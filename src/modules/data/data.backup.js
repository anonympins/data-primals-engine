import {dbUrl, MongoClient, MongoDatabase} from "../../engine.js";
import {getUserId, isDemoUser} from "../../data.js";
import {Config} from "../../config.js";
import {Event} from "../../events.js";
import {getObjectHash} from "../../core.js";
import path from "node:path";
import {downloadFromS3, getUserS3Config, listS3Backups, uploadToS3} from "../bucket.js";
import fs from "node:fs";
import {modelsCache, runCryptoWorkerTask} from "./data.core.js";
import * as tar from "tar";
import {getCollection, getUserCollectionName, modelsCollection} from "../mongodb.js";
import {removeFile} from "../file.js";
import {cancelAlerts, scheduleAlerts} from "./data.scheduling.js";
import {dbName} from "../../constants.js";
import {scheduleWorkflowTriggers} from "../workflow.js";
import crypto from "node:crypto";
import process from "node:process";
import {promisify} from "node:util";
import {execFile} from "node:child_process";
import AWS from "aws-sdk";
import {Logger} from "../../gameObject.js";

const getBackupDir = () => process.env.BACKUP_DIR || './backups'; // Répertoire de stockage des sauvegardes
const execFileAsync = promisify(execFile);

let engine, logger;
export function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
}

export const jobDumpUserData = async () => {

    try {

        const primalsDb = MongoClient.db("primals");

        let usersCollection = primalsDb.collection("users");
        const users = await usersCollection.find().toArray();

        users.forEach((user) => {
            if (isDemoUser(user) && Config.Get("useDemoAccounts"))
                return;
            try {
                dumpUserData(user).catch(e => {
                    Event.Trigger("OnUserDataDumped", "event", "system", engine);
                })
            } catch (ignored) {

            }
        });

    } catch (e) {
        console.error(e);
    }
}
let restoreRequests = {};
export const validateRestoreRequest = (username, token) => {
    const request = restoreRequests[username];
    if (!request) {
        return {error: 'Invalid username.'};
    }

    if (request.token !== token) {
        return {error: 'Invalid token.'};
    }

    if (request.expiresAt < new Date()) {
        delete restoreRequests[username];
        return {error: 'Token has expired.'};
    }

    delete restoreRequests[username]; // Remove the request after validation
    return {success: true};
};
export const loadFromDump = async (user, options = {}) => {
    const {modelsOnly = false} = options;
    const action = modelsOnly ? 'restore-models' : 'full-restore';
    logger.info(`[${action}] Starting for user: ${user.username}`);

    const encryptedKey = readKeyFromFile(user);
    if (!encryptedKey) {
        throw new Error("No encryption key found for this user. Cannot restore.");
    }

    const userId = getObjectHash({user: user.username});
    const backupDir = getBackupDir();
    let backupFilePath = ''; // Will hold the path to the archive to be restored
    let isTempFile = false; // Flag to know if we need to delete the file later

    const tmpRestoreDir = path.join(backupDir, `tmp_restore_${userId}_${Date.now()}`);

    try {
        const s3Config = await getUserS3Config(user);
        // --- NEW LOGIC: Check for S3 config first ---
        if (s3Config && s3Config.bucketName && s3Config.accessKeyId && s3Config.secretAccessKey) {
            logger.info(`[${action}] S3 config found for user. Searching for backups in bucket: ${s3Config.bucketName}`);

            const s3Backups = await listS3Backups(s3Config);
            const userBackups = s3Backups
                .filter(f => f.filename.startsWith(`backup_${userId}_`))
                .sort((a, b) => b.timestamp - a.timestamp);

            if (userBackups.length === 0) {
                throw new Error(`No S3 backups found for user ${user.username} in bucket ${s3Config.bucketName}.`);
            }

            const latestBackup = userBackups[0];
            logger.info(`[${action}] Found latest S3 backup: ${latestBackup.key}. Downloading...`);

            // Download the file to a temporary location
            backupFilePath = path.join(backupDir, latestBackup.filename);
            isTempFile = true;
            await downloadFromS3(s3Config, latestBackup.key, backupFilePath);
            logger.info(`[${action}] S3 backup downloaded to ${backupFilePath}.`);

        } else {
            // --- FALLBACK LOGIC: Look for local backups ---
            logger.info(`[${action}] No S3 config. Searching for local backups.`);
            const backupFilenameRegex = new RegExp(`^backup_${userId}_(\\d+)\\.tar\\.gz$`);
            const backupFiles = fs.readdirSync(backupDir).filter(filename => backupFilenameRegex.test(filename));
            if (backupFiles.length === 0) {
                throw new Error(`No local backup files found for user ${user.username}.`);
            }
            const latestBackupFile = backupFiles.sort((a, b) => parseInt(b.match(backupFilenameRegex)[1], 10) - parseInt(a.match(backupFilenameRegex)[1], 10))[0];
            backupFilePath = path.join(backupDir, latestBackupFile);
        }

        // --- The rest of the logic remains the same, operating on backupFilePath ---

        await runCryptoWorkerTask('decrypt', {filePath: backupFilePath, password: encryptedKey});

        if (!fs.existsSync(tmpRestoreDir)) {
            fs.mkdirSync(tmpRestoreDir, {recursive: true});
        }
        await tar.extract({file: backupFilePath, gzip: true, C: tmpRestoreDir, sync: true});

        // ... (Cleaning logic: deleteMany, removeFile, cancelAlerts) ...
        const datasCollection = getCollection("datas");
        if (modelsOnly) {
            await modelsCollection.deleteMany({_user: user.username});
        } else {
            await datasCollection.deleteMany({_user: user.username});
            await modelsCollection.deleteMany({_user: user.username});

            const filesCollection = getCollection("files");
            const userFiles = await filesCollection.find({user: user.username, _model: "privateFile"}).toArray();
            for (const file of userFiles) {
                await removeFile(file.guid, user).catch(e => logger.error(e.message));
            }
            await cancelAlerts(user);
            logger.info(`[${action}] Cleaned existing data, models, files, and alerts for user ${user.username}.`);
        }

        // --- EXÉCUTION DE MONGORESTORE ---
        const d = Config.Get('dbName', dbName);
        const restoreSourceDir = path.join(tmpRestoreDir, d);
        if (!fs.existsSync(restoreSourceDir)) {
            throw new Error(`Restore source directory (${restoreSourceDir}) not found.`);
        }

        let command;
        const args = [
            '--uri', dbUrl,
            '--db', d
        ];

        if (modelsOnly) {
            args.push('--nsInclude', `${d}.models`);
        } else {
            // mongorestore accepte plusieurs fois l'option --nsInclude
            args.push('--nsInclude', `${d}.datas`);
            args.push('--nsInclude', `${d}.models`);
        }
        // Le répertoire source est le dernier argument
        args.push(restoreSourceDir);


        logger.info(`[${action}] Executing restore command: ${command}`);
        await execFileAsync('mongorestore', args);

        // ... (Post-restore tasks) ...
        await scheduleAlerts();
        await scheduleWorkflowTriggers();
        modelsCache.flushAll();

        logger.info(`[${action}] Restore successful for user ${user.username}.`);
        await Event.Trigger("OnDataRestored", "event", "system");

    } finally {
        // --- GUARANTEED CLEANUP ---
        if (fs.existsSync(tmpRestoreDir)) {
            await fs.promises.rm(tmpRestoreDir, {recursive: true, force: true});
        }

        // Re-encrypt the original file if it's not a temporary one
        if (fs.existsSync(backupFilePath) && !isTempFile) {
            await runCryptoWorkerTask('encrypt', {filePath: backupFilePath, password: encryptedKey});
        }

        // If we downloaded a temp file from S3, delete it
        if (fs.existsSync(backupFilePath) && isTempFile) {
            fs.unlinkSync(backupFilePath);
            logger.info(`[${action}] Deleted temporary downloaded backup file: ${backupFilePath}`);
        }
    }
};
// Fonction pour générer une clé aléatoire et la stocker dans un fichier
const generateAndStoreKey = (user) => {
    const backupDir = getBackupDir();
    const keyFile = path.join(backupDir, getObjectHash({id: getUserId(user)}) + '_encryption.key');
    const key = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(keyFile, key, {mode: 0o600}); // Permissions strictes
    return key;
};
// Fonction pour lire la clé depuis le fichier
const readKeyFromFile = (user) => {
    const backupDir = getBackupDir();
    const keyFile = path.join(backupDir, getObjectHash({id: getUserId(user)}) + '_encryption.key');
    if (fs.existsSync(keyFile)) {
        return fs.readFileSync(keyFile, 'utf8');
    }
    return null;
};
export const dumpUserData = async (user) => {
    const s3Config = await getUserS3Config(user);
    const backupDir = getBackupDir();
    const userId = getObjectHash({user: user.username});
    const backupFilename = `backup_${userId}`;
    const timestamp = Date.now();

    // Déclarer les chemins ici pour qu'ils soient accessibles dans tout le scope de la fonction
    const localTempDumpDir = path.join(backupDir, `${backupFilename}_${timestamp}_temp`);
    const finalArchiveName = `${backupFilename}_${timestamp}.tar.gz`;
    const localArchivePath = path.join(backupDir, finalArchiveName);

    let encryptedKey = readKeyFromFile(user);
    if (!encryptedKey) {
        encryptedKey = generateAndStoreKey(user);
    }

    try {
        const backupFrequency = await engine.userProvider.getBackupFrequency(user);
        logger.info(`Fréquence de sauvegarde : ${backupFrequency}.`);


        const d = Config.Get('dbName', dbName);
        const collections = await MongoDatabase.listCollections().toArray();
        for (const collection of collections) {
            const collsToBackup = [await getUserCollectionName(user), 'models'];
            if (collsToBackup.includes(collection.name)) {
                const query = {_user: user.username};
                const args = [
                    '--uri', dbUrl,
                    '--db', d,
                    '--out', localTempDumpDir,
                    '--collection', collection.name,
                    '--query', JSON.stringify(query)
                ];
                logger.info(`Exécution de la commande : mongodump ${args.join(' ')}`);
                await execFileAsync('mongodump', args);
            }
        }
        const dumpSourceDir = path.join(localTempDumpDir, d);
        if (fs.existsSync(dumpSourceDir)) {
            await tar.create({gzip: true, file: localArchivePath, C: localTempDumpDir}, [d]);
            logger.info(`Archive de sauvegarde locale créée : ${localArchivePath}`);
        } else {
            logger.warn(`Le répertoire de dump ${dumpSourceDir} était vide. Aucune archive n'a créée.`);
            return Promise.resolve();
        }

        await runCryptoWorkerTask('encrypt', {filePath: localArchivePath, password: encryptedKey});

        try {
            // Attempt the S3 upload
            await uploadToS3(s3Config, localArchivePath, finalArchiveName);
            // ONLY if the upload succeeds, delete the local file.
            fs.unlinkSync(localArchivePath);
            logger.info(`Local archive ${finalArchiveName} deleted after successful S3 upload.`);
        } catch (e) {
        }

        logger.info(`Sauvegarde réussie pour l'utilisateur ${user.username}.`);
        await manageBackupRotation(user, await engine.userProvider.getBackupFrequency(user), s3Config);

    } catch (error) {
        logger.error(`Erreur lors de la sauvegarde pour l'utilisateur ${user.username}:`, error);
        // Nettoyage de l'archive si elle a été créée avant l'erreur
        if (fs.existsSync(localArchivePath)) {
            fs.unlinkSync(localArchivePath);
        }
        throw error; // Relancer l'erreur pour que l'appelant soit informé
    } finally {
        // --- NETTOYAGE GARANTI ---
        // Ce bloc s'exécute toujours, que la sauvegarde réussisse ou échoue.
        if (fs.existsSync(localTempDumpDir)) {
            fs.rmSync(localTempDumpDir, {recursive: true, force: true});
            logger.info(`Répertoire de dump temporaire ${localTempDumpDir} supprimé.`);
        }
    }
};

async function manageBackupRotation(user, backupFrequency, s3Config = null) { // Accepter s3Config
    const userId = getObjectHash({user: user.username});
    let filesToManage = [];

    if (s3Config && s3Config.bucketName && s3Config.accessKeyId && s3Config.secretAccessKey) {
        logger.info(`Gestion de la rotation des sauvegardes S3 pour ${userId}.`);
        const s3Backups = await listS3Backups(s3Config);
        // Filtrer pour ne garder que les backups de cet utilisateur et trier
        filesToManage = s3Backups
            .filter(f => f.filename.startsWith(`backup_${userId}_`) && f.filename.endsWith('.tar.gz'))
            .map(f => ({
                name: f.filename,
                key: f.key,
                timestamp: f.timestamp
            })) // listS3Backups devrait fournir le timestamp
            .sort((a, b) => b.timestamp - a.timestamp); // Tri décroissant (plus récent en premier)

    } else {
        logger.info(`Gestion de la rotation des sauvegardes locales pour ${userId}.`);
        const backupDir = getBackupDir();
        const localFiles = fs.readdirSync(backupDir);
        filesToManage = localFiles
            .filter(f => !fs.lstatSync(path.join(backupDir, f)).isDirectory() && f.startsWith(`backup_${userId}_`) && f.endsWith('.tar.gz'))
            .map(f => {
                const match = f.match(/_(\d+)\.tar\.gz$/);
                return {name: f, key: path.join(backupDir, f), timestamp: match ? parseInt(match[1], 10) : 0};
            })
            .sort((a, b) => b.timestamp - a.timestamp); // Tri décroissant
    }

    let maxFilesToKeep;
    // ... (ta logique existante pour maxFilesToKeep basée sur backupFrequency)
    switch (backupFrequency) {
    case 'daily': // Premium
        maxFilesToKeep = 7; // Garder 7 jours
        break;
    case 'weekly': // Standard
        maxFilesToKeep = 4; // Garder 4 semaines
        break;
    case 'monthly': // Free
    default:
        maxFilesToKeep = 2; // Garder 2 mois
        break;
    }
    logger.info(`Rotation pour ${userId}: fréquence ${backupFrequency}, garde ${maxFilesToKeep} sauvegardes.`);


    if (filesToManage.length > maxFilesToKeep) {
        const filesToDelete = filesToManage.slice(maxFilesToKeep);
        logger.info(`Suppression de ${filesToDelete.length} anciennes sauvegardes pour ${userId}.`);

        const deletionPromises = filesToDelete.map(async (fileInfo) => {
            try {
                if (s3Config && s3Config.bucketName) {
                    const s3 = new AWS.S3({ /* ... config ... */
                        accessKeyId: s3Config.accessKeyId,
                        secretAccessKey: s3Config.secretAccessKey,
                        region: s3Config.region
                    });
                    await s3.deleteObject({Bucket: s3Config.bucketName, Key: fileInfo.key}).promise();
                    logger.info(`Ancienne sauvegarde S3 supprimée : ${fileInfo.key}`);
                } else {
                    await fs.promises.unlink(fileInfo.key); // key est le chemin complet pour les fichiers locaux
                    logger.info(`Ancienne sauvegarde locale supprimée : ${fileInfo.name}`);
                }
            } catch (err) {
                logger.error(`Erreur lors de la suppression de l'ancienne sauvegarde ${fileInfo.name || fileInfo.key}:`, err);
            }
        });
        await Promise.allSettled(deletionPromises);
    } else {
        logger.info(`Aucune ancienne sauvegarde à supprimer pour ${userId} (total: ${filesToManage.length}, garde: ${maxFilesToKeep}).`);
    }
}