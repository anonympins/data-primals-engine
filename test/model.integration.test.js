// __tests__/data.integration.test.js
import { ObjectId } from 'mongodb';
import {expect,beforeEach, describe, it, beforeAll} from 'vitest';
import { Config } from '../src/config.js';

import {
    getCollection, modelsCollection // Accès direct pour vérifications
} from '../src/modules/mongodb.js';
import {generateUniqueName, initEngine} from "../src/setenv.js";
import {editModel, searchData} from "../src/index.js";
import {getCollectionForUser} from "../src/modules/mongodb.js";
import {purgeData} from "../src/modules/data/data.history.js";

let testModelsColInstance;
let testModelId;
// Cette fonction va remplacer la logique de votre beforeEach pour la création de contexte
async function setupTestContext() {

    const currentTestModelName = generateUniqueName('relatedModel');
    const currentRelatedModelName = generateUniqueName('comprehensiveModel');


    // Créer un utilisateur unique pour ce test
    const currentTestUser = {
        username: generateUniqueName('testuserModelIntegration'),
        userPlan: 'free',
        email: generateUniqueName('test') + '@example.com'
    };

    testModelsColInstance = getCollection("models");
    const testDatasColInstance = await getCollectionForUser(currentTestUser);

    const relatedModelDefinition = {
        name: currentRelatedModelName,
        _user: currentTestUser.username,
        description: 'Model for testing relations',
        fields: [
            {name: 'relatedName', type: 'string', required: true, unique: true},
            {name: 'relatedValue', type: 'number'}
        ],
        maxRequestData: 10
    };

    const comprehensiveTestModelDefinition = {
        name: currentTestModelName,
        _user: currentTestUser.username,
        description: 'A model with all field types and constraints for testing',
        fields: [
            // String types
            {name: 'stringRequired', type: 'string', required: true, hint: 'A required string'},
            {name: 'stringUnique', type: 'string', unique: true, hint: 'A unique string'},
            {name: 'stringMaxLength', type: 'string', maxlength: 5, hint: 'String with max length 5'},
            {name: 'stringDefault', type: 'string', default: 'defaultString'},
            {name: 'string_tLang', type: 'string_t', hint: 'Localizable string'},
            {name: 'richtextField', type: 'richtext', maxlength: 200},
            {name: 'passwordField', type: 'password'},
            {name: 'emailField', type: 'email'},
            {name: 'phoneField', type: 'phone'},
            {name: 'urlField', type: 'url'},
            // Number types
            {name: 'number', type: 'number'},
            {name: 'numberMinMax', type: 'number', min: 10, max: 20},
            {name: 'numberStep', type: 'number', step: 0.5},
            {name: 'numberDefault', type: 'number', default: 42},
            // Boolean
            {name: 'booleanField', type: 'boolean'},
            {name: 'booleanDefault', type: 'boolean', default: true},
            // Date & Datetime
            {name: 'dateField', type: 'date'},
            {name: 'datetimeField', type: 'datetime', default: 'now'},
            {name: 'dateMinMax', type: 'date', min: '2023-01-01', max: '2023-12-31'},
            // Enum
            {name: 'enumField', type: 'enum', items: ['alpha', 'beta', 'gamma']},
            {name: 'enumDefault', type: 'enum', items: ['one', 'two'], default: 'one'},
            // Array
            {name: 'arrayString', type: 'array', itemsType: 'string', maxItems: 2},
            {name: 'arrayNumber', type: 'array', itemsType: 'number', minItems: 1},
            {name: 'arrayEnum', type: 'array', itemsType: 'enum', items: ['a', 'b']},
            // Relation
            {name: 'relationSingle', type: 'relation', relation: currentRelatedModelName},
            {name: 'relationMultiple', type: 'relation', relation: currentRelatedModelName, multiple: true},
            // File (metadata validation)
            {name: 'fileField', type: 'file', mimeTypes: ['image/png', 'application/pdf'], maxSize: 1024 * 10}, // 10KB
            // Color
            {name: 'colorField', type: 'color'},
            // Code
            {name: 'codeJsonField', type: 'code', language: 'json'},
            {name: 'codeJsField', type: 'code', language: 'javascript', maxlength: 100},
            // Object (simple validation, structure not deeply validated by default dataTypes.object)
            {name: 'objectField', type: 'object'},
            // Model & ModelField (validation of string format, not existence)
            {name: 'modelNameField', type: 'model'},
            {name: 'modelFieldNameField', type: 'modelField'} // Note: modelField type expects an object {model: 'modelName', field: 'fieldName'}
        ],
        maxRequestData: 50
    };

    // Insérer les modèles en base
    const result=  await testModelsColInstance.insertMany([
        comprehensiveTestModelDefinition,
        relatedModelDefinition
    ]);

    testModelId = result.insertedIds[0];

    await purgeData(currentTestUser, comprehensiveTestModelDefinition.name);
    await purgeData(currentTestUser, relatedModelDefinition.name);

    await testDatasColInstance.deleteMany({ _user: currentTestUser.username });
    await testDatasColInstance.deleteMany({ _model: { $in: [comprehensiveTestModelDefinition.name, 'renamedTestModel'] } });
    // Retourner toutes les variables nécessaires pour un test

    return {
        currentTestUser,
        coll:testDatasColInstance,
        comprehensiveTestModelDefinition,
        relatedModelDefinition
    };
}


describe('CRUD on model definitions and integrity tests', () => {

    beforeAll(async () =>{
        Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);
        await initEngine();
    })

    describe('editModel unit tests', () => {

        it('should create and drop index when field.index is toggled (premium user)', async () => {
            // --- SETUP ---
            const { coll, currentTestUser, comprehensiveTestModelDefinition } = await setupTestContext();
            const fieldToIndex = 'stringUnique'; // Utiliser un champ qui existe vraiment dans le modèle

            // --- FIX: Ensure the collection exists before any operation ---
            // By inserting and deleting a dummy document, we force MongoDB to create the
            // collection and its default indexes. This prevents the "ns does not exist"
            // error in asynchronous listeners (like workflow triggers).
            const dummyDoc = await coll.insertOne({ _model: 'dummy', _user: currentTestUser.username });
            await coll.deleteOne({ _id: dummyDoc.insertedId });


            // --- VERIFICATION INITIALE ---
            // S'assurer qu'aucun index n'existe au départ.
            // Cet appel ne plantera plus car la collection est maintenant créée.
            const initialIndexes = await coll.indexes();
            expect(initialIndexes.some(i => i.key[fieldToIndex] === 1)).toBe(false);

            // --- ACTION 1 : AJOUTER UN INDEX ---
            const modelWithIndex = {
                ...comprehensiveTestModelDefinition,
                fields: comprehensiveTestModelDefinition.fields.map(f =>
                    f.name === fieldToIndex ? { ...f, index: true } : f
                )
            };
            await editModel(currentTestUser, testModelId, modelWithIndex);

            // --- VERIFICATION 1 ---
            // Maintenant, la collection et l'index doivent exister.
            const indexesAfterCreation = await coll.indexes();
            const newIndex = indexesAfterCreation.find(i => i.key[fieldToIndex] === 1);

            expect(newIndex).toBeDefined();
            // Le filtre partiel est crucial pour que l'index ne s'applique qu'aux bonnes données
            expect(newIndex.partialFilterExpression).toEqual({
                _model: comprehensiveTestModelDefinition.name,
                _user: currentTestUser.username
            });

            // --- ACTION 2 : SUPPRIMER L'INDEX ---
            const modelWithoutIndex = {
                ...comprehensiveTestModelDefinition,
                fields: comprehensiveTestModelDefinition.fields.map(f =>
                    f.name === fieldToIndex ? { ...f, index: false } : f
                )
            };
            await editModel(currentTestUser, testModelId, modelWithoutIndex);

            // --- VERIFICATION 2 ---
            const indexesAfterDeletion = await coll.indexes();
            expect(indexesAfterDeletion.some(i => i.key[fieldToIndex] === 1)).toBe(false);

        }, 20000);

        it('should not save extra, non-defined fields in the model definition', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            // 1. Préparer les données avec un champ non sollicité
            const updatedModelData = {
                ...comprehensiveTestModelDefinition,
                description: 'An updated description',
                extraBogusField: 'this should not be saved', // Champ arbitraire
                anotherOne: { nested: true }
            };
            // 2. Appeler la fonction d'édition
            const result = await editModel(currentTestUser, testModelId, updatedModelData);
            expect(result.success).toBe(false);
        });
        it('should return an error if trying to edit a non-existent model', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const nonExistentId = new ObjectId();
            const result = await editModel(currentTestUser, nonExistentId, comprehensiveTestModelDefinition);
            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(404);
            expect(result.error).toContain('introuvable');
        });
        it('should return an error if the new model structure is invalid', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const invalidModelData = {
                ...comprehensiveTestModelDefinition,
                fields: [
                    { name: 'title' } // Le champ 'type' est manquant, ce qui est invalide
                ]
            };
            const result = await editModel(currentTestUser, testModelId, invalidModelData);
            expect(result.success).toBe(false);
            // L'erreur est levée par validateModelStructure, donc le message peut varier
            expect(result.error).toBeDefined();
        });
    });

    describe('Index Management via editModel', () => {
        it('should create a regular index on a field', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const modelDef = {
                name: 'indexedModel',
                description: '',
                _user: currentTestUser.username,
                fields: [{ name: 'indexedField', type: 'string', index: true }]
            };
            const { insertedId } = await modelsCollection.insertOne(modelDef);

            await editModel(currentTestUser, insertedId, modelDef);

            const dataColl = await getCollectionForUser(currentTestUser);
            const indexes = await dataColl.indexes();
            console.log(indexes);
            const createdIndex = indexes.find(idx => idx.key.indexedField === 1);

            expect(createdIndex).toBeDefined();
            expect(createdIndex.name).toBe('indexedField_regular_idx');
            expect(createdIndex.partialFilterExpression).toEqual({
                _model: 'indexedModel',
                _user: currentTestUser.username
            });
        });

        it('should create a 2dsphere index for geolocation fields', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const modelDef = {
                name: 'geoModel',
                description: '',
                _user: currentTestUser.username,
                fields: [{ name: 'location', type: 'geolocation', index: true, indexType: '2dsphere' }]
            };
            const { insertedId } = await modelsCollection.insertOne(modelDef);

            await editModel(currentTestUser, insertedId, modelDef);

            const dataColl = await getCollectionForUser(currentTestUser);
            const indexes = await dataColl.indexes();
            console.log(indexes);
            const geoIndex = indexes.find(idx => idx.key.location === '2dsphere');

            expect(geoIndex).toBeDefined();
            expect(geoIndex.name).toBe('location_2dsphere_idx');
        });

        it('should create a single compound text index for multiple text fields', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const modelDef = {
                name: 'textSearchModel',
                description: '',
                _user: currentTestUser.username,
                fields: [
                    { name: 'title', type: 'string', index: true, indexType: 'text' },
                    { name: 'content', type: 'richtext', index: true, indexType: 'text' }
                ]
            };
            const { insertedId } = await modelsCollection.insertOne(modelDef);

            await editModel(currentTestUser, insertedId, modelDef);

            const dataColl = await getCollectionForUser(currentTestUser);
            const indexes = await dataColl.indexes();
            const textIndex = indexes.find(idx => idx.name === `_text_search_idx_${modelDef.name}`);

            expect(textIndex).toBeDefined();
            expect(textIndex.key._fts).toBe('text');
            expect(textIndex.weights).toEqual({ title: 1, content: 1 });
        });

        it('should drop an index when a field is un-indexed', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const initialModelDef = {
                name: 'toggleIndexModel',
                description: '',
                _user: currentTestUser.username,
                fields: [{ name: 'tempIndexField', type: 'string', index: true }]
            };
            const { insertedId } = await modelsCollection.insertOne(initialModelDef);
            await editModel(currentTestUser, insertedId, initialModelDef);

            const dataColl = await getCollectionForUser(currentTestUser);
            let indexes = await dataColl.indexes();
            expect(indexes.some(idx => idx.key.tempIndexField === 1)).toBe(true);

            const updatedModelDef = { ...initialModelDef, fields: [{ name: 'tempIndexField', type: 'string', index: false }] };
            await editModel(currentTestUser, insertedId, updatedModelDef);

            indexes = await dataColl.indexes();
            expect(indexes.some(idx => idx.key.tempIndexField === 1)).toBe(false);
        });
    });

    describe('Special Pipeline Execution via searchData', () => {
        beforeEach(async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const testModel = {
                name: 'searchTestModel',
                description: '',
                _user: currentTestUser.username,
                fields: [
                    { name: 'name', type: 'string', index: true, indexType: 'text' },
                    { name: 'description', type: 'string', index: true, indexType: 'text' },
                    { name: 'value', type: 'number' },
                    { name: 'location', type: 'geolocation', index: true, indexType: '2dsphere' }
                ]
            };
            const { insertedId } = await modelsCollection.insertOne(testModel);
            await editModel(currentTestUser, insertedId, testModel);

            const testData = [
                { _model: 'searchTestModel', _user: currentTestUser.username, name: 'First Item', description: 'A test document about MongoDB.', value: 10, location: { type: 'Point', coordinates: [-73.9667, 40.78] } },
                { _model: 'searchTestModel', _user: currentTestUser.username, name: 'Second TEST Item', description: 'Another document for testing.', value: 20, location: { type: 'Point', coordinates: [-74.0, 40.71] } },
                { _model: 'searchTestModel', _user: currentTestUser.username, name: 'Third Thing', description: 'Completely different.', value: 30, location: { type: 'Point', coordinates: [0, 0] } }
            ];
            const dataColl = await getCollectionForUser(currentTestUser);
            await dataColl.insertMany(testData);
            await new Promise(resolve => setTimeout(resolve, 200)); // Allow indexes to build
        });

        it('should execute a $regex query correctly', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const { data, count } = await searchData({ model: 'searchTestModel', filter: { name: { $regex: 'item', $options: 'i' } } }, currentTestUser);
            expect(count).toBe(2);
            expect(data.some(d => d.name === 'First Item')).toBe(true);
        });

        it('should execute a $text search query correctly', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const { data, count } = await searchData({ model: 'searchTestModel', filter: { $text: { $search: 'mongodb' } } }, currentTestUser);
            expect(count).toBe(1);
            expect(data[0].name).toBe('First Item');
        });

        it('should execute a $nearSphere query correctly', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const { data, count } = await searchData({ model: 'searchTestModel', filter: { location: { $nearSphere: { $geometry: { type: 'Point', coordinates: [-73.9, 40.7] }, $maxDistance: 20000 } } } }, currentTestUser);
            expect(count).toBe(2);
            expect(data.some(d => d.name === 'Third Thing')).toBe(false);
        });

        it('should execute a $geoNear stage and sort by distance', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const { data, count } = await searchData({ model: 'searchTestModel', filter: { $geoNear: { near: { type: 'Point', coordinates: [-74.0, 40.71] }, distanceField: "dist.calculated", spherical: true } } }, currentTestUser);
            expect(count).toBe(3);
            expect(data[0].name).toBe('Second TEST Item');
            expect(data[0].dist.calculated).toBe(0);
        });

        it('should handle a mix of special and standard operators in an $or clause', async () => {
            const { currentTestUser, comprehensiveTestModelDefinition, relatedModelDefinition } = await setupTestContext();
            const { data, count } = await searchData({ model: 'searchTestModel', filter: { $or: [{ name: { $regex: 'Third' } }, { value: { $gt: 15 } }] } }, currentTestUser);
            expect(count).toBe(2);
            expect(data.some(d => d.name === 'Second TEST Item')).toBe(true);
            expect(data.some(d => d.name === 'Third Thing')).toBe(true);
        });
    });
});