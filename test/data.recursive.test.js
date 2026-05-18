import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Config } from '../src/config.js';
import { initEngine, generateUniqueName } from "../src/setenv.js";
import { createModel, insertData, searchData, deleteData } from "../src/index.js";
import { getCollectionForUser } from "../src/modules/mongodb.js";
import { ObjectId } from 'mongodb';
import { vi } from 'vitest'
let testUser = {
    _id: new ObjectId(),
    username: generateUniqueName('recursive_user'),
    _user: generateUniqueName('recursive_user'),
    userPlan: 'free',
    roles: [], // Utilisateur standard pour tester l'anonymisation
    _model: 'user',
    temporary: true
};

const targetModelName = generateUniqueName('target_relation');
const complexModelName = generateUniqueName('recursive_complex_model');

describe('Recursive Fields Operations & Validation', () => {
    vi.stubEnv('ENCRYPTION_KEY', '12345678901234567890123456789012');
    Config.Set("useDemoAccounts", true);

    beforeAll(async () => {
        Config.Set("modules", ["mongodb", "data", "user", "workflow"]);
        await initEngine();

        // 1. Modèle cible pour tester les relations imbriquées
        await createModel({
            name: targetModelName,
            description: "",
            _user: testUser.username,
            fields: [{ name: 'label', type: 'string', asMain: true }]
        });

        // 2. Modèle complexe récursif
        const nestedModel = {
            name: complexModelName,
            description: "Modèle de test pour la récursivité",
            _user: testUser.username,
            fields: [
                { name: 'title', type: 'string', required: true },
                {
                    name: 'settings',
                    type: 'object',
                    fields: [
                        { name: 'theme', type: 'enum', items: ['dark', 'light'], required: true },
                        { name: 'secretKey', type: 'string', anonymized: true }, // Test anonymisation récursive
                        { name: 'description', type: 'string_t' } // Test traduction récursive
                    ]
                },
                {
                    name: 'components',
                    type: 'array',
                    itemsType: 'object',
                    fields: [
                        { name: 'name', type: 'string', required: true },
                        { name: 'content', type: 'richtext' }, // Test sanitization récursive
                        { name: 'ref', type: 'relation', relation: targetModelName } // Test relation récursive
                    ]
                }
            ]
        };
        await createModel(nestedModel);
    });

    afterAll(async () => {
        const coll = await getCollectionForUser(testUser);
        await coll.drop();
    });

    it('should successfully insert and resolve relations recursively', async () => {
        // Créer une donnée cible
        const targetRes = await insertData(targetModelName, { label: 'Target Item' }, {}, testUser, false);
        const targetId = targetRes.insertedIds[0];

        const validData = {
            title: 'Main Doc',
            settings: {
                theme: 'dark',
                secretKey: 'top-secret-123',
                description: 'main_desc'
            },
            components: [
                { 
                    name: 'Comp 1', 
                    content: '<p>Hello <script>alert("xss")</script></p>', 
                    ref: targetId 
                }
            ]
        };

        const result = await insertData(complexModelName, validData, {}, testUser, false);
        expect(result.success).toBe(true);

        // Rechercher la donnée pour vérifier les transformations
        const searchRes = await searchData({ model: complexModelName }, testUser);
        const doc = searchRes.data[0];

        // 1. Vérifier le nettoyage XSS récursif
        expect(doc.components[0].content).not.toContain('<script>');
        
        // 2. Vérifier la résolution de relation récursive
        expect(doc.components[0].ref).toBeInstanceOf(Object);
        expect(doc.components[0].ref.label).toBe('Target Item');

        // 3. Vérifier la transformation string_t récursive
        expect(doc.settings.description).toBeInstanceOf(Object);
        expect(doc.settings.description.key).toBe('main_desc');
    });

    it('should clean undefined fields recursively (security)', async () => {
        const dataWithGarbage = {
            title: 'Clean Test',
            garbageRoot: 'delete-me',
            settings: {
                theme: 'light',
                garbageNested: 'delete-me-too'
            },
            components: [
                { name: 'C1', garbageInArray: 'bye' }
            ]
        };

        const result = await insertData(complexModelName, dataWithGarbage, {}, testUser, false);
        const coll = await getCollectionForUser(testUser);
        const rawDoc = await coll.findOne({ _id: new ObjectId(result.insertedIds[0]) });

        // Vérification en base (données brutes)
        expect(rawDoc.garbageRoot).toBeUndefined();
        expect(rawDoc.settings.garbageNested).toBeUndefined();
        expect(rawDoc.components[0].garbageInArray).toBeUndefined();
    });

    it('should apply anonymization recursively for non-authorized users', async () => {
        const secretData = {
            title: 'Secret Doc',
            settings: {
                theme: 'dark',
                secretKey: 'I AM A SECRET'
            }
        };
        await insertData(complexModelName, secretData, {}, testUser, false);

        // L'utilisateur testUser n'a pas la permission API_DEANONYMIZED
        const searchRes = await searchData({ model: complexModelName, filter: { title: 'Secret Doc' } }, testUser);
        const doc = searchRes.data[0];

        expect(doc.settings.secretKey).not.toBe('I AM A SECRET');
        expect(doc.settings.secretKey.length).toBeGreaterThan(0);
    });

    it('should fail validation if a required sub-field is missing', async () => {
        const invalidData = {
            title: 'Invalid',
            settings: {
                // theme is required but missing
                secretKey: 'test'
            }
        };

        const result = await insertData(complexModelName, invalidData, {}, testUser, false);
        expect(result.success).toBe(false);
        expect(result.error).toContain('theme');
    });

    it('should support $find operator inside nested structures', async () => {
        // Créer un item à trouver
        await insertData(targetModelName, { label: 'Findable' }, {}, testUser, false);

        const dataWithFind = {
            title: 'Find Test',
            settings: { theme: 'light' },
            components: [
                {
                    name: 'Component with $find',
                    ref: { $find: { label: 'Findable' } }
                }
            ]
        };

        const result = await insertData(complexModelName, dataWithFind, {}, testUser, false);
        expect(result.success).toBe(true);
        
        const coll = await getCollectionForUser(testUser);
        const savedDoc = await coll.findOne({ _id: new ObjectId(result.insertedIds[0]) });
        expect(savedDoc.components[0].ref).toBeDefined();
        expect(typeof savedDoc.components[0].ref).toBe('string'); // Doit être l'ID converti en string
    });
});