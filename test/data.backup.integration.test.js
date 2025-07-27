// test/data.backup.integration.test.js

import path from "node:path";
import { Config } from '../src/config.js';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import {expect, describe, it, beforeAll, afterAll, beforeEach} from 'vitest';
import { vi } from 'vitest'
import { Buffer } from 'node:buffer'; // Explicitly import Buffer
import crypto from 'node:crypto';  //Explicitly import crypto

import {
    createModel,
    getModel, insertData
} from 'data-primals-engine/modules/data';

import {
    modelsCollection as getAppModelsCollection,
    getCollectionForUser as getAppUserCollection,
} from 'data-primals-engine/modules/mongodb';
import { Engine } from "data-primals-engine/engine";
import process from "node:process";

import { dumpUserData, loadFromDump, getUserHash } from 'data-primals-engine/modules/data';
import fs from "node:fs";
import {getRandom} from "data-primals-engine/core";
import {getUniquePort, initEngine, stopEngine} from "../src/setenv.js";

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
    userPlan: 'premium',
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
        { name: 'optionalField', type: 'number' },
    ],
    maxRequestData: 10,
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
    vi.stubEnv('S3_CONFIG_ENCRYPTION_KEY', '00000000000000000000000000000000');
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
        // Optional: fs.rmdirSync(backupDir); // Remove the directory itself
    }
});

beforeAll(async () =>{
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);
    await initEngine();
})
beforeEach(async () => {
    testModelsColInstance = getAppModelsCollection;
    testDatasColInstance = getAppUserCollection(mockUser);
});

describe('Data Backup and Restore Integration', () => {
    it('should dump and restore user data successfully', async ({skip}) => {

        // 1. Insert some data to be backed up
        const initialData = { testField: 'Initial Value', optionalField: 123 };
        const insertResult = await insertData(testModelDefinition.name, initialData, {}, mockUser, false); // Assuming direct API call
        expect(insertResult.success).toBe(true);
        const insertedId = insertResult.insertedIds[0];

        // Verify data exists before backup
        let doc = await testDatasColInstance.findOne({ _id: new ObjectId(insertedId) });
        expect(doc).not.toBeNull();
        expect(doc.testField).toBe('Initial Value');

        //2. Backup the data
        await dumpUserData(mockUser);

        //3. Simulate deleting all data (for testing purposes)
        await testDatasColInstance.deleteMany({});
        let docAfterDelete = await testDatasColInstance.findOne({ _id: new ObjectId(insertedId) });
        expect(docAfterDelete).toBeNull();

        //4. Restore the data
        await loadFromDump(mockUser);

    }, 5000); // Increased timeout for potentially long operations
});