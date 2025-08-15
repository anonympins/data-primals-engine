// __tests__/data.history.integration.test.js
import { ObjectId } from 'mongodb';
import { expect, describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Config } from '../src/config.js';
import { sleep } from '../src/core.js';
import { insertData, editData, deleteModels } from '../src/index.js';
import { getCollection, getCollectionForUser } from '../src/modules/mongodb.js';
import { generateUniqueName, initEngine } from "../src/setenv.js";
import {purgeData} from "../src/modules/data/data.history.js";
import {MongoDatabase} from "../src/engine.js";

let engine;
let testUser;
let historyCollection;
let datasCollection;
let modelsCollection;

describe('Data History Module Integration Tests', () => {

    beforeAll(async () => {
        // IMPORTANT: Add the history module to the engine configuration for tests
        Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow", "user", "assistant"]);
        engine = await initEngine();

        // Setup a single user for all tests in this suite
        testUser = {
            username: generateUniqueName('testUserHistory'),
            userPlan: 'free',
            email: generateUniqueName('test') + '@example.com'
        };

        // Initialize collection instances
        historyCollection = getCollection('history');
        datasCollection = await getCollectionForUser(testUser);
        modelsCollection = getCollection('models');
    });

    afterAll(async () =>{
        await purgeData(testUser);
        await datasCollection.drop();
    })

    // Clean up collections before each test to ensure isolation
    beforeEach(async () => {
        await historyCollection.deleteMany({ 'user.username': testUser.username });
        await datasCollection.deleteMany({ _user: testUser.username });
        await modelsCollection.deleteMany({ _user: testUser.username });
    });

    afterAll(async () => {
        // Final cleanup
        await historyCollection.deleteMany({ 'user.username': testUser.username });
        await datasCollection.deleteMany({ _user: testUser.username });
        await modelsCollection.deleteMany({ _user: testUser.username });
    });

    it('should create a full snapshot history record on document creation', async () => {
        // 1. Define and create a model with history enabled
        const modelName = generateUniqueName('productHistory');
        const productModelDef = {
            name: modelName,
            description:"",
            _user: testUser.username,
            history: {
                enabled: true,
                // For creation, all fields are snapshotted regardless of this config
                fields: {
                    price: true,
                    stock: true
                }
            },
            fields: [
                { name: 'name', type: 'string', required: true },
                { name: 'price', type: 'number' },
                { name: 'stock', type: 'number' },
                { name: 'description', type: 'string' }
            ]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Insert a new document
        const initialData = {
            name: 'Super Widget',
            price: 99.99,
            stock: 100,
            description: 'A very super widget.'
        };
        const insertResult = await insertData(modelName, initialData, {}, testUser);
        expect(insertResult.success).toBe(true);
        const docId = new ObjectId(insertResult.insertedIds[0]);

        // 3. Verify the history record
        const historyRecord = await historyCollection.findOne({ documentId: new ObjectId(docId) });

        expect(historyRecord).not.toBeNull();
        expect(historyRecord.documentId.toString()).toBe(docId.toString());
        expect(historyRecord.model).toBe(modelName);
        expect(historyRecord.version).toBe(1);
        expect(historyRecord.operation).toBe('create');
        expect(historyRecord.user.username).toBe(testUser.username);

        // 4. Verify the snapshot
        expect(historyRecord.snapshot).not.toBeNull();
        expect(historyRecord.snapshot.name).toBe('Super Widget');
        expect(historyRecord.snapshot.price).toBe(99.99);
        expect(historyRecord.snapshot.stock).toBe(100);
        expect(historyRecord.snapshot.description).toBe('A very super widget.');
        expect(historyRecord.changes).toBeUndefined(); // No 'changes' field on creation
    });

    it('should create a diff history record on document update for historized fields only', async () => {
        // 1. Define and create a model with specific history fields
        const modelName = generateUniqueName('productHistorySelective');
        const productModelDef = {
            name: modelName,
            description:"",
            _user: testUser.username,
            history: {
                enabled: true,
                fields: {
                    price: true, // Track this
                    stock: true  // Track this
                    // 'description' is NOT tracked
                }
            },
            fields: [
                { name: 'name', type: 'string', required: true },
                { name: 'price', type: 'number' },
                { name: 'stock', type: 'number' },
                { name: 'description', type: 'string' }
            ]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Insert the initial document
        const initialData = { name: 'Selective Widget', price: 50, stock: 200, description: 'Initial description.' };
        const insertResult = await insertData(modelName, initialData, {}, testUser);
        const docId = new ObjectId(insertResult.insertedIds[0]);

        // 3. Edit the document: change one historized field and one non-historized field
        const updateData = { price: 55.5, description: 'Updated description.' };
        const editResult = await editData(modelName, { _id: docId }, updateData, {}, testUser);
        expect(editResult.success).toBe(true);

        // 4. Verify the new history record (v2)
        const historyRecord = await historyCollection.findOne({ documentId: docId, version: 2 });

        expect(historyRecord).not.toBeNull();
        expect(historyRecord.operation).toBe('update');
        expect(historyRecord.snapshot).toBeUndefined(); // No 'snapshot' on update

        // 5. Verify the 'changes' object
        const changes = historyRecord.changes;
        expect(changes).not.toBeNull();
        expect(changes.price).toBeDefined();
        expect(changes.price.from).toBe(50);
        expect(changes.price.to).toBe(55.5);
        expect(changes.description).toBeUndefined();
        expect(changes.stock).toBeUndefined();
    });

    it('should NOT create a history record if only non-historized fields are updated', async () => {
        // 1. Setup model
        const modelName = generateUniqueName('productHistoryNoOp');
        const productModelDef = {
            name: modelName,
            description:"",
            _user: testUser.username,
            history: { enabled: true, fields: { price: true } },
            fields: [
                { name: 'name', type: 'string', required: true },
                { name: 'price', type: 'number' },
                { name: 'description', type: 'string' }
            ]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Insert initial document
        const initialData = { name: 'No-Op Widget', price: 10, description: 'Initial.' };
        const insertResult = await insertData(modelName, initialData, {}, testUser);
        const docId = new ObjectId(insertResult.insertedIds[0]);

        // 3. Edit ONLY a non-historized field
        const updateData = { description: 'This change should not be recorded.' };
        await editData(modelName, { _id: docId }, updateData, {}, testUser);

        await sleep(2000);

        // 4. Verify that NO new history record was created (only the 'create' record exists)
        const historyCount = await historyCollection.countDocuments({ documentId: docId });
        expect(historyCount).toBe(1);
    });
});