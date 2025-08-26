import {Logger} from "../../gameObject.js";
import {mkdir} from 'node:fs/promises';
import {onInit as historyInit} from "./data.history.js";
import {isDemoUser, isLocalUser} from "../../data.js";
import {install, maxRequestData, storageSafetyMargin} from "../../constants.js";
import {createCollection, getCollection} from "../mongodb.js";
import path from "node:path";
import {isGUID, sequential} from "../../core.js";
import {Event} from "../../events.js";
import fs from "node:fs";
import schedule from "node-schedule";
import {middleware} from "../../middlewares/middleware-mongodb.js";
import i18n from "../../i18n.js";
import checkDiskSpace from "check-disk-space";
import {removeFile} from "../file.js";
import {hasPermission} from "../user.js";
import {profiles} from "../../../client/src/constants.js";
import {registerRoutes} from "./data.routes.js";
import {mongoDBWhitelist} from "./data.core.js";
import {onInit as relationsInit} from "./data.relations.js";
import {validateField, onInit as validationInit} from "./data.validation.js";
import {cancelAlerts, scheduleAlerts, onInit as scheduleInit} from "./data.scheduling.js";
import {deleteData, installPack, onInit as operationsInit} from "./data.operations.js";
import {jobDumpUserData, onInit as backupInit} from "./data.backup.js";

let engine;
let logger;

const DATA_STORAGE_PATH = path.resolve('./');

export const getAPILang = (langs) => {
    if( typeof(langs) !== 'string')
        return 'en';
    const array = (langs || 'en')?.split(/,|;q=/g)

    let quality
    return array.reverse().reduce((e, val) => {
        if (!isNaN(val)) {
            quality = Number(val);
        } else {
            const [lang, dialect] = val.split('-');

            e.push({ lang, dialect, quality });
        }
        return e;
    }, []).sort(((p,r) => p.quality < r.quality ? 1 : -1))?.[0].lang.split(/[-_]/)?.[0];
}

export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    engine.use(middleware({ whitelist: mongoDBWhitelist }));

    let modelsCollection, datasCollection, filesCollection, packsCollection, magnetsCollection, historyCollection;

    if( install ) {
        datasCollection = await createCollection("datas");
        historyCollection = await createCollection("history");
        filesCollection = await createCollection("files");
        packsCollection = await createCollection("packs");
        //data
        const indexes = await datasCollection.indexes();
        if (!indexes.find(i => i.name === 'genericPartialIndex')) {
            await datasCollection.createIndex({"$**": 1}, {
                name: 'genericPartialIndex',
                partialFilterExpression: {
                    _model: 1,
                    _user: 1
                }
            });
        }

        if (! await datasCollection.indexExists("_hash") ) {
            await datasCollection.createIndex({_hash: 1});
        }
        if (! await datasCollection.indexExists("_model") ) {
            await datasCollection.createIndex({_model: 1});
        }
        if (! await datasCollection.indexExists("_user") ) {
            await datasCollection.createIndex({_user: 1});
        }
        if (!indexes.find(i => i.name === 'modelUserIndex')) {
            await datasCollection.createIndex({_model: 1, _user: 1}, { name: 'modelUserIndex'});
        }

        const jobsCollection = await createCollection("job_locks");
        if (! await jobsCollection.indexExists("jobTTLIndex") ) {
            await jobsCollection.createIndex({ "lockedUntil": 1 }, { name: "jobTTLIndex", expireAfterSeconds: 0 });
        }
        if (! await jobsCollection.indexExists("jobIdUnique") ) {
            await jobsCollection.createIndex({ "jobId": 1 }, { name: "jobIdUnique", unique: true });
        }

        logger.info("Setting up indexes for 'files' collection...");
        const filesIndexes = await filesCollection.indexes();

        // Index composé pour les lookups fréquents par GUID et utilisateur
        const compoundGuidUserIndexName = 'file_guid_user_idx';
        if (!filesIndexes.find(i => i.name === compoundGuidUserIndexName)) {
            await filesCollection.createIndex({ guid: 1, user: 1 }, { name: compoundGuidUserIndexName });
            logger.info(`Created compound index '${compoundGuidUserIndexName}' on 'files' collection (guid: 1, user: 1).`);
        } else {
            logger.info(`Index '${compoundGuidUserIndexName}' already exists on 'files' collection.`);
        }

        const uniqueGuidIndexName = 'file_guid_unique_idx';
        const existingGuidIndex = filesIndexes.find(i => i.name === uniqueGuidIndexName);
        if (!existingGuidIndex) {
            await filesCollection.createIndex({ guid: 1 }, { name: uniqueGuidIndexName, unique: true });
            logger.info(`Created unique index '${uniqueGuidIndexName}' on 'guid' for 'files' collection.`);
        } else if (existingGuidIndex.name !== uniqueGuidIndexName || !existingGuidIndex.unique) {
            logger.warn(`An index on 'guid' exists for 'files' collection (name: ${existingGuidIndex.name}, unique: ${existingGuidIndex.unique}), but not matching desired spec (name: ${uniqueGuidIndexName}, unique: true). Manual review might be needed.`);
        } else {
            logger.info(`Unique index on 'guid' (name: '${existingGuidIndex.name}') already exists for 'files' collection.`);
        }

        if (! await packsCollection.indexExists("_user") ) {
            await packsCollection.createIndex({_user: 1});
        }


        // Create the uploads directories
        await mkdir(path.join("uploads", "tmp"),{ recursive: true});

    }else {
        modelsCollection = getCollection("models");
        datasCollection = getCollection("datas");
        filesCollection = getCollection("files");
        packsCollection = getCollection("packs");
        historyCollection = getCollection("history");
    }

    // Sub modules
    backupInit(defaultEngine);
    historyInit(defaultEngine);
    validationInit(defaultEngine);
    relationsInit(defaultEngine);
    scheduleInit(defaultEngine);
    operationsInit(defaultEngine);


    await registerRoutes(engine);
    logger = engine.getComponent(Logger);

    // set backup scheduler
    schedule.scheduleJob("0 2 * * *", jobDumpUserData);
    //await jobDumpUserData();


    schedule.scheduleJob("0 0 * * *", async () => {
        const dt = new Date();
        dt.setTime(dt.getTime()-1000*3600*24*14);
        await deleteData("request", {"$lt": ["$timestamp",dt.toISOString()]}, null, false);
    });
    await scheduleAlerts();

    // Triggers

    Event.Listen("OnValidateModelStructure", async (modelStructure) =>{

        const objectKeys = Object.keys(modelStructure);

        if( objectKeys.find(o => !["name", "_user", "icon", "history", "locked", "_id", "description", "maxRequestData", "fields"].includes(o)) ){
            throw new Error(i18n.t('api.model.invalidStructure'));
        }

        // Vérification du type de name
        if (typeof modelStructure.name !== 'string' || !modelStructure.name) {
            throw new Error(i18n.t("api.validate.requiredFieldString", ["name"]));
        }

        // Vérification du type de description
        if (typeof modelStructure.description !== 'string') {
            throw new Error(i18n.t("api.validate.fieldString", ["description"]));
        }

        // Vérification de la présence et du type du tableau fields
        if (!Array.isArray(modelStructure.fields)) {
            throw new Error(i18n.t('api.validate.fieldArray', ["fields"]));
        }

        // Vérification de chaque champ dans le tableau fields
        for (const field of modelStructure.fields) {
            validateField(field);
        }

        if (modelStructure.constraints) {
            if (!Array.isArray(modelStructure.constraints)) {
                throw new Error('Model "constraints" property must be an array.');
            }
            const fieldNames = new Set(modelStructure.fields.map(f => f.name));
            for (const constraint of modelStructure.constraints) {
                if (constraint.type === 'unique') {
                    if (!constraint.name || !Array.isArray(constraint.keys) || constraint.keys.length === 0) {
                        throw new Error('Unique constraint must have a "name" and a non-empty "keys" array.');
                    }
                    for (const key of constraint.keys) {
                        if (!fieldNames.has(key)) {
                            throw new Error(`Constraint key "${key}" in constraint "${constraint.name}" does not exist as a field in the model.`);
                        }
                    }
                }
            }
        }

        return true; // La structure du modèle est valide
    }, "event", "system");

}


/**
 * Vérifie si l'ajout de nouvelles données dépasserait la capacité de stockage globale du serveur.
 * @param {number} incomingDataSize - La taille des données entrantes en octets.
 * @returns {Promise<{isSufficient: boolean, free?: number, total?: number, error?: string}>}
 */
export async function checkServerCapacity(incomingDataSize = 0) {
    try {
        const diskSpace = await checkDiskSpace(DATA_STORAGE_PATH);
        const { free, size } = diskSpace;

        // Limite maximale d'utilisation du disque (ex: 90% de la taille totale)
        const maxAllowedUsage = size * storageSafetyMargin;
        const currentUsage = size - free;
        const projectedUsage = currentUsage + incomingDataSize;

        if (projectedUsage > maxAllowedUsage) {
            logger.warn(`[checkServerCapacity] Alert: Projected usage (${projectedUsage} bytes) would exceed the server's safety limit (${maxAllowedUsage} bytes).`);
            return {
                isSufficient: false,
                free,
                total: size
            };
        }
        return { isSufficient: true, free, total: size };
    } catch (err) {
        logger.error(`[checkServerCapacity] CRITICAL: Failed to check disk space: ${err.message}. Allowing write operation as a failsafe. Please investigate disk permissions or configuration.`);
        // Failsafe: On autorise l'ure si la vérification échoue, mais on logue une erreur critique.
        return { isSufficient: true, error: 'Could not verify disk space.' };
    }
}


export const getResource = async (guid, user) => {
    if (!guid) throw new Error("Le GUID du fichier est requis.");
    if (!isGUID(guid)) throw new Error("Le GUID du fichier n'est pas valide.");

    const collection = getCollection("files");
    const file = await collection.findOne({ guid });

    if (!file) {
        throw new Error("Fichier non trouvé.");
    }

    // La vérification des permissions reste la même...
    if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_READ_FILE", `API_READ_FILE_privateFile_${guid}`], user)) {
        if (file.user !== (user._user || user.username)) {
            throw new Error("Vous n'êtes pas autorisé à accéder à ce fichier.");
        }
    }

    // On retourne des informations différentes selon le type de stockage
    if (file.storage === 's3') {
        return {
            success: true,
            storage: 's3',
            s3Key: file.filename, // 'filename' contient la clé S3
            mimeType: file.mimeType
            // Idlement, on aurait aussi le nom de fichier original ici
        };
    } else { // Par défaut, on considère le stockage local
        // On utilise le chemin stocké en base de données
        const filepath = file.path;
        if (!filepath || !fs.existsSync(filepath)) {
            throw new Error("Fichier non trouvé sur le serveur.");
        }
        return {
            success: true,
            storage: 'local',
            filepath: filepath,
            filename: file.filename,
            mimeType: file.mimeType
        };
    }
};


export async function handleDemoInitialization(req, res) {
    const user = req.me;
    const body = req.fields;
    const packs = body.packs;
    const models = (Object.keys(profiles).includes(body.profile) && profiles[body.profile].models) || '';
    if (!isDemoUser(user)) {
        return res.status(403).json({ success: false, error: "This action is only for demo users." });
    }
    if (!Array.isArray(models) || models.length === 0) {
        return res.status(400).json({ success: false, error: "A valid 'models' array is required." });
    }

    logger.info(`[Demo Init] Starting initialization for user '${user.username}' with ${models.length} models.`);

    try {
        // 1. Nettoyage de l'environnement (inchangé)
        const datasCollection = getCollection("datas");
        const modelsCollection = getCollection("models");
        const filesCollection = getCollection("files");

        await datasCollection.deleteMany({ _user: user.username });
        await modelsCollection.deleteMany({ _user: user.username });
        const files = await filesCollection.find({ user: user.username }).toArray();
        for (const file of files) {
            await removeFile(file.guid, user).catch(e => logger.error(e.message));
        }
        await cancelAlerts(user);
        logger.info(`[Demo Init] Environment cleaned for user '${user.username}'.`);

        const packToInstall = {
            name: `dynamic-pack-for-${user.username}-${Date.now()}`,
            description: `Dynamically generated pack for profile models.`,
            models: models,
            data: {}
        };

        logger.info(`[Demo Init] Installing dynamically generated pack with models: [${models.join(', ')}].`);

        await sequential(packs.map(p => {
            return () => installPack(p, user, req.query.lang || 'en');
        }));

        // Create and install pack
        const result = await installPack(packToInstall, user, req.query.lang || 'en');

        if (result.success || result.modifiedCount > 0) {

            await Event.Trigger('OnDemoUserAdded', "event", "system", req.me.username);
            logger.info(`[Demo Init] Pack installed successfully for user '${user.username}'.`);
            res.status(200).json({ success: true, message: "Demo environment initialized successfully.", summary: result.summary });
        } else {
            logger.error(`[Demo Init] Pack installation failed for user '${user.username}'.`);
            res.status(200).json({ success: false, error: 'Demo pack installation failed.', errors: result.errors });
        }

    } catch (error) {
        logger.error(`[Demo Init] Critical error during initialization for user '${user.username}':`, error);
        res.status(500).json({ success: false, error: 'An internal server error occurred during initialization.' });
    }
}
