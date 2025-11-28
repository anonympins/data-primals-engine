// __tests__/data.history.integration.test.js
import { ObjectId } from 'mongodb';
import { expect, describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { handleGetHistoryRequest, handleGetRevisionRequest, handleRevertToRevisionRequest } from '../src/modules/data/data.history.js';
import { Config } from '../src/config.js';
import { sleep } from '../src/core.js';
import { insertData, editData, deleteData } from '../src/index.js';
import { getCollection, getCollectionForUser } from '../src/modules/mongodb.js';
import { generateUniqueName, initEngine } from "../src/setenv.js";
import {purgeData} from "../src/modules/data/data.history.js";
import {MongoDatabase} from "../src/engine.js";

let engine;
let testUser;
let historyCollection;
let datasCollection;
let modelsCollection;

// Mock Express req/res objects for testing API handlers
const mockReq = (params = {}, query = {}, body = {}, user = testUser) => ({
    params,
    query,
    body,
    me: user
});
const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
};

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
        const docId = new ObjectId(insertResult.data._id);

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
        const docId = new ObjectId(insertResult.data._id);

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
        const docId = new ObjectId(insertResult.data._id);

        // 3. Edit ONLY a non-historized field
        const updateData = { description: 'This change should not be recorded.' };
        await editData(modelName, { _id: docId }, updateData, {}, testUser);

        await sleep(2000);

        // 4. Verify that NO new history record was created (only the 'create' record exists)
        const historyCount = await historyCollection.countDocuments({ documentId: docId });
        expect(historyCount).toBe(1);
    });

    it('should create a snapshot history record on document deletion', async () => {
        // 1. Setup model
        const modelName = generateUniqueName('productHistoryDelete');
        const productModelDef = {
            name: modelName,
            description:'',
            _user: testUser.username,
            history: { enabled: true },
            fields: [{ name: 'name', type: 'string' }]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Insert a document
        const insertResult = await insertData(modelName, { name: 'Document to be deleted' }, {}, testUser);
        const docId = new ObjectId(insertResult.data._id);

        // 3. Delete the document
        await deleteData(modelName, [docId.toString()], testUser);

        // 4. Verify the new history record (v2)
        const historyRecord = await historyCollection.findOne({ documentId: docId, version: 2 });

        expect(historyRecord).not.toBeNull();
        expect(historyRecord.operation).toBe('delete');
        expect(historyRecord.snapshot).not.toBeNull();
        expect(historyRecord.snapshot.name).toBe('Document to be deleted');
        expect(historyRecord.changes).toBeUndefined();
    });

    it('should correctly reconstruct a document at a specific version', async () => {
        // 1. Setup model
        const modelName = generateUniqueName('productHistoryReconstruct');
        const productModelDef = {
            name: modelName,
            _user: testUser.username,
            description:'',
            history: { enabled: true },
            fields: [
                { name: 'name', type: 'string' },
                { name: 'status', type: 'string' },
                { name: 'count', type: 'number' }
            ]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Create and update document to generate history
        const insertResult = await insertData(modelName, { name: 'Reconstruct', status: 'initial', count: 0 }, {}, testUser); // v1
        const docId = new ObjectId(insertResult.data._id);

        await editData(modelName, { _id: docId }, { status: 'updated' }, {}, testUser); // v2
        await editData(modelName, { _id: docId }, { count: 10 }, {}, testUser); // v3

        // 3. Test reconstruction at each version via the API handler
        // Version 1 (creation)
        let req = mockReq({ modelName, recordId: docId.toString(), version: '1' });
        let res = mockRes();
        await handleGetRevisionRequest(req, res);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('Reconstruct');
        expect(res.body.data.status).toBe('initial');
        expect(res.body.data.count).toBe(0);

        // Version 2 (status updated)
        req = mockReq({ modelName, recordId: docId.toString(), version: '2' });
        res = mockRes();
        await handleGetRevisionRequest(req, res);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('updated');
        expect(res.body.data.count).toBe(0); // count is still 0

        // Version 3 (count updated)
        req = mockReq({ modelName, recordId: docId.toString(), version: '3' });
        res = mockRes();
        await handleGetRevisionRequest(req, res);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('updated');
        expect(res.body.data.count).toBe(10);
    });

    it('should revert a document to a previous version and create a new history entry', async () => {
        // 1. Setup model
        const modelName = generateUniqueName('productHistoryRevert');
        const productModelDef = {
            name: modelName,
            _user: testUser.username,
            description:'',
            history: { enabled: true },
            fields: [{ name: 'name', type: 'string' }, { name: 'status', type: 'string' }]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Create and update document
        const insertResult = await insertData(modelName, { name: 'Revert Test', status: 'v1' }, {}, testUser); // v1
        const docId = new ObjectId(insertResult.data._id);
        await editData(modelName, { _id: docId }, { status: 'v2' }, {}, testUser); // v2

        // 3. Revert the document to version 1
        const req = mockReq({ modelName, recordId: docId.toString(), version: '1' });
        const res = mockRes();
        await handleRevertToRevisionRequest(req, res);

        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("Document successfully reverted.");

        // 4. Verify the current state of the document
        const revertedDoc = await datasCollection.findOne({ _id: docId });
        expect(revertedDoc.status).toBe('v1');

        // 5. Verify that a new history entry (v3) was created for the revert action
        const historyRecords = await historyCollection.find({ documentId: docId }).sort({ version: 1 }).toArray();
        expect(historyRecords).toHaveLength(3);

        const revertHistoryEntry = historyRecords[2]; // v3
        expect(revertHistoryEntry.version).toBe(3);
        expect(revertHistoryEntry.operation).toBe('update'); // A revert is an update
        expect(revertHistoryEntry.changes).not.toBeNull();
        expect(revertHistoryEntry.changes.status.from).toBe('v2');
        expect(revertHistoryEntry.changes.status.to).toBe('v1');
    });

    it('should filter history records by date range', async () => {
        // 1. Setup model
        const modelName = generateUniqueName('productHistoryDateFilter');
        const productModelDef = {
            name: modelName,
            description: "",
            _user: testUser.username,
            history: { enabled: true },
            fields: [{ name: 'name', type: 'string' }]
        };
        await modelsCollection.insertOne(productModelDef);

        // 2. Insert initial document
        const insertResult = await insertData(modelName, { name: 'Time-traveling Widget' }, {}, testUser);
        const docId = new ObjectId(insertResult.data._id);

        // 3. Create history entries at different times
        // To simulate different timestamps, we'll manually insert history records
        // as editData() would create them too close together in time.
        await historyCollection.updateOne({ documentId: docId, version: 1 }, { $set: { timestamp: new Date('2023-01-10T10:00:00Z') } });

        await historyCollection.insertOne({
            documentId: docId, model: modelName, version: 2, operation: 'update',
            timestamp: new Date('2023-02-15T12:00:00Z'), user: { username: testUser.username }, changes: { name: { from: 'v1', to: 'v2' } }
        });
        await historyCollection.insertOne({
            documentId: docId, model: modelName, version: 3, operation: 'update',
            timestamp: new Date('2023-02-20T14:00:00Z'), user: { username: testUser.username }, changes: { name: { from: 'v2', to: 'v3' } }
        });
        await historyCollection.insertOne({
            documentId: docId, model: modelName, version: 4, operation: 'update',
            timestamp: new Date('2023-03-05T16:00:00Z'), user: { username: testUser.username }, changes: { name: { from: 'v3', to: 'v4' } }
        });

        // Mock Express req/res objects
        // Using the global mockReq and mockRes helpers now

        // 4. Test cases
        // Case A: Filter for February
        let req = mockReq({ modelName, recordId: docId.toString() }, { startDate: '2023-02-01', endDate: '2023-02-28' });
        let res = mockRes();
        await handleGetHistoryRequest(req, res);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(2);
        expect(res.body.data.map(d => d._v).sort()).toEqual([2, 3]);

        // Case B: Filter starting from Feb 15th
        req = mockReq({ modelName, recordId: docId.toString() }, { startDate: '2023-02-15' });
        res = mockRes();
        await handleGetHistoryRequest(req, res);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(3); // v2, v3, v4

        // Case C: Filter up to Feb 15th (inclusive)
        req = mockReq({ modelName, recordId: docId.toString() }, { endDate: '2023-02-15' });
        res = mockRes();
        await handleGetHistoryRequest(req, res);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(2); // v1, v2
    });
});