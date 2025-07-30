// C:/Dev/hackersonline-engine/server/src/workers/crypto-worker.js
import { parentPort } from 'worker_threads';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import bcrypt from 'bcrypt'; // 1. Importer bcrypt

// --- Fonctions de cryptographie (inchangées) ---
const pbkdf2Async = promisify(crypto.pbkdf2);
const algorithm = 'aes-256-cbc';
const iterations = 100000;
const keyLength = 32;
const ivLength = 16;

async function deriveKeyAndIV(password, salt) {
    const key = await pbkdf2Async(password, salt, iterations, keyLength, 'sha256');
    return { key };
}

async function encryptFile(filePath, password) {
    // ... (fonction inchangée)
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(ivLength);
    const { key } = await deriveKeyAndIV(password, salt);
    const fileData = await fs.readFile(filePath);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encryptedData = Buffer.concat([cipher.update(fileData), cipher.final()]);
    await fs.writeFile(filePath, Buffer.concat([salt, iv, encryptedData]));
}

async function decryptFile(filePath, password) {
    // ... (fonction inchangée)
    const fileData = await fs.readFile(filePath);
    const salt = fileData.slice(0, 16);
    const iv = fileData.slice(16, 16 + ivLength);
    const encryptedData = fileData.slice(16 + ivLength);
    const { key } = await deriveKeyAndIV(password, salt);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    await fs.writeFile(filePath, decryptedData);
}
// --- Fin des fonctions de cryptographie ---

// 2. Mettre à jour le gestionnaire de messages pour être plus générique et ajouter le cas 'hash'
parentPort.on('message', async ({ action, payload }) => {
    try {
        let result;
        switch (action) {
        case 'encrypt':
            console.log(`[Worker] Received action: ${action} for file: ${payload.filePath}`);
            await encryptFile(payload.filePath, payload.password);
            parentPort.postMessage({ success: true }); // Pas de données à retourner
            break;

        case 'decrypt':
            console.log(`[Worker] Received action: ${action} for file: ${payload.filePath}`);
            await decryptFile(payload.filePath, payload.password);
            parentPort.postMessage({ success: true }); // Pas de données à retourner
            break;
                

        case 'hash':
            console.log(`[Worker] Received action: hash`);
            if (!payload.data) throw new Error('Data to hash is missing in payload.');
            // Le worker gère à la fois la génération du "salt" et le hachage
            const salt = await bcrypt.genSalt(10);
            result = await bcrypt.hash(payload.data, salt);
            parentPort.postMessage({ success: true, data: result }); // On retourne le hash
            break;

        default:
            throw new Error(`Unknown crypto action: ${action}`);
        }
    } catch (error) {
        // Envoie l'erreur au thread principal
        parentPort.postMessage({ success: false, error: error.message });
    }
});