// __tests__/data.integration.test.js
import { ObjectId } from 'mongodb';
import {expect, describe, it, beforeAll} from 'vitest';
import { Config } from '../src/config.js';

import {
    getCollection // Accès direct pour vérifications
} from '../src/modules/mongodb.js';
import {generateUniqueName, initEngine} from "../src/setenv.js";
import {editModel} from "../src/index.js";
import {getCollectionForUser} from "../src/modules/mongodb.js";

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
            const result = await editM  odel(currentTestUser, testModelId, updatedModelData);
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

});