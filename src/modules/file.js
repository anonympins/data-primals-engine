
// Nouvelle fonction pour ajouter un fichier privé
import {maxPrivateFileSize, megabytes} from "../constants.js";
import {isLocalUser} from "../data.js";
import i18n from "../../../data-primals-engine/src/i18n.js";
import {getUserStorageLimit} from "../user.js";
import {getCollection} from "./mongodb.js";
import {getFileExtension, isGUID, uuidv4} from "../core.js";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { checkServerCapacity} from "./data.js";
import crypto from "node:crypto";
import * as tar from "tar";
import {promisify} from "node:util";
import {calculateTotalUserStorageUsage, hasPermission} from "./user.js";
import {Logger} from "../gameObject.js";
import YAML from "yaml";
import swaggerUi from "swagger-ui-express";

const pbkdf2Async = promisify(crypto.pbkdf2);

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

    if (file.size > maxPrivateFileSize) {
        throw new Error(`La taille du fichier dépasse la limite autorisée (${maxPrivateFileSize / megabytes} Mo).`);
    }

    if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_UPLOAD_FILE"], user)) {
        throw new Error(i18n.t("api.permission.uploadFile"));
    }

    const incomingDataSize = file.size;

    const userStorageLimit = getUserStorageLimit(user);
    const currentStorageUsage = await calculateTotalUserStorageUsage(user);

    if (currentStorageUsage + incomingDataSize > userStorageLimit) {
        throw new Error(i18n.t("api.data.storageLimitExceeded", { limit: Math.round(userStorageLimit / megabytes) }));
    }

    const serverCapacity = await checkServerCapacity(incomingDataSize);
    if (!serverCapacity.isSufficient) {
        throw new Error(i18n.t("api.data.serverStorageFull", "Le serveur a atteint sa capacité de stockage maximale. Veuillez réessayer plus tard."));
    }

    const collection = getCollection("files");

    // Générer un GUID pour le fichier
    const guid = uuidv4();
    const filename = guid + path.extname(file.originalname || file.name); // Préserver l'extension
    const filepath = path.join(process.cwd(), 'uploads', 'private', filename);

    try {
        // Enregistrer le fichier sur le serveur
        await fsPromises.mkdir(path.join(process.cwd(), 'uploads', 'private'), {recursive: true});
        await fsPromises.writeFile(filepath, file.buffer || fs.readFileSync(file.path)); // Utiliser buffer si disponible
        if( file.path && fs.existsSync(file.path) ){
            fs.unlinkSync(file.path);
        }

        // Enregistrer les métadonnées du fichier
        const fileMetadata = {
            guid,
            filename: file.originalname || file.name, // Conserver le nom original
            mimeType: file.type,
            size: file.size,
            mainUser: user._user,
            user: user.username,
            timestamp: new Date()
        };

        // Insérer le fichier dans une collection dédiée (par exemple, "privateFiles")
        const result = await collection.insertOne({...fileMetadata, _model: "privateFile"});
        if (!result.insertedId) throw new Error("Échec de l'indexation du fichier.");

        return guid;

    } catch (error) {
        // Nettoyage en cas d'erreur
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        throw new Error(`Erreur lors de l'ajout du fichier: ${error.message}`);
    }
};

export const removeFile = async (guid, user) => {
    if (!guid) return false;
    if (!isGUID(guid)) throw new Error("Le GUID du fichier n'est pas valide.");

    const collection = getCollection("files");

    // Trouver le fichier et vérifier l'autorisation (propriétaire ou admin)
    const file = await collection.findOne({ guid });
    if (!file) throw new Error("Fichier non trouvé (" + guid + ")");

    if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_EDIT_DATA", "API_EDIT_DATA_privateFile", `API_EDIT_DATA_privateFile_${guid}`], user) ) {
        if (file._user !== (user._user || user.username)) {
            throw new Error("Vous n'êtes pas autorisé à supprimer ce fichier.");
        }
    }

    try {
        // Supprimer le fichier de la base de données
        const deleteResult = await collection.deleteOne({ _model: "privateFile", guid });
        if (deleteResult.deletedCount !== 1) throw new Error("Échec de la suppression de l'indexation du fichier.");

        // Supprimer le fichier du serveur
        const filepath = path.join(process.cwd(), 'uploads', 'private', guid)+'.'+getFileExtension(file.filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }

        return { success: true, message: "Fichier supprimé avec succès." };
    } catch (error) {
        throw new Error(`Erreur lors de la suppression du fichier: ${error.message}`);
    }
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

}