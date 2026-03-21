// __tests__/assistant.test.js
import { vi, expect, describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Config } from '../src/config.js';
import { getCollection, getCollectionForUser } from '../src/modules/mongodb.js';
import { generateUniqueName, initEngine } from "../src/setenv.js";
import { purgeData } from "../src/modules/data/data.history.js";
import { handleChatRequest } from '../src/modules/assistant/assistant.js';
import { insertData } from '../src/index.js';
import * as dataOperations from '../src/modules/data/data.operations.js';

// --- CORRECTION ---
// On mock le nouveau module 'providers.js' qui contient la fonction que l'on veut surcharger.
vi.mock('../src/modules/assistant/providers.js', () => ({
    getAIProvider: vi.fn(),
}));

// On importe la version mockée de getAIProvider
import { getAIProvider } from '../src/modules/assistant/providers.js';

let testUser;
let modelsCollection;
let datasCollection;

const modelName = generateUniqueName('productAssistant');

describe('Assistant Module Unit Tests', () => {

    beforeAll(async () => {
        Config.Set("modules", ["mongodb", "data", "user", "assistant"]);
        await initEngine(); // Cette ligne ne devrait plus planter.
        testUser = {
            username: generateUniqueName('testUserAssistant'),
            email: generateUniqueName('test') + '@example.com',
            lang: 'fr'
        };

        modelsCollection = getCollection('models');
        datasCollection = await getCollectionForUser(testUser);

        // Create a model for testing
        const productModelDef = {
            name: modelName,
            description: 'A model for testing',
            _user: testUser.username,
            fields: [
                { name: 'name', type: 'string', required: true },
                { name: 'price', type: 'number' }
            ]
        };
        await modelsCollection.insertOne(productModelDef);
    });

    beforeEach(async () => {
        // Clear mocks before each test
        vi.clearAllMocks();
        // Clean data, but keep the model
        await datasCollection.deleteMany({ _user: testUser.username });
    });

    // Helper to create a mock LLM stream
    const createMockStream = (content) => {
        return (async function* () {
            yield { content };
        })();
    };

    it('should return a simple text message from the AI', async () => {
        const mockLLM = {
            stream: vi.fn().mockReturnValue(createMockStream('Bonjour, ceci est un test.')),
        };
        getAIProvider.mockResolvedValue(mockLLM);

        const params = { message: 'Dis bonjour', history: [] };
        const result = await handleChatRequest(params, testUser);

        expect(getAIProvider).toHaveBeenCalled();
        expect(mockLLM.stream).toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            displayMessage: 'Bonjour, ceci est un test.'
        });
    });

    it('should handle a search action', async () => {

        // Configure le retour du mock pour ce test spécifique
        const searchDataSpy = vi.spyOn(dataOperations, 'searchData').mockResolvedValue({ data: [{ name: 'Test Widget', price: 100 }], count: 1 });

        const aiResponse = JSON.stringify([
            { action: 'search_models', params: { query: modelName } },
            { action: 'search', params: { model: modelName, filter: {} } }
        ]);
        const mockLLM = {
            stream: vi.fn().mockReturnValue(createMockStream(aiResponse))
        };
        getAIProvider.mockResolvedValue(mockLLM);

        const params = { message: `cherche les produits`, history: [] };
        const result = await handleChatRequest(params, testUser);

        expect(searchDataSpy).toHaveBeenCalled();

        expect(result.success).toBe(true);
        expect(result.dataResult).toBeDefined();
        expect(result.dataResult.model).toBe(modelName);
        expect(result.dataResult.data).toHaveLength(1);
        expect(result.dataResult.data[0].name).toBe('Test Widget');
    });

    it('should request confirmation for a "post" action', async () => {
        const aiResponse = JSON.stringify({
            action: 'post',
            params: {
                model: modelName,
                data: { name: 'New Gadget', price: 19.99 }
            }
        });
        const mockLLM = {
            stream: vi.fn().mockReturnValue(createMockStream(aiResponse)),
        };
        getAIProvider.mockResolvedValue(mockLLM);

        const params = { message: 'Crée un produit', history: [] };
        const result = await handleChatRequest(params, testUser);

        expect(result.success).toBe(true);
        expect(result.confirmationRequest).toBeDefined();
        expect(result.confirmationRequest.action).toBe('post');
        expect(result.confirmationRequest.params.model).toBe(modelName);
        expect(result.confirmationRequest.params.data.name).toBe('New Gadget');
    });

    it('should execute a confirmed "post" action', async () => {
        const confirmedAction = {
            action: 'post',
            params: {
                model: modelName,
                data: { name: 'Confirmed Gadget', price: 50 }
            }
        };

        const params = { message: '', confirmedAction };
        const result = await handleChatRequest(params, testUser);

        expect(result.success).toBe(true);
        // --- CORRECTION ---
        // On vérifie le message de succès spécifique à la création, qui est plus informatif.
        expect(result.displayMessage).toContain("Élément créé avec l'ID:");

        // Verify the data was actually inserted
        const dataInDb = await datasCollection.findOne({ name: 'Confirmed Gadget' });
        expect(dataInDb).not.toBeNull();
        expect(dataInDb.price).toBe(50);
    });

    it('should handle malformed JSON from AI by returning it as a text message', async () => {
        const aiResponse = `{ "action": "search", "params": { "model": "${modelName}" }`; // Missing closing brace
        const mockLLM = {
            stream: vi.fn().mockReturnValue(createMockStream(aiResponse)),
        };
        getAIProvider.mockResolvedValue(mockLLM);

        const params = { message: 'test', history: [] };
        const result = await handleChatRequest(params, testUser);

        expect(result.success).toBe(true);
        expect(result.displayMessage).toBe(aiResponse);
    });

    it('should correct a malformed filter from the AI', async () => {
        const aiResponse = JSON.stringify([{
            action: 'search',
            params: {
                model: modelName,
                // This filter is malformed: multiple operators at the root level
                filter: {
                    "$gt": ["$price", 50],
                    "$lt": ["$price", 200]
                }
            }
        }]);
        const mockLLM = {
            stream: vi.fn().mockReturnValue(createMockStream(aiResponse)),
        };
        getAIProvider.mockResolvedValue(mockLLM);

        // Configure le retour du mock pour ce test spécifique
        const searchDataSpy = vi.spyOn(dataOperations, 'searchData').mockResolvedValue({ data: [], count: 0 });

        const params = { message: 'cherche produits entre 50 et 200', history: [] };
        // On peut maintenant utiliser la fonction handleChatRequest importée normalement
        await handleChatRequest(params, testUser);

        // On s'attend à ce que le filtre ait été encapsulé dans un $and
        const expectedFilter = {
            "$and": [
                { "$gt": ["$price", 50] },
                { "$lt": ["$price", 200] }
            ]
        };

        expect(searchDataSpy).toHaveBeenCalledWith(expect.objectContaining({ filter: expectedFilter }), expect.anything());

        // On nettoie l'espion après le test
        searchDataSpy.mockRestore();
    });
});