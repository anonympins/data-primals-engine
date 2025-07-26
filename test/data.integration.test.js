// __tests__/data.integration.test.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import {expect, describe, it, beforeEach, beforeAll, afterAll, vi} from 'vitest';
import { Config } from "data-primals-engine/config"; // Assurez-vous que Config est importé si utilisé globalement avant les modules

// --- Configuration initiale pour l'environnement de test ---
let mongod;
let testDbUri;
const testDbName = 'testIntegrationDbHO_Comprehensive'; // Nom unique pour la base de test

Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);

// --- Importations des modules de votre application ---
import {
    insertData,
    editData,
    deleteData,
    getModel, searchData, installPack
} from 'data-primals-engine/modules/data';

import {
    modelsCollection as getAppModelsCollection,
    getCollection,
    getCollectionForUser as getAppUserCollection,
    datasCollection // Accès direct pour vérifications
} from 'data-primals-engine/modules/mongodb';
import { Engine } from "data-primals-engine/engine";
import process from "node:process";
import fs from "node:fs";
import util from "node:util";
import {getRandom} from "data-primals-engine/core";
import {getUniquePort} from "./setenv.js";
// Logger peut être utile pour le débogage des tests, mais pas essentiel pour les assertions
// import { Logger } from "../server/src/gameObject.js";

// --- Données Mock pour les tests ---
const mockUser = {
    username: 'testuserComprehensive',
    _user: 'testuserComprehensive',
    userPlan: 'premium',
    email: 'testComprehensive@example.com'
};

const relatedModelDefinition = {
    name: 'relatedComprehensiveModel',
    _user: mockUser.username,
    description: 'Model for testing relations',
    fields: [
        { name: 'relatedName', type: 'string', required: true, unique: true },
        { name: 'relatedValue', type: 'number' }
    ],
    maxRequestData: 10,
};

const comprehensiveTestModelDefinition = {
    name: 'comprehensiveTestModel',
    _user: mockUser.username,
    description: 'A model with all field types and constraints for testing',
    fields: [
        // String types
        { name: 'stringRequired', type: 'string', required: true, hint: 'A required string' },
        { name: 'stringUnique', type: 'string', unique: true, hint: 'A unique string' },
        { name: 'stringMaxLength', type: 'string', maxlength: 5, hint: 'String with max length 5' },
        { name: 'stringDefault', type: 'string', default: 'defaultString' },
        { name: 'string_tLang', type: 'string_t', hint: 'Localizable string' },
        { name: 'richtextField', type: 'richtext', maxlength: 200 },
        { name: 'passwordField', type: 'password' },
        { name: 'emailField', type: 'email' },
        { name: 'phoneField', type: 'phone' },
        { name: 'urlField', type: 'url' },
        // Number types
        { name: 'number', type: 'number' },
        { name: 'numberMinMax', type: 'number', min: 10, max: 20 },
        { name: 'numberStep', type: 'number', step: 0.5 },
        { name: 'numberDefault', type: 'number', default: 42 },
        // Boolean
        { name: 'booleanField', type: 'boolean' },
        { name: 'booleanDefault', type: 'boolean', default: true },
        // Date & Datetime
        { name: 'dateField', type: 'date' },
        { name: 'datetimeField', type: 'datetime', default: 'now' },
        { name: 'dateMinMax', type: 'date', min: '2023-01-01', max: '2023-12-31'},
        // Enum
        { name: 'enumField', type: 'enum', items: ['alpha', 'beta', 'gamma'] },
        { name: 'enumDefault', type: 'enum', items: ['one', 'two'], default: 'one' },
        // Array
        { name: 'arrayString', type: 'array', itemsType: 'string', maxItems: 2 },
        { name: 'arrayNumber', type: 'array', itemsType: 'number', minItems: 1 },
        { name: 'arrayEnum', type: 'array', itemsType: 'enum', items: ['a', 'b'] },
        // Relation
        { name: 'relationSingle', type: 'relation', relation: relatedModelDefinition.name },
        { name: 'relationMultiple', type: 'relation', relation: relatedModelDefinition.name, multiple: true },
        // File (metadata validation)
        { name: 'fileField', type: 'file', mimeTypes: ['image/png', 'application/pdf'], maxSize: 1024 * 10 }, // 10KB
        // Color
        { name: 'colorField', type: 'color' },
        // Code
        { name: 'codeJsonField', type: 'code', language: 'json' },
        { name: 'codeJsField', type: 'code', language: 'javascript', maxlength: 100 },
        // Object (simple validation, structure not deeply validated by default dataTypes.object)
        { name: 'objectField', type: 'object' },
        // Model & ModelField (validation of string format, not existence)
        { name: 'modelNameField', type: 'model' },
        { name: 'modelFieldNameField', type: 'modelField' }, // Note: modelField type expects an object {model: 'modelName', field: 'fieldName'}
    ],
    maxRequestData: 50,
};

let testModelsColInstance;
let testDatasColInstance;
let testPacksColInstance;
let engineInstance;

const port = process.env.PORT || getUniquePort(); // Different port for this test suite

beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { port: getUniquePort() } }); // Ensure a unique port if running multiple test files
    testDbUri = mongod.getUri();
    process.env.DB_URL = testDbUri;
    process.env.DB_NAME = testDbName;

    engineInstance = await Engine.Create();
    await engineInstance.start(port);

    vi.stubEnv('OPENAI_API_KEY', '00000000000000000000000000000000');

    // Get collection instances after engine has initialized modules
    testModelsColInstance = getAppModelsCollection;
    testDatasColInstance = getAppUserCollection(mockUser);
    testPacksColInstance = getCollection('packs');
});

beforeEach(async () => {
    // Clear data before each test
    await testDatasColInstance.deleteMany({});
    await testModelsColInstance.deleteMany({ _user: mockUser.username });
    await testPacksColInstance.deleteMany({});

    // Insert necessary model definitions for each test run
    // This ensures a clean state and that models are available
    // Validate structure before inserting (good practice)
    // validateModelStructure(comprehensiveTestModelDefinition);
    // validateModelStructure(relatedModelDefinition);

    await testModelsColInstance.insertMany([
        { ...comprehensiveTestModelDefinition }, // Spread to avoid mutation if object is reused
        { ...relatedModelDefinition }
    ]);
});

afterAll(async () => {
    await engineInstance.stop();
    await mongod.stop();
    delete process.env.DB_URL;
    delete process.env.DB_NAME;
});

describe('Intégration des fonctions CRUD de données avec validation complète', () => {


    describe('insertData avec comprehensiveTestModel', () => {
        it('devrait insérer des données valides pour tous les types de champs', async () => {
            // --- SETUP AMÉLIORÉ ---
            // 1. Créer un suffixe unique pour cette exécution de test
            const testSuffix = getRandom(1000, 9999); // Génère un nombre aléatoire

            // 2. Insérer les documents liés avec des noms uniques garantis
            const relatedDoc1 = await insertData(relatedModelDefinition.name, {
                relatedName: `Rel1_Unique_${testSuffix}`, // Nom unique
                relatedValue: 100
            }, {}, mockUser, false);

            const relatedDoc2 = await insertData(relatedModelDefinition.name, {
                relatedName: `Rel2_Unique_${testSuffix}`, // Nom unique
                relatedValue: 200
            }, {}, mockUser, false);

            // S'assurer que les insertions précédentes ont réussi avant de continuer
            expect(relatedDoc1.success, "L'insertion du document lié 1 a échoué").toBe(true);
            expect(relatedDoc2.success, "L'insertion du document lié 2 a échoué").toBe(true);

            // --- FIN DU SETUP AMÉLIORÉ ---

            const validData = {
                stringRequired: 'Valid String',
                stringUnique: `UniqueValueForInsert_${testSuffix}`, // Valeur unique garantie
                stringMaxLength: '12345',
                string_tLang: 'Bonjour',
                richtextField: '<p>Valid rich text</p>',
                passwordField: 'validPassword123',
                emailField: 'valid@example.com',
                phoneField: '+1234567890',
                urlField: 'https://example.com',
                number: 123,
                numberMinMax: 15,
                numberStep: 10.5,
                booleanField: true,
                dateField: '2023-07-15',
                dateMinMax: '2023-06-01',
                enumField: 'alpha',
                arrayString: ['one', 'two'],
                arrayNumber: [1, 2, 3],
                arrayEnum: ['a'],
                relationSingle: relatedDoc1.insertedIds[0].toString(),
                relationMultiple: [relatedDoc1.insertedIds[0].toString(), relatedDoc2.insertedIds[0].toString()],
                // Le mock de fichier est OK, pas besoin de le rendre unique
                fileField: { name: 'test.png', type: 'image/png', size: 1024 * 5, guid: `dummy-guid-png-${testSuffix}` },
                colorField: '#FF0000',
                codeJsonField: { "key": "value" },
                codeJsField: 'console.log("hello");',
                objectField: { a: 1, b: "test" },
                modelNameField: 'someModelName',
                modelFieldNameField: { model: 'someModelName', field: 'someFieldName' },
            };

            const result = await insertData(comprehensiveTestModelDefinition.name, validData, {}, mockUser, false);
            expect(result.success, `L'insertion principale a échoué: ${result.error}`).toBe(true);
            expect(result.insertedIds).toHaveLength(1);

            const insertedDoc = await testDatasColInstance.findOne({ _id: new ObjectId(result.insertedIds[0]) });
            expect(insertedDoc).not.toBeNull();
            expect(insertedDoc.stringRequired).toBe('Valid String');
            expect(insertedDoc.stringUnique).toBe(`UniqueValueForInsert_${testSuffix}`); // Vérifier la valeur unique
            expect(insertedDoc.stringDefault).toBe('defaultString');
            expect(new Date(insertedDoc.datetimeField).getFullYear()).toBe(new Date().getFullYear());
            expect(insertedDoc.booleanDefault).toBe(true);
            expect(insertedDoc.relationSingle.toString()).toBe(relatedDoc1.insertedIds[0].toString());
        }, 10000);

        describe('Validations des champs à l\'insertion', () => {
            // --- STRING VALIDATIONS ---
            it('devrait rejeter un string requis non fourni', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringUnique: 'test' /* stringRequired manquant */ }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('stringRequired');
            });

            it('devrait rejeter un string trop long pour maxlength', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', stringMaxLength: '123456' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('stringMaxLength');
            });

            it('devrait rejeter une valeur dupliquée pour un champ unique (stringUnique)', async () => {
                await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req1', stringUnique: 'duplicateMe', 'passwordField': 'pass', number: 1, enumField: 'test' }, {}, mockUser, false);
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req2', stringUnique: 'duplicateMe', 'passwordField': 'pass', number: 1, enumField: 'test' }, {}, mockUser, false);
                expect(result.success).toBe(false);
            });

            // --- NUMBER VALIDATIONS ---
            it('devrait rejeter un number non numérique', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', number: 'not-a-number' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('number');
            });

            it('devrait rejeter un number infur à min (numberMinMax)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', numberMinMax: 5 }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('numberMinMax');
            });

            it('devrait rejeter un number supérieur à max (numberMinMax)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', numberMinMax: 25 }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('numberMinMax');
            });

            // --- ARRAY VALIDATIONS ---
            it('devrait rejeter un array avec trop d\'items (arrayString maxItems: 2)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', arrayString: ['a', 'b', 'c'] }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('arrayString');
            });

            it('devrait rejeter un array avec pas assez d\'items (arrayNumber minItems: 1)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', arrayNumber: [] }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('arrayNumber');
            });

            it('devrait rejeter un array avec un item de type incorrect (arrayNumber)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', arrayNumber: [1, 'not-a-number', 3] }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('arrayNumber');
            });

            // --- FILE VALIDATIONS (metadata) ---
            it('devrait rejeter un file avec un mimeType non autorisé', async () => {
                const mockFile = { name: 'test.txt', type: 'text/plain', size: 1024, guid: 'dummy-txt' };
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', fileField: mockFile }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('image/png'); // Ou un message plus spécifique sur mimeTypes
                expect(result.error).toContain('text/plain'); // Ou un message plus spécifique sur mimeTypes
            });

            it('devrait rejeter un file avec une taille supérieure à maxSize', async () => {
                const mockFile = { name: 'large.png', type: 'image/png', size: 1024 * 15, guid: 'dummy-large' }; // 15KB > 10KB
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', fileField: mockFile }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('fileField'); // Ou un message plus spécifique sur maxSize
            });

            // --- EMAIL, URL, PHONE, COLOR (basic format) ---
            it('devrait rejeter un email invalide', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', emailField: 'not-an-email' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('emailField');
            });
            it('devrait rejeter une URL invalide', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', urlField: 'not a url' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('urlField');
            });
            it('devrait rejeter une couleur invalide', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', colorField: '#GGHHII' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('colorField');
            });

            // --- DATE / DATETIME VALIDATIONS ---
            it('devrait rejeter une date invalide (format)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', dateField: 'not-a-date' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('dateField');
            });
            it('devrait rejeter une date en dehors de min/max (dateMinMax)', async () => {
                const result = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'req', dateMinMax: '2024-01-01' }, {}, mockUser, false);
                expect(result.success).toBe(false);
                expect(result.error).toContain('dateMinMax');
            });

            // TODO: Ajouter des tests pour les autres types et contraintes (password, richtext, code, object, model, modelField)
            // Pour 'code' avec language 'json', tester l'insertion d'un JSON invalide si la validation va jusque-là.
            // Pour 'relation', tester l'insertion d'un ObjectId non existant (si la validation vérifie l'existence).
        });

        // --- NOUVEAU TEST POUR $find ---
        it('devrait insérer des données avec des relations référencées par $find', async () => {
            // 1. Insérer les documents liés qui seront trouvés par $find
            const relatedDocA = await insertData(relatedModelDefinition.name, { relatedName: 'FindMeA', relatedValue: 111 }, {}, mockUser, false);
            const relatedDocB = await insertData(relatedModelDefinition.name, { relatedName: 'FindMeB', relatedValue: 222 }, {}, mockUser, false);
            const relatedDocC = await insertData(relatedModelDefinition.name, { relatedName: 'FindMeC', relatedValue: 222 }, {}, mockUser, false);

            const relatedIdA = relatedDocA.insertedIds[0];
            const relatedIdB = relatedDocB.insertedIds[0];
            const relatedIdC = relatedDocC.insertedIds[0];

            // 2. Prr les données du document principal utilisant $find
            const dataWithFindRelations = {
                stringRequired: 'DocWithFind',
                stringUnique: 'UniqueFindValue',
                passwordField: 'findPass',
                enumField: 'beta',
                number: 99,
                // Utiliser $find pour la relation simple
                relationSingle: { $find: { $eq: ["$relatedName", 'FindMeA'] } },
                // Utiliser un tableau de $find pour la relation multiple
                relationMultiple: { $find: { $eq: ["$relatedValue", 222] } },
                // Inclure d'autres champs requis ou avec défauts si nécessaire
                stringMaxLength: 'short',
                emailField: 'find@example.com',
                phoneField: '+19876543210',
                urlField: 'https://find.example.com',
                numberMinMax: 18,
                dateField: '2023-11-20',
                dateMinMax: '2023-11-20',
                arrayNumber: [10],
                fileField: { name: 'find.png', type: 'image/png', size: 1024, guid: 'dummy-find-png' },
                colorField: '#123456',
                codeJsonField: { "find": true },
                codeJsField: 'console.log("find");',
                objectField: { find: "test" },
                modelNameField: 'findModel',
                modelFieldNameField: { model: 'findModel', field: 'findField' },
            };

            // 3. Insérer le document principal
            const result = await insertData(comprehensiveTestModelDefinition.name, dataWithFindRelations, {}, mockUser, false);

            // 4. Vérifier le résultat de l'insertion
            expect(result.success, `Insertion with $find failed: ${result.error}`).toBe(true);
            expect(result.insertedIds).toHaveLength(1);

            // 5. Récupérer le document inséré depuis la base de données
            const insertedDoc = await testDatasColInstance.findOne({ _id: new ObjectId(result.insertedIds[0]) });
            expect(insertedDoc).not.toBeNull();

            console.log({insertedDoc: insertedDoc.relationMultiple, relatedIdB})
            expect(insertedDoc.relationSingle).toBe(relatedIdA.toString());

            expect(insertedDoc.relationMultiple).toBeInstanceOf(Array);
            expect(insertedDoc.relationMultiple).toHaveLength(2);
            // Convertir les ObjectIds en string pour une comparaison facile
            const insertedRelationMultipleIds = insertedDoc.relationMultiple.map(id => id.toString());
            expect(insertedRelationMultipleIds).toContain(relatedIdB.toString());
            expect(insertedRelationMultipleIds).toContain(relatedIdC.toString());

            // Vérifier d'autres champs pour s'assurer que le reste des données est correct
            expect(insertedDoc.stringRequired).toBe('DocWithFind');
            expect(insertedDoc.enumField).toBe('beta');

        }, 10000); // Augmenter le timeout si nécessaire
    });

    describe('editData avec comprehensiveTestModel', () => {
        let docToEditId;
        let relatedDocId;

        beforeEach(async () => {
            // Insert a base document and a related document to be used in edit tests
            const relatedInsert = await insertData(relatedModelDefinition.name, { relatedName: 'RelForEdit', relatedValue: 50 }, {}, mockUser, false);
            relatedDocId = relatedInsert.insertedIds[0];

            const initialData = {
                stringRequired: 'Initial',
                stringUnique: 'UniqueForEdit',
                enumField: 'alpha',
                passwordField: 'initialPass',
                relationSingle: relatedDocId,
            };
            const insertResult = await insertData(comprehensiveTestModelDefinition.name, initialData, {}, mockUser, false);
            docToEditId = insertResult.insertedIds[0];
        });

        it('devrait modifier des données valides', async () => {
            const dataToEdit = { stringRequired: 'Edited String', numberMinMax: 12 };
            const result = await editData(comprehensiveTestModelDefinition.name, docToEditId, dataToEdit, {}, mockUser);

            expect(result.success, `Edit failed: ${result.error}`).toBe(true);
            expect(result.modifiedCount).toBe(1);

            const editedDoc = await testDatasColInstance.findOne({ _id: new ObjectId(docToEditId) });
            expect(editedDoc.stringRequired).toBe('Edited String');
            expect(editedDoc.numberMinMax).toBe(12);
        });

        it('devrait rejeter une modification avec un string requis vide', async () => {
            const result = await editData(comprehensiveTestModelDefinition.name, docToEditId, { stringRequired: '' }, {}, mockUser);
            expect(result.success).toBe(false);
            expect(result.error).toContain('stringRequired');
        });

        it('devrait rejeter une modification avec un number hors des bornes (numberMinMax)', async () => {
            const result = await editData(comprehensiveTestModelDefinition.name, docToEditId, { stringRequired: 'test', numberMinMax: 50 }, {}, mockUser);
            expect(result.success).toBe(false);
            expect(result.error).toContain('numberMinMax');
        });

        it('devrait rejeter une modification qui viole une contrainte unique (stringUnique)', async ({skip}) => {
            // Insert another doc to create the unique conflict

            await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'Other', stringUnique: 'UniqueValue', enumField: 'beta', passwordField: 'pass' }, {}, mockUser, false);
            // Insert another doc to create the unique conflict
            const res1 = await insertData(comprehensiveTestModelDefinition.name, { stringRequired: 'Other', stringUnique: 'ExistingUniqueValue', enumField: 'beta', passwordField: 'pass' }, {}, mockUser, false);

            const result = await editData(comprehensiveTestModelDefinition.name, { stringUnique: 'ExistingUniqueValue'}, { stringRequired: 'Other', stringUnique: 'UniqueValue', enumField: 'beta', passwordField: 'pass' }, {}, mockUser);
            expect(result.success).toBe(false);
            expect(result.error).toContain('UniqueValue');
            expect(result.error).toContain('stringUnique');
        });

        // TODO: Ajouter plus de tests de validation pour editData, similaires à ceux de insertData
    });

    // --- Tests deleteData (repris de votre exemple, peuvent être gardés tels quels ou adaptés) ---
    describe('deleteData (tests existants)', () => {
        it('supprimer des données par ID (deleteData)', async () => {
            const dataToDelete = { name: 'Objet à supprimer', value: 300 };
            // Utiliser le modèle simple pour ces tests delete pour ne pas avoir à remplir tous les champs requis de comprehensive
            const simpleModel = { name: 'simpleDeleteModel', _user: mockUser.username, description: '', fields: [{ name: 'name', type: 'string' }, { name: 'value', type: 'number' }] };
            await testModelsColInstance.insertOne(simpleModel);

            const insertResult = await insertData(simpleModel.name, dataToDelete, {}, mockUser, false);
            const docId = insertResult.insertedIds[0];

            const deleteResult = await deleteData(simpleModel.name, [docId], {}, mockUser, false);

            expect(deleteResult.success).toBe(true);
            expect(deleteResult.deletedCount).toBe(1);

            const deletedDoc = await testDatasColInstance.findOne({ _id: new ObjectId(docId) });
            expect(deletedDoc).toBeNull();
        });

        it('supprimer des données par filtre (deleteData)', async () => {
            const simpleModel = { name: 'deleteModelTest', _user: mockUser.username, description: '',fields: [{ name: 'name', type: 'string' }, { name: 'value', type: 'number' }] };
            await testModelsColInstance.insertOne(simpleModel);

            await insertData(simpleModel.name, { name: 'Item Filtrable 1', value: 401 }, {}, mockUser, false);
            await insertData(simpleModel.name, { name: 'Item Filtrable 2', value: 402 }, {}, mockUser, false);
            await insertData(simpleModel.name, { name: 'Autre Item', value: 403 }, {}, mockUser, false);

            const filter = { $regexMatch: {
                    input: '$name',
                    regex: "^Item Filtrable"
                } };
            const deleteResult = await deleteData(simpleModel.name, [], filter, mockUser, false);

            expect(deleteResult.success).toBe(true);
            expect(deleteResult.deletedCount).toBe(2);

            const remainingCount = await testDatasColInstance.countDocuments({ _model: simpleModel.name, name: { $regex: "^Item Filtrable" } });
            expect(remainingCount).toBe(0);
            const totalRemaining = await testDatasColInstance.countDocuments({ _model: simpleModel.name });
            expect(totalRemaining).toBe(1);
        });
    });

    // ... (dans data.integration.test.js, après les tests editData ou deleteData)

    describe('searchData avec comprehensiveTestModel et filtres $find', () => {
        let docId1, docId2;
        let relatedDocId_A1, relatedDocId_A2, relatedDocId_B1;

        beforeEach(async () => {
            // Insérer des documents liés
            const relA1 = await insertData(relatedModelDefinition.name, { relatedName: 'Rel_Search_A1', relatedValue: 101 }, {}, mockUser, false);
            relatedDocId_A1 = relA1.insertedIds[0].toString();
            const relA2 = await insertData(relatedModelDefinition.name, { relatedName: 'Rel_Search_A2', relatedValue: 102 }, {}, mockUser, false);
            relatedDocId_A2 = relA2.insertedIds[0].toString();
            const relB1 = await insertData(relatedModelDefinition.name, { relatedName: 'Rel_Search_B1', relatedValue: 201 }, {}, mockUser, false);
            relatedDocId_B1 = relB1.insertedIds[0].toString();

            // Insérer des documents principaux
            const data1 = {
                stringRequired: 'SearchDoc1',
                stringUnique: 'UniqueSearch1',
                enumField: 'alpha',
                passwordField: 'searchPass1',
                relationSingle: relatedDocId_A1,
                relationMultiple: [relatedDocId_A1, relatedDocId_A2],
                number: 10,
            };
            const insertResult1 = await insertData(comprehensiveTestModelDefinition.name, data1, {}, mockUser, false);
            docId1 = insertResult1.insertedIds[0].toString();

            const data2 = {
                stringRequired: 'SearchDoc2',
                stringUnique: 'UniqueSearch2',
                enumField: 'beta',
                passwordField: 'searchPass2',
                relationSingle: relatedDocId_B1,
                relationMultiple: [relatedDocId_B1],
                number: 20,
            };
            const insertResult2 = await insertData(comprehensiveTestModelDefinition.name, data2, {}, mockUser, false);
            docId2 = insertResult2.insertedIds[0].toString();
        });

        it('devrait trouver un document par une condition sur une relation simple ($find)', async () => {

            const searchParams = {
                user: mockUser,
                query: {
                    model: comprehensiveTestModelDefinition.name,
                    filter: {
                        relationSingle: {
                            "$find": { "$and": [{"$eq": ["$$this.relatedValue", 101]}] }
                        }
                    },
                    autoExpand: true,
                    depth: 8
                },
            };
            const { data, count } = await searchData(searchParams);
            expect(count).toBe(1);
            expect(data).toHaveLength(1);
            expect(data[0]._id.toString()).toBe(docId1.toString());
            // Vérifier que la relation est bien populée si depth > 0
            expect(data[0].relationSingle).toBeInstanceOf(Object);
            expect(data[0].relationSingle.relatedName).toBe('Rel_Search_A1');
        });

        it('ne devrait pas trouver de document si la condition $find sur relation simple ne correspond pas', async () => {
            const searchParams = {
                user: mockUser,
                query: {
                    model: comprehensiveTestModelDefinition.name,
                    filter: {
                        relationSingle: {
                            "$find": { "$eq": ["$$this.relatedName", "NonExistentRelName"] }
                        }
                    },
                    depth: 1
                }
            };
            const { data, count } = await searchData(searchParams);
            expect(count).toBe(0);
            expect(data).toHaveLength(0);
        });

        it('devrait trouver des documents par une condition sur une relation multiple ($find)', async () => {
            const searchParams = {
                user: mockUser,
                query: {
                    model: comprehensiveTestModelDefinition.name,
                    filter: {
                        $and: [{$ne:["$stringRequired", null]}, {
                            relationMultiple: { // Le champ qui est un tableau de relations
                                "$find": {"$eq": ["$$this.relatedValue", 102]} // Condition sur les documents liés
                            }
                        }]
                    },
                    depth: 1
                }
            };
            const { data, count } = await searchData(searchParams);
            expect(count).toBe(1);
            expect(data).toHaveLength(1);
            expect(data[0]._id.toString()).toBe(docId1.toString());
            // Note: searchData with depth > 0 will populate the relationMultiple array
            expect(data[0].relationMultiple).toBeInstanceOf(Array);
            expect(data[0].relationMultiple.some(rel => rel.relatedValue === 102)).toBe(true);
        });


        it('devrait trouver des documents en combinant un filtre normal et un filtre $find', async () => {
            const searchParams = {
                user: mockUser,
                query: {
                    model: comprehensiveTestModelDefinition.name,
                    filter: {
                        stringRequired: "SearchDoc1", // Filtre sur le modèle principal
                        relationSingle: {
                            "$find": {"$gt": ["$$this.relatedValue", 100] } // Filtre sur la relation
                        }
                    },
                    depth: 1
                }
            };
            const { data, count } = await searchData(searchParams);
            expect(count).toBe(1);
            expect(data).toHaveLength(1);
            expect(data[0]._id.toString()).toBe(docId1.toString());
        });

        it('devrait retourner un tableau vide si $find ne correspond à aucun document lié', async () => {
            const searchParams = {
                user: mockUser,
                query: {
                    model: comprehensiveTestModelDefinition.name,
                    filter: {
                        relationMultiple: {
                            "$find": { "$eq": ["$$this.relatedName", "NonExistentRelNameForMultiple"] }
                        }
                    },
                    depth: 1
                }
            };
            const { data, count } = await searchData(searchParams);
            expect(count).toBe(0);
            expect(data).toHaveLength(0);
        });

    });

    // Dans C:/Dev/hackersonline-engine/test/data.integration.test.js

    describe('installPack', () => {
        let testPacksColInstance;

        beforeAll(() => {
            // Note: l'initialisation est déjà faite dans le beforeAll global.
            // On s'assure juste d'avoir une référence si on en a besoin spécifiquement ici.
            // Si vous n'avez pas suivi l'étape 1, vous pouvez l'initialiser ici.
            testPacksColInstance = getCollection('packs');
        });

        beforeEach(async () => {
            await testPacksColInstance.deleteMany({});
        });

        it('devrait installer un pack, créer les modèles et insérer les données avec relations via $link', async () => {
            // 1. Définir le pack de données mock
            const mockPack = {
                name: 'test-pack-for-install',
                models: [
                    {
                        name: 'packUser',
                        description: 'Modèle pour les utilisateurs du pack',
                        fields: [
                            { name: 'username', type: 'string', required: true, unique: true },
                            { name: 'level', type: 'number', default: 1 }
                        ]
                    },
                    {
                        name: 'packItem',
                        description: 'Modèle pour les items du pack',
                        fields: [
                            { name: 'itemName', type: 'string', required: true },
                            { name: 'owner', type: 'relation', relation: 'packUser' }
                        ]
                    }
                ],
                data: {
                    all: { // 'all' pour les données non spécifiques à une langue
                        packUser: [
                            { username: 'playerOne' },
                            { username: 'playerTwo', level: 5 }
                        ],
                        packItem: [
                            // La nouvelle syntaxe $link pour résoudre les relations
                            { itemName: 'Sword', owner: { $link: { _model: 'packUser', username: 'playerOne' } } },
                            { itemName: 'Shield', owner: { $link: { _model: 'packUser', username: 'playerTwo' } } }
                        ]
                    }
                }
            };

            // 2. Insérer le pack dans la collection pour le rendre disponible au test
            const packInsertResult = await testPacksColInstance.insertOne(mockPack);
            const packId = packInsertResult.insertedId;

            // 3. Appeler la fonction à tester avec la nouvelle signature
            const result = await installPack(console, packId, mockUser, 'en');

            // 4. Assertions sur le résumé de l'installation
            expect(result.success, `L'installation du pack a échoué: ${result.errors?.join('; ')}`).toBe(true);
            expect(result.summary.models.installed).toHaveLength(2);
            expect(result.summary.datas.inserted).toBe(4); // 2 utilisateurs + 2 items
            expect(result.summary.datas.updated).toBe(2); // 2 items mis à jour avec la relation

            // 5. Vérifier la création des modèles
            const userModel = await testModelsColInstance.findOne({ name: 'packUser', _user: mockUser.username });
            expect(userModel).not.toBeNull();
            const itemModel = await testModelsColInstance.findOne({ name: 'packItem', _user: mockUser.username });
            expect(itemModel).not.toBeNull();
            expect(itemModel.fields.find(f => f.name === 'owner').relation).toBe('packUser');

            // 6. Vérifier l'insertion des données
            const insertedUsers = await testDatasColInstance.find({ _model: 'packUser', _user: mockUser.username }).toArray();
            expect(insertedUsers).toHaveLength(2);
            const insertedItems = await testDatasColInstance.find({ _model: 'packItem', _user: mockUser.username }).toArray();
            expect(insertedItems).toHaveLength(2);

            // 7. Vérifier la résolution des relations via $link
            const playerOne = insertedUsers.find(u => u.username === 'playerOne');
            const sword = insertedItems.find(i => i.itemName === 'Sword');
            expect(sword.owner.toString()).toBe(playerOne._id.toString());

            const playerTwo = insertedUsers.find(u => u.username === 'playerTwo');
            const shield = insertedItems.find(i => i.itemName === 'Shield');
            expect(shield.owner.toString()).toBe(playerTwo._id.toString());
        }, 10000);

        it("ne devrait installer que les modèles valides d'un pack et rapporter les erreurs", async () => {
            const mockPackWithInvalidModel = {
                name: 'invalid-model-pack',
                models: [
                    {
                        // 'name' est requis, on l'omet pour causer une erreur
                        description: 'Modèle invalide sans nom',
                        fields: []
                    },
                    { // Un modèle valide pour s'assurer que l'installation continue
                        name: 'validPackModel',
                        description: 'Un modèle valide',
                        fields: [{ name: 'title', type: 'string' }]
                    }
                ],
                data: {}
            };

            const packInsertResult = await testPacksColInstance.insertOne(mockPackWithInvalidModel);
            const packId = packInsertResult.insertedId;

            const result = await installPack(console, packId, mockUser, 'en');

            // Le succès global est faux s'il y a des erreurs
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain("Failed to install model 'unknown'"); // Le nom est inconnu

            // Vérifier le résumé de l'option
            expect(result.summary.models.failed).toHaveLength(1);
            expect(result.summary.models.failed[0]).toBe('unknown');
            expect(result.summary.models.installed).toHaveLength(1);
            expect(result.summary.models.installed[0]).toBe('validPackModel');

            // Vérifier en BDD que le modèle valide a bien été créé
            const validModel = await testModelsColInstance.findOne({ name: 'validPackModel', _user: mockUser.username });
            expect(validModel).not.toBeNull();
        });
    });

});