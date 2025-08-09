// __tests__/file.integration.test.js
import { expect, describe, it, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { Config } from '../src/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { initEngine, generateUniqueName } from "../src/setenv.js";
import { addFile, removeFile, getFile, onInit } from "../src/modules/file.js";
import { getCollection } from "../src/modules/mongodb.js";
import { Logger } from "../src/gameObject.js";
import {maxPrivateFileSize} from "../src/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.stubEnv('ENCRYPTION_KEY', '12345678901234567890123456789012');

// Mock pour les fichiers uploadés
const createMockFile = (name, size, type = 'text/plain') => {
    const tempPath = path.join(__dirname, 'temp', name);
    fs.writeFileSync(tempPath, 'a'.repeat(size));
    return {
        name,
        size,
        type,
        path: tempPath
    };
};
let engine;
const testUploadDir = path.join(process.cwd(), "uploads", "private");
const testTempDir = path.join(__dirname, 'temp');
let filesCollection;

beforeAll(async () => {
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "user","file"]);
    engine= await initEngine();
    await onInit(engine);

    // Créer les répertoires nécessaires
    if (!fs.existsSync(testUploadDir)) {
        fs.mkdirSync(testUploadDir, { recursive: true });
    }
    if (!fs.existsSync(testTempDir)) {
        fs.mkdirSync(testTempDir, { recursive: true });
    }

    filesCollection = await getCollection("files");
});
describe('File Module Integration Tests', () => {
    let testUser;


    beforeEach(async () => {
        // Créer un utilisateur de test
        testUser = {
            username: generateUniqueName('testuser'),
            _user: generateUniqueName('testuser'),
            userPlan: 'premium',
            permissions: ['API_UPLOAD_FILE']
        };

        // Nettoyer les collections avant chaque test
        await filesCollection.deleteMany({});

        // Nettoyer le répertoire upload
        const files = fs.readdirSync(testUploadDir);
        for (const file of files) {
            fs.unlinkSync(path.join(testUploadDir, file));
        }
    });

    afterAll(async () => {
        // Nettoyer après tous les tests
        await filesCollection.deleteMany({});
        if (fs.existsSync(testUploadDir)) {
            fs.rmSync(testUploadDir, { recursive: true });
        }
        if (fs.existsSync(testTempDir)) {
            fs.rmSync(testTempDir, { recursive: true });
        }
    });

    describe('addFile', () => {
        it('should successfully add a file with local storage', async () => {
            const mockFile = createMockFile('test.txt', 1024); // 1KB file

            const guid = await addFile(mockFile, testUser);

            // Vérifier le retour
            expect(guid).toBeDefined();
            expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

            // Vérifier en base de données
            const fileRecord = await filesCollection.findOne({ guid });
            expect(fileRecord).toBeDefined();
            expect(fileRecord.filename).toBeDefined();
            expect(fileRecord.size).toBe(1024);
            expect(fileRecord.user).toBe(testUser.username);
            expect(fileRecord.storage).toBe('local');

            // Vérifier que le fichier existe physiquement
            const expectedPath = path.join(testUploadDir, `${guid}.txt`);
            expect(fs.existsSync(expectedPath)).toBe(true);
        });

        it('should throw error when file size exceeds limit', async () => {
            const mockFile = createMockFile('large.txt', maxPrivateFileSize+1); // 11MB (dépasse la limite de 10MB)

            await expect(addFile(mockFile, testUser)).rejects.toThrow(/La taille du fichier dépasse la limite autorisée/);
        });

        it.skip('should throw error when storage limit exceeded', async ({skip}) => {
            // Mock la fonction de calcul d'usage pour simuler un dépassement
            vi.spyOn(engine.userProvider, 'getUserStorageLimit').mockResolvedValue(85 * 1024 * 1024); // 5MB

            const mockFile = createMockFile('test.txt', 1024 * 1024); // 1MB

            await expect(addFile(mockFile, testUser)).rejects.toThrow("api.data.storageLimitExceeded");
        });

        it.skip('should throw error when server capacity is insufficient', async ({skip}) => {
            // Mock la vérification de capacité serveur
            vi.spyOn(engine.userProvider, 'checkServerCapacity').mockResolvedValue({ isSufficient: false });

            const mockFile = createMockFile('test.txt', 1024);

            await expect(addFile(mockFile, testUser)).rejects.toThrow("api.data.serverStorageFull");
        });
    });

    describe('removeFile', () => {
        it('should successfully remove a locally stored file', async () => {
            // D'abord ajouter un fichier
            const mockFile = createMockFile('to-delete.txt', 1024);
            const guid = await addFile(mockFile, testUser);

            // Vérifier qu'il existe avant suppression
            const beforeDelete = await getFile(guid);
            expect(beforeDelete).toBeDefined();

            // Supprimer le fichier
            await removeFile(guid, testUser);

            // Vérifier en base de données
            const afterDelete = await getFile(guid);
            expect(afterDelete).toBeNull();

            // Vérifier que le fichier physique a été supprimé
            const expectedPath = path.join(testUploadDir, `${guid}.txt`);
            expect(fs.existsSync(expectedPath)).toBe(false);
        });

        it('should handle trying to remove non-existent file gracefully', async () => {
            const nonExistentGuid = '123e4567-e89b-12d3-a456-426614174000';

            vi.spyOn(engine.getComponent(Logger), "info");

            // Cela ne devrait pas throw d'erreur
            await removeFile(nonExistentGuid, testUser);

            // Vérifier que le logger a bien enregistré l'info
            expect(engine.getComponent(Logger).info).toHaveBeenCalledWith(
                expect.stringContaining(`Tentative de suppression d'un fichier inexistant`),
                'warn'
            );
        });

        it('should throw error when GUID is invalid', async () => {
            await expect(removeFile('invalid-guid', testUser)).rejects.toThrow("Le GUID du fichier n'est pas valide.");
        });
    });

    describe('getFile', () => {
        it('should retrieve file metadata', async () => {
            const mockFile = createMockFile('metadata-test.txt', 2048);
            const guid = await addFile(mockFile, testUser);

            const fileData = await getFile(guid);

            expect(fileData).toBeDefined();
            expect(fileData.guid).toBe(guid);
            expect(fileData.filename).toContain('.txt');
            expect(fileData.size).toBe(2048);
            expect(fileData.user).toBe(testUser.username);
        });

        it('should return null for non-existent file', async () => {
            const nonExistentGuid = '123e4567-e89b-12d3-a456-426614174000';
            const fileData = await getFile(nonExistentGuid);

            expect(fileData).toBeNull();
        });
    });
});