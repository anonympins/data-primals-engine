import {getObjectHash, getRand, getRandom, isPlainObject, randomDate, safeAssignObject, setSeed} from "../../core.js";
import {
    maxExportCount,
    maxFileSize,
    maxFilterDepth,
    maxModelNameLength,
    maxPasswordLength,
    maxPostData,
    maxRelationsPerData,
    maxRequestData,
    maxRichTextLength,
    maxStringLength,
    maxTotalDataPerUser,
    megabytes,
    optionsSanitizer,
    searchRequestTimeout
} from "../../constants.js";
import {anonymizeText, getFieldValueHash, getUserId, isDemoUser, isLocalUser} from "../../data.js";
import sanitizeHtml from "sanitize-html";
import {importJobs, modelsCache, runCryptoWorkerTask, runImportExportWorker} from "./data.core.js";
import {
    getCollection,
    getCollectionForUser,
    getUserCollectionName,
    isObjectId,
    modelsCollection,
    packsCollection
} from "../mongodb.js";
import i18n from "../../i18n.js";
import tinycolor from 'tinycolor2';
import {Config} from "../../config.js";
import {calculateTotalUserStorageUsage, hasPermission} from "../user.js";
import {BSON, ObjectId} from "mongodb";
import {runScheduledJobWithDbLock, triggerWorkflows} from "../workflow.js";
import schedule from "node-schedule";
import {sendSseToUser} from "./data.routes.js";
import {applyCronMask, handleScheduledJobs, runStatefulAlertJob} from "./data.scheduling.js";
import {Event} from "../../events.js";
import {getAllPacks} from "../../packs.js";
import {validateModelData, validateModelStructure} from "./data.validation.js";
import {addFile, removeFile} from "../file.js";
import NodeCache from "node-cache";
import fs from "node:fs";
import readXlsxFile from "read-excel-file/node";
import {checkServerCapacity} from "./data.js";
import {Logger} from "../../gameObject.js";
import {
    changeValue,
    checkHash,
    convertDataTypes,
    handleFilesIfNeeded,
    processDocuments,
    processFileArray
} from "./data.relations.js";
import cronstrue from 'cronstrue/i18n.js';

const delay = ms => new Promise(res => setTimeout(res, ms));
const IMPORT_CHUNK_SIZE = 100; // Nombre d'enregistrements à traiter par lot
const IMPORT_CHUNK_DELAY_MS = 1000; // Délai en millisecondes entre le traitement des lots

export const dataTypes = {
    object: {
        validate: (value, field) => {
            return value === null || isPlainObject(value);
        }
    },
    model: {
        validate: (value, field) => {
            return value === null || typeof value === 'string' && value.length <= maxModelNameLength;
        }
    },
    cronSchedule: {
        validate: (value, field) => {
            if (value === null)
                return true;
            try {
                cronstrue.toString(value, {throwExceptionOnParseError: true});
                return true;
            } catch (e) {
                return false;
            }
        },
        filter: async (value, field) => {
            if (value === null)
                return null;
            if (field.cronMask && field.default) {
                return applyCronMask(value, field.cronMask, field.default);
            }
            return value;
        }
    },
    modelField: {
        validate: (value, field) => {
            return value === null || (typeof value === 'string' && value.length < maxStringLength) || typeof value === 'object' && JSON.stringify(value).length <= maxModelNameLength + 100;
        }
    },
    string: {
        validate: (value, field) => {
            const ml = Math.min(Math.max(field.maxlength, 0), maxStringLength);
            return value === null || typeof value === 'string' && (!ml || value.length <= ml)
        },
        anonymize: anonymizeText
    },
    code: {
        validate: (value, field) => {
            return value === null || (field.language === 'json' && typeof (value) === 'object') || (typeof value === 'string' && (field.maxlength === undefined || field.maxlength <= 0 || value.length <= field.maxlength));
        },
        filter: async (value, field) => {
            if (field.language === 'json') {
                if (typeof (value) === 'object')
                    return value;
                else if (typeof (value) === 'string') {
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                        return null;
                    }
                } else {
                    return null;
                }
            }
            return value;
        },
        anonymize: (str) => anonymizeText(typeof (str) === 'object' ? JSON.stringify(str) : str)
    },
    richtext: {
        validate: (value, field) => {
            const ml = Math.min(Math.max(field.maxlength, 0), maxRichTextLength);
            return value === null || typeof value === 'string' && (!ml || value.length <= ml)
        },
        filter: async (value) => {
            return sanitizeHtml(value, optionsSanitizer);
        },
        anonymize: anonymizeText
    },
    'string_t': {
        validate: (value, field) => {
            if (value === null)
                return true;
            const ml = Math.min(Math.max(field.maxlength, 0), maxStringLength);
            // La valeur peut être une chaîne de caractères...
            if (typeof value === 'string') {
                return !ml || value.length <= ml;
            }
            // ... ou un objet contenant une clé de type chaîne de caractères.
            if (typeof value === 'object' &&
                (typeof value.key === 'string' || value.key === null)) {
                return !ml || value.key.length <= ml;
            }
            return false; // Invalide si ce n'est aucun des deux.
        },
        filter: async (value, field) => {
            // Si la valeur est un objet avec une clé, on ne garde que la clé.
            if (typeof value === 'object' && value !== null &&
                (typeof value.key === 'string' || value.key === null)) {
                return value.key || '';
            }
            // Sinon, on garde la valeur telle quelle (qui devrait être une chaîne).
            return value;
        },
        anonymize: anonymizeText
    },
    password: {
        filter: async (value) => {
            if (value)
                return await runCryptoWorkerTask('hash', {data: value});
            return null;
        },
        validate: (value, field) => {
            const ml = Math.min(Math.max(field.maxlength, 0), maxPasswordLength);
            return value === null || typeof value === 'string' && (!ml || value.length <= ml)
        },
        anonymize: anonymizeText
    },
    date: {
        validate: (value, field) => {
            if (value === null)
                return true;
            if (typeof (value) === 'string' && value.toLowerCase() === 'now')
                return true;
            if (typeof value !== 'string') return false;
            const dt = new Date(value);

            const dtMin = new Date(field.min || value);
            const dtMax = new Date(field.max || value);
            if (isNaN(dt)) {
                return false;
            }
            return (dt.getTime() >= dtMin.getTime() && dt.getTime() <= dtMax.getTime());
        },
        filter: async (value) => {
            if (typeof (value) === 'string' && value.toLowerCase() === "now") {
                return new Date().toISOString().split("T")[0];
            }
            if (value instanceof Date)
                return value.toISOString().split("T")[0];
            return value;
        },
        anonymize: (value, field) => {
            const min = new Date();
            const max = new Date();
            min.setFullYear(min.getFullYear() - 1);
            max.setFullYear(max.getFullYear() + 1);
            return randomDate(field.min ? new Date(field.min) : min, field.max ? new Date(field.max) : max);
        }
    },
    datetime: {
        validate: (value, field) => {
            if (typeof (value) === 'string' && value.toLowerCase() === 'now')
                return true;
            if (value instanceof Date || value === null)
                return true;
            if (typeof value !== 'string' || !value) return false;
            const dt = new Date(value);
            const dtMin = new Date(field.min || value);
            const dtMax = new Date(field.max || value);
            if (isNaN(dt)) {
                return false;
            }
            return (dt.getTime() >= dtMin.getTime() && dt.getTime() <= dtMax.getTime());
        },
        filter: async (value) => {
            if (typeof (value) === 'string' && value.toLowerCase() === "now") {
                return new Date().toISOString();
            }
            if (value instanceof Date)
                return value.toISOString();
            return value;
        },
        anonymize: (value, field) => {
            const min = new Date();
            const max = new Date();
            min.setFullYear(min.getFullYear() - 1);
            max.setFullYear(max.getFullYear() + 1);
            return randomDate(field.min ? new Date(field.min) : min, field.max ? new Date(field.max) : max);
        }
    },
    phone: {
        prefixRegex: /^[+]?[(]?[0-9]{2,3}[)]?$/,
        validate: (value) => {
            if (value === null) return true;
            if (typeof value !== 'string') return false;
            if (!value) return true;
            if (dataTypes.phone.prefixRegex.test(value)) return true;
            const phoneRegex = /^[+]?[(]?[0-9]{2,3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im;
            return phoneRegex.test(value);
        },
        filter: async (value) => {
            if (dataTypes.phone.prefixRegex.test(value)) return '';
            return value;
        },
        anonymize: anonymizeText
    },
    url: {
        validate: (value) => {
            if (value === null) return true;
            if (typeof value !== 'string') return false;
            if (!value.trim()) return true;
            const expression = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/;
            return expression.test(value);
        },
        anonymize: anonymizeText
    },
    number: {
        validate: (value, field) => {
            if (value === null) return true;
            const min = typeof (field.min) === 'number' ? field.min : null;
            const max = typeof (field.max) === 'number' ? field.max : null;
            if (min !== null && max !== null && max < min)
                return false;
            return typeof value === 'number' && !isNaN(value) && (min === null || value >= min) && (max === null || value <= max);
        },
        anonymize: (value, field) => {
            const min = typeof (field.min) === 'number' ? field.min : 0;
            const max = typeof (field.max) === 'number' ? field.max : Math.MAX_SAFE_INTEGER;
            return getRandom(min, max);
        }
    },
    boolean: {
        validate: (value) => value === null || typeof value === 'boolean',
        anonymize: () => {
            return !!getRandom(0, 1);
        }
    },
    array: {
        validate: (value, field) => {
            if (value === null) return true;
            if (!Array.isArray(value)) {
                return false;
            }
            if (field.minItems && value.length < field.minItems) {
                return false;
            }
            if (field.maxItems && value.length > field.maxItems) {
                return false;
            }
            return value.every(item => {
                if (!dataTypes[field.itemsType]) {
                    throw new Error(`Invalid itemsType: ${field.itemsType}`);
                }
                return dataTypes[field.itemsType].validate(item, {field, type: field.itemsType});
            });
        },
        anonymize: () => []
    },
    enum: {
        validate: (value) => value === null || typeof (value) === 'string',
        anonymize: (value, field) => {
            return field.items[Math.floor(Math.random() * field.items.length)];
        }
    },
    // Types personnalisés
    email: {
        validate: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        anonymize: anonymizeText
    },
    relation: {
        validate: (value, field) => {
            if (field.multiple) {
                return typeof (value) === 'object' || (Array.isArray(value) && value.length <= maxRelationsPerData && !value.some(v => {
                    return !isObjectId(v);
                }));
            }
            return value === null || value === undefined || isObjectId(value) || typeof (value) === 'object';
        },
        anonymize: () => null
    },
    file: {
        validate: (value, field) => {
            // If no file is selected, it's considered valid (optional field)
            if (value === null || value === undefined) {
                return true;
            }

            // Check if the value is a string (filename or GUID)
            if (typeof value === 'string') {
                return true;
            }

            // Check if the value is a File object
            if (typeof (value) === 'object') {
                if (field.mimeTypes && !field.mimeTypes.includes(value.type)) {
                    throw new Error(i18n.t('api.validate.invalidMimeType', {
                        type: value.type,
                        authorized: field.mimeTypes.join(', ')
                    }));
                }

                // Check if the file size is within the limit
                if (value.size > (field.maxSize || maxFileSize)) {
                    return false;
                }

                return true;
            }

            return false; // Invalid type
        },
        filter: async (value, field, reqFile) => {
            if (typeof value !== 'object') {
                return null;
            }

            return value;
        },
        anonymize: () => null
    },
    color: {
        validate: (value) => {
            if (value === null) return true;
            if (typeof value !== 'string') return false;
            // Utilise tinycolor pour valider n'importe quel format de couleur supporté (hex, rgb, hsl, etc.)
            return tinycolor(value).isValid();
        },
        filter: async (value) => {
            if (!value) return null;
            const color = tinycolor(value);
            // Stocke dans un format canonique : HEX8 (#RRGGBBAA) pour supporter la transparence alpha
            return color.isValid() ? color.toHex8String().toUpperCase() : null;
        },
        anonymize: () => {
            return '#FFFFFFFF';
        }
    },
    calculated: {
        validate: (value) => {
            return value !== undefined && value !== null && typeof value !== 'object' && !Array.isArray(value);
        },
        filter: async (value) => {
            return value;
        }
    },
    geolocation: {
        validate: (value) => {
            if (value === null) return true;
            // Basic GeoJSON structure validation
            if (typeof value !== 'object' || !value.type || !value.coordinates) {
                return false;
            }
            // For now, we only validate 'Point' type, which is the most common.
            if (value.type !== 'Point') {
                // This can be extended to support 'Polygon', 'LineString', etc.
                return false;
            }
            // Validate coordinates for a Point
            return Array.isArray(value.coordinates) &&
                value.coordinates.length === 2 &&
                typeof value.coordinates[0] === 'number' &&
                typeof value.coordinates[1] === 'number';
        },
        anonymize: () => {
            // Generate random coordinates for a GeoJSON Point.
            // Longitude: -180 to 180
            // Latitude: -90 to 90
            setSeed(new Date().getTime()+'');
            const longitude = (getRand() * 360) - 180;
            const latitude = (getRand() * 180) - 90;
            return {
                type: 'Point',
                coordinates: [longitude, latitude]
            };
        }
    },
    richtext_t: {
        validate: (value, field) => {
            // La valeur doit être un objet (ou null/undefined)
            if (value === null || typeof value === 'undefined') return true;
            if (typeof value !== 'object' || Array.isArray(value)) return false;

            // Chaque valeur dans l'objet doit être une chaîne de caractères (le HTML)
            return Object.values(value).every(html => typeof html === 'string');
        },
        filter: async (value) => {
            if (!value) return null;
            const sanitizedObject = {};
            for (const lang in value) {
                if (Object.prototype.hasOwnProperty.call(value, lang)) {
                    // On réutilise le même sanitizer que pour le richtext simple
                    safeAssignObject(sanitizedObject, lang, sanitizeHtml(value[lang], optionsSanitizer));
                }
            }
            return sanitizedObject;
        },
        anonymize: () => ({}) // Anonymisation en objet vide
    }
};



let engine, logger;
export function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
}

export const editModel = async (user, id, data) => {

    if (!(isDemoUser(user) && Config.Get("useDemoAccounts")) && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_EDIT_MODEL"], user)) {
        return ({success: false, error: i18n.t('api.permission.editModel', 'Cannot edit models from the API')})
    }

    const dataModel = data;
    try {
        const collection = await getCollectionForUser(user);
        await validateModelStructure(dataModel);

        const el = await modelsCollection.findOne({
            $and: [
                {_user: {$exists: true}},
                {_id: new ObjectId(id)},
                {
                    $and: [{_user: {$exists: true}}, {$or: [{_user: user._user}, {_user: user.username}]}]
                }
            ]
        });

        if (!el) {
            return ({success: false, statusCode: 404, error: i18n.t("api.model.notFound", {model: dataModel.name})});
        }

        // renommage du modèle
        if (typeof (data.name) === 'string' && el.name !== data.name && data.name) {
            await collection.updateMany({_model: el.name}, {$set: {_model: data.name}});
            await modelsCollection.updateMany({
                'fields': {
                    '$elemMatch': {relation: el.name}
                }
            }, {
                $set: {
                    'fields.$.relation': data.name
                }
            })
        }

        // Update indexes
        if (await engine.userProvider.hasFeature(user, 'indexes')) {
            const coll = await getCollectionForUser(user);
            let indexes = [];
            try {
                indexes = await coll.indexes();
            } catch (e) {
                if (e.codeName !== 'NamespaceNotFound') {
                    throw e;
                }
            }

            const oldFields = el.fields || [];
            const newFields = data.fields || [];

            // --- Text Index Management (Compound) ---
            const newTextFields = newFields.filter(f => f.index && f.indexType === 'text').map(f => f.name).sort();
            const textIndexName = `_text_search_idx_${data.name}`;
            const existingTextIndex = indexes.find(i => i.name === textIndexName);
            const existingTextFields = existingTextIndex ? Object.keys(existingTextIndex.weights || {}).sort() : [];

            // Check if the text index definition has changed
            const textIndexChanged = JSON.stringify(existingTextFields) !== JSON.stringify(newTextFields);

            if (textIndexChanged) {
                if (existingTextIndex) {
                    logger.info(`[Index] Dropping existing text index '${textIndexName}' due to changes.`);
                    await coll.dropIndex(textIndexName);
                }
                if (newTextFields.length > 0) {
                    const textIndexSpec = newTextFields.reduce((acc, fieldName) => {
                        acc[fieldName] = 'text';
                        return acc;
                    }, {});
                    const indexOptions = {
                        name: textIndexName,
                        partialFilterExpression: { _model: data.name, _user: user.username }
                    };
                    logger.info(`[Index] Creating compound text index on fields: [${newTextFields.join(', ')}].`);
                    await coll.createIndex(textIndexSpec, indexOptions);
                }
            }

            // --- Regular and 2dsphere Index Management (per field) ---
            const managedFields = newFields.concat(oldFields.filter(oldField => !newFields.some(nf => nf.name === oldField.name)));

            for (const field of managedFields) {
                const oldField = oldFields.find(f => f.name === field.name);
                const newField = newFields.find(f => f.name === field.name);
                const fieldName = field.name;

                // Skip text fields, they are handled above
                if ((oldField?.indexType === 'text') || (newField?.indexType === 'text')) continue;

                const wasIndexed = oldField?.index;
                const isIndexed = newField?.index ?? false;
                const oldIndexType = oldField?.indexType || 'regular';
                const newIndexType = newField?.indexType || 'regular';
                const indexName = `${fieldName}_${newIndexType}_idx`;
                const existingIndex = indexes.find(i => i.key[fieldName] && i.name.startsWith(fieldName));
                const indexExists = !!existingIndex;
                const existingIndexTypeFromName = indexExists ? existingIndex.name.split('_')[1] : null;

                const needsUpdate = !newField || (isIndexed !== indexExists) || (isIndexed && indexExists && newIndexType !== existingIndexTypeFromName);

                if (needsUpdate) {
                    if (existingIndex) {
                        logger.info(`[Index] Dropping existing index '${existingIndex.name}' for field '${fieldName}' due to changes or deletion.`);
                        await coll.dropIndex(existingIndex.name);
                    }
                    if (isIndexed && newField) {
                        const indexValue = newIndexType === '2dsphere' ? '2dsphere' : 1;
                        const indexSpec = { [fieldName]: indexValue };
                        const indexOptions = { name: indexName, partialFilterExpression: { _model: data.name, _user: user.username } };
                        logger.info(`[Index] Creating '${newIndexType}' index on field '${fieldName}'.`);
                        await coll.createIndex(indexSpec, indexOptions);
                    }
                }
            }
        }
        // suppression des données à la suppression des champs
        const unset = {};
        el.fields.filter(f => !dataModel.fields.some(dt => dt.name === f.name)).map(f => f.name).forEach(f => {
            unset[f] = 1;
        });
        await collection.updateMany({_model: el.name}, {$unset: unset});

        // sauvegarde du modele
        const set = {...data};
        delete set['_id'];

        const oid = new ObjectId(id);
        await modelsCollection.updateOne({_id: oid}, {$set: set});

        modelsCache.del(user.username + '@@' + el.name);

        const model = await modelsCollection.findOne({_id: oid});
        triggerWorkflows(model, user, 'ModelEdited').catch(workflowError => {
            logger.error(`Erreur asynchrone lors du déclenchement des workflows pour ${model._model} ID ${model._id}:`, workflowError);
        });

        const newModel = await modelsCollection.findOne({_id: oid});
        const res = ({success: true, data: newModel});
        const plugin = await Event.Trigger("OnModelEdited", "event", "system", engine, newModel);
        await Event.Trigger("OnModelEdited", "event", "user", plugin?.data || newModel);
        return plugin || res
    } catch (e) {
        logger.error(e);
        return ({success: false, error: e.message, statusCode: 500});
    }
};
export const createModel = async (data) => {
    return await getCollection('models').insertOne(data);
}
export const deleteModels = async (filter) => {
    return await getCollection('models').deleteMany(filter ? filter : {_user: {$exists: false}});
}
export const getModel = async (modelName, user) => {
    const modelInCache = modelsCache.get((user?.username || '') + "@@" + modelName);
    if (modelInCache)
        return modelInCache;
    const model = await getCollection('models').findOne({
        name: modelName,
        $and: user ? [{_user: {$exists: true}}, {$or: [{_user: user._user}, {_user: user.username}]}] : [{_user: {$exists: false}}]
    });
    if (!model) {
        throw new Error(i18n.t('api.model.notFound', {model: modelName}));
    }
    modelsCache.set((user?.username || '') + "@@" + modelName, model);
    return model;
}
export const getModels = async () => {
    return await getCollection('models')?.find({'$or': [{_user: {$exists: false}}]}).toArray() || [];
}
export const insertData = async (modelName, data, files, user, triggerWorkflow = true, waitForWorkflow = true) => {

    // --- Vérification des permissions (inchangée) ---
    if (!(isDemoUser(user) && Config.Get("useDemoAccounts")) && isLocalUser(user) && (
        !await hasPermission(["API_ADMIN", "API_ADD_DATA", "API_ADD_DATA_" + modelName], user) ||
        await hasPermission(["API_ADD_DATA_NOT_" + modelName], user))) {
        // Renvoyer une structure d'erreur cohérente
        return {success: false, error: i18n.t('api.permission.addData'), statusCode: 403};
    }

    const collection = await getCollectionForUser(user);
    let insertedIds = []; // Pour stocker les IDs retourn par pushDataUnsecure

    try {
        // --- Insertion via pushDataUnsecure (inchangée) ---
        insertedIds = await pushDataUnsecure(data, modelName, user, files);

        // Check if pushDataUnsecure actually returned IDs
        if (!insertedIds || insertedIds.length === 0) {
            logger.warn(`[insertData] pushDataUnsecure did not return inserted IDs for model ${modelName}.`);
            // Retourner échec si l'insertion n'a pas retourné d'IDs
            return {
                success: false,
                unmodified: true,
                error: "Insertion failed, no IDs returned by core function.",
                statusCode: 500
            };
        }

        // Convertir les IDs en ObjectId pour la recherche
        const objectIds = insertedIds.map(id => new ObjectId(id));
        const insertedDocs = await collection.find({_id: {$in: objectIds}}).toArray();

        if (!insertedDocs || insertedDocs.length === 0) {
            logger.warn(`[insertData] Could not fetch inserted documents after pushDataUnsecure (IDs: ${insertedIds.join(', ')}).`);
            // Continuer même si on ne peut pas fetch, l'insertion a réussi.
        } else {
            // --- Logique de post-insertion (Workflows et Planification) ---
            const postInsertionPromises = insertedDocs.map(async (doc) => {
                // 1. Déclencher les workflows 'DataAdded' (si activé)
                if (triggerWorkflow) {
                    const prom = triggerWorkflows(doc, user, 'DataAdded').then(e => {
                        logger.debug(`[insertData] Triggered DataAdded workflow for ${doc._model} ID ${doc._id}.`);
                    }).catch(e => {
                        logger.error(`[insertData] Error triggering DataAdded workflow for ${doc._model} ID ${doc._id}:`, e);
                    });
                    if (waitForWorkflow) {
                        await prom;
                    }
                }

                if (doc._model === 'workflowTrigger' && doc.isActive === true && doc.cronExpression) {
                    const jobId = `workflowTrigger_${doc._id}`;
                    logger.info(`[insertData] Scheduling new active workflowTrigger ${doc._id} (${doc.name || 'No Name'}) with cron: "${doc.cronExpression}"`);

                    if (schedule.scheduledJobs[jobId]) {
                        logger.warn(`[insertData] Job ${jobId} already exists. Cancelling before rescheduling.`);
                        schedule.scheduledJobs[jobId].cancel();
                    }

                    try {
                        schedule.scheduleJob(jobId, doc.cronExpression, async () => {
                            logger.info(`[Scheduled Job] Cron triggered for job ${jobId}. Attempting to run with lock...`);
                            await runScheduledJobWithDbLock(
                                jobId,
                                async () => {
                                    // --- NOUVELLE LOGIQUE D'ALERTE ---
                                    logger.info(`[Scheduled Job] Executing alert logic for workflow ${doc.name} (ID: ${doc._id}) for user ${doc._user}`);

                                    const alertPayload = {
                                        type: 'cron_alert',
                                        triggerId: doc._id.toString(),
                                        triggerName: doc.name,
                                        timestamp: new Date().toISOString(),
                                        message: `L'alerte planifiée '${doc.name || 'Sans nom'}' a été déclenchée.`
                                    };

                                    // Envoyer l'alerte à l'utilisateur spécifique via SSE
                                    const sent = await sendSseToUser(doc._user, alertPayload);

                                    if (sent) {
                                        logger.info(`[Scheduled Job] Successfully sent SSE alert for job ${jobId} to user ${doc._user}.`);
                                    } else {
                                        logger.warn(`[Scheduled Job] Could not send SSE alert for job ${jobId}. User ${doc._user} is not connected via SSE.`);
                                    }
                                    // --- FIN DE LA LOGIQUE D'ALERTE ---
                                },
                                doc.lockDurationMinutes || 5
                            );
                        });
                        logger.info(`[insertData] Successfully scheduled job ${jobId}.`);
                    } catch (scheduleError) {
                        logger.error(`[insertData] Failed to schedule job ${jobId} for workflowTrigger ${doc._id}. Error: ${scheduleError.message}`);
                    }
                } else if (doc._model === 'alert' && doc.isActive === true && doc.frequency) {
                    const jobId = `alert_${doc._id}`;
                    logger.info(`[insertData] Scheduling new active alert ${doc._id} (${doc.name}) with frequency: "${doc.frequency}"`);

                    if (schedule.scheduledJobs[jobId]) {
                        logger.warn(`[insertData] Job ${jobId} already exists. Cancelling before rescheduling.`);
                        schedule.scheduledJobs[jobId].cancel();
                    }

                    try {
                        // --- MODIFICATION ICI ---
                        schedule.scheduleJob(jobId, doc.frequency, () => runStatefulAlertJob(doc._id));
                        // --- FIN MODIFICATION ---
                        logger.info(`[insertData] Successfully scheduled alert job ${jobId}.`);
                    } catch (scheduleError) {
                        logger.error(`[insertData] Failed to schedule alert job ${jobId}. Error: ${scheduleError.message}`);
                    }
                }

            });

            // Attendre que toutes les opérations post-insertion (workflows, planification) soient tentées
            await Promise.allSettled(postInsertionPromises);
        }

        // System specific event
        const eventPayload = {modelName, insertedIds, user};
        await Event.Trigger("OnDataAdded", "event", "system", engine, eventPayload);

        // User specific event
        const userPayload = {...eventPayload};
        delete userPayload['user'];
        await Event.Trigger("OnDataAdded", "event", "user", userPayload);

        // Return valid result
        return {success: true, insertedIds: insertedIds.map(id => id.toString())}; // Convertir les IDs en string pour la réponse

    } catch (error) { // Attrape les erreurs de permission ou de pushDataUnsecure
        logger.error(`[insertData] Main error during insertion process for model ${modelName}: ${error.message}`, error.stack);
        // Renvoyer une structure d'erreur cohérente
        return {
            success: false,
            unmodified: error.unmodified,
            error: error.message || "Insertion failed due to an unexpected error.",
            statusCode: error.statusCode || 500
        };
    }
};
/**
 * Fonction principale pour l'insertion de données avec gestion des relations
 * @param {Array<object>|object} data - Données à insérer
 * @param {string} modelName - Nom du modèle cible
 * @param {object} me - Utilisateur courant
 * @param {object} [files={}] - Fichiers associés (optionnel)
 * @returns {Promise<Array<string>>} IDs des documents insérés/trouvés
 */
export const pushDataUnsecure = async (data, modelName, me, files = {}) => {
    try {
        // 1. Initialisation et validation
        const {datas, model, collection} = await initializeAndValidate(data, modelName, me);
        if (datas.length === 0) {
            return [];
        }

        // 2. Vérification des limites (en parallèle avec les contraintes)
        const [_, violations] = await Promise.all([
            checkLimits(datas, model, collection, me),
            checkCompositeUniqueConstraints(datas, model, collection, me)
        ]);

        if (violations.length > 0) {
            throw new Error(`Violation of unique constraints :\n${violations.join('\n')}`);
        }

        // 3. Traitement des documents
        const {allInsertedIds, idMap} = await processDocuments(datas, model, collection, me);

        // 4. Gestion des fichiers (optionnel)
        await handleFilesIfNeeded(allInsertedIds, files, model, collection);

        return allInsertedIds;
    } catch (e) {
        throw e;
    }
};

async function checkCompositeUniqueConstraints(datas, model, collection, user) {
    if (!model.constraints?.length) return [];

    const uniqueConstraints = model.constraints.filter(c => c.type === 'unique' && c.keys?.length);
    if (!uniqueConstraints.length) return [];

    // Préparation des vérifications
    const violations = [];
    const userId = user._user || user.username;

    // Paralléliser par contrainte
    await Promise.all(uniqueConstraints.map(async (constraint) => {
        // Vérifier les champs de la contrainte
        const invalidFields = constraint.keys.filter(key =>
            !model.fields.some(f => f.name === key)
        );

        if (invalidFields.length) {
            violations.push(`Fields used in constraint [${invalidFields.join(', ')}] '${constraint.name}' are inexistant.`);
            return;
        }

        // Batch processing des documents (500 max)
        const batchSize = 50;
        for (let i = 0; i < datas.length; i += batchSize) {
            const batch = datas.slice(i, i + batchSize);

            // Créer toutes les requêtes pour ce batch
            const queries = batch.flatMap(doc => {
                const compositeKey = {};
                let hasNull = false;

                for (const key of constraint.keys) {
                    if (doc[key] == null) {
                        hasNull = true;
                        break;
                    }
                    compositeKey[key] = doc[key];
                }

                return hasNull ? [] : [{
                    collection,
                    query: {
                        ...compositeKey,
                        _model: model.name,
                        _user: userId
                    }
                }];
            });

            // Exécution en parallèle avec $or pour réduire les appels
            if (queries.length) {
                const matchingDocs = await collection.find({
                    $or: queries.map(q => q.query)
                }).toArray();

                if (matchingDocs.length) {
                    // Créer un Set des clés existantes pour recherche rapide
                    const existingKeys = new Set(
                        matchingDocs.map(doc =>
                            constraint.keys.map(k => doc[k]).join('|')
                        )
                    );

                    // Vérifier chaque document du batch
                    batch.forEach(doc => {
                        const keyValues = constraint.keys.map(k => doc[k]);
                        if (keyValues.every(v => v != null)) {
                            const compositeKey = keyValues.join('|');
                            if (existingKeys.has(compositeKey)) {
                                violations.push(
                                    `[${constraint.name}] Existing data : ${constraint.keys.map((k, i) => `${k}=${keyValues[i]}`).join(', ')}`
                                );
                            }
                        }
                    });
                }
            }
        }
    }));

    return violations;
}

/**
 * Initialise et valide les paramètres d'entrée
 */
async function initializeAndValidate(data, modelName, me) {
    const datas = normalizeInputData(data);
    if (datas.length === 0) return {datas: [], model: null, collection: null};

    const model = await getModel(modelName, me);
    const collection = await getCollectionForUser(me);
    await validateModelStructure(model);

    return {datas, model, collection};
}

/**
 * Normalise les données d'entrée (tableau ou objet unique)
 */
function normalizeInputData(data) {
    if (Array.isArray(data)) return data;
    if (isPlainObject(data)) return [data];
    return [];
}

/**
 * Vérifie toutes les limites (stockage, capacité, etc.)
 */
async function checkLimits(datas, model, collection, me) {
    const incomingDataSize = calculateDataSize(datas);
    const userStorageLimit = await engine.userProvider.getUserStorageLimit(me);

    // Vérification des limites utilisateur
    const currentStorageUsage = await calculateTotalUserStorageUsage(me);
    if (currentStorageUsage + incomingDataSize > userStorageLimit) {
        throw new Error(i18n.t("api.data.storageLimitExceeded", {
            limit: Math.round(userStorageLimit / megabytes)
        }));
    }

    // Vérification capacité serveur
    const serverCapacity = await checkServerCapacity(incomingDataSize);
    if (!serverCapacity.isSufficient) {
        throw new Error(i18n.t("api.data.serverStorageFull"));
    }

    // Vérification nombre max de documents
    const count = await collection.countDocuments({_user: me._user || me.username});
    if (count + datas.length > maxTotalDataPerUser) {
        throw new Error(i18n.t("api.data.tooManyData"));
    }

    if (datas.length > maxPostData) {
        throw new Error(i18n.t('api.data.tooManyData'));
    }
}

/**
 * Calcule la taille des données (en octets)
 */
function calculateDataSize(datas) {
    try {
        return BSON.calculateObjectSize(datas);
    } catch (e) {
        logger.warn("[Storage] Fallback to JSON.stringify for size estimation.");
        return JSON.stringify(datas).length;
    }
}

export const patchData = async (modelName, filter, data, files, user, triggerWorkflow = true, waitForWorkflow = false) => {
    return await internalEditOrPatchData(modelName, filter, data, files, user, true, triggerWorkflow, waitForWorkflow);
};
export const editData = async (modelName, filter, data, files, user, triggerWorkflow = true, waitForWorkflow = false) => {
    return await internalEditOrPatchData(modelName, filter, data, files, user, false, triggerWorkflow, waitForWorkflow);
};
const internalEditOrPatchData = async (modelName, filter, data, files, user, isPatch, triggerWorkflow = true, waitForWorkflow = false) => {
    try {
        // 1. Vérification des permissions
        if (user.username !== 'demo' && isLocalUser(user) && (
            !await hasPermission(["API_ADMIN", "API_EDIT_DATA", "API_EDIT_DATA_" + modelName], user) ||
            await hasPermission(["API_EDIT_DATA_NOT_" + modelName], user))) {
            throw new Error(i18n.t("api.permission.editData"));
        }

        const collection = await getCollectionForUser(user);
        const model = await modelsCollection.findOne({name: modelName, _user: user.username});
        if (!model) {
            throw new Error(i18n.t("api.model.notFound", {model: modelName}));
        }

        // 2. Récupération des documents existants et de leur hash original
        const existingDocs = (await searchData({model: modelName, filter}, user))?.data;
        if (!existingDocs || existingDocs.length === 0) {
            return {success: false, error: i18n.t("api.data.notFound")};
        }
        const ids = existingDocs.map(d => new ObjectId(d._id));
        const originalHash = existingDocs[0]._hash; // Sauvegarde du hash avant modification

        // 3. Préparation des données de mise à jour (inchangé)
        const updateData = {...data};
        delete updateData._model;
        delete updateData._user;

        // Traitement des fichiers (inchangé)
        const fileFields = model.fields.filter(f => f.type === 'file' || (f.type === 'array' && f.itemsType === 'file'));
        for (const field of fileFields) {
            if (files?.[field.name + '[0]']) {
                if (field.type === 'file') {
                    updateData[field.name] = await addFile(files[field.name + '[0]'][0], user);
                } else if (field.type === 'array' && field.itemsType === 'file') {
                    const currentFiles = existingDocs[0]?.[field.name] || [];
                    const newFiles = await processFileArray(files[field.name + '[0]'], currentFiles, user);
                    updateData[field.name] = newFiles;
                }
            }
        }

        // 4. Validation adaptée pour patch ou edit (inchangé)
        if (!isPatch) {
            const dataToValidate = {...existingDocs[0], ...updateData};
            await validateModelData(dataToValidate, model, false);
        } else {
            await validateModelData(updateData, model, true);
        }

        // 5. Vérification des champs uniques (inchangé)
        const uniqueFields = model.fields.filter(f => f.unique);
        for (const field of uniqueFields) {
            if (updateData[field.name] !== undefined) {
                const existing = await collection.findOne({
                    _user: user._user || user.username,
                    _model: modelName,
                    [field.name]: updateData[field.name],
                    _id: {$nin: ids}
                });
                if (existing) {
                    throw new Error(i18n.t("api.data.duplicateValue", {
                        field: field.name,
                        value: updateData[field.name]
                    }));
                }
            }
        }

        // 6. Traitement des relations (inchangé)
        const relationFields = model.fields.filter(f => f.type === 'relation');
        for (const field of relationFields) {
            if (updateData[field.name] !== undefined) {
                const relationValue = updateData[field.name];
                // Only process relations if the value is an object or an array containing at least one object.
                // An array of strings (ObjectIDs) should be passed through as-is for the update.
                let shouldProcessRelation = false;
                if (Array.isArray(relationValue)) {
                    // If any item in the array is a plain object, we need to process the whole array
                    // to handle potential nested creations or lookups.
                    if (relationValue.some(item => isPlainObject(item))) {
                        shouldProcessRelation = true;
                    }
                } else if (isPlainObject(relationValue)) {
                    shouldProcessRelation = true;
                }
                if (shouldProcessRelation) {
                    const insertedIds = await pushDataUnsecure(relationValue, field.relation, user);
                    updateData[field.name] = field.multiple ? insertedIds || [] : (insertedIds?.[0] || null);
                }
            }
        }

        // 7. Application des filtres de champ (ex: hashage de mot de passe) (inchangé)
        for (const field of model.fields) {
            if (updateData[field.name] !== undefined && dataTypes[field.type]?.filter) {
                updateData[field.name] = await dataTypes[field.type].filter(
                    field.type === 'file' ? null : updateData[field.name],
                    field
                );
            }
        }

        for (const field of model.fields) {
            if (field.type === 'relation' && field.relationFilter && updateData[field.name]) {

                const relatedIds = Array.isArray(updateData[field.name])
                    ? updateData[field.name]
                    : [updateData[field.name]];

                // Préparer un filtre global : match si _id dans relatedIds ET respecte relationFilter
                const validationQuery = {
                    $and: [
                        {$in: ['$_id', relatedIds.map(id => ({$toObjectId: id}))]},
                        field.relationFilter
                    ]
                };

                const relatedDocs = await searchData({
                    filter: validationQuery,
                    model: field.relation,
                    limit: relatedIds.length
                }, user);

                if ((relatedDocs?.count || 0) !== relatedIds.length) {
                    const invalidIds = relatedIds.filter(id =>
                        !relatedDocs.data.some(doc => doc._id.toString() === id.toString())
                    );
                    throw new Error(
                        i18n.t(
                            'api.data.relationFilterFailed',
                            'Les valeurs {{values}} pour le champ {{field}} ne respectent pas le filtre de relation défini.',
                            {field: field.name, values: invalidIds.join(', ')}
                        )
                    );
                }
            }
        }

        // 8. Calcul du nouveau hash et préparation des données finales
        const finalStateForHash = {...existingDocs[0], ...updateData};
        const newHash = getFieldValueHash(model, finalStateForHash);

        const finalDataForSet = {
            ...updateData,
            _hash: newHash
        };

        // 9. *** CORRECTION LOGIQUE ***
        // On ne vérifie l'unicité que si le hash a réellement changé.
        if (newHash !== originalHash) {
            const hashCheck = await checkHash(user, model, newHash, existingDocs[0]._id.toString());
            if (hashCheck) {
                // Le nouvel état du document créerait un doublon.
                throw new Error(i18n.t("api.data.notUniqueData"));
            }
        }

        // 10. Exécution de la mise à jour (inchangé)
        const bulkOps = [{updateMany: {filter: {_id: {$in: ids}}, update: {$set: finalDataForSet}}}];
        const bulkResult = await collection.bulkWrite(bulkOps);
        const modifiedCount = bulkResult.modifiedCount || 0;

        // Déclencher l'événement OnDataEdited avec les états avant/après
        if (modifiedCount > 0) {
            const updatedDocs = await collection.find({_id: {$in: ids}}).toArray();
            await Event.Trigger("OnDataEdited", "event", "system", engine, {
                modelName,
                user,
                before: existingDocs, // Documents avant la modification
                after: updatedDocs     // Documents après la modification
            });
        }

        // 11. Tâches post-mise à jour (schedules, workflows) (inchangé)
        if (["workflowTrigger", "alert"].includes(modelName)) {
            await handleScheduledJobs(modelName, existingDocs, collection, finalDataForSet);
        }

        if (triggerWorkflow && modifiedCount > 0) {
            const updatedDoc = await collection.findOne({_id: ids[0]});
            if (updatedDoc) {
                const proms = triggerWorkflows(updatedDoc, user, 'DataEdited')
                    .catch(err => logger.error("[editData] Workflow trigger error:", err));
                if (waitForWorkflow) {
                    await proms;
                }
            }
        }

        return {
            success: true,
            modifiedCount
        };

    } catch (error) {
        logger.error("Erreur lors de la mise à jour de la ressource :", error);
        return {success: false, error: error.message};
    }
};
export const deleteData = async (modelName, filter, user = {}, triggerWorkflow, waitForWorkflow = false) => {

    try {
        const collection = await getCollectionForUser(user);

        // --- Début de la logique de suppression ---

        // 1. Construire le filtre de base pour trouver les documents à supprimer
        let findFilter = [];
        if (user)
            findFilter.push({
                '$eq': ["$_user", user.username]
            });

        // Ajouter le filtre par IDs si fourni
        if (Array.isArray(filter) && filter.length > 0) {
            findFilter.push({"$in": ["$_id", filter.map(m => new ObjectId(m))]});
        }

        // Ajouter le filtre par nom de modèle si fourni (utile si 'filter' est utilisé seul)
        if (modelName)
            findFilter.push({
                '$eq': ["$_model", modelName]
            });

        // Ajouter le filtre supplémentaire si fourni
        if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
            // Fusionner prudemment le filtre supplémentaire
            // Attention: Si 'filter' contient des clés comme _id ou _user,
            // cela pourrait entrer en conflit. Une fusion plus robuste pourrait re nécessaire.
            findFilter.push(filter);
        } else {

        }

        // 2. Récupérer les documents à supprimer pour vérifier leur type et annuler les schedules
        const documentsToDelete = await collection.aggregate([{$match: {$expr: {"$and": findFilter}}}]).toArray();

        if (documentsToDelete.length === 0) {
            logger.info(`[deleteData] No documents found matching the criteria for user ${user?.username}.`);
            return ({success: true, deletedCount: 0, message: "No documents found to delete."});
        }

        const finalIdsToDelete = []; // IDs des documents qui seront effectivement supprimés

        for (const docToDelete of documentsToDelete) {
            const deletePromises = [];
            const model = await getModel(docToDelete._model, user);
            for (const f of model.fields) {
                const fieldValue = docToDelete[f.name]; // Valeur du champ actuel depuis le document
                if (f.type === 'file') {
                    if (typeof fieldValue === 'string' && fieldValue) { // fieldValue est un GUID
                        deletePromises.push(removeFile(fieldValue, user));
                    }
                } else if (f.type === 'array' && f.itemsType === 'file') {
                    if (Array.isArray(fieldValue)) {
                        for (const guidInArray of fieldValue) {
                            if (typeof guidInArray === 'string' && guidInArray) {
                                deletePromises.push(removeFile(guidInArray, user));
                            }
                        }
                    }
                }
            }
            if (deletePromises.length > 0) {
                await Promise.allSettled(deletePromises);
            }

            // Vérification des permissions (pour chaque document trouvé)
            if (user?.username !== 'demo' && isLocalUser(user) && (
                !await hasPermission(["API_ADMIN", "API_DELETE_DATA", "API_DELETE_DATA_" + docToDelete._model], user) ||
                await hasPermission(["API_DELETE_DATA_NOT_" + docToDelete._model], user))) {
                // Si l'utilisateur n'a pas la permission pour CE document spécifique, on l'ignore
                logger.warn(`[deleteData] User ${user.username} lacks permission to delete document ${docToDelete._id} of model ${docToDelete._model}. Skipping.`);
                continue; // Passe au document suivant
            }

            // *** Ajout de l'annulation du schedule pour workflowTrigger ***
            if (docToDelete._model === 'workflowTrigger') {
                const jobId = `workflowTrigger_${docToDelete._id}`;
                const scheduledJob = schedule.scheduledJobs[jobId];
                if (scheduledJob) {
                    scheduledJob.cancel();
                    logger.info(`[deleteData] Cancelled scheduled job ${jobId} for deleted workflowTrigger ${docToDelete._id}.`);
                } else {
                    // Ce n'est pas forcément une erreur si le trigger n'avait pas de cronExpression
                    logger.debug(`[deleteData] No scheduled job found with ID ${jobId} to cancel for workflowTrigger ${docToDelete._id}.`);
                }
            } else if (docToDelete._model === 'alert') {
                const jobId = `alert_${docToDelete._id}`;
                const scheduledJob = schedule.scheduledJobs[jobId];
                if (scheduledJob) {
                    scheduledJob.cancel();
                    logger.info(`[deleteData] Cancelled scheduled job ${jobId} for deleted alert ${docToDelete._id}.`);
                }
            }
            // *** Fin de l'ajout ***

            if (user) {
                // --- Logique existante pour gérer les relations ---
                const relatedModels = await modelsCollection.aggregate([
                    {
                        $match: {
                            $and: [
                                {"fields.relation": {$eq: docToDelete._model}}, // Utilise le modèle du document actuel
                                {
                                    $and: [
                                        {_user: {$exists: true}},
                                        {
                                            $or: [
                                                {_user: {$eq: user._user}},
                                                {_user: {$eq: user.username}}
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]).toArray();

                for (const relatedModel of relatedModels) {
                    let relsSet = {}, pullOps = {}, filterConditions = [];
                    relatedModel.fields.forEach(f => {
                        if (f.type === 'relation' && f.relation === docToDelete._model) {
                            const fieldCondition = {[f.name]: docToDelete._id.toString()};
                            filterConditions.push(fieldCondition); // Condition pour trouver les documents liés

                            if (f.multiple) {
                                if (!pullOps.$pull) pullOps.$pull = {};
                                pullOps.$pull[f.name] = docToDelete._id.toString();
                            } else {
                                relsSet[f.name] = null;
                            }
                        }
                    });

                    if (filterConditions.length > 0) {
                        const updateFilter = {
                            $and: [
                                {_user: {$exists: true}},
                                {_model: relatedModel.name},
                                {$or: [{_user: user._user}, {_user: user.username}]},
                                {$or: filterConditions}
                            ]
                        };

                        const updateOps = {};
                        if (Object.keys(relsSet).length > 0) updateOps.$set = relsSet;
                        if (pullOps.$pull && Object.keys(pullOps.$pull).length > 0) updateOps.$pull = pullOps.$pull;

                        if (Object.keys(updateOps).length > 0) {
                            const elementsToUpdate = await collection.find(updateFilter).toArray();
                            const updateResult = await collection.updateMany(updateFilter, updateOps);
                            logger.debug(`[deleteData] Updated relations in model ${relatedModel.name} referencing ${docToDelete._id}. Modified: ${updateResult.modifiedCount}`);

                            if (triggerWorkflow) {
                                elementsToUpdate.forEach(e => {
                                    collection.findOne({_id: e._id}).then(updatedDoc => {
                                        if (updatedDoc) {
                                            triggerWorkflows(updatedDoc, user, 'DataEdited').catch(workflowError => {
                                                logger.error(`[deleteData] Async error triggering DataEdited workflow for ${updatedDoc._model} ID ${updatedDoc._id}:`, workflowError);
                                            });
                                        }
                                    });
                                });
                            }
                        }
                    }
                }

                // --- Fin de la logique des relations ---

                // Déclencher le workflow DataDeleted AVANT la suppression effective
                if (triggerWorkflow) {
                    const prom = triggerWorkflows(docToDelete, user, 'DataDeleted').catch(workflowError => {
                        logger.error(`[deleteData] Async error triggering DataDeleted workflow for ${docToDelete._model} ID ${docToDelete._id}:`, workflowError);
                    });

                    if (waitForWorkflow) {
                        await prom;
                    }
                }
            }

            // Ajouter l'ID à la liste finale si la permission est accordée
            finalIdsToDelete.push(docToDelete._id);

        } // Fin de la boucle sur documentsToDelete

        // 3. Supprimer effectivement les documents (ceux pour lesquels on a la permission)
        let deletedCount = 0;
        if (finalIdsToDelete.length > 0) {
            const result = await collection.deleteMany({
                _id: {$in: finalIdsToDelete}
                // Le filtre _user est déjà implicite car on a fetch les documents de l'utilisateur
            });
            deletedCount = result.deletedCount;
            logger.info(`[deleteData] Successfully deleted ${deletedCount} documents for user ${user?.username}.`);
        } else {
            logger.info(`[deleteData] No documents to delete for user ${user?.username} after permission checks or matching criteria.`);
        }

        const res = {success: true, deletedCount}
        const plugin = await Event.Trigger("OnDataDeleted", "event", "system", engine, {model: modelName, filter});
        await Event.Trigger("OnDataDeleted", "event", "user", {model: modelName, filter});
        return plugin || res;

    } catch (error) {
        logger.error(`[deleteData] Error during deletion process for user ${user?.username}:`, error);
        // Renvoyer une structure d'erreur cohérente
        return ({
            success: false,
            error: error.message || "An unexpected error occurred during deletion.",
            statusCode: error.statusCode || 500
        });
    }
}


// List of operators that cannot be used inside $expr. $geoNear is handled separately
// as it's a full stage, not just an operator.
const specialOpKeys = ['$text', '$near', '$nearSphere', '$geoWithin', '$geoIntersects', '$regex'];

/**
 * Recursively checks if any part of a filter expression contains a special operator.
 * @param {*} expression - The filter expression or a part of it.
 * @returns {boolean}
 */
const containsSpecialOp = (expression) => {
    if (Array.isArray(expression)) {
        return expression.some(item => containsSpecialOp(item));
    }
    if (!isPlainObject(expression)) {
        return false;
    }

    for (const key in expression) {
        if (specialOpKeys.includes(key)) {
            return true;
        }
        if (containsSpecialOp(expression[key])) {
            return true;
        }
    }
    return false;
};

/**
 * Transforms a simple $find condition object into a full MongoDB aggregation expression.
 * e.g., { relatedValue: 101 } becomes { $eq: ['$$this.relatedValue', 101] }
 * e.g., { name: 'A', value: 1 } becomes { $and: [{ $eq: ['$$this.name', 'A'] }, { $eq: ['$$this.value', 1] }] }
 * @param {object} findCondition - The condition object from the $find operator.
 * @returns {object} The complete MongoDB aggregation expression.
 */
function transformFindShorthand(findCondition) {
    // If it's not a plain object, do nothing.
    if (typeof findCondition !== 'object' || findCondition === null || Array.isArray(findCondition)) {
        return findCondition;
    }

    const keys = Object.keys(findCondition);

    // If the object is empty or already contains MongoDB operators (keys starting with '$'),
    // assume it's already in the full format and don't modify it.
    if (keys.length === 0 || keys.some(key => key.startsWith('$'))) {
        return findCondition;
    }

    // It's the shorthand format. Transform it.
    // Create an $eq condition for each key/value pair.
    const conditions = keys.map(key => ({
        $eq: [`$$this.${key}`, findCondition[key]]
    }));

    // If there's only one condition, return the $eq object directly.
    if (conditions.length === 1) return conditions[0];

    // If there are multiple conditions, combine them with an $and.
    return { $and: conditions };
}

export const searchData = async (query, user) => {
    const {page, limit, sort, model, pipelinesPosition, pipelines: customPipelines = [], ids, timeout, pack} = query;

    if (user && user.username !== 'demo' && isLocalUser(user) && (
        !await hasPermission(["API_ADMIN", "API_SEARCH_DATA", "API_SEARCH_DATA_" + model], user) ||
        await hasPermission(["API_SEARCH_DATA_NOT_" + model], user))) {
        throw new Error(i18n.t('api.permission.searchData'));
    }

    const collection = await getCollectionForUser(user);
    const modelElement = await getModel(model, user);

    const allIds = (ids || '').split(",").map(m => m.trim()).filter(Boolean).map(m => {
        return new ObjectId(m);
    });
    let l = Math.min(modelElement.maxRequestData || maxRequestData, limit ? parseInt(limit, 10) : maxRequestData);
    let p = parseInt(page, 10);
    let filter = query.filter || {};

    // --- START: Added logic for special query operators ---
    const specialFilterOps = {};
    let standardFilter = {};

    // Recursively separate special operators ($text, $nearSphere, etc.) that cannot be used within $expr
    for (const key in filter) {
        const value = filter[key];

        // $geoNear is a special case; it's a stage and must be at the top level of the filter.
        if (key === '$geoNear') {
            specialFilterOps[key] = value;
        }
        // For logical operators, we split their child arrays based on whether they contain special ops.
        else if ((key === '$and' || key === '$or' || key === '$nor') && Array.isArray(value)) {
            const hasSpecial = value.some(child => containsSpecialOp(child));

            // If a logical operator contains any condition with a special operator (like $regex or a geo-op),
            // the entire logical block must be processed in a standard `$match` stage.
            // This is because splitting the block would break the original logic (e.g., an `$or` would become an `$and`).
            if (hasSpecial) {
                specialFilterOps[key] = value;
            } else {
                // Otherwise, the entire block is "standard" and can be processed by the $expr-based logic.
                standardFilter[key] = value;
            }
        }
        // For other keys, check if the expression {key: value} contains a special op.
        else if (containsSpecialOp({ [key]: value })) {
            specialFilterOps[key] = value;
        } else {
            standardFilter[key] = value;
        }
    }

    // The rest of the function will use `standardFilter` for the recursive lookup.
    filter = standardFilter;
    // --- END: Added logic for special query operators ---

    let sortObj = null; // Initialize to null
    if (sort) {
        sortObj = {};
        sort.split(',').forEach(s => {
            const v = s.split(':');
            sortObj[v[0] || s] = v[1] === 'DESC' ? -1 : 1;
        });
    }

    let i = 0;
    const f = {...filter};

    let depthParam = Math.max(1, Math.min(maxFilterDepth, typeof (query.depth) === 'string' ? parseInt(query.depth) : (typeof (query.depth) === 'number' ? query.depth : 1)));
    let autoExpand = typeof (query.autoExpand) === 'undefined' || (typeof (query.autoExpand) === 'string' && ['1', 'true'].includes(query.autoExpand.toLowerCase()));

    const recursiveLookup = async (model, data, depth = 1, already = [], parentPath = '') => {

        if (depth > depthParam) {
            return [];
        }
        // Handle null, array, or other non-object data gracefully to prevent crashes.
        if (!isPlainObject(data)) {
            return [];
        }

        let pipelines = [], pipelinesLookups = [];
        let modelElement;
        try {
            modelElement = await getModel(model, user);
        } catch (e) {
            return [];
        }

        let dataRelationF = [], dataNoRelation = {};
        let dte = changeValue(data, '$find', (name, d, topLevel) => {
            if (autoExpand)
                depthParam++;
            const field = modelElement.fields.find(f => f.name === name);
            if (!field || !name)
                return {};
            if (field.type === "relation") {
                const findCondition = transformFindShorthand(d);
                const dt = {
                    '$ne': [
                        {
                            '$filter': {
                                'input': (depth === 1 ? "$" + name : "$this." + name),
                                'as': 'this',
                                'cond': findCondition
                            }
                        }
                        , []]
                };
                dataRelationF.push(dt);
                dataRelationF.push({"$ne": [(depth === 1 ? "$" + name : "$this." + name), null]})
                return {"$internal": {}};
            }
            dataNoRelation[name] = d;
            return {"$internal": d};
        });

        dataNoRelation = changeValue(dte, '$internal', (name, d, topLevel) => {
            return d;
        });

        for (let fi of modelElement.fields.sort((s1, s2) => {
            const v = s1.type === 'relation' ? 1 : 0;
            const v2 = s2.type === 'relation' ? 1 : 0;

            const t1 = s1.type === 'calculated' ? 1 : 0;
            const t2 = s2.type === 'calculated' ? 1 : 0;
            return v <= v2 ? -1 : (t1 <= t2 ? -1 : 1);
        })) {

            if (already.includes(fi.relation)) {
                console.warn(`Skipping circular reference to model: ${fi.relation}`);
                continue;
            }
            const relSort = {};
            if (fi.type === 'relation' && depthParam !== 1) {
                if (sortObj?.[fi.name]) {

                    const sortColumn = await getModel(fi.relation, user);
                    let t = sortColumn.fields.find(f => f.asMain)?.name;
                    if (!t) {
                        let t = sortColumn.fields?.find((f) => f.type === 'string_t')?.name;
                        if (t)
                            relSort['items' + i + '.' + t] = sortObj[fi.name];
                        else {

                            t = sortColumn.fields?.find((f) => f.type === 'string')?.name;
                            if (t) {
                                relSort['items' + i + '.' + t] = sortObj[fi.name];
                            }
                        }
                    } else {
                        relSort['items' + i + '.' + t] = sortObj[fi.name];
                    }
                    if (t) {
                        delete sortObj[fi.name];
                    }
                }

                ++i;
                const lookup = {
                    $lookup: {
                        from: await getUserCollectionName(user),
                        as: "items" + i,
                        let: {
                            dtid: {'$toString': '$_id'}, convertedId: '$' + fi.name
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            ...[
                                                {$eq: ["$_model", fi.relation]},
                                                {$eq: ["$_user", user.username]},
                                                fi.multiple ? {
                                                    $in: [{$toString: "$_id"}, {
                                                        $map: {
                                                            input: {$ifNull: ["$$convertedId", []]},
                                                            as: "relationId",
                                                            in: {$toString: "$$relationId"}
                                                        }
                                                    }]
                                                } : {
                                                    $eq: [
                                                        {$toString: "$_id"},
                                                        {$convert: {input: '$$convertedId', to: "string", onError: ''}}
                                                    ]
                                                }
                                            ]
                                        ]
                                    }
                                }
                            },
                            {$limit: maxRelationsPerData}
                        ]
                    }
                };

                pipelinesLookups.push(lookup);
                pipelinesLookups.push({$limit: Math.floor(maxTotalDataPerUser)});

                const currentPath = parentPath ? `${parentPath}_${fi.name}` : fi.name;
                fi.path = currentPath;
                pipelinesLookups.push(
                    {
                        $addFields: {
                            [`${fi.name}`]: (fi.multiple ? "$items" + i : {
                                $cond: {
                                    if: {$gt: [{$size: {$ifNull: ["$items" + i, []]}}, 0]},
                                    then: "$items" + i,
                                    else: null
                                }
                            })
                        }
                    }
                );

                pipelinesLookups.push(
                    {$project: {['items' + i]: 0}}
                );

                const nextAlready = [...already, fi.relation];
                if (Object.keys(relSort).length) {
                    pipelinesLookups.push(
                        {$sort: relSort}
                    );
                }

                let find = dte[fi.name] || [];

                const rec = await recursiveLookup(fi.relation, find, depth + 1, nextAlready, currentPath);

                if (rec.length) {
                    lookup['$lookup']['pipeline'] = lookup['$lookup']['pipeline'].concat(rec);
                }

                lookup['$lookup']['pipeline'].push(
                    {$project: {_model: 0}}
                );
                lookup['$lookup']['pipeline'].push(
                    {$project: {_user: 0}}
                );

            } else if (fi.type === 'file') {
                pipelinesLookups.push({
                    $lookup: {
                        from: "files",
                        let: {fileGuid: '$' + fi.name},
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            {$eq: ['$guid', '$$fileGuid']},
                                            {$eq: ['$user', user.username]}
                                        ]
                                    }
                                }
                            },
                            {$limit: 1}
                        ],
                        as: fi.name + "_details_temp"
                    }
                });

                pipelinesLookups.push({
                    $addFields: {
                        [fi.name]: {
                            $ifNull: [{$first: '$' + fi.name + "_details_temp"}, null]
                        }
                    }
                });

                pipelinesLookups.push({
                    $project: {
                        [fi.name + "_details_temp"]: 0
                    }
                });
            } else if (fi.type === 'array' && fi.itemsType === 'file' && depthParam !== 1) {
                pipelinesLookups.push(
                    {
                        $lookup: {
                            from: "files",
                            let: {localGuidsArray: '$' + fi.name},
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $in: ['$guid', {$ifNull: ['$$localGuidsArray', []]}]
                                        }
                                    }
                                }
                            ],
                            as: fi.name + "_details_temp"
                        }
                    },
                    {
                        $addFields: {
                            [fi.name]: {
                                $ifNull: [
                                    {
                                        $map: {
                                            input: '$' + fi.name,
                                            as: "originalGuidString",
                                            in: {
                                                $let: {
                                                    vars: {
                                                        matchedDetail: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: '$' + fi.name + "_details_temp",
                                                                        as: "detailFile",
                                                                        cond: {$eq: ["$$detailFile.guid", "$$originalGuidString"]}
                                                                    }
                                                                },
                                                                0
                                                            ]
                                                        }
                                                    },
                                                    in: {
                                                        $cond: {
                                                            if: '$$matchedDetail',
                                                            then: '$$matchedDetail',
                                                            else: {
                                                                guid: '$$originalGuidString',
                                                                name: null,
                                                                _error: "File details not found"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    []
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            [fi.name + "_details_temp"]: 0
                        }
                    }
                );
            } else if (fi.type === 'calculated' && fi.calculation && fi.calculation.pipeline && fi.calculation.final) {
                const calcPipelineAbstract = fi.calculation.pipeline;
                const calcFinalFieldName = fi.calculation.final;
                const tempLookupsForThisCalcField = [];

                if (calcPipelineAbstract.lookups && calcPipelineAbstract.lookups.length > 0) {
                    for (const lookupDef of calcPipelineAbstract.lookups) {
                        if (!lookupDef.localField || typeof lookupDef.localField !== 'string' || lookupDef.localField.trim() === '') {
                            logger.warn(`[Calculated Field Error] ... localField ... invalide ...`);
                            pipelinesLookups.push({$addFields: {[lookupDef.as]: lookupDef.isMultiple ? [] : null}});
                            continue;
                        }

                        const targetCollectionName = await getUserCollectionName(user);
                        const localFieldValueInPipeline = `$${lookupDef.localField}`;

                        const mongoLookupStage = {
                            $lookup: {
                                from: targetCollectionName,
                                let: {local_val: localFieldValueInPipeline},
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    {$eq: ["$_model", lookupDef.foreignModel]},
                                                    {$eq: ["$_user", user.username]},
                                                    lookupDef.isMultiple
                                                        ? {$in: [{$toString: "$_id"}, {$ifNull: ["$$local_val", []]}]}
                                                        : {$eq: [{$toString: "$_id"}, {$ifNull: ["$$local_val", null]}]}
                                                ]
                                            }
                                        }
                                    }
                                ],
                                as: lookupDef.as
                            }
                        };
                        pipelinesLookups.push(mongoLookupStage);
                        tempLookupsForThisCalcField.push(lookupDef.as);

                        if (!lookupDef.isMultiple) {
                            pipelinesLookups.push({
                                $unwind: {
                                    path: `$${lookupDef.as}`,
                                    preserveNullAndEmptyArrays: true
                                }
                            });
                        }
                    }
                }

                if (calcPipelineAbstract.addFields && Object.keys(calcPipelineAbstract.addFields).length > 0) {
                    const addFields = Object.keys(calcPipelineAbstract.addFields).map(m => ({$addFields: {[m]: calcPipelineAbstract.addFields[m]}}));
                    pipelinesLookups = pipelinesLookups.concat(addFields);
                }

                if (calcFinalFieldName !== fi.name) {
                    pipelinesLookups.push({$addFields: {[fi.name]: `$${calcFinalFieldName}`}});
                }

                if (tempLookupsForThisCalcField.length > 0) {
                    const unsetProjection = {};
                    for (const tempField of tempLookupsForThisCalcField) {
                        unsetProjection[tempField] = 0;
                    }
                    if (Object.keys(unsetProjection).length > 0) {
                        pipelinesLookups.push({$project: unsetProjection});
                    }
                }
            } else if (fi.type === 'array') {
                if (data[fi.name]) {
                    pipelines.push({
                        $match: {
                            $expr: {
                                $in: [data[fi.name], '$' + fi.name]
                            }
                        }
                    });
                }
            } else if (data[fi.name]) {
                if (typeof (data[fi.name]) === 'string') {
                    pipelines.push({
                        $match: {
                            $expr: {
                                $eq: ['$' + fi.name, data[fi.name]]
                            }
                        }
                    })
                }
            }
        }

        return pipelines.concat(
            [
                {$match: {'_pack': pack ? pack : {$exists: false}}},
                {$match: {$expr: dataNoRelation}}
            ],
            customPipelines, // ← INTÉGRATION DES PIPELINES PERSONNALISÉES
            pipelinesLookups,
            [{$match: {$expr: {$and: dataRelationF}}}]
        );
    };

    let pipelines = [];

    // --- START: Modified pipeline construction for special operators ---
    if (specialFilterOps.$geoNear && (Object.values(specialFilterOps).some(v => v?.$nearSphere) || specialFilterOps.$text)) {
        throw new Error("A $geoNear stage cannot be combined with $nearSphere or $text operators in the same query.");
    }

    // --- Strategy ---
    // 1. If a $nearSphere operator is found, convert it to a $geoNear stage. This must be the first stage.
    //    Other special filters (like $regex) will be moved into the `query` part of the $geoNear stage.
    // 2. If a user-provided $geoNear stage exists, use it. It must be the first stage.
    // 3. If a $text operator is found, it must be in the first $match stage. It is mutually exclusive with geo-queries.

    let nearSphereField = null;
    let nearSphereKey = null;
    for (const key in specialFilterOps) {
        if (isPlainObject(specialFilterOps[key]) && specialFilterOps[key].$nearSphere) {
            if (nearSphereField) {
                throw new Error("Query cannot contain multiple $nearSphere operators. Use a single $geoNear stage for complex geo-queries.");
            }
            nearSphereField = specialFilterOps[key].$nearSphere;
            nearSphereKey = key;
        }
    }

    if (nearSphereField) {
        // A $geoNear stage must be the first stage.
        if (specialFilterOps.$geoNear || specialFilterOps.$text) {
            throw new Error("Cannot use $nearSphere with a $geoNear stage or a $text operator.");
        }

        const geoNearStage = {
            near: nearSphereField.$geometry,
            distanceField: "distance", // Default distance field name
            key: nearSphereKey, // The field to perform the search on
            spherical: true,
            query: { // Base query for model and user
                _model: modelElement.name,
                _user: user.username
            }
        };

        // Conditionally add distance fields to avoid passing 'undefined' to MongoDB
        if (nearSphereField.$maxDistance !== undefined) {
            geoNearStage.maxDistance = nearSphereField.$maxDistance;
        }
        if (nearSphereField.$minDistance !== undefined) {
            geoNearStage.minDistance = nearSphereField.$minDistance;
        }

        // Remove the processed nearSphere operator from specialFilterOps
        delete specialFilterOps[nearSphereKey];

        // Add any other special filters (like $regex) to the $geoNear query
        Object.assign(geoNearStage.query, specialFilterOps);

        if (allIds.length > 0) {
            geoNearStage.query._id = { $in: allIds };
        }

        pipelines.push({ $geoNear: geoNearStage });

        // Clear specialFilterOps as they've all been moved into the $geoNear query
        Object.keys(specialFilterOps).forEach(key => delete specialFilterOps[key]);

    } else if (specialFilterOps.$geoNear) {
        // Handle a user-provided $geoNear stage
        const geoNearStage = { ...specialFilterOps.$geoNear };
        geoNearStage.query = {
            ...(geoNearStage.query || {}),
            _model: modelElement.name,
            _user: user.username
        };
        if (allIds.length > 0) {
            geoNearStage.query._id = { $in: allIds };
        }
        pipelines.push({ $geoNear: geoNearStage });
        delete specialFilterOps.$geoNear;

    } else if (Object.keys(specialFilterOps).length > 0) {
        // Handle other special operators like $text and $regex if no geo-query was present.
        const standardMatchQueries = {};
        if (specialFilterOps.$text) {
            standardMatchQueries.$text = specialFilterOps.$text;
            delete specialFilterOps.$text;
        }
        Object.assign(standardMatchQueries, specialFilterOps);

        standardMatchQueries._model = modelElement.name;
        standardMatchQueries._user = user.username;
        if (allIds.length > 0) {
            standardMatchQueries._id = { $in: allIds };
        }
        pipelines.push({ $match: standardMatchQueries });
    }

    // Add the original initial match logic, but only if no pipeline stages have been created yet.
    if (pipelines.length === 0) {
        if (allIds.length) {
            // Note: allIds are already ObjectIds from the start of the function.
            const id = {$in: ["$_id", allIds]};
            pipelines.push({
                $match: {$expr: id}
            });
        } else {
            pipelines.push(
                {
                    $match: {
                        $expr: {
                            $and: [
                                {$eq: ["$_model", modelElement.name]},
                                {$eq: ["$_user", user.username]}
                            ]
                        }
                    }
                }
            );
        }
    }
    // --- END: Modified pipeline construction ---

    // Intégration des pipelines personnalisés au début si nécessaire
    if (customPipelines.length > 0 && pipelinesPosition === 'start') {
        pipelines = pipelines.concat(customPipelines);
    }

    pipelines = pipelines.concat(await recursiveLookup(model, filter, 1, []));

    // Intégration des pipelines personnalisés à la fin si nécessaire
    if (customPipelines.length > 0 && pipelinesPosition !== 'start') {
        pipelines = pipelines.concat(customPipelines);
    }

    if (depthParam) {
        pipelines.push({$project: {_user: 0}});
        pipelines.push({$project: {_model: 0}});
    }

    const ts = parseInt(timeout, 10) / 2.0 || searchRequestTimeout;
    const count = await collection.aggregate([...pipelines, {$count: "count"}]).maxTimeMS(ts).toArray();
    let prom = collection.aggregate(pipelines).maxTimeMS(ts);

    // Apply sort logic:
    // 1. If a user-defined sort exists, use it.
    // 2. If not, and if there's no $geoNear stage (which has implicit sort), apply a default sort.
    if (sortObj) {
        prom.sort(sortObj);
    } else if (!pipelines.some(stage => stage.$geoNear)) {
        const defaultSort = { [modelElement.fields[0]?.name || '_id']: ['datetime', 'date'].includes(modelElement.fields[0].type) ? -1 : 1 };
        prom.sort(defaultSort);
    }
    prom.skip(p ? (p - 1) * l : 0).limit(l);
    let data = await prom.toArray();
    data = await handleFields(modelElement, data, user);

    const res = {data, count: count[0]?.count || 0};
    const plugin = await Event.Trigger("OnDataSearched", "event", "system", engine, {data, count: count[0]?.count});
    await Event.Trigger("OnDataSearched", "event", "user", plugin || {data, count: count[0]?.count});
    return plugin || res;
}
export const importData = async (options, files, user) => {

    if (!(isDemoUser(user) && Config.Get("useDemoAccounts")) && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_IMPORT_DATA"], user)) {
        return ({success: false, error: "API_IMPORT_DATA permission needed."});
    }

    const file = files.file;
    const hasHeaders = options.hasHeaders ? options.hasHeaders === 'true' : true;
    const csvHeadersString = options.csvHeaders;

    if (!file) {
        return ({success: false, error: "No file uploaded."});
    }

    const importJobId = new ObjectId().toString();
    importJobs[importJobId] = {
        userId: user.username,
        status: 'pending',
        totalRecords: 0,
        processedRecords: 0,
        errors: [],
        jobId: importJobId // Inclure l'ID de la tâche dans son état
    };

    const importJob = importJobs[importJobId];
    // Excuter le reste de la logique d'importation en arrière-plan
    (async () => {
        let fileProcessed = false;
        const importResults = {success: true, counts: {}, errors: []}; // Pour collecter les erreurs internes

        try {
            const fileContent = fs.readFileSync(file.path);
            // --- DÉBUT DE LA MODIFICATION ---
            // La variable allProcessedData est maintenant déclarée à l'intérieur de la boucle
            // let allProcessedData = [];
            // let modelNameForImport = '';
            // --- FIN DE LA MODIFICATION ---
            if (!file.name) {
                throw new Error("No file provided.");
            }
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                fileProcessed = true;
                const jsonData = await runImportExportWorker('parse-json', {fileContent: fileContent.toString()});

                // --- Logique d'importation des modèles (inchangée) ---
                if (jsonData.models && Array.isArray(jsonData.models)) {
                    logger.info(`[Model Import] Found ${jsonData.models.length} models to import for user ${user.username}.`);
                    const userModels = await modelsCollection.find({_user: user.username}).toArray();
                    const userModelNames = userModels.map(m => m.name);

                    for (const modelToInstall of jsonData.models) {
                        try {
                            const modelName = modelToInstall.name;
                            if (!modelName) {
                                throw new Error("Model definition in import file is missing a 'name'.");
                            }

                            if (userModelNames.includes(modelName)) {
                                logger.debug(`[Model Import] Skipping '${modelName}': already exists for user.`);
                                continue;
                            }

                            const modelData = {...modelToInstall};
                            delete modelData._id;
                            modelData._user = user.username;
                            modelData.locked = false;
                            if (modelData.fields) {
                                modelData.fields.forEach(f => {
                                    delete f._id;
                                    f.locked = false;
                                });
                            }

                            await validateModelStructure(modelData);
                            await modelsCollection.insertOne(modelData);
                            logger.info(`[Model Import] Successfully imported model '${modelName}' for user ${user.username}.`);
                        } catch (e) {
                            const errorMsg = `Failed to import model '${modelToInstall.name || 'N/A'}': ${e.message}`;
                            logger.error(`[Model Import] ${errorMsg}`);
                            importResults.errors.push(errorMsg);
                            importResults.success = false;
                        }
                    }
                }

                const dataToProcess = jsonData.data || jsonData;
                const modelsToProcess = [];

                if (Array.isArray(dataToProcess)) {
                    const modelNameForImport = options.model;
                    if (!modelNameForImport) {
                        importResults.errors.push("Model name is required in the request body when JSON is an array.");
                        importResults.success = false;
                    } else {
                        modelsToProcess.push({name: modelNameForImport, data: dataToProcess});
                    }
                } else if (typeof dataToProcess === 'object' && dataToProcess !== null) {
                    for (const modelKey in dataToProcess) {
                        if (modelKey === 'models') continue;
                        if (Object.prototype.hasOwnProperty.call(dataToProcess, modelKey)) {
                            if (Array.isArray(dataToProcess[modelKey])) {
                                modelsToProcess.push({name: modelKey, data: dataToProcess[modelKey]});
                            } else {
                                const errorMsg = `Data for model '${modelKey}' in JSON object is not an array. Skipping.`;
                                logger.warn(`[Import JSON Object] ${errorMsg}`);
                                importResults.errors.push(errorMsg);
                                importResults.success = false;
                            }
                        }
                    }
                } else {
                    importResults.errors.push("Invalid JSON file structure. Expecting an array of data, or an object where keys are model names and values are arrays of data.");
                    importResults.success = false;
                }

                if (modelsToProcess.length === 0 && importResults.errors.length === 0) {
                    importResults.errors.push("No data found to process in JSON file.");
                    importResults.success = false;
                }

                // --- DÉBUT DE LA MODIFICATION PRINCIPALE ---
                // Mettre à jour le statut et le nombre total d'enregistrements avant la boucle
                if (importResults.success && modelsToProcess.length > 0) {
                    importJobs[importJobId].totalRecords = modelsToProcess.reduce((acc, model) => acc + model.data.length, 0);
                    importJobs[importJobId].status = 'processing';
                }

                // Boucler sur CHAQUE modèle trouvé dans le fichier JSON
                for (const modelData of modelsToProcess) {
                    const modelName = modelData.name;
                    const dataArray = modelData.data;

                    if (dataArray.length === 0) {
                        logger.info(`[Import Job ${importJobId}] Skipping model '${modelName}' as it has no data.`);
                        continue;
                    }

                    logger.info(`[Import Job ${importJobId}] Processing ${dataArray.length} records for model '${modelName}'.`);

                    try {
                        const modelDef = await getModel(modelName, user);
                        if (!modelDef) {
                            throw new Error(i18n.t('api.model.notFound', {model: modelName}));
                        }

                        const allProcessedData = convertDataTypes(dataArray, modelDef.fields, 'json');

                        // Logique de découpage en lots pour le modèle actuel
                        for (let i = 0; i < allProcessedData.length; i += IMPORT_CHUNK_SIZE) {
                            const chunk = allProcessedData.slice(i, i + IMPORT_CHUNK_SIZE);
                            try {
                                const insertedIdsArray = await pushDataUnsecure(chunk, modelName, user, {});
                                if (insertedIdsArray && insertedIdsArray.length > 0) {
                                    importJobs[importJobId].processedRecords += insertedIdsArray.length;
                                    logger.debug(`[Import Job ${importJobId}] Processed chunk for '${modelName}': ${insertedIdsArray.length} records. Total processed: ${importJobs[importJobId].processedRecords}`);
                                    sendSseToUser(user.username, {
                                        type: 'import_progress',
                                        job: importJobs[importJobId]
                                    });
                                }
                            } catch (chunkError) {
                                console.log(chunkError.stack);
                                const errorMsg = `[Import Job ${importJobId}] Error on chunk for model '${modelName}': ${chunkError.message}`;
                                logger.error(errorMsg);
                                importResults.errors.push(errorMsg);
                                importJobs[importJobId].errors.push(errorMsg);
                                importResults.success = false;
                            }

                            if (i + IMPORT_CHUNK_SIZE < allProcessedData.length) {
                                await delay(IMPORT_CHUNK_DELAY_MS);
                            }
                        }
                        importResults.counts[modelName] = (importResults.counts[modelName] || 0) + allProcessedData.length;

                    } catch (modelProcessingError) {
                        const errorMsg = `[Import Job ${importJobId}] Failed to process model '${modelName}': ${modelProcessingError.message}`;
                        logger.error(errorMsg);
                        importResults.errors.push(errorMsg);
                        importJobs[importJobId].errors.push(errorMsg);
                        importResults.success = false;
                    }
                }
                // --- FIN DE LA MODIFICATION PRINCIPALE ---

            } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                // --- Logique CSV (inchangée, mais maintenant elle est séparée de la logique JSON) ---
                fileProcessed = true;
                const modelNameForImport = options.model;
                if (!modelNameForImport) {
                    importResults.errors.push("Model name is required in the request body for CSV import.");
                    importResults.success = false;
                } else {
                    try {
                        const modelDef = await getModel(modelNameForImport, user);
                        if (!modelDef) {
                            throw new Error(i18n.t('api.model.notFound', {model: modelNameForImport}));
                        }

                        let userDefinedHeadersForMapping = [];
                        if (!hasHeaders && csvHeadersString && typeof csvHeadersString === 'string') {
                            userDefinedHeadersForMapping = csvHeadersString.split(',').map(h => h.trim());
                        }

                        const records = await runImportExportWorker('parse-csv', {
                            fileContent: fileContent.toString(),
                            options: {columns: hasHeaders}
                        });

                        let datasToImport;
                        if (!hasHeaders) {
                            const effectiveHeadersForMapping = (userDefinedHeadersForMapping.length > 0 && userDefinedHeadersForMapping.some(h => h !== ''))
                                ? userDefinedHeadersForMapping
                                : modelDef.fields.map(f => f.name);

                            datasToImport = records.map(recordRow => {
                                const obj = {};
                                if (Array.isArray(recordRow)) {
                                    recordRow.forEach((value, index) => {
                                        const targetModelFieldName = effectiveHeadersForMapping[index];
                                        if (targetModelFieldName && targetModelFieldName !== '') {
                                            if (modelDef.fields.some(mf => mf.name === targetModelFieldName)) {
                                                obj[targetModelFieldName] = value;
                                            } else {
                                                logger.warn(`CSV Import (!hasHeaders): Specified target field "${targetModelFieldName}" at column ${index + 1} does not exist in model "${modelNameForImport}". Skipping column.`);
                                            }
                                        }
                                    });
                                } else {
                                    Object.values(recordRow).forEach((value, index) => {
                                        const targetModelFieldName = effectiveHeadersForMapping[index];
                                        if (targetModelFieldName && targetModelFieldName !== '') {
                                            if (modelDef.fields.some(mf => mf.name === targetModelFieldName)) {
                                                obj[targetModelFieldName] = value;
                                            } else {
                                                logger.warn(`CSV Import (!hasHeaders, object row): Specified target field "${targetModelFieldName}" at column ${index + 1} does not exist in model "${modelNameForImport}". Skipping column.`);
                                            }
                                        }
                                    });
                                }
                                return obj;
                            });
                        } else {
                            datasToImport = records;
                        }
                        const allProcessedData = convertDataTypes(datasToImport, modelDef.fields, 'csv');

                        // Logique de découpage en lots pour le CSV
                        if (allProcessedData.length > 0) {
                            importJobs[importJobId].totalRecords = allProcessedData.length;
                            importJobs[importJobId].status = 'processing';

                            for (let i = 0; i < allProcessedData.length; i += IMPORT_CHUNK_SIZE) {
                                const chunk = allProcessedData.slice(i, i + IMPORT_CHUNK_SIZE);
                                try {
                                    const insertedIdsArray = await pushDataUnsecure(chunk, modelNameForImport, user, {});
                                    if (insertedIdsArray && insertedIdsArray.length > 0) {
                                        importJobs[importJobId].processedRecords += insertedIdsArray.length;
                                        sendSseToUser(user.username, {
                                            type: 'import_progress',
                                            job: importJobs[importJobId]
                                        });
                                    }
                                } catch (chunkError) {
                                    const errorMsg = `[Import Job ${importJobId}] Error on CSV chunk: ${chunkError.message}`;
                                    logger.error(errorMsg, chunkError.stack);
                                    importResults.errors.push(errorMsg);
                                    importJobs[importJobId].errors.push(errorMsg);
                                    importResults.success = false;
                                }
                                if (i + IMPORT_CHUNK_SIZE < allProcessedData.length) {
                                    await delay(IMPORT_CHUNK_DELAY_MS);
                                }
                            }
                            importResults.counts[modelNameForImport] = (importResults.counts[modelNameForImport] || 0) + allProcessedData.length;
                        }

                    } catch (modelProcessingError) {
                        logger.error(`[Import CSV] Error processing model ${modelNameForImport}: ${modelProcessingError.message}`);
                        importResults.errors.push(`Model ${modelNameForImport} (CSV): ${modelProcessingError.message}`);
                        importResults.success = false;
                        importJobs[importJobId].errors.push(`Model ${modelNameForImport} (CSV): ${modelProcessingError.message}`);
                    }
                }
            } else if (['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.type) || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
                fileProcessed = true;
                const modelNameForImport = options.model;
                if (!modelNameForImport) {
                    importResults.errors.push("Model name is required in the request body for Excel import.");
                    importResults.success = false;
                } else {
                    try {
                        const modelDef = await getModel(modelNameForImport, user);
                        if (!modelDef) {
                            throw new Error(i18n.t('api.model.notFound', {model: modelNameForImport}));
                        }

                        let datasToImport;
                        let excelErrors = [];

                        // Cas 2: Pas d'en-têtes. On lit les lignes brutes et on les mappe.
                        const rows = await readXlsxFile(fileContent, {sheet: 1});

                        let userDefinedHeadersForMapping = [];
                        if (csvHeadersString && typeof csvHeadersString === 'string') {
                            userDefinedHeadersForMapping = csvHeadersString.split(',').map(h => h.trim());
                        }

                        const effectiveHeadersForMapping = (userDefinedHeadersForMapping.length > 0 && userDefinedHeadersForMapping.some(h => h !== ''))
                            ? userDefinedHeadersForMapping
                            : modelDef.fields.map(f => f.name);

                        datasToImport = rows.map(recordRow => {
                            const obj = {};
                            if (Array.isArray(recordRow)) {
                                recordRow.forEach((value, index) => {
                                    const targetModelFieldName = effectiveHeadersForMapping[index];
                                    if (targetModelFieldName && targetModelFieldName !== '') {
                                        if (modelDef.fields.some(mf => mf.name === targetModelFieldName)) {
                                            obj[targetModelFieldName] = value;
                                        } else {
                                            logger.warn(`Excel Import (!hasHeaders): Specified target field "${targetModelFieldName}" at column ${index + 1} does not exist in model "${modelNameForImport}". Skipping column.`);
                                        }
                                    }
                                });
                            }
                            return obj;
                        });

                        if (excelErrors.length > 0) {
                            excelErrors.forEach(error => {
                                const errorMsg = `Excel Import Error (Row ${error.row}, Column "${error.column}"): ${error.error}.`;
                                logger.error(`[Import Job ${importJobId}] ${errorMsg}`);
                                importResults.errors.push(errorMsg);
                                importJobs[importJobId].errors.push(errorMsg);
                            });
                            importResults.success = false;
                        }

                        if (datasToImport && datasToImport.length > 0) {
                            const allProcessedData = convertDataTypes(datasToImport, modelDef.fields, 'excel');

                            importJobs[importJobId].totalRecords = allProcessedData.length;
                            importJobs[importJobId].status = 'processing';

                            for (let i = 0; i < allProcessedData.length; i += IMPORT_CHUNK_SIZE) {
                                const chunk = allProcessedData.slice(i, i + IMPORT_CHUNK_SIZE);
                                try {
                                    const insertedIdsArray = await pushDataUnsecure(chunk, modelNameForImport, user, {});
                                    if (insertedIdsArray && insertedIdsArray.length > 0) {
                                        importJobs[importJobId].processedRecords += insertedIdsArray.length;
                                        sendSseToUser(user.username, {
                                            type: 'import_progress',
                                            job: importJobs[importJobId]
                                        });
                                    }
                                } catch (chunkError) {
                                    const errorMsg = `[Import Job ${importJobId}] Error on Excel chunk: ${chunkError.message}`;
                                    logger.error(errorMsg, chunkError.stack);
                                    importResults.errors.push(errorMsg);
                                    importJobs[importJobId].errors.push(errorMsg);
                                    importResults.success = false;
                                }
                                if (i + IMPORT_CHUNK_SIZE < allProcessedData.length) await delay(IMPORT_CHUNK_DELAY_MS);
                            }
                            importResults.counts[modelNameForImport] = (importResults.counts[modelNameForImport] || 0) + allProcessedData.length;
                        }

                    } catch (modelProcessingError) {
                        logger.error(`[Import Excel] Error processing model ${modelNameForImport}: ${modelProcessingError.message}`);
                        importResults.errors.push(`Model ${modelNameForImport} (Excel): ${modelProcessingError.message}`);
                        importResults.success = false;
                        importJobs[importJobId].errors.push(`Model ${modelNameForImport} (Excel): ${modelProcessingError.message}`);
                    }
                }
            } else {
                importResults.errors.push("Unsupported file type. Please upload a JSON or CSV file.");
                importResults.success = false;
                importJobs[importJobId].errors.push("Unsupported file type. Please upload a JSON or CSV file.");
            }

        } catch (e) {
            logger.error("Import Error (Global):", e);
            importResults.success = false;
            importResults.errors.push(e.message || "An unexpected error occurred during import.");
            if (importJobs[importJobId]) {
                importJobs[importJobId].errors.push(e.message || "An unexpected error occurred during import.");
            }
        } finally {
            if (importJobs[importJobId]) {
                if (importResults.errors.length > 0) {
                    importJobs[importJobId].status = 'failed';
                } else {
                    importJobs[importJobId].status = 'completed';
                }
                sendSseToUser(user.username, {
                    type: 'import_progress',
                    job: importJobs[importJobId]
                });
            }
            if (file && file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        }
    })().catch(error => {
        logger.error(`Unhandled error in background import job ${importJobId}:`, error);
        if (importJobs[importJobId]) {
            importJobs[importJobId].status = 'failed';
            importJobs[importJobId].errors.push(error.message || "An unhandled error occurred in background process.");
            sendSseToUser(user.username, {
                type: 'import_progress',
                job: importJobs[importJobId]
            });
        }
    });
    return ({success: true, message: "Import initiated. Check progress via SSE.", job: importJob});
}
export const exportData = async (options, user) => {
    // Extract parameters from request body and query
    const {models, ids, filter = {}, depth, lang} = options;
    const userId = getUserId(user);

    const effectiveMaxDepth = maxExportCount ?? maxFilterDepth; // Use defined constant or fallback
    i18n.changeLanguage(lang);

    // --- Input Validation ---
    if (!Array.isArray(models) || models.length === 0) {
        return {success: false, error: i18n.t('api.export.error.noModels', 'Models array is required.')};
    }
    const parsedDepth = parseInt(depth, 10);
    if (isNaN(parsedDepth) || parsedDepth < 0 || parsedDepth > effectiveMaxDepth) {
        return {
            success: false,
            error: i18n.t('api.export.error.invalidDepth', `Invalid depth parameter. Must be between 0 and ${effectiveMaxDepth}.`, {maxDepth: effectiveMaxDepth})
        };
    }
    if (ids && !Array.isArray(ids)) {
        return {
            success: false,
            error: i18n.t('api.export.error.invalidIdsType', 'ids parameter must be an array if provided.')
        };
    }
    if (ids && !ids.every(id => typeof id === 'string' || isObjectId(id))) { // Allow string or ObjectId format
        return {
            success: false,
            error: i18n.t('api.export.error.invalidIdsContent', 'ids parameter must contain valid identifiers (strings or ObjectIds).')
        };
    }

    const exportResults = {};
    let totalDocsFetched = 0;
    const errors = [];

    let modelsToExport = [];

    // --- Permissions & Data Fetching Loop ---
    for (const modelName of models) {
        if (totalDocsFetched >= maxExportCount) {
            console.warn(`Export limit of ${maxExportCount} documents reached before processing model ${modelName}.`);
            errors.push(i18n.t('api.export.error.limitReached', 'Export document limit reached.', {limit: maxExportCount}));
            break; // Stop fetching more models if limit is hit early
        }

        try {
            // Check permission to search/export data for this model
            // Using API_SEARCH_DATA as a proxy, adjust if a specific export permission exists
            // Assuming checkPermission is adapted or hasPermission is used directly
            // Note: Your original code used checkPermission, but data.js has hasPermission. Adjust as needed.
            // Example using hasPermission:
            // if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_SEARCH_DATA", "API_SEARCH_DATA_"+modelName], user)) {
            // Example using checkPermission (if it exists and works similarly):
            if (isLocalUser(user) && !(isDemoUser(user) && Config.Get("useDemoAccounts")) && !(await hasPermission('API_EXPORT_DATA', user))) { // Adapt this line based on your actual permission function
                console.warn(`User ${userId} lacks permission to search/export model ${modelName}`);
                errors.push(i18n.t('api.permission.searchData', 'Cannot search data from the API') + ` (${modelName})`);
                continue; // Skip this model
            }

            // Fetch model definition securely (needed by searchData internally anyway)
            // getModel might throw if not found, handle this
            try {
                const mod = await getModel(modelName, user);
                modelsToExport.push(mod);
            } catch (modelError) {
                console.warn(`Model ${modelName} not found or not accessible for user ${userId}: ${modelError.message}`);
                errors.push(i18n.t('api.model.notFound', 'Model {{model}} not found.', {model: modelName}));
                continue; // Skip this model
            }


            // Construct the query filter for the current model
            let modelSpecificFilter = {...(filter[modelName] || {})}; // Use model-specific filter from request if provided
            // _user filter is handled internally by searchData based on the user object passed

            if (ids && ids.length > 0)
                modelSpecificFilter = {$in: ['$_id', ids]};

            // Calculate remaining limit for this model
            const remainingLimit = maxExportCount - totalDocsFetched;

            // --- Fetch Data using searchData ---
            const searchParams = {
                model: modelName,
                filter: modelSpecificFilter,
                depth: parsedDepth,
                limit: remainingLimit
            };

            const {data: resultData, count} = await searchData(searchParams, user);

            if (resultData && resultData.length > 0) {
                exportResults[modelName] = resultData;
                totalDocsFetched += resultData.length;
                logger.debug(`Fetched ${resultData.length} documents for model ${modelName}. Total: ${totalDocsFetched}`);
            } else {
                logger.debug(`No documents found for model ${modelName} with the given criteria.`);
            }

        } catch (modelError) {
            // Catch errors specific to processing this model (e.g., from searchData)
            console.error(`Error exporting model ${modelName}:`, modelError);
            errors.push(i18n.t('api.export.error.modelError', 'Error exporting model {{model}}.', {model: modelName}) + ` (${modelError.message})`);
        }
    } // End of loop through models

    // --- Prepare and Send Response ---
    if (Object.keys(exportResults).length === 0) {
        const finalError = errors.length > 0 ? errors.join('; ') : i18n.t('api.data.noExportData', 'No data found for the specified criteria or permissions denied.');
        // Use 404 if no data found/accessible, 400 if only errors occurred but no data attempt was possible
        const statusCode = errors.length > 0 && totalDocsFetched === 0 ? 400 : 404;
        return {success: false, error: finalError};
    }

    // Include errors in the response if any occurred but some data was fetched
    if (errors.length > 0) {
        exportResults._exportErrors = errors;
    }

    const res = {success: true, data: exportResults, models: modelsToExport};
    const plugin = await Event.Trigger("OnDataExported", "event", "system", engine, exportResults, modelsToExport);
    await Event.Trigger("OnDataExported", "event", "user", plugin?.exportResults || exportResults, plugin?.modelsToExport || modelsToExport);
    return plugin || res;
}

/**
 * Installs pack models and data for a user or globally.
 * Can accept either a pack ID (to install from database) or a direct pack JSON object.
 *
 * @param {object} logger - Logger instance
 * @param {string|object} packIdentifier - Either pack ID (string) or pack JSON object
 * @param {object|null} user - User object (if installing for user) or null (for global install)
 * @param {string} [lang='en'] - Language code for localized data
 * @returns {Promise<{success: boolean, summary: object, errors: Array, modifiedCount: number}>}
 */
export async function installPack(packIdentifier, user = null, lang = 'en', options = {}) {
    let pack;
    const packsCollection = getCollection('packs');

    // Determine if we're working with an ID or direct pack object
    if (typeof packIdentifier === 'string') {
        let p;
        try {
            p = new ObjectId(packIdentifier);
        } catch (e) {
            p = packIdentifier;
        }
        // Existing behavior - fetch from database
        pack = await packsCollection.findOne({$and: [{_user: {$exists: false}}, {private: false}, {$or: [{_id: p}, {name: packIdentifier}]}]});
        if (!pack) {
            throw new Error(`Pack with ID ${packIdentifier} not found.`);
        }
    } else if (typeof packIdentifier === 'object' && packIdentifier !== null) {
        // New behavior - use provided pack object directly
        pack = packIdentifier;

        // Validate basic pack structure
        if (!pack.name || (!pack.models && !pack.data)) {
            throw new Error('Invalid pack structure - must contain at least name and models or data');
        }
    } else {
        throw new Error('Invalid pack identifier - must be either pack ID string or pack object');
    }

    const username = user ? user.username : null;
    const logPrefix = username
        ? `Installing pack '${pack.name}' for user '${username}'`
        : `Installing pack '${pack.name}' globally`;

    logger.info(`--- ${logPrefix} ---`);

    const summary = {
        models: {installed: [], skipped: [], failed: []},
        datas: {inserted: 0, updated: 0, skipped: 0, failed: 0}
    };
    const errors = [];
    const collection = user ? await getCollectionForUser(user) : getCollection('data');
    const tempIdToNewIdMap = {};
    const linkCache = new Map();

    // --- PHASE 1: MODEL INSTALLATION ---
    if (Array.isArray(pack.models)) {
        // For user installs, check existing models
        const existingModels = user
            ? await modelsCollection.find({_user: username}).toArray()
            : await modelsCollection.find({_user: {$exists: false}}).toArray();

        console.log("EXISTING", existingModels);

        const existingModelNames = existingModels.map(m => m.name);

        for (const modelOrName of pack.models) {
            try {
                const modelName = typeof modelOrName === 'string' ? modelOrName : modelOrName?.name;
                if (!modelName) throw new Error('Model definition in pack is missing a name.');

                if (existingModelNames.includes(modelName)) {
                    logger.debug(`[Model Install] Skipping '${modelName}': already exists`);
                    summary.models.skipped.push(modelName);
                    continue;
                }

                const modelToInstall = typeof modelOrName === 'string'
                    ? await modelsCollection.findOne({name: modelName, _user: {$exists: false}})
                    : {...modelOrName};

                if (!modelToInstall) {
                    throw new Error(`Model '${modelName}' not found in shared models`);
                }

                // Prepare model for installation
                const preparedModel = {...modelToInstall};
                if (user) preparedModel._user = username;
                delete preparedModel._id;
                preparedModel.locked = false;

                if (preparedModel.fields) {
                    preparedModel.fields.forEach(f => f.locked = false);
                }

                await validateModelStructure(preparedModel);
                await modelsCollection.insertOne(preparedModel);
                summary.models.installed.push(modelName);

            } catch (e) {
                const modelName = typeof modelOrName === 'string' ? modelOrName : modelOrName?.name || 'unknown';
                errors.push(`Failed to install model '${modelName}': ${e.message}`);
                summary.models.failed.push(modelName);
            }
        }
    }

    // --- PHASE 2: DATA INSTALLATION ---
    const dataToInstall = {...pack.data?.all, ...pack.data?.[lang]};
    if (!dataToInstall || Object.keys(dataToInstall).length === 0) {
        logger.warn(`Pack '${pack.name}' has no data to install.`);
        return {success: false, summary, errors, modifiedCount: 0};
    }

    // Process link references (same as original)
    const linkQueue = [];
    for (const modelName in dataToInstall) {
        if (Array.isArray(dataToInstall[modelName])) {
            for (const docSource of dataToInstall[modelName]) {
                const tempId = new ObjectId().toString();
                docSource._temp_pack_id = tempId;

                for (const fieldName in docSource) {
                    if (isPlainObject(docSource[fieldName]) && docSource[fieldName].$link) {
                        linkQueue.push({
                            sourceTempId: tempId,
                            sourceModelName: modelName,
                            fieldName,
                            linkSelector: docSource[fieldName].$link
                        });
                    }
                }
            }
        }
    }

    // --- PASS 1: BATCH INSERTION ---
    logger.info("[Pack Install] Starting Pass 1: Batch Insertion & ID Mapping");
    for (const modelName in dataToInstall) {
        if (!Array.isArray(dataToInstall[modelName])) continue;

        const documents = dataToInstall[modelName];
        if (documents.length === 0) continue;

        const docsToInsert = [];
        const modelDefForHash = await getModel(modelName, user);

        for (const docSource of documents) {
            let docForInsert = {...docSource};

            // Clear $link fields for first pass
            for (const key in docForInsert) {
                if (isPlainObject(docForInsert[key]) && docForInsert[key].$link) {
                    docForInsert[key] = null;
                }
            }

            const tempId = docForInsert._temp_pack_id;
            delete docForInsert._id;
            delete docForInsert._temp_pack_id;

            if (user) docForInsert._user = username;
            docForInsert._model = modelName;
            docForInsert._hash = getFieldValueHash(modelDefForHash, docForInsert);

            // Check for existing document
            const existingQuery = {
                _hash: docForInsert._hash,
                _model: modelName
            };
            if (user) existingQuery._user = username;

            const existingDoc = await collection.findOne(existingQuery, {projection: {_id: 1}});
            if (existingDoc) {
                tempIdToNewIdMap[tempId] = existingDoc._id;
                summary.datas.skipped++;
            } else {
                docForInsert._temp_pack_id_for_mapping = tempId;
                docsToInsert.push(docForInsert);
            }
        }

        if (docsToInsert.length > 0) {
            try {
                const finalDocsToInsert = docsToInsert.map(d => {
                    const doc = {...d};
                    delete doc._temp_pack_id_for_mapping;
                    return doc;
                });

                const result = await collection.insertMany(finalDocsToInsert, {ordered: false});
                summary.datas.inserted += result.insertedCount;

                docsToInsert.forEach((doc, index) => {
                    if (result.insertedIds[index]) {
                        tempIdToNewIdMap[doc._temp_pack_id_for_mapping] = result.insertedIds[index];
                    }
                });
            } catch (e) {
                summary.datas.failed += docsToInsert.length;
                errors.push(`Error inserting batch for ${modelName}: ${e.message}`);
                logger.error(`[Pack Install] Error on insertMany for model ${modelName}:`, e);
            }
        }
    }

    // --- PASS 2: REFERENCE LINKING ---
    logger.info(`[Pack Install] Starting Pass 2: Linking ${linkQueue.length} references`);
    for (const linkOp of linkQueue) {
        const {sourceTempId, sourceModelName, fieldName, linkSelector} = linkOp;
        const sourceId = tempIdToNewIdMap[sourceTempId];

        if (!sourceId) {
            logger.warn(`[LINK FAILED] Could not find newly inserted document for temp ID ${sourceTempId}. Skipping link.`);
            continue;
        }

        try {
            const targetModelName = linkSelector._model;
            delete linkSelector._model;

            const sourceModelDef = await getModel(sourceModelName, user);
            const fieldDef = sourceModelDef.fields.find(f => f.name === fieldName);

            if (!fieldDef) {
                logger.warn(`[LINK FAILED] Field '${fieldName}' not found in source model '${sourceModelName}'`);
                errors.push(`[LINK FAILED] Field '${fieldName}' not found in source model '${sourceModelName}'`);
                summary.datas.failed++;
                continue;
            }

            // Search for target documents
            const {data: targetDocs} = await searchData(
                {model: targetModelName, filter: linkSelector},
                user
            );

            if (!targetDocs || targetDocs.length === 0) {
                const errorMsg = `[LINK FAILED] No target found for ${JSON.stringify(linkSelector)}`;
                logger.warn(errorMsg);
                errors.push(errorMsg);
                summary.datas.failed++;
                continue;
            }

            // Update source document with reference
            const valueToSet = fieldDef.multiple
                ? targetDocs.map(d => d._id.toString())
                : targetDocs[0]._id.toString();

            await collection.updateOne(
                {_id: sourceId},
                {$set: {[fieldName]: valueToSet}}
            );
            summary.datas.updated++;

        } catch (e) {
            const errorMsg = `[LINK CRITICAL] Error linking ${sourceModelName}.${fieldName}: ${e.message}`;
            logger.error(errorMsg, e.stack);
            errors.push(errorMsg);
            summary.datas.failed++;
        }
    }

    if (options.installForUser && user?.username) {
        if (pack.name)
            await packsCollection.deleteOne({name: pack.name, _user: user.username});
        logger.info(`--- Creating pack '${pack.name}' for user... ---`);
        const packToCreate = {...pack, _id: undefined, private: true, _user: user.username};
        await packsCollection.insertOne(packToCreate);
    }

    // Trigger event only if pack came from database (original behavior)
    if (typeof packIdentifier === 'string') {
        await Event.Trigger("OnPackInstalled", "event", "system", pack);
    }

    const modifiedCount = summary.datas.inserted + summary.datas.updated;
    logger.info(`--- ${logPrefix} completed ---`);
    return {
        success: errors.length === 0,
        summary,
        errors,
        modifiedCount
    };
}

export const installAllPacks = async () => {
    const packs = await getAllPacks();
    await packsCollection.deleteMany({_user: {$exists: false}});
    await packsCollection.insertMany(packs.map(p => ({...p, private: false})));
}
/**
 * Gère les traductions spécifiques à l'utilisateur et traite les données de manière récursive
 * pour l'anonymisation et la résolution des relations.
 *
 * Cette fonction est le point d'entrée principal. Elle charge temporairement les traductions
 * d'un utilisateur, traite les données, puis décharge les traductions pour garantir
 * qu'une requête n'affecte pas les autres.
 *
 * @param {object} model - La définition du modèle pour les données actuelles.
 * @param {object|Array<object>|null} data - Les données à traiter (un objet, un tableau ou null).
 * @param {object} user - L'objet utilisateur effectuant la requête.
 * @param {boolean} [isRecursiveCall=false] - Un drapeau interne pour éviter de recharger les traductions lors des appels récursifs.
 * @returns {Promise<object|Array<object>|null>} - Les données traitées, dans le même format que l'entrée.
 */
const handleFields = async (model, data, user, isRecursiveCall = false) => {
    // Détermine si l'entrée était un tableau pour retourner le même format.
    const wasArray = Array.isArray(data);
    // Normalise les données en tableau pour un traitement unifié. Gère le cas où data est null/undefined.
    const dataArray = wasArray ? data : (data ? [data] : []);

    if (dataArray.length === 0) {
        return wasArray ? [] : null;
    }

    // Fonction interne pour traiter les données. Appelée après la gestion des traductions.
    const _processItems = async (items) => {
        const canRead = !isLocalUser(user) || await hasPermission(["API_ADMIN", "API_DEANONYMIZED", "API_DEANONYMIZED_" + model.name], user);

        for (const item of items) {
            if (!item) continue;

            if (item['_id']) {
                item['_id'] = item['_id'].toString();
            }

            for (const field of model.fields) {
                const fieldName = field.name;
                const fieldValue = item[fieldName];

                if (fieldValue === undefined) continue;

                // 1. Anonymisation des champs si nécessaire
                if (field.anonymized && !canRead && dataTypes[field.type]?.anonymize) {
                    item[fieldName] = dataTypes[field.type].anonymize(fieldValue, field, getObjectHash({id: item._id}));
                }

                if (field.type === 'string_t') {
                    item[fieldName] = {key: fieldValue, value: i18n.t(fieldValue, fieldValue)};
                }

                // 2. Résolution récursive des relations

                if (field.type === 'relation' && fieldValue) {
                    try {
                        const relatedModel = await getModel(field.relation, user);
                        // Appel récursif à la fonction principale, en signalant que ce n'est pas l'appel initial.
                        item[fieldName] = await handleFields(relatedModel, fieldValue, user, true);
                        if (!field.multiple && Array.isArray(item[fieldName]) && item[fieldName].length <= 1) {
                            item[fieldName] = item[fieldName][0] || null;
                        }
                    } catch (e) {
                        logger.warn(`Impossible de traiter la relation pour le champ '${fieldName}' du modèle '${model.name}'. Erreur: ${e.message}`);
                        // En cas d'erreur (ex: modèle de relation introuvable), on conserve la valeur originale (probablement un ID).
                    }
                }
            }
        }
        return items;
    };

    // Si c'est l'appel initial (non récursif) et qu'un utilisateur est fourni, on gère les traductions.
    if (!isRecursiveCall && user?.username) {
        const lang = user.lang || 'en'; // Utilise la langue définie par le middleware, sinon 'en'.
        let originalTranslations = null;
        let userTranslationsLoaded = false;


        try {
            const coll = await getCollectionForUser(user);
            // 1. Récupérer l'ID du document de langue de l'utilisateur pour la langue actuelle.
            const userLangDoc = await coll.findOne({
                _model: 'lang',
                code: lang,
                _user: user.username
            });

            if (userLangDoc) {
                // 2. Récupérer les traductions de l'utilisateur pour cette langue.
                const userTranslationsArray = await coll.find({
                    _model: 'translation',
                    _user: user.username,
                    lang: userLangDoc._id.toString()
                }).toArray();

                if (userTranslationsArray.length > 0) {
                    // 3. Préparer le "bundle" de ressources pour i18n.
                    const newResourceBundle = userTranslationsArray.reduce((acc, tr) => {
                        if (tr.key && tr.value) {
                            acc[tr.key] = tr.value;
                        }
                        return acc;
                    }, {});


                    // 4. Charger temporairement les traductions de l'utilisateur.
                    if (Object.keys(newResourceBundle).length > 0) {
                        // Sauvegarder les traductions originales si elles existent
                        if (i18n.store.data[lang] && i18n.store.data[lang].translation) {
                            originalTranslations = {...i18n.store.data[lang].translation};
                        }
                        // Ajoute/remplace les clés de traduction pour la langue et le namespace courants.
                        i18n.addResourceBundle(lang, 'translation', newResourceBundle, true, true);
                        userTranslationsLoaded = true;
                        logger.debug(`Chargement de ${userTranslationsArray.length} traductions personnalisées pour l'utilisateur '${user.username}' en '${lang}'.`);
                    }
                }
            }

            // 5. Traiter les données avec les traductions (personnalisées ou par défaut).
            const processedData = await _processItems(dataArray);
            return wasArray ? processedData : processedData[0];
        } finally {
            // 6. Nettoyage : décharger les traductions de l'utilisateur et restaurer les originales.
            // Ce bloc s'exécute toujours, même en cas d'erreur, garantissant l'isolation des requêtes.
            if (userTranslationsLoaded) {
                // Supprime le namespace temporaire.
                i18n.removeResourceBundle(lang, 'translation');
                logger.debug(`Déchargement des traductions personnalisées pour l'utilisateur '${user.username}' en '${lang}'.`);

                // Restaure les traductions originales si elles avaient été sauvegardées.
                if (originalTranslations) {
                    i18n.addResourceBundle(lang, 'translation', originalTranslations, true, true);
                    logger.debug(`Restauration des traductions originales pour la langue '${lang}'.`);
                }
            }
        }
    } else {
        // C'est un appel récursif ou il n'y a pas d'utilisateur, on traite donc directement les données.
        const processedData = await _processItems(dataArray);
        return wasArray ? processedData : processedData[0];
    }
};