// test/workflow.robustness.test.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { expect, describe, it, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { Config } from "data-primals-engine/config";

// --- Configuration initiale (similaire à workflow.integration.test.js) ---
let mongod;
let testDbUri;
const testDbName = 'testRobustnessDbHO_Workflow';

// --- Importations des modules de l'application ---
import { Engine } from "data-primals-engine/engine";
import { insertData, editData } from 'data-primals-engine/modules/data';
import { modelsCollection as getAppModelsCollection, getCollectionForUser, getCollection } from 'data-primals-engine/modules/mongodb';
import * as workflowModule from 'data-primals-engine/modules/workflow';
import {getUniquePort, initEngine} from "../src/setenv.js";
import {maxExecutionsByStep} from "data-primals-engine/constants";

vi.mock('data-primals-engine/modules/workflow', { spy: true })

const mockUser = {
    username: 'robustnessUser',
    _user: 'robustnessUser',
    email: 'robustness@example.com'
};

// Recopie des méta-modèles pour la lisibilité
const workflowMetaModels = [
    { name: 'workflow', 'description': '', _user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'startStep', type: 'relation', relation: 'workflowStep' }] },
    { name: 'workflowStep', 'description': '', _user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'onSuccessStep', type: 'relation', relation: 'workflowStep' }, { name: 'onFailureStep', type: 'relation', relation: 'workflowStep' }, { name: 'isTerminal', type: 'boolean' }, { name: 'actions', type: 'array', itemsType: 'relation', relation: 'workflowAction' }, { name: 'conditions', type: 'object' }] },
    { name: 'workflowTrigger', 'description': '', _user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'targetModel', type: 'model' }, { name: 'onEvent', type: 'enum', items: ['DataAdded'] }, { name: 'isActive', type: 'boolean' }, { name: 'dataFilter', type: 'object' }, { name: 'workflow', type: 'relation', relation: 'workflow' }] },
    { name: 'workflowRun',  'description': '',_user: mockUser.username, fields: [{ name: 'status', type: 'enum', items: ['pending', 'running', 'completed', 'failed', 'cancelled'] }, { name: 'workflow', type: 'relation', relation: 'workflow' }, { name: 'contextData', type: 'object' }, { name: 'currentStep', type: 'relation', relation: 'workflowStep' }, { name: 'error', type: 'string' }, { name: 'completedAt', type: 'datetime' }, { name: 'stepExecutionsCount', type: 'object' }] },
    { name: 'workflowAction', 'description': '', _user: mockUser.username, fields: [{ name: 'name', type: 'string' }, { name: 'type', type: 'enum', items: ['Log'] }] }
];
const targetDataModel = { name: 'project',  'description': '',_user: mockUser.username, fields: [{ name: 'projectName', type: 'string' }, { name: 'status', type: 'string' }] };


let testModelsColInstance;
let testDatasColInstance;

beforeAll(async () =>{
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);
    await initEngine();
})

beforeEach(async () => {
    testModelsColInstance = getAppModelsCollection;
    testDatasColInstance = getCollectionForUser(mockUser);
    await testDatasColInstance.deleteMany({ _user: mockUser.username });
    await getCollection('job_locks').deleteMany({}); // Nettoyer les verrous
    const mods = await testModelsColInstance.find({ $and: [{_user: mockUser.username}, {$or: [{name: targetDataModel.name}, ...workflowMetaModels.map(m =>({name: m.name}))] }]}).toArray();
    console.log({mods})
    if( mods.length === 0){
        await testModelsColInstance.insertMany([targetDataModel, ...workflowMetaModels]);
    }
});

// ====================================================================================
// =================== DÉBUT DES TESTS DE ROBUSTESSE ==================================
// ====================================================================================

describe('Tests de robustesse et des cas limites du module Workflow', () => {

    describe('Verrouillage distribué (runScheduledJobWithDbLock)', () => {

        it('ne devrait pas exécuter la fonction si un verrou est déjà actif', async () => {
            const jobsCollection = getCollection('job_locks');
            const jobId = 'concurrent-job-1';
            const jobFunctionSpy = vi.fn();

            // 1. Arrange: Insérer manuellement un verrou actif dans la DB
            const now = new Date();
            await jobsCollection.insertOne({
                jobId: jobId,
                lockedUntil: new Date(now.getTime() + 10 * 60 * 1000), // Verrouillé pour 10 min
            });

            // 2. Act: Tenter de lancer le job
            await workflowModule.runScheduledJobWithDbLock(jobId, jobFunctionSpy);

            // 3. Assert: La fonction ne doit JAMAIS avoir été appelée
            expect(jobFunctionSpy).not.toHaveBeenCalled();
        });

        it('devrait acquérir un verrou expiré et exécuter la fonction', async () => {
            const jobsCollection = getCollection('job_locks');
            const jobId = 'expired-lock-job-1';
            const jobFunctionSpy = vi.fn();

            // 1. Arrange: Insérer un verrou qui a déjà expiré (simule un crash)
            await jobsCollection.insertOne({
                jobId: jobId,
                lockedUntil: new Date(Date.now() - 1000), // Expiré depuis 1 seconde
            });

            // 2. Act: Lancer le job
            await workflowModule.runScheduledJobWithDbLock(jobId, jobFunctionSpy);

            // 3. Assert: La fonction a bien été exécutée car le verrou a été repris
            expect(jobFunctionSpy).toHaveBeenCalledTimes(1);
        });

        it('devrait libérer le verrou même si la jobFunction lve une exception', async () => {
            const jobsCollection = getCollection('job_locks');
            const jobId = 'job-with-exception';
            // 1. Arrange: Créer une fonction qui échoue systématiquement
            const failingJobFunction = vi.fn().mockRejectedValue(new Error('Erreur de traitement interne'));

            // 2. Act: Exécuter la fonction. On s'attend à ce qu'elle gère l'erreur en interne.
            await expect(workflowModule.runScheduledJobWithDbLock(jobId, failingJobFunction)).resolves.not.toThrow();

            // 3. Assert:
            // - La fonction a bien été tentée
            expect(failingJobFunction).toHaveBeenCalledTimes(1);
            // - Le verrou a quand même été libéré (c'est le test le plus important ici)
            const lockInDb = await jobsCollection.findOne({ jobId: jobId });
            expect(lockInDb).not.toBeNull();
            // La date d'expiration est mise à une date passée (ici, l'époque UNIX 0)
            expect(lockInDb.lockedUntil.getTime()).toBe(new Date(0).getTime());
        });
    });

    describe('Moteur de Workflow (processWorkflowRun)', () => {

        it('devrait arrêter un workflow en boucle et le marquer comme "failed"', async () => {
            // 1. Arrange: Créer un workflow qui boucle sur lui-même
            const action = (await insertData('workflowAction', { name: 'Log Action', type: 'Log' }, {}, mockUser)).insertedIds[0];
            const step1 = (await insertData('workflowStep', { name: 'Step 1', actions: [action] }, {}, mockUser)).insertedIds[0];
            const step2 = (await insertData('workflowStep', { name: 'Step 2', onSuccessStep: step1.toString() }, {}, mockUser)).insertedIds[0];
            await editData('workflowStep', step1, { onSuccessStep: step2.toString() }, {}, mockUser);

            const workflow = (await insertData('workflow', { name: 'Looping Workflow', startStep: step1.toString() }, {}, mockUser)).insertedIds[0];
            const run = (await insertData('workflowRun', { workflow: workflow, status: 'pending', contextData: {} }, {}, mockUser)).insertedIds[0];

            // 2. Act: Lancer le traitement du workflow
            await workflowModule.processWorkflowRun(run, mockUser);

            // 3. Assert: Le workflow a été arrêté et marqué comme échoué
            const finalRun = await testDatasColInstance.findOne({ _id: new ObjectId(run) });
            expect(finalRun.status).toBe('failed');
            expect(finalRun.error).toContain("Maximum executions ("+maxExecutionsByStep+") exceed");
            // Vérifier que le compteur de steps a bien augmenté
            expect(Object.keys(finalRun.stepExecutionsCount).length).toBeGreaterThan(1);
        }, 10000); // Timeout un peu plus long pour ce test

        it('devrait suivre le chemin "onFailureStep" si les conditions ne sont pas remplies', async () => {
            // 1. Arrange:
            const successAction = (await insertData('workflowAction', { name: 'Success Action', type: 'Log' }, {}, mockUser)).insertedIds[0];
            const failureAction = (await insertData('workflowAction', { name: 'Failure Action', type: 'Log' }, {}, mockUser)).insertedIds[0];

            const successStep = (await insertData('workflowStep', { name: 'Success Step', actions: [successAction], isTerminal: true }, {}, mockUser)).insertedIds[0];
            const failureStep = (await insertData('workflowStep', { name: 'Failure Step', actions: [failureAction], isTerminal: true }, {}, mockUser)).insertedIds[0];

            const startStepDef = {
                name: 'Conditional Step',
                // Cette condition est conçue pour échouer car la donnée n'existera pas
                conditions: { status: 'must-be-this-to-succeed' },
                onSuccessStep: successStep.toString(),
                onFailureStep: failureStep.toString(),
            };
            const startStep = (await insertData('workflowStep', startStepDef, {}, mockUser)).insertedIds[0];
            const workflow = (await insertData('workflow', { name: 'Failure Path Workflow', startStep: startStep.toString() }, {}, mockUser)).insertedIds[0];
            const run = (await insertData('workflowRun', { workflow: workflow, status: 'pending', contextData: { triggerDataModel: 'project' } }, {}, mockUser)).insertedIds[0];

            // 2. Act
            await workflowModule.processWorkflowRun(run, mockUser);

            // 3. Assert
            const finalRun = await testDatasColInstance.findOne({ _id: new ObjectId(run) });

            // Le workflow doit se terminer avec le statut 'completed', car une condition
            // non remplie est une branche valide, pas une erreur système.
            expect(finalRun.status).toBe('completed');
            expect(finalRun.error).toBeNull(); // Aucune erreur ne doit être enregistrée
            expect(finalRun.stepExecutionsCount[startStep]).toBe(1); // Aucune erreur ne doit être enregistrée
            expect(finalRun.stepExecutionsCount[failureStep]).toBe(1); // Aucune erreur ne doit être enregistrée

        }, 10000);

        it('devrait échouer proprement si une définition d\'étape est introuvable', async () => {
            // 1. Arrange: Créer un workflow qui pointe vers un step ID invalide
            const nonExistentStepId = new ObjectId().toString();
            const workflow = (await insertData('workflow', { name: 'Broken Workflow', startStep: nonExistentStepId }, {}, mockUser)).insertedIds[0];
            const run = (await insertData('workflowRun', { workflow: workflow, status: 'pending' }, {}, mockUser)).insertedIds[0];

            // 2. Act
            await workflowModule.processWorkflowRun(run, mockUser);

            // 3. Assert
            const finalRun = await testDatasColInstance.findOne({ _id: new ObjectId(run) });
            expect(finalRun.status).toBe('failed');
            expect(finalRun.error).toContain(`Step definition ID: ${nonExistentStepId} not found`);
        });
    });

    describe('Déclencheurs (triggerWorkflows)', () => {

        it('devrait ignorer un trigger avec un dataFilter invalide (JSON malformé) sans planter', async () => {
            const workflow = (await insertData('workflow', { name: 'Valid Workflow' }, {}, mockUser)).insertedIds[0];

            // 1. Arrange: Créer un trigger avec un JSON invalide dans le dataFilter
            await insertData('workflowTrigger', {
                name: 'Trigger with bad filter',
                targetModel: targetDataModel.name,
                onEvent: 'DataAdded',
                isActive: true,
                // JSON volontairement cassé
                dataFilter: '{"status": "active", }',
                workflow: workflow.toString()
            }, {}, mockUser);

            // 2. Act & Assert: On s'attend à ce que l'appel ne lève pas d'exception et se termine.
            // Le trigger sera juste ignoré.
            const projectData = { projectName: 'Test Project', status: 'active' };
            await expect(workflowModule.triggerWorkflows(projectData, mockUser, 'DataAdded')).resolves.toBeUndefined();

            // Aucun workflowRun ne doit être créé
            const runCount = await testDatasColInstance.countDocuments({ _model: 'workflowRun' });
            expect(runCount).toBe(0);
        });
    });
});