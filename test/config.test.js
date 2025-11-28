// __tests__/config.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { Config } from '../src/config.js';
import { initEngine } from '../src/setenv.js';

describe('Configuration Module Tests', () => {

    it('should correctly get and set a simple value', () => {
        const key = 'testKey';
        const value = 'testValue';

        Config.Set(key, value);
        const retrievedValue = Config.Get(key);

        expect(retrievedValue).toBe(value);
    });

    it('should return the default value if a key is not set', () => {
        const defaultValue = 'default';
        const retrievedValue = Config.Get('nonExistentKey', defaultValue);

        expect(retrievedValue).toBe(defaultValue);
    });

    it('should initialize the engine with only the modules specified in the config', async () => {
        // 1. Définir une configuration de modules minimale.
        const targetModules = ['mongodb', 'user'];
        Config.Set("modules", targetModules);

        // 2. Initialiser le moteur. initEngine devrait lire cette configuration.
        const engine = await initEngine();

        // 3. Vérifier que le moteur a chargé UNIQUEMENT les modules spécifiés.
        // La propriété _modules de l'engine contient les instances des modules chargés.
        const loadedModuleNames = engine._modules.map(m => m.module);

        expect(engine._modules).toBeInstanceOf(Array);
        expect(loadedModuleNames).toHaveLength(targetModules.length);
        expect(loadedModuleNames).toEqual(expect.arrayContaining(targetModules));
    });
});