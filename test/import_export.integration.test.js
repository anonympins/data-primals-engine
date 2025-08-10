import {expect, describe, it, beforeEach, beforeAll, afterAll, vi, afterEach} from 'vitest';

// --- Importations des modules de votre application ---
import {
    insertData,
    exportData,
    importData
} from '../src/index.js';

import {
    modelsCollection as getAppModelsCollection,
    getCollectionForUser as getAppUserCollection, getCollectionForUser
} from 'data-primals-engine/modules/mongodb';
import {sleep} from "data-primals-engine/core";
import fs from "node:fs";
import {getUniquePort, initEngine} from "../src/setenv.js";
import {Config} from "../src/index.js";
import {ObjectId} from "mongodb";

// --- Données Mock ---
const mockUser = {
    username: 'testuserImpex',
    _user: 'testuserImpex',
    userPlan: 'premium',
    email: 'testImpex@example.com'
};

const impexTestModel = {
    name: 'impex_products',
    description: 'test',
    _user: mockUser.username,
    fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'sku', type: 'string', unique: true },
        { name: 'price', type: 'number', required: true },
        { name: 'inStock', type: 'boolean', default: true }
    ]
};

// --- Setup de l'environnement de test ---
let testModelsColInstance;
let testDatasColInstance;

function blobToFile(theBlob, fileName){
    //A Blob() is almost a File() - it's just missing the two properties below which we will add
    theBlob.lastModifiedDate = new Date();
    theBlob.name = fileName;
    return theBlob;
}

beforeAll(async () =>{
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);
    await initEngine();
})

beforeEach(async() =>{
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
// --- Début des tests ---
describe('Intégration des fonctions d\'Import/Export', () => {

    // Préparation avant chaque test du bloc
    beforeEach(async () => {
        testModelsColInstance = getAppModelsCollection;
        testDatasColInstance = await getAppUserCollection(mockUser);

        // Nettoyage complet pour un état propre
        await testDatasColInstance.deleteMany({ _user: "testuserImpex"});

        if( await testModelsColInstance.find({ name: impexTestModel.name, _user: mockUser.username }).count() === 0) {
            await testModelsColInstance.insertOne(impexTestModel);
        }
        // Insérer des données de base pour les tests d'exportation
        await insertData(impexTestModel.name, [
            { name: 'Produit A', sku: 'SKU-A', price: 10.50, inStock: true },
            { name: 'Produit B', sku: 'SKU-B', price: 25.00, inStock: false },
            { name: 'Produit C', sku: 'SKU-C', price: 99.99, inStock: true }
        ], {}, mockUser, false);
    });

    describe('Export de données', () => {
        it('devrait exporter les données en format JSON', async () => {

            const res= await exportData({
                models: [impexTestModel.name],
                depth: 1
            }, mockUser);

            expect(res.success).toBeTruthy();

            const data = res.data[impexTestModel.name];
            expect(data).toBeInstanceOf(Array);
            expect(data).toHaveLength(3);
            expect(data[0]).toMatchObject({ name: 'Produit A', sku: 'SKU-A', price: 10.50 });
            // Les champs système (_id, _model, _user, _hash) ne devraient pas être exportés par défaut
            expect(data[0]).not.toHaveProperty('_model');
        });

        it('devrait lever une exception si le modèle n\'existe pas', async () => {
            // La fonction devrait rejeter la promesse ou lancer une erreur
            await expect((await exportData('model_inexistant', 'json', mockUser)).success).toBeFalsy();
        });
    });

    describe('Import de données', () => {
        it('devrait importer des données depuis une chaîne JSON', async () => {

            const jsonDataToImport = [
                { name: 'Produit D', sku: 'SKU-D', price: 1.00, inStock: true },
                { name: 'Produit E', sku: 'SKU-E', price: 2.00 } // inStock utilisera la valeur par défaut
            ];
            const jsonString = JSON.stringify(jsonDataToImport);

            // Exécution de la fonction d'import (hypothétique)x
            var blob = new Blob([jsonString], {type: "application/json"});
            fs.writeFileSync('test.json', jsonString);
            blob.path = 'test.json';
            blob.originalFilename = 'test.json';
            const result = await importData({model: impexTestModel.name}, {file: blobToFile(blob, "test.json")}, mockUser);

            // Vérifications du résultat de l'opération
            expect(result.success).toBe(true);
            expect(result.job.jobId).not.toBeNull();

            await sleep(5000);

            // Vérification directe en base de données
            const importedDocs = await testDatasColInstance.find({
                _model: impexTestModel.name,
                sku: { $in: ['SKU-D', 'SKU-E'] }
            }).toArray();

            expect(importedDocs).toHaveLength(2);
            const docD = importedDocs.find(d => d.sku === 'SKU-D');
            const docE = importedDocs.find(d => d.sku === 'SKU-E');

            expect(docD.name).toBe('Produit D');
            expect(docD.inStock).toBe(true); // Vérification de la valeur par défaut
            expect(docE.price).toBe(2.00);

        }, 20000);

        it('devrait importer des données depuis une chaîne CSV et convertir les types', async () => {
            const csvStringToImport = `name,sku,price,inStock\nProduit F,SKU-F,3.55,true\nProduit G,SKU-G,4.99,false`;

            // Exécution de la fonction d'import (hypothétique)x
            var blob = new Blob([csvStringToImport], {type: "text/csv"});
            fs.writeFileSync('test.csv', csvStringToImport);
            blob.path = 'test.csv';
            blob.originalFilename = 'test.csv';

            // Exécution de la fonction d'import
            const result = await importData({model:impexTestModel.name}, {file: blobToFile(blob, "test.csv")}, mockUser);

            // Vérifications du résultat
            expect(result.success).toBe(true);
            expect(result.job.jobId).not.toBeNull();

            await sleep(5000);
            // Vérification en base de données
            const importedDocs = await testDatasColInstance.find({
                _model: impexTestModel.name,
                sku: { $in: ['SKU-F', 'SKU-G'] }
            }).toArray();

            expect(importedDocs).toHaveLength(2);
            const docF = importedDocs.find(d => d.sku === 'SKU-F');
            const docG = importedDocs.find(d => d.sku === 'SKU-G');

            // Vérification de la conversion des types
            expect(docF.price).toBe(3.55);
            expect(docF.inStock).toBe(true);
            expect(docG.inStock).toBe(false);
        }, 20000);

        it('devrait rejeter les lignes invalides et rapporter les erreurs', async () => {
            const csvStringToImport = `name,sku,price,inStock
Valide H,SKU-H,10,true
,SKU-I,20,true
Valide J,SKU-J,,false
Valide K,SKU-A,40,true`;

            // Exécution de la fonction d'import (hypothétique)x
            var blob = new Blob([csvStringToImport], {type: "text/csv"});
            fs.writeFileSync('test.csv', csvStringToImport);
            blob.path = 'test.csv';
            blob.originalFilename = 'test.csv';

            const result = await importData({ model: impexTestModel.name }, {file: blobToFile(blob,"test.csv")}, mockUser);

            // L'initiation du job doit réussir
            expect(result.success).toBe(true);
            expect(result.job.jobId).not.toBeNull();

            await sleep(5000);
            // Vérifier que seule les données valides sont en BDD
            const count = await testDatasColInstance.countDocuments({ _model: impexTestModel.name, sku: 'SKU-H' });
            expect(count).toBe(1); // Seule la ligne valide 'SKU-H' doit être insérée.
        }, 20000);
    });
});