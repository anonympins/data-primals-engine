import { expect, describe, it, beforeEach,afterEach, beforeAll, afterAll, vi } from 'vitest';
import { Config } from "../src/config";

import {insertData, editData, deleteData, patchData} from '../src/index.js';
import { modelsCollection as getAppModelsCollection, getCollectionForUser } from '../src/modules/mongodb.js';
import * as workflowModule from '../src/modules/workflow.js';
import {initEngine} from "../src/setenv.js";

beforeAll(async () =>{
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);
    await initEngine();
})
vi.mock('../src/modules/workflow.js', { spy: true })
// --- Données Mock pour les tests ---
const mockUser = {
    username: 'testuserWorkflow',
    _user: 'testuserWorkflow',
    userPlan: 'premium',
    email: 'testWorkflow@example.com'
};

// --- Définitions des modèles ---

// Le modèle de données qui déclenchera les workflows
const targetDataModel = {
    name: 'project',
    _user: mockUser.username,
    description: 'Un modèle pour les projets qui déclencheront des workflows',
    fields: [
        { name: 'projectName', type: 'string', required: true },
        { name: 'status', type: 'string', required: true }, // ex: 'new', 'active', 'archived'
        { name: 'budget', type: 'number' }
    ]
};

// Les modèles qui définissent le système de workflow lui-même.
// Pour les tests, nous devons insérer leurs définitions dans la collection 'models',
// puis leurs instances (ex: un trigger spécifique) dans la collection 'datas' de l'utilisateur.
// Les modèles qui définissent le système de workflow lui-me.
// Pour les tests, nous devons insérer leurs définitions dans la collection 'models',
// puis leurs instances (ex: un trigger spécifique) dans la collection 'datas' de l'utilisateur.
const workflowMetaModels = [
    {
        name: 'workflow',
        _user: mockUser.username,
        description:'',
        fields: [
            { name: 'name', type: 'string' },
            { name: 'startStep', type: 'relation', relation: 'workflowStep' }
        ]
    },
    {
        name: 'workflowStep',
        _user: mockUser.username,
        description:'',
        fields: [
            { name: 'name', type: 'string' },
            { name: 'onSuccessStep', type: 'relation', relation: 'workflowStep' },
            { name: 'onFailureStep', type: 'relation', relation: 'workflowStep' },
            { name: 'isTerminal', type: 'boolean' },
            { name: 'actions', type: 'array', itemsType: 'relation', relation: 'workflowAction' },
            { name: 'conditions', type: 'object' }
        ]
    },
    {
        name: 'workflowTrigger',
        _user: mockUser.username,
        description:'',
        fields: [
            { name: 'name', type: 'string' },
            { name: 'targetModel', type: 'model' },
            { name: 'onEvent', type: 'enum', items: ['DataAdded', 'DataEdited', 'DataDeleted', 'ModelAdded', 'ModelEdited', 'ModelDeleted'] },
            { name: 'isActive', type: 'boolean' },
            { name: 'dataFilter', type: 'object' },
            { name: 'workflow', type: 'relation', relation: 'workflow' },
            { name: 'cronExpression', type: 'cronSchedule' },
            { name: 'lockDurationMinutes', type: 'number' }
        ]
    },
    {
        name: 'workflowRun',
        _user: mockUser.username,
        description:'',
        fields: [
            { name: 'status', type: 'enum', items: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
            { name: 'workflow', type: 'relation', relation: 'workflow' },
            { name: 'contextData', type: 'object' },
            { name: 'currentStep', type: 'relation', relation: 'workflowStep' },
            { name: 'error', type: 'string' },
            { name: 'startedAt', type: 'datetime' },
            { name: 'completedAt', type: 'datetime' },
            { name: 'stepExecutionsCount', type: 'object' }
        ]
    },
    {
        name: 'workflowAction',
        _user: mockUser.username,
        description:'',
        fields: [
            // Common
            { name: 'name', type: 'string' },
            { name: 'type', type: 'enum', items: ['Webhook', 'CreateData', 'UpdateData', 'DeleteData', 'GenerateAIContent', 'SendEmail'] },
            // Webhook
            { name: 'url', type: 'url' },
            { name: 'method', type: 'enum', items: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            { name: 'headers', type: 'code', language: 'json' },
            { name: 'body', type: 'code', language: 'json' },
            // Create/Update/Delete
            { name: 'targetModel', type: 'model' },
            { name: 'dataToCreate', type: 'code', language: 'json' },
            { name: 'targetSelector', type: 'code', language: 'json' },
            { name: 'fieldsToUpdate', type: 'code', language: 'json' },
            { name: 'updateMultiple', type: 'boolean' },
            { name: 'deleteMultiple', type: 'boolean' },
            // GenerateAIContent
            { name: 'aiProvider', type: 'enum', items: ['OpenAI', 'GoogleGemini'] },
            { name: 'aiModel', type: 'string' },
            { name: 'prompt', type: 'richtext' },
            // SendEmail
            { name: 'emailRecipients', type: 'array', itemsType: 'string' },
            { name: 'emailSubject', type: 'string' },
            { name: 'emailContent', type: 'richtext' }
        ]
    }
];


let testModelsColInstance;
let testDatasColInstance;

// On "espionne" `c` pour vérifier qu'elle est appelée sans l'exécuter réellement.
// Cela nous permet de tester uniquement la logique de déclenchement.
const processWorkflowRunSpy = vi.spyOn(workflowModule, 'processWorkflowRun');

beforeEach(async () => {
    testModelsColInstance = getAppModelsCollection;
    testDatasColInstance = await getCollectionForUser(mockUser);

    // Réinitialiser l'espion
    processWorkflowRunSpy.mockClear();

    const mods = await testModelsColInstance.find({ $and: [{ _user: mockUser.username}, { $or: [{name: targetDataModel.name}, ...workflowMetaModels.map(m =>({name: m.name}))]}]}).toArray();
    if( mods.length === 0 ) {
        // Insérer les définitions de modèles nécessaires
        await testModelsColInstance.insertMany([
            {...targetDataModel},
            ...workflowMetaModels.map(m => ({...m})) // Copie pour éviter les mutations
        ]);
    }
    // tell vitest we use mocked time
    vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
    vi.runOnlyPendingTimers();
    // restoring date after each test run
    vi.useRealTimers()
})
afterAll(async () => {
    const coll = await getCollectionForUser(mockUser);
    await coll.drop();
})
describe('Intégration des Workflows - triggerWorkflows', () => {

    let testWorkflow;
    let testStep;

    // Avant chaque test de ce bloc, on crée un workflow et une étape de base
    const initTest = async () => {
        // Nettoyer les données avant chaque test
        await testDatasColInstance.deleteMany({_user: "testuserWorkflow"});

        const workflowInsertResult = await insertData('workflow', { name: 'Test Workflow' }, {}, mockUser, false);
        testWorkflow = { _id: workflowInsertResult.insertedIds[0] };

        const stepInsertResult = await insertData('workflowStep', { name: 'Start Step', isTerminal: true }, {}, mockUser, false);
        testStep = { _id: stepInsertResult.insertedIds[0] };

        // Lier l'étape au workflow
        await editData('workflow', testWorkflow._id, { startStep: testStep._id.toString() }, {}, mockUser, false);
    };

    it('devrait créer un workflowRun lors de l\'ajout de données correspondant à un trigger "DataAdded"', async () => {
        await initTest();
        // 1. Arrange: Créer un déclencheur actif pour 'DataAdded' sur le modèle 'project'
        await insertData('workflowTrigger', {
            name: 'Trigger on Project Add',
            targetModel: targetDataModel.name,
            onEvent: 'DataAdded',
            isActive: true,
            workflow: testWorkflow._id.toString()
        }, {}, mockUser, false);

        // 2. Act: Insérer une donnée qui doit déclencher le workflow
        const projectData = { projectName: 'New Corp Website', status: 'new', budget: 50000 };
        const insertResult = await insertData(targetDataModel.name, projectData, {}, mockUser, true, true);

        expect(insertResult.success).toBe(true);

        const workflowRun = await testDatasColInstance.findOne({ _model: 'workflowRun' });

        expect(workflowRun).not.toBeNull();
        expect(workflowRun.status).toBe('completed');
        expect(workflowRun.workflow.toString()).toBe(testWorkflow._id.toString());
        expect(workflowRun.contextData.triggerData._id.toString()).toBe(insertResult.insertedIds[0].toString());
        expect(workflowRun.contextData.triggerData.projectName).toBe('New Corp Website');

    });

    it('ne devrait PAS créer de workflowRun si le trigger est inactif', async () => {
        await initTest();
        // 1. Arrange: Créer un déclencheur INACTIF
        await insertData('workflowTrigger', {
            name: 'Inactive Trigger',
            targetModel: targetDataModel.name,
            onEvent: 'DataAdded',
            isActive: false, // Inactif
            workflow: testWorkflow._id.toString()
        }, {}, mockUser, false);

        // 2. Act: Insérer des données
        await insertData(targetDataModel.name, { projectName: 'Secret Project', status: 'new' }, {}, mockUser, true);

        // 3. Assert: Aucun `workflowRun` ne doit être créé
        const workflowRunCount = await testDatasColInstance.countDocuments({ _model: 'workflowRun' });
        expect(workflowRunCount).toBe(0);
    });

    it('devrait créer un workflowRun si le dataFilter est satisfait', async () => {
        await initTest();
        // 1. Arrange: Créer un déclencheur avec un `dataFilter`
        await insertData('workflowTrigger', {
            name: 'Trigger for Active Projects',
            targetModel: targetDataModel.name,
            onEvent: 'DataAdded',
            isActive: true,
            dataFilter: { $eq: ['$status', 'active'] }, // Filtre pour status = 'active'
            workflow: testWorkflow._id.toString()
        }, {}, mockUser, false);

        // 2. Act: Insérer des données qui correspondent au filtre
        await insertData(targetDataModel.name, { projectName: 'Go-Live Project', status: 'active' }, {}, mockUser, true, true);

        // 3. Assert: Un `workflowRun` doit être créé
        const workflowRunCount = await testDatasColInstance.countDocuments({ _model: 'workflowRun' });
        expect(workflowRunCount).toBe(1);
    });

    it('ne devrait PAS créer de workflowRun si le dataFilter n\'est PAS satisfait', async () => {
        await initTest();
        // 1. Arrange: Créer un déclencheur avec un `dataFilter`
        await insertData('workflowTrigger', {
            name: 'Trigger for Archived Projects',
            targetModel: targetDataModel.name,
            onEvent: 'DataAdded',
            isActive: true,
            dataFilter: { $eq: ['$status', 'archived'] }, // Filtre pour status = 'archived'
            workflow: testWorkflow._id.toString()
        }, {}, mockUser, false);

        // 2. Act: Insérer des données qui NE correspondent PAS au filtre
        await insertData(targetDataModel.name, { projectName: 'Ongoing Project', status: 'active' }, {}, mockUser, true, true);

        // 3. Assert: Aucun `workflowRun` ne doit être créé
        const workflowRunCount = await testDatasColInstance.countDocuments({ _model: 'workflowRun' });
        expect(workflowRunCount).toBe(0);
    });

    it('devrait déclencher un workflow "DataEdited" lors de la modification de données', async () => {
        await initTest();
        // 1. Arrange: Insérer une donnée initiale et un déclencheur pour 'DataEdited'
        const insertResult = await insertData(targetDataModel.name, { projectName: 'To Edit', status: 'initial' }, {}, mockUser, false);
        const projectId = insertResult.insertedIds[0];

        await insertData('workflowTrigger', {
            name: 'Trigger on Project Edit',
            targetModel: targetDataModel.name,
            onEvent: 'DataEdited',
            isActive: true,
            workflow: testWorkflow._id.toString()
        }, {}, mockUser, false);

        // 2. Act: Modifier la donnée
        const editResult = await patchData(targetDataModel.name, projectId, { status: 'edited' }, {}, mockUser, true, true);
        expect(editResult.success).toBe(true);

        // 2. Act: Modifier la donnée
        const editResult2 = await editData(targetDataModel.name, projectId, { projectName: 'test', status: 'edited' }, {}, mockUser, true, true);
        expect(editResult2.success).toBe(true);

        const workflows = await testDatasColInstance.countDocuments({ _model: 'workflowRun' });
        expect(workflows).toBe(2);
    });

    it('devrait déclencher un workflow "DataDeleted" lors de la suppression de données', async () => {
        await initTest();
        // 1. Arrange: Insérer une donnée et un déclencheur pour 'DataDeleted'
        const insertResult = await insertData(targetDataModel.name, { projectName: 'To Delete', status: 'temp' }, {}, mockUser, false);
        const projectId = insertResult.insertedIds[0];

        await insertData('workflowTrigger', {
            name: 'Trigger on Project Delete',
            targetModel: targetDataModel.name,
            onEvent: 'DataDeleted',
            isActive: true,
            workflow: testWorkflow._id.toString()
        }, {}, mockUser, false);

        // 2. Act: Supprimer la donnée
        const deleteResult = await deleteData(targetDataModel.name, [projectId], mockUser, true, true);
        expect(deleteResult.success).toBe(true);

        // 3. Assert: Un `workflowRun` doit être créé
        const workflowRun = await testDatasColInstance.findOne({ _model: 'workflowRun' });
        expect(workflowRun).not.toBeNull();
        // Le `triggerData` est le document *avant* sa suppression
        expect(workflowRun.contextData.triggerData.projectName).toBe('To Delete');
    });
});
