// test/data.backup.integration.test.js

import path from "node:path";
import { Config } from '../src/config.js';

import { ObjectId } from 'mongodb';
import {expect, describe, it, beforeAll, afterAll, beforeEach} from 'vitest';
import { vi } from 'vitest'

import {
    createModel,
    insertData
} from '../src/index.js';

import {
    modelsCollection as getAppModelsCollection,
    getCollectionForUser as getAppUserCollection, getCollectionForUser
} from '../src/modules/mongodb.js';
import process from "node:process";

import { dumpUserData, loadFromDump } from '../src/index.js';
import fs from "node:fs";
import {initEngine} from "../src/setenv.js";

vi.mock('data-primals-engine/engine', async(importOriginal) => {
    const mod = await importOriginal() // type is inferred
    return {
        ...mod
    };
});

// Mock data and settings
const mockUser = {
    username: 'testuserBackup',
    _user: 'testuserBackup',
    email: 'testBackup@example.com',
    configS3: {
        bucketName: null
    }
};
const testDbName = 'testIntegrationDbHO_Backup';
const testModelDefinition = {
    name: 'backupTestModel',
    _user: mockUser.username,
    description: 'Model for testing backup/restore',
    fields: [
        { name: 'testField', type: 'string', required: true },
        { name: 'optionalField', type: 'number' }
    ],
    maxRequestData: 10
};

let testModelsColInstance;
let testDatasColInstance;
let engineInstance;
let testDatasApi;

const backupDir = path.resolve('./test-backups'); // Use an absolute path

beforeAll(async () => {

    process.env.BACKUP_DIR = backupDir; // Set backup directory

    // Create the backup directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    // Delete any existing files in the backup directory
    fs.readdirSync(backupDir).forEach(file => {
        fs.unlinkSync(path.join(backupDir, file));
    });
    vi.stubEnv('ENCRYPTION_KEY', '00000000000000000000000000000000');
    vi.stubEnv('OPENAI_API_KEY', '00000000000000000000000000000000');
    // You might need to create a model first if your dumpUserData requires it
    await createModel(testModelDefinition);
}, 45000);

afterAll(async () => {

    delete process.env.DB_URL;
    delete process.env.DB_NAME;

    // Clean up test backups
    if (fs.existsSync(backupDir)) {
        fs.readdirSync(backupDir).forEach(file => {
            fs.unlinkSync(path.join(backupDir, file));
        });
        fs.rmdirSync(backupDir); // Remove the directory itself
    }
    const coll = await getCollectionForUser(mockUser);
    await coll.drop()
});

beforeAll(async () =>{
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);
    await initEngine();
})
beforeEach(async () => {
    testModelsColInstance = getAppModelsCollection;
    testDatasColInstance = await getAppUserCollection(mockUser);
});

describe('Data Backup and Restore Integration', () => {
    it('should dump and restore user data successfully, and verify data integrity', async () => { // Le nom du test est plus précis
        // 1. Insérer des données à sauvegarder
        const initialData = { testField: 'Initial Value', optionalField: 123 };
        const insertResult = await insertData(testModelDefinition.name, initialData, {}, mockUser, false);
        expect(insertResult.success).toBe(true);
        const insertedId = insertResult.insertedIds[0];

        // Vérifier que les données existent avant la sauvegarde
        let docBeforeBackup = await testDatasColInstance.findOne({ _id: new ObjectId(insertedId) });
        expect(docBeforeBackup).not.toBeNull();
        expect(docBeforeBackup.testField).toBe('Initial Value');

        // 2. Sauvegarder les données
        await dumpUserData(mockUser);

        // 3. Simuler une suppression totale des données
        await testDatasColInstance.deleteMany({ _user: mockUser.username });
        let docAfterDelete = await testDatasColInstance.findOne({ _id: new ObjectId(insertedId) });
        expect(docAfterDelete).toBeNull();

        // 4. Restaurer les données
        await loadFromDump(mockUser);

        // 5. **VÉRIFICATION FINALE** : S'assurer que les données sont restaurées correctement
        const countAfterRestore = await testDatasColInstance.countDocuments({ _user: mockUser.username });
        expect(countAfterRestore).toBeGreaterThan(0);

        const docAfterRestore = await testDatasColInstance.findOne({ _user: mockUser.username, _model: testModelDefinition.name });
        expect(docAfterRestore).not.toBeNull();
        expect(docAfterRestore.testField).toBe('Initial Value');
        expect(docAfterRestore.optionalField).toBe(123);

        console.log("Tests passed for backup and restore");

    }, 15000); // Timeout augmenté pour les opérations de fichiers
});