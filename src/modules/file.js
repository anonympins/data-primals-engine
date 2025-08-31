
// Nouvelle fonction pour ajouter un fichier privé
import {maxPrivateFileSize, megabytes} from "../constants.js";
import {isLocalUser} from "../data.js";
import i18n from "../../src/i18n.js";
import {getCollection} from "./mongodb.js";
import {getFileExtension, isGUID, uuidv4} from "../core.js";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { checkServerCapacity} from "./data/index.js";
import crypto from "node:crypto";
import * as tar from "tar";
import {promisify} from "node:util";
import {calculateTotalUserStorageUsage, hasPermission} from "./user.js";
import {Logger} from "../gameObject.js";
import {deleteFromS3, getUserS3Config, uploadToS3} from "./bucket.js";
import {Config} from "../config.js";

const pbkdf2Async = promisify(crypto.pbkdf2);

let engine, logger;
const fsPromises = fs.promises;

// Encryption settings
const algorithm = 'aes-256-cbc'; // Algorithm to use
const iterations = 100000; // Number of iterations for PBKDF2
const keyLength = 32; // Key length for AES-256
const ivLength = 16; // IV length for AES

// Function to derive a key and IV from a passphrase and salt
async function deriveKeyAndIV(password, salt) {
    const key = await pbkdf2Async(password, salt, iterations, keyLength, 'sha256');
    // L'IV n'est plus dérivé ici.
    return { key };
}


export const unzip = async (file) => {
    await tar.extract({ file: file, gzip: true, sync: true });
}

export const zip = async (filename) => {
    await tar.create({ gzip: true, sync: true, file: filename+'.gz' }, [filename])
}
export const addFile = async (file, user) => {
    if (!file) throw new Error("Le fichier est requis");

    // Rendre compatible avec formidable v2 (path, name, type) et v3 (filepath, originalFilename, mimetype)
    const filePath = file.path || file.filepath;
    const originalName = file.name || file.originalFilename;
    const mimeType = file.type || file.mimetype;

    if (!filePath || !originalName) {
        throw new Error("Les informations du fichier (nom, chemin) sont incomplètes.");
    }

    const m = Config.Get('maxPrivateFileSize', maxPrivateFileSize);
    if (file.size > m) {
        throw new Error(`La taille du fichier dépasse la limite autorisée (${m / megabytes} Mo).`);
    }

    if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_UPLOAD_FILE"], user)) {
        throw new Error(i18n.t("api.permission.uploadFile"));
    }

    const incomingDataSize = file.size;

    const userStorageLimit = await engine.userProvider.getUserStorageLimit(user);
    const currentStorageUsage = await calculateTotalUserStorageUsage(user);

    if (currentStorageUsage + incomingDataSize > userStorageLimit) {
        throw new Error(i18n.t("api.data.storageLimitExceeded", { limit: Math.round(userStorageLimit / megabytes) }));
    }

    const serverCapacity = await checkServerCapacity(incomingDataSize);
    if (!serverCapacity.isSufficient) {
        throw new Error(i18n.t("api.data.serverStorageFull", "Le serveur a atteint sa capacité de stockage maximale. Veuillez réessayer plus tard."));
    }

    // Générer un GUID pour le fichier
    const guid = uuidv4();
    const s3Config = await getUserS3Config(user);
    const extension = getFileExtension(originalName);
    const newFilename = `${guid}.${extension}`;

    const fileData = {
        guid: guid,
        name: originalName, // Nom original du fichier
        filename: newFilename, // Nom du fichier stocké (GUID + extension)
        size: file.size,
        mimeType: mimeType,
        createdAt: new Date(),
        user: user.username,
        mainUser: user._user
    };

    if (s3Config && s3Config.bucketName && s3Config.accessKeyId && s3Config.secretAccessKey) {
        try {
            await uploadToS3(s3Config, filePath, newFilename);

            fileData.storage = 's3';
            logger.info(`Fichier ${newFilename} téléversé sur le bucket S3 ${s3Config.bucketName}.`);
        } catch (error) {
            logger.error(`Le téléversement S3 a échoué pour ${originalName}: ${error.message}`, error);
            throw new Error("Le téléversement S3 a échoué.");
        } finally {
            // Nettoyer le fichier temporaire uploadé par express-formidable
            await fsPromises.unlink(filePath).catch(e => logger.warn(`Échec de la suppression du fichier temporaire ${filePath}: ${e.message}`));
        }
    } else {
        // Sauvegarde locale
        const uploadDir = path.join(process.cwd(), "uploads", "private");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const newPath = path.join(uploadDir, newFilename);

        try {
            // Utiliser copyFile puis unlink au lieu de rename pour éviter les erreurs cross-device (EXDEV)
            // qui peuvent survenir dans des environnements conteneurisés comme GitHub Actions.
            await fsPromises.copyFile(filePath, newPath);
            await fsPromises.unlink(filePath);
            fileData.storage = 'local';
            fileData.path = newPath; // Le chemin complet pour les fichiers locaux
            logger.info(`Fichier ${newFilename} sauvegardé localement dans ${newPath}.`);
        } catch (error) {
            logger.error(`Le stockage du fichier local a échoué pour ${originalName}: ${error.message}`, error);
            // Essayer de nettoyer le fichier temporaire même si le renommage échoue
            await fsPromises.unlink(filePath).catch(e => logger.warn(`Échec de la suppression du fichier temporaire ${filePath}: ${e.message}`));
            throw new Error("Le stockage du fichier local a échoué.");
        }
    }

    const filesCollection = await getCollection("files");
    await filesCollection.insertOne(fileData);

    return guid;
};

/**
 * Récupère les métadonnées d'un fichier depuis la base de données.
 * @param {string} guid - Le GUID du fichier.
 * @returns {Promise<object|null>} L'objet de métadonnées du fichier ou null si non trouvé.
 */
export const getFile = async (guid) => {
    const filesCollection = await getCollection("files");
    return await filesCollection.findOne({ guid });
};

export const removeFile = async (guid, user) => {
    if (!guid) return false;
    if (!isGUID(guid)) throw new Error("Le GUID du fichier n'est pas valide.");

    const fileData = await getFile(guid);
    if (!fileData) {
        logger.info(`Tentative de suppression d'un fichier inexistant avec le GUID : ${guid}`, 'warn');
        return;
    }

    if (fileData.storage === 's3') {
        const s3Config = await getUserS3Config(user);
        if (s3Config && s3Config.bucketName) { // Correction: bucketName au lieu de bucket
            try {
                await deleteFromS3(s3Config, fileData.filename);
                logger.info(`Fichier ${fileData.filename} supprimé du bucket S3 ${s3Config.bucketName}.`);
            } catch (error) {
                logger.info(`La suppression S3 a échoué pour ${fileData.filename}: ${error.message}`, 'error');
                throw new Error("La suppression S3 a échoué.");
            }
        } else {
            logger.info(`Configuration S3 non trouvée pour l'utilisateur, impossible de supprimer le fichier ${fileData.filename} de S3.`, 'error');
            throw new Error("Configuration S3 non trouvée, impossible de supprimer le fichier.");
        }
    } else if (fileData.storage === 'local') {
        try {
            if (fileData.path && fs.existsSync(fileData.path)) {
                await fsPromises.unlink(fileData.path);
                logger.info(`Fichier local ${fileData.path} supprimé.`);
            } else {
                logger.info(`Fichier local non trouvé au chemin ${fileData.path}, mais suppression de l'enregistrement en BDD.`, 'warn');
            }
        } catch (error) {
            logger.info(`La suppression du fichier local a échoué pour ${fileData.path}: ${error.message}`, 'error');
            throw new Error("La suppression du fichier local a échoué.");
        }
    }

    const filesCollection = await getCollection("files");
    await filesCollection.deleteOne({ guid });
};




// Function to encrypt the file content
export async function encryptFile(filePath, password) {
    try {
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(ivLength);

        // On ne dérive que la clé
        const { key } = await deriveKeyAndIV(password, salt);

        const fileData = await fs.promises.readFile(filePath);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        const encryptedData = Buffer.concat([cipher.update(fileData), cipher.final()]);

        // On it : [salt][iv][données chiffrées]
        await fs.promises.writeFile(filePath, Buffer.concat([salt, iv, encryptedData]));

        console.log('File encrypted successfully.', filePath);
    } catch (error) {
        console.error('Error during encryption:', error.message);
    }
}
// Function to decrypt the file content
export async function decryptFile(filePath, password) {
    try {
        const fileData = await fs.promises.readFile(filePath);

        // Extraire le sel, l'IV et les données
        const salt = fileData.slice(0, 16);
        // NOUVEAU: Extraire l'IV qui suit le sel
        const iv = fileData.slice(16, 16 + ivLength);
        const encryptedData = fileData.slice(16 + ivLength);

        // On dérive la même clé en utilisant le sel extrait
        const { key } = await deriveKeyAndIV(password, salt);

        // On utilise l'IV extrait pour le déchiffrement
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

        await fs.promises.writeFile(filePath, decryptedData);

        console.log('File decrypted successfully.');
    } catch (error) {
        console.error('Error during decryption:', error.message);
        // Relancer l'erreur peut être utile pour que l'appelant sache que ça a échoué
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
}