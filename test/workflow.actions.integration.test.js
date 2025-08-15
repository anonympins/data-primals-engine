import { expect, describe, it, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { Config } from "../src/config.js";
import { insertData, editData } from '../src/index.js';
import {
    modelsCollection as getAppModelsCollection,
    getCollectionForUser,
    getCollection
} from '../src/modules/mongodb.js';
import * as workflowModule from '../src/modules/workflow.js';
import { initEngine } from "../src/setenv.js";
import * as emailModule from '../src/email.js';
import { ChatOpenAI } from "@langchain/openai";
import {ObjectId} from "mongodb";
import {purgeData} from "../src/modules/data/data.history.js";

let testModelsColInstance;
let testDatasColInstance;


// --- Mocks ---
// On mock le module email pour ne pas envoyer de vrais emails
vi.mock('../src/email.js', () => ({
    sendEmail: vi.fn().mockResolvedValue({ success: true })
}));

// On mock LangChain pour ne pas faire de vrais appels aux API d'IA
const mockInvoke = vi.fn().mockResolvedValue({
    content: "Ceci est une réponse IA simulée."
});
vi.mock('@langchain/openai', () => ({
    ChatOpenAI: vi.fn(() => mockInvoke)
}));
vi.mock('@langchain/google-genai', () => ({
    ChatGoogleGenerativeAI: vi.fn(() => mockInvoke)
}));
vi.mock('@langchain/deepseek', () => ({
    ChatDeepSeek: vi.fn(() => mockInvoke)
}));

// On mock le fetch global pour les tests de webhook
global.fetch = vi.fn();

// --- Configuration des Tests ---
beforeAll(async () => {
    Config.Set('defaultModels', []);
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow", "user", "assistant"]);
    await initEngine();

    testModelsColInstance = getAppModelsCollection
    await testModelsColInstance.deleteMany({_user: mockUser.username});
});

const mockUser = {
    username: 'testuserWorkflowActions',
    _user: 'testuserWorkflowActions',
    email: 'actions@test.com',
    userPlan: 'premium'
};

// --- Définitions des modèles ---
const targetDataModel = {
    name: 'task',
    description: "",
    _user: mockUser.username,
    fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'status', type: 'string' }, // ex: 'todo', 'done'
        { name: 'assignee', type: 'string' }
    ]
};

const logDataModel = {
    name: 'log',
    description: "",
    _user: mockUser.username,
    fields: [
        { name: 'message', type: 'string' },
        { name: 'level', type: 'string' }
    ]
};

const workflowMetaModels = [
    {
        name: "env",
        "description": "",
        _user: mockUser.username,
        fields: [
            { name: "name", type: "string", required: true, unique: true, asMain: true },
            { name: "value", type: "string", anonymized: true, hiddenable: true }
        ]
    },
    { name: 'workflow', "description": "", _user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'startStep', type: 'relation', relation: 'workflowStep' }] },
    { name: 'workflowStep', "description": "",_user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'onSuccessStep', type: 'relation', relation: 'workflowStep' }, { name: 'onFailureStep', type: 'relation', relation: 'workflowStep' }, { name: 'isTerminal', type: 'boolean' }, { name: 'actions', type: 'array', itemsType: 'relation', relation: 'workflowAction' }, { name: 'conditions', type: 'object' }] },
    { name: 'workflowTrigger', "description": "",_user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'targetModel', type: 'model' }, { name: 'onEvent', type: 'enum', items: ['DataAdded', 'DataEdited', 'DataDeleted'] }, { name: 'isActive', type: 'boolean' }, { name: 'dataFilter', type: 'object' }, { name: 'workflow', type: 'relation', relation: 'workflow' }] },
    { name: 'workflowRun', "description": "",_user: mockUser.username, fields: [{ name: 'status', type: 'enum', items: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'] }, { name: 'workflow', type: 'relation', relation: 'workflow' }, { name: 'contextData', type: 'object' }, { name: 'currentStep', type: 'relation', relation: 'workflowStep' }, { name: 'error', type: 'string' }, { name: 'resumeAt', type: 'datetime' }] },
    { name: 'workflowAction', "description": "d", _user: mockUser.username, fields: [
        { name: 'name', type: 'string' },
        { name: 'type', type: 'enum', items: ['Webhook', 'CreateData', 'UpdateData', 'DeleteData', 'GenerateAIContent', 'SendEmail', 'ExecuteScript', 'Wait'] },
        // Webhook
        { name: 'url', type: 'url' }, { name: 'method', type: 'enum', items: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }, { name: 'headers', type: 'code', language: 'json' }, { name: 'body', type: 'code', language: 'json' },
        // Data
        { name: 'targetModel', type: 'model' }, { name: 'dataToCreate', type: 'code', language: 'json' }, { name: 'targetSelector', type: 'code', language: 'json' }, { name: 'fieldsToUpdate', type: 'code', language: 'json' },
        // AI
        { name: 'aiProvider', type: 'enum', items: ['OpenAI', 'Google', 'DeepSeek'] }, { name: 'aiModel', type: 'string' }, { name: 'prompt', type: 'richtext' },
        // Email
        { name: 'emailRecipients', type: 'array', itemsType: 'string' }, { name: 'emailSubject', type: 'string' }, { name: 'emailContent', type: 'richtext' },
        // Script
        { name: 'script', type: 'code', language: 'javascript' },
        // Wait
        { name: 'duration', type: 'number' }, { name: 'durationUnit', type: 'enum', items: ['seconds', 'minutes', 'hours', 'days'] }
    ] }
];

beforeEach(async () => {
    testDatasColInstance = await getCollectionForUser(mockUser);

    await testDatasColInstance.deleteMany({_user: mockUser.username});
    await testModelsColInstance.deleteMany({_user: mockUser.username});

    // Réinitialiser les mocks
    vi.clearAllMocks();
    global.fetch.mockClear();
    mockInvoke.mockClear();
    emailModule.sendEmail.mockClear();

    // Insérer les modèles si nécessaire
    await testModelsColInstance.insertMany([
        { ...targetDataModel },
        { ...logDataModel },
        ...workflowMetaModels
    ]);

    // Nettoyer les données de test
    await testDatasColInstance.deleteMany({ _user: mockUser.username });

    // Utiliser des timers simulés
    vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
});

afterAll(async () => {
    await purgeData(mockUser);
    const coll = await getCollectionForUser(mockUser);
    await coll.drop();
});

describe('Intégration des Actions de Workflow', () => {

    /**
     * Helper pour créer une structure de workflow de base pour un test.
     * @param {object} actionDef - La définition de l'action à tester.
     * @returns {Promise<{workflowId: ObjectId, stepId: ObjectId, actionId: ObjectId}>}
     */
    const setupWorkflow = async (actionDef) => {
        const actionRes = await insertData('workflowAction', actionDef, {}, mockUser, false);
        const actionId = actionRes.insertedIds[0];

        const stepRes = await insertData('workflowStep', { name: 'Test Step', actions: [actionId.toString()], isTerminal: true }, {}, mockUser, false);
        const stepId = stepRes.insertedIds[0];

        const workflowRes = await insertData('workflow', { name: 'Test Workflow', startStep: stepId.toString() }, {}, mockUser, false);
        const workflowId = workflowRes.insertedIds[0];

        // AJOUT : Créer le déclencheur qui lie l'événement au workflow.
        // C'est l'élément manquant qui empêchait les workflows de se lancer.
        await insertData('workflowTrigger', {
            name: `Trigger for ${actionDef.name}`,
            targetModel: 'task', // Tous les tests se déclenchent sur le modèle 'task'
            onEvent: 'DataAdded', // Tous les tests utilisent cet événement
            isActive: true,
            workflow: workflowId.toString()
        }, {}, mockUser, false);

        return { workflowId, stepId, actionId };
    };

    /**
     * Helper pour lancer un workflow et attendre sa complétion.
     * @param {ObjectId} workflowId - L'ID du workflow à lancer.
     * @param {object} triggerData - Les données de déclenchement.
     * @returns {Promise<object>} Le document workflowRun final.
     */
    const runWorkflowAndWait = async (workflowId, triggerData) => {
        await workflowModule.triggerWorkflows(triggerData, mockUser, 'DataAdded');
        await vi.runAllTimersAsync(); // Exécute les timers (setTimeout(0) dans triggerWorkflows)

        // Attendre que le workflowRun soit complété
        let workflowRun = await testDatasColInstance.findOne({ _model: 'workflowRun' });
        return workflowRun;
    };

    it('Action CreateData: devrait créer un document avec des données du contexte', async () => {
        const { workflowId } = await setupWorkflow({
            name: 'Create Log Entry',
            type: 'CreateData',
            targetModel: 'log',
            dataToCreate: {
                "message": "New task created: {triggerData.title}",
                "level": "info"
            }
        });

        const triggerTask = { _model: 'task', title: 'Implement Tests', status: 'todo' };
        const workflowRun = await runWorkflowAndWait(workflowId, triggerTask);

        expect(workflowRun.status).toBe('completed');
        const newLog = await testDatasColInstance.findOne({ _model: 'log' });
        expect(newLog).not.toBeNull();
        expect(newLog.message).toBe('New task created: Implement Tests');
        expect(newLog.level).toBe('info');
    });

    it('Action UpdateData: devrait mettre à jour un document en utilisant un sélecteur et des données du contexte', async () => {
        const taskRes = await insertData('task', { title: 'Initial Task', status: 'todo' }, {}, mockUser, false);
        const taskId = taskRes.insertedIds[0];

        const { workflowId } = await setupWorkflow({
            name: 'Update Task Status',
            type: 'UpdateData',
            targetModel: 'task',
            targetSelector: { "_id": "{triggerData._id}" },
            fieldsToUpdate: { "status": "done", "assignee": "{triggerData.assignee}" }
        });

        const triggerData = { _id: taskId, _model: 'task', assignee: 'testuserWorkflowActions' };
        const workflowRun = await runWorkflowAndWait(workflowId, triggerData);

        expect(workflowRun.status).toBe('completed');
        const updatedTask = await testDatasColInstance.findOne({ _id: new ObjectId(taskId) });
        expect(updatedTask.status).toBe('done');
        expect(updatedTask.assignee).toBe('testuserWorkflowActions');
    });

    it('Action DeleteData: devrait supprimer un document basé sur un sélecteur', async () => {
        const taskRes = await insertData('task', { title: 'Task to be deleted', status: 'temp' }, {}, mockUser, false);
        const taskId = taskRes.insertedIds[0];

        const { workflowId } = await setupWorkflow({
            name: 'Delete Temp Task',
            type: 'DeleteData',
            targetModel: 'task',
            targetSelector: { "_id": "{triggerData._id}" }
        });

        const workflowRun = await runWorkflowAndWait(workflowId, { _id: taskId, _model: 'task' });

        expect(workflowRun.status).toBe('completed');
        const deletedTask = await testDatasColInstance.findOne({ _id: taskId });
        expect(deletedTask).toBeNull();
    });

    it('Action HttpRequest: devrait appeler fetch avec les bonnes informations substituées', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: 'Webhook received' }),
            headers: new Map([['content-type', 'application/json']])
        });

        const { workflowId } = await setupWorkflow({
            name: 'Notify External System',
            type: 'HttpRequest',
            method: 'POST',
            url: 'https://api.example.com/notify/{triggerData.status}',
            headers: { "Authorization": "Bearer {env.API_KEY}" },
            body: { "taskId": "{triggerData._id}", "title": "{triggerData.title}" }
        });

        // Simuler une variable d'environnement
        await insertData('env', { name: 'API_KEY', value: 'secret123' }, {}, mockUser, false);

        const triggerData = { _id: 'task_123', _model: 'task', title: 'My Webhook Task', status: 'done' };
        const workflowRun = await runWorkflowAndWait(workflowId, triggerData);

        expect(workflowRun.status).toBe('completed');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.example.com/notify/done',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer secret123',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ taskId: 'task_123', title: 'My Webhook Task' })
            })
        );
    });

    it('Action SendEmail: devrait appeler le service email avec un contenu personnalisé', async () => {
        const { workflowId } = await setupWorkflow({
            name: 'Send Task Completion Email',
            type: 'SendEmail',
            emailRecipients: ["{triggerData.assigneeEmail}"],
            emailSubject: "Task Completed: {triggerData.title}",
            emailContent: "<h1>Done!</h1><p>The task '{triggerData.title}' is now complete.</p>"
        });

        const triggerData = { _model: 'task', title: 'Finish Email Action Test', assigneeEmail: 'dev@example.com' };
        const workflowRun = await runWorkflowAndWait(workflowId, triggerData);

        expect(workflowRun.status).toBe('completed');
        expect(emailModule.sendEmail).toHaveBeenCalledTimes(1);
        expect(emailModule.sendEmail).toHaveBeenCalledWith(
            ['dev@example.com'],
            expect.objectContaining({
                title: "Task Completed: Finish Email Action Test",
                content: "<h1>Done!</h1><p>The task 'Finish Email Action Test' is now complete.</p>"
            }),
            expect.any(Object), // smtpConfig
            undefined // lang
        );
    });

    it('Action GenerateAIContent: devrait appeler le client IA et ajouter le résultat au contexte', async () => {
        const { workflowId } = await setupWorkflow({
            name: 'Summarize Task',
            type: 'GenerateAIContent',
            aiProvider: 'OpenAI',
            aiModel: 'gpt-4o-mini',
            prompt: "Summarize this task title: {triggerData.title}"
        });

        // Simuler une clé API utilisateur
        await insertData('env', { name: 'OPENAI_API_KEY', value: 'user_api_key' }, {}, mockUser, false);

        const triggerData = { _model: 'task', title: 'A very long and detailed task title that needs summarization' };
        const workflowRun = await runWorkflowAndWait(workflowId, triggerData);

        expect(workflowRun.status).toBe('completed');
        expect(mockInvoke).toHaveBeenCalledTimes(1);
        expect(workflowRun.contextData.aiContent).toBe("Ceci est une réponse IA simulée.");
    });

    it('Action ExecuteScript: devrait exécuter un script et mettre à jour le contexte', async () => {
        const { workflowId } = await setupWorkflow({
            name: 'Process Data with Script',
            type: 'ExecuteScript',
            script: `
                const title = context.triggerData.title.toUpperCase();
                const status = 'processed';
                
                // Créer un log
                await db.create('log', { "message": "Processing "+title});

                // Retourner des données à ajouter au contexte
                return { processedTitle: title, newStatus: status };
            `
        });

        const triggerData = { _model: 'task', title: 'script test' };
        const workflowRun = await runWorkflowAndWait(workflowId, triggerData);

        expect(workflowRun.status).toBe('completed');
        // Vérifier que le contexte a été mis à jour par le `return` du script
        expect(workflowRun.contextData.result.processedTitle).toBe('SCRIPT TEST');
        expect(workflowRun.contextData.result.newStatus).toBe('processed');

        // Vérifier que l'action `db.create` dans le script a fonctionné
        const logEntry = await testDatasColInstance.findOne({ _model: 'log' });
        expect(logEntry).not.toBeNull();
        expect(logEntry.message).toBe('Processing SCRIPT TEST');
    });

    it('Action Wait: devrait mettre le workflow en pause puis le reprendre', async () => {
        // Création d'une étape de fin pour vérifier la reprise
        vi.useFakeTimers();

        const finalStepRes = await insertData('workflowStep', { name: 'Final Step', isTerminal: true }, {}, mockUser, false);
        const finalStepId = finalStepRes.insertedIds[0];

        const actionRes = await insertData('workflowAction', { name: 'Wait Action', type: 'Wait', duration: 2, durationUnit: 'seconds' }, {}, mockUser, false);
        const actionId = actionRes.insertedIds[0];

        const waitStepRes = await insertData('workflowStep', { name: 'Wait Step', actions: [actionId.toString()], onSuccessStep: finalStepId.toString() }, {}, mockUser, false);
        const waitStepId = waitStepRes.insertedIds[0];

        const workflowRes = await insertData('workflow', { name: 'Wait Workflow', startStep: waitStepId.toString() }, {}, mockUser, false);
        const workflowId = workflowRes.insertedIds[0];

        // Le trigger était manquant pour ce test spécifique.
        // On l'ajoute ici, comme le fait la fonction `setupWorkflow`.
        await insertData('workflowTrigger', {
            name: 'Trigger for Wait Test',
            targetModel: 'task',
            onEvent: 'DataAdded',
            isActive: true,
            workflow: workflowId.toString()
        }, {}, mockUser, false);

        // Lancement du workflow
        await workflowModule.triggerWorkflows({ _model: 'task', title: 'wait test' }, mockUser, 'DataAdded');

        // 1. Vérifier que le workflow est en pause
        let workflowRun = await testDatasColInstance.findOne({ _model: 'workflowRun' });
        expect(workflowRun.status).toBe('paused');
        expect(workflowRun.currentStep.toString()).toBe(finalStepId.toString()); // Il est prêt pour la prochaine étape

        vi.advanceTimersByTime(4000);
        // 2. Simuler manuellement la reprise du workflow
        await workflowModule.processWorkflowRun(workflowRun._id, mockUser);

        // 3. Vérifier que le workflow s'est terminé
        workflowRun = await testDatasColInstance.findOne({ _id: workflowRun._id });
        expect(workflowRun.status).toBe('completed');
        expect(workflowRun.currentStep).toBeNull();
    });

    it('Chemin d\'échec (onFailureStep): devrait suivre la branche d\'échec si une action échoue', async () => {
        // Créer deux étapes terminales: une pour le succès, une pour l'échec
        const successStepRes = await insertData('workflowStep', { name: 'Success Step', isTerminal: true }, {}, mockUser, false);
        const failureStepRes = await insertData('workflowStep', { name: 'Failure Step', isTerminal: true }, {}, mockUser, false);

        // Créer une action qui va échouer (CreateData sans champ requis 'message')
        const failingActionRes = await insertData('workflowAction', {
            name: 'Failing Create Log',
            type: 'CreateData',
            targetModel: 'log',
            dataToCreate: { "level": "error" } // 'message' est requis dans le modèle 'log' et est manquant ici
        }, {}, mockUser, false);

        // Créer l'étape principale qui utilise cette action et les branches de succès/échec
        const mainStepRes = await insertData('workflowStep', {
            name: 'Main Step',
            actions: [failingActionRes.insertedIds[0].toString()],
            onSuccessStep: successStepRes.insertedIds[0].toString(),
            onFailureStep: failureStepRes.insertedIds[0].toString()
        }, {}, mockUser, false);

        const { workflowId } = await setupWorkflow({
            name: 'Workflow with Failure Path',
            startStep: mainStepRes.insertedIds[0].toString()
        });

        const workflowRun = await runWorkflowAndWait(workflowId, { _model: 'task', title: 'Test failure path' });

        expect(workflowRun.status).toBe('failed'); // Le statut final est 'failed' car il n'y a pas d'étape après l'échec
    });

    it('Trigger dataFilter: ne devrait lancer le workflow que si le filtre correspond', async () => {
        // Création d'une étape de fin pour vérifier la reprise
        vi.useFakeTimers();

        // Créer une action et une étape simples
        const actionRes = await insertData('workflowAction', { name: 'Create Log', type: 'CreateData', targetModel: 'log', dataToCreate: { message: 'Filtered task processed' } }, {}, mockUser, false);
        const stepRes = await insertData('workflowStep', { name: 'Step', actions: [actionRes.insertedIds[0].toString()], isTerminal: true }, {}, mockUser, false);
        const workflowRes = await insertData('workflow', { name: 'Filtered Workflow', startStep: stepRes.insertedIds[0].toString() }, {}, mockUser, false);

        // Créer un trigger avec un dataFilter
        await insertData('workflowTrigger', {
            name: 'Trigger only for "done" tasks',
            targetModel: 'task',
            onEvent: 'DataAdded',
            isActive: true,
            workflow: workflowRes.insertedIds[0].toString(),
            dataFilter: { "$eq": ["$status","done"] } // Le filtre crucial
        }, {}, mockUser, false);

        // 1. Déclencher avec une donnée qui NE correspond PAS au filtre
        await workflowModule.triggerWorkflows({ _model: 'task', title: 'A task not done', status: 'todo' }, mockUser, 'DataAdded');
        let runs = await testDatasColInstance.find({ _model: 'workflowRun' }).toArray();
        expect(runs.length).toBe(0); // Aucun workflow ne doit avoir été lancé

        vi.advanceTimersByTime(2000);

        // 2. Déclencher avec une donnée qui correspond au filtre
        await workflowModule.triggerWorkflows({ _model: 'task', title: 'A task that is done', status: 'done' }, mockUser, 'DataAdded');
        runs = await testDatasColInstance.find({ _model: 'workflowRun' }).toArray();
        expect(runs.length).toBe(1); // Un seul workflow doit avoir été lancé
        expect(runs[0].status).toBe('completed');
    });
});