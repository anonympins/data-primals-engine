import {Logger} from "../gameObject.js";
import {BSON, ObjectId} from "mongodb";
import * as util from 'node:util';
import {promisify} from 'node:util';
import crypto from "node:crypto";
import {exec,execFile} from 'node:child_process';
import sanitizeHtml from 'sanitize-html';
import * as tar from "tar";
import process from "node:process";
import {randomColor} from "randomcolor";
import cronstrue from 'cronstrue/i18n.js';
import { setTimeoutMiddleware } from '../middlewares/timeout.js';

import {
    anonymizeText,
    encryptValue,
    getDefaultForType,
    getFieldValueHash,
    getUserId, isDemoUser,
    isLocalUser
} from "../data.js";
import {
    allowedFields, availableLangs,
    dbName,
    install, maxAlertsPerUser,
    maxBytesPerSecondThrottleData,
    maxExportCount,
    maxFileSize,
    maxFilterDepth, maxMagnetsDataPerModel, maxMagnetsModels,
    maxModelNameLength,
    maxModelsPerUser,
    maxPasswordLength,
    maxPostData,
    maxPrivateFileSize,
    maxRelationsPerData,
    maxRequestData,
    maxRichTextLength,
    maxStringLength,
    maxTotalDataPerUser,
    megabytes,
    optionsSanitizer,
    searchRequestTimeout, storageSafetyMargin
} from "../constants.js";
import {
    getCollection,
    getCollectionForUser,
    getUserCollectionName,
    isObjectId,
    modelsCollection,
    packsCollection
} from "./mongodb.js";
import {dbUrl, MongoClient, MongoDatabase} from "../engine.js";
import path from "node:path";
import {
    event_trigger,
    getFileExtension,
    getObjectHash,
    getRandom,
    isGUID,
    isPlainObject,
    randomDate,
    uuidv4
} from "../core.js";
import fs from "node:fs";
import schedule from "node-schedule";
import {middleware} from "../middlewares/middleware-mongodb.js";
import i18n from "../i18n.js";
import {
    executeSafeJavascript,
    runScheduledJobWithDbLock,
    scheduleWorkflowTriggers,
    triggerWorkflows
} from "./workflow.js";
import NodeCache from "node-cache";
import AWS from 'aws-sdk';
import {openaiJobModel} from "../openai.jobs.js";
import checkDiskSpace from "check-disk-space";
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import {addFile, encryptFile, removeFile} from "./file.js";
import {listS3Backups, uploadToS3} from "./bucket.js";
import {
    calculateTotalUserStorageUsage, generateLimiter, hasPermission,
    middlewareAuthenticator,
    userInitiator
} from "./user.js";
import {assistantGlobalLimiter} from "./assistant.js";
import {getAllPacks} from "../packs.js";
import {throttleMiddleware} from "../middlewares/throttle.js";
import {Config} from "../config.js";
import {profiles} from "../../client/src/constants.js";
import {processFilterPlaceholders} from "../../client/src/filter.js";
import {tutorialsConfig} from "../../client/src/tutorials.js";

// Obtenir le chemin du répertoire courant de manière fiable avec ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let engine;
let logger;

const sseConnections = new Map();

const delay = ms => new Promise(res => setTimeout(res, ms));

const getBackupDir = () => process.env.BACKUP_DIR || './backups'; // Répertoire de stockage des sauvegardes
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

let importJobs = {};
const IMPORT_CHUNK_SIZE = 100; // Nombre d'enregistrements à traiter par lot
const IMPORT_CHUNK_DELAY_MS = 1000; // Délai en millisecondes entre le traitement des lots

let depthFilter= 0;

const DATA_STORAGE_PATH = path.resolve('./');

// Création du cache avec des options configurables
const relationCache = new NodeCache({
    stdTTL: 3600, // TTL par défaut de 1 heure (en secondes)
    checkperiod: 600, // Vérification des éléments expirés toutes les 10 minutes
    useClones: false // Pour des performances optimales avec des ObjectId
});

/**
 * Envoie un SSE à un utilisateur spécifique.
 * @param {string} username - Le nom de l'utilisateur à qui envoyer l'événement.
 * @param {object} data - L'objet de données à envoyer.
 * @returns {boolean} - True si l'événement a été envoyé, false sinon.
 */
export function sendSseToUser(username, data) {
    const res = sseConnections.get(username);
    if (res) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
    }
    logger.warn(`[SSE] Attempted to send event to disconnected user: ${username}`);
    return false;
}



export const jobDumpUserData = async () => {

    try {

        const primalsDb = MongoClient.db("primals");

        let usersCollection = primalsDb.collection("users");
        const users = await usersCollection.find().toArray();

        users.forEach((user) =>
        {
            if( isDemoUser(user) && Config.Get("useDemoAccounts"))
                return;
            try {
                dumpUserData(user).catch(e => {

                })
            } catch (ignored) {

            }
        });
    }catch (e) {
        console.error(e);
    }
}

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
            if( value === null )
                return true;
            try {
                cronstrue.toString(value, { throwExceptionOnParseError: true });
                return true;
            } catch (e) {
                return false;
            }
        },
        filter: async (value, field)=>{
            if( value === null )
                return null;
            if (field.cronMask && field.default) {
                return applyCronMask(value, field.cronMask, field.default);
            }
            return value;
        }
    },
    modelField: {
        validate: (value, field) => {
            return value === null || typeof value === 'object' && JSON.stringify(value).length <= maxModelNameLength + 100;
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
            console.log(field,typeof(value));
            return value === null || (field.language === 'json' && typeof(value) === 'object') || (typeof value === 'string' && (field.maxlength === undefined || field.maxlength <= 0 || value.length <= field.maxlength));
        },
        filter: async (value, field) => {
            if( field.language === 'json')
            {
                if( typeof(value) === 'object')
                    return value;
                else if( typeof(value) === 'string') {
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                        return null;
                    }
                }else{
                    return null;
                }
            }
            return value;
        },
        anonymize: anonymizeText
    },
    richtext: {
        validate: (value, field) => {
            const ml = Math.min(Math.max(field.maxlength,0), maxRichTextLength);
            return value === null || typeof value === 'string' && (!ml || value.length <= ml)
        },
        filter: async (value) =>{
            return sanitizeHtml(value, optionsSanitizer);
        },
        anonymize: anonymizeText
    },
    'string_t': {
        validate: (value, field) => {
            if( value === null )
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
            if( value )
                return await runCryptoWorkerTask('hash', { data: value });
            return null;
        },
        validate: (value, field) => {
            const ml = Math.min(Math.max(field.maxlength,0), maxPasswordLength);
            return value === null || typeof value === 'string' && (!ml || value.length <= ml)
        },
        anonymize: anonymizeText
    },
    date: {
        validate: (value, field) => {
            if( value === null )
                return true;
            if( typeof(value) === 'string' && value.toLowerCase() === 'now')
                return true;
            if (typeof value !== 'string' ) return false;
            const dt = new Date(value);

            const dtMin = new Date(field.min || value);
            const dtMax = new Date(field.max || value);
            if( isNaN(dt) ){
                return false;
            }
            return ( dt.getTime() >= dtMin.getTime() && dt.getTime() <= dtMax.getTime());
        },
        filter: async (value) => {
            if( typeof(value) === 'string' && value.toLowerCase() === "now"){
                return new Date().toISOString().split("T")[0];
            }
            if (value instanceof Date)
                return value.toISOString().split("T")[0];
            return value;
        },
        anonymize: (value, field) => {
            const min = new Date();
            const max = new Date();
            min.setFullYear(min.getFullYear()-1);
            max.setFullYear(max.getFullYear()+1);
            return randomDate(field.min ? new Date(field.min) : min, field.max ? new Date(field.max) : max);
        }
    },
    datetime: {
        validate: (value, field) => {
            if( typeof(value) === 'string' && value.toLowerCase() === 'now')
                return true;
            if (value instanceof Date || value === null)
                return true;
            if (typeof value !== 'string' || !value ) return false;
            const dt = new Date(value);
            const dtMin = new Date(field.min || value);
            const dtMax = new Date(field.max || value);
            if( isNaN(dt) ){
                return false;
            }
            return ( dt.getTime() >= dtMin.getTime() && dt.getTime() <= dtMax.getTime());
        },
        filter: async (value) => {
            if( typeof(value) === 'string' && value.toLowerCase() === "now"){
                return new Date().toISOString();
            }
            if (value instanceof Date)
                return value.toISOString();
            return value;
        },
        anonymize: (value, field) => {
            const min = new Date();
            const max = new Date();
            min.setFullYear(min.getFullYear()-1);
            max.setFullYear(max.getFullYear()+1);
            return randomDate(field.min ? new Date(field.min) : min, field.max ? new Date(field.max) : max);
        }
    },
    phone: {
        prefixRegex: /^[+]?[(]?[0-9]{2,3}[)]?$/,
        validate: (value) => {
            if( value === null) return true;
            if (typeof value !== 'string') return false;
            if( !value ) return true;
            if( dataTypes.phone.prefixRegex.test(value) ) return true;
            const phoneRegex = /^[+]?[(]?[0-9]{2,3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im;
            return phoneRegex.test(value);
        },
        filter: async (value) =>{
            if( dataTypes.phone.prefixRegex.test(value) ) return '';
            return value;
        },
        anonymize: anonymizeText
    },
    url: {
        validate: (value) => {
            if( value === null) return true;
            if (typeof value !== 'string') return false;
            if( !value.trim() ) return true;
            const expression = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/;
            return expression.test(value);
        },
        anonymize: anonymizeText
    },
    number: {
        validate: (value, field) => {
            if( value === null) return true;
            const min = typeof(field.min) === 'number' ? field.min : null;
            const max = typeof(field.max) === 'number' ? field.max : null;
            if( min !== null && max !== null && max < min )
                return false;
            return typeof value === 'number' && !isNaN(value) && (min === null || value >= min) && (max === null || value <= max);
        },
        anonymize: (value, field) => {
            const min = typeof(field.min) === 'number' ? field.min : 0;
            const max = typeof(field.max) === 'number' ? field.max : Math.MAX_SAFE_INTEGER;
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
            if( value === null) return true;
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
                return dataTypes[field.itemsType].validate(item, {field, type: field.itemsType });
            });
        },
        anonymize: () => []
    },
    enum: {
        validate: (value) => value === null || typeof(value) === 'string',
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
            if( field.multiple ){
                return typeof(value) === 'object' || (Array.isArray(value) && value.length <= maxRelationsPerData && !value.some(v => {
                    return !isObjectId(v);
                }));
            }
            return value === null || value === undefined || isObjectId(value) || typeof(value) === 'object';
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
                    throw new Error(i18n.t('api.validate.invalidMimeType', { type: value.type, authorized: field.mimeTypes.join(', ') }));
                }

                // Check if the file size is within the limit
                if (value.size > (field.maxSize || maxFileSize )) {
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
            // Vérification si la valeur est une chaîne de caractères et correspond à un format de couleur hexadécimal valide.
            return value === null ||typeof value === 'string' && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);
        },
        filter: async (value) => {
            // Nettoyage ou transformation de la valeur si nécessaire (par exemple, mise en majuscule des caractères hexadécimaux).
            return value ? value.toUpperCase() : null; // Retourne null si la valeur est null ou undefined
        },
        anonymize: () => {
            return randomColor({
                format: 'hex'
            });
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
                    sanitizedObject[lang] = sanitizeHtml(value[lang], optionsSanitizer);
                }
            }
            return sanitizedObject;
        },
        anonymize: () => ({}) // Anonymisation en objet vide
    }
};

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

/**
 * Exécute une tâche d'import/export (parsing, stringify) dans un worker thread.
 * @param {('parse-json'|'parse-csv'|'stringify-json')} action - L'action à effectuer.
 * @param {object} payload - Les données nécessaires pour l'action.
 * @returns {Promise<any>} - Une promesse qui se résout avec les données traitées.
 */
function runImportExportWorker(action, payload) {
    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(__dirname, '../workers/import-export-worker.js');
        const worker = new Worker(workerPath);

        worker.postMessage({ action, payload });

        worker.on('message', (result) => {
            if (result.success) {
                resolve(result.data);
            } else {
                // Correction : On s'assure de toujours passer une chaîne de caractères à new Error()
                const errorMessage = result.error || `Import/Export Worker failed with an unknown error. Action: ${action}.`;
                reject(new Error(errorMessage));
            }
            worker.terminate();
        });

        worker.on('error', (err) => {
            reject(err);
            worker.terminate();
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Import/Export Worker stopped with exit code ${code}`));
            }
        });
    });
}
/** Exécute une tâche de cryptographie dans un worker thread.
 * @param {('encrypt'|'decrypt'|'hash')} action - L'action à effectuer.
 * @param {object} payload - Les données nécessaires pour l'action.
 * @returns {Promise<any>} - Une promesse qui se résout avec le résultat (si pertinent).
 */
function runCryptoWorkerTask(action, payload) {
    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(__dirname, '../workers/crypto-worker.js');
        const worker = new Worker(workerPath);

        worker.postMessage({ action, payload });

        worker.on('message', (result) => {
            if (result.success) {
                resolve(result.data); // Résout avec les données (ex: le hash) ou undefined si pas de retour
            } else {
                reject(new Error(result.error));
            }
            worker.terminate();
        });

        worker.on('error', (err) => {
            reject(err);
            worker.terminate();
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Crypto Worker stopped with exit code ${code}`));
            }
        });
    });
}

export function validateModelStructure(modelStructure) {

    const objectKeys = Object.keys(modelStructure);
    if( objectKeys.find(o => !["name", "_user", "locked", "_id", "description", "maxRequestData", "fields"].includes(o)) ){
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

    return true; // La structure du modèle est valide
}

const validateField = (field) => {

    const allowedFieldTest = (fields)=>{
        // Check for unknown fields
        const unknownFields = Object.keys(field).filter(f => ![...allowedFields, ...fields].includes(f));

        if (unknownFields.length > 0) {
            throw new Error(i18n.t('api.validate.unknowField', `Propriété(s) non reconnue(s): '{{0}}' pour le champ '{{1}}'`, [unknownFields.join(', '), field.name]));
        }

        const fieldInvalid = Object.keys(fields).find(f => JSON.stringify(field[f] || '').length > maxStringLength);
        if(fieldInvalid){
            throw new Error(i18n.t('api.validate.invalidField', `Champ(s) non valide(s): '{{0}}'`, [fieldInvalid.name]));
        }
    }

    // Check for required fields
    if (!field.name || typeof field.name !== 'string') {
        throw new Error(i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["name"]));
    }
    if (!field.type || typeof field.type !== 'string') {
        throw new Error(i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["type"]));
    }

    // Check for specific field types
    switch (field.type) {
    case 'relation':
        allowedFieldTest(['relation', 'multiple', 'relationFilter']);
        if (!field.relation || typeof field.relation !== 'string' || field.relation.length > maxModelNameLength) {
            throw new Error(i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["relation"]));
        }
        if (field.multiple !== undefined && typeof field.multiple !== 'boolean') {
            throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["multiple"]));
        }
        if( field.relationFilter && typeof field.relationFilter !== 'object'){
            throw new Error(i18n.t('api.validate.fieldObject', "L'attribut '{{0}}' doit être un objet.", ["relationFilter"]));
        }
        break;
    case 'enum':
    {
        allowedFieldTest(['items']);
        if (!field.items || !Array.isArray(field.items) || field.items.length === 0) {
            throw new Error(i18n.t('api.validate.fieldStringArray', "L'attribut '{{0}}' doit être un tableau de chaines de caractères.", ["items"]));
        }
        let id = field.items.findIndex(item => typeof item !== 'string');
        if( id !== -1 ){
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["items["+id+"]"]));
        }
        break;
    }
    case 'number':
        allowedFieldTest(['min', 'max', 'step', 'unit']);
        if (field.min !== undefined && typeof field.min !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["min"]));
        }
        if (field.max !== undefined && typeof field.max !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["max"]));
        }
        if (field.max < field.min ){
            throw new Error(i18n.t('api.validate.inferiorTo', "L'attribut '{{0}}' doit être inférieur à l'attribut '{{1}}'.", ["min", "max"]));
        }
        if (field.step !== undefined && typeof field.step !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["step"]));
        }
        if (field.unit !== undefined && typeof field.unit !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["unit"]));
        }
        break;
    case 'string':
    case 'string_t':
    case 'richtext':
    case 'richtext_t':
    case 'url':
    case 'email':
    case 'phone':
    case 'password':
    case 'code':
        if (field.type === 'code')
            allowedFieldTest(['maxlength', 'language', 'conditionBuilder', 'targetModel']);
        else if( ['string_t', 'string'].includes(field.type))
            allowedFieldTest(['maxlength', 'multiline']);
        else
            allowedFieldTest(['maxlength']);
        if (field.maxlength !== undefined && typeof field.maxlength !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["maxlength"]));
        }
        break;
    case 'model':
    case 'modelField':
        allowedFieldTest([]);
        break;
    case 'object':
        allowedFieldTest([]);
        break;
    case 'boolean':
        allowedFieldTest([]);
        break;
    case 'date':
    case 'datetime':
    {
        allowedFieldTest(['min','max']);
        if (field.min !== undefined && typeof field.min !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["min"]));
        }
        if (field.max !== undefined && typeof field.max !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["max"]));
        }
        const dtMin = field.min ? new Date(field.min) : null;
        const dtMax = field.max ? new Date(field.max) : null;
        if( dtMin && dtMax && dtMin > dtMax){
            throw new Error(i18n.t('api.validate.inferiorTo', "L'attribut '{{0}}' doit être inférieur à l'attribut '{{1}}'.", ["min", "max"]));
        }
        break;
    }
    case 'image':
    case 'file':
    {
        allowedFieldTest(['mimeTypes', 'maxSize']);
        if (field.mimeTypes !== undefined && !Array.isArray(field.mimeTypes)) {
            throw new Error(i18n.t('api.validate.fieldStringArray', "L'attribut '{{0}}' doit être un tableau de chaines de caractères.", ["mimeTypes"]));
        }
        let id;
        if (field.mimeTypes !== undefined && (id = field.mimeTypes.findIndex(item => typeof item !== 'string')) !== -1) {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["mimeTypes["+id+"]"]));
        }
        if (field.maxSize !== undefined && typeof field.maxSize !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["maxSize"]));
        }
        if (field.maxSize !== undefined && field.maxSize > maxFileSize) {
            throw new Error(i18n.t('api.validate.fileSize', `L'attribut 'maxSize' ne doit pas dépasser {{0}} octets.`, [maxFileSize]));
        }
        break;
    }
    case 'color':
        allowedFieldTest([]);
        return true;
    case 'cronSchedule':
        allowedFieldTest(['cronMask']);
        return true;
    case 'calculated':
        allowedFieldTest(['calculation']);
        return true;
    case 'array':
        if (!field.itemsType || typeof field.itemsType !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["itemsType"]));
        }
        if (!dataTypes[field.itemsType]) {
            throw new Error(i18n.t('api.validate.invalidField', `Champ(s) non valide(s): '{{0}}'`, ["itemsType"]));
        }
        if (field.minItems !== undefined && typeof field.minItems !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["minItems"]));
        }
        if (field.maxItems !== undefined && typeof field.maxItems !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["maxItems"]));
        }
        break;
    default:
        throw new Error(i18n.t('api.validate.unknowType',`Le type '{{0}}' n'est pas reconnu.`, [field.type]));
    }

    // Check for optional fields
    if (field.required !== undefined && typeof field.required !== 'boolean') {
        throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["required"]));
    }
    if (field.hint !== undefined && typeof field.hint !== 'string') {
        throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["hint"]));
    }
    if (field.default !== undefined && field.default !== null && typeof field.default !== typeof getDefaultForType(field) && typeof field.default !== 'function') {
        throw new Error(i18n.t('api.validate.sameType', `L'attribut '{{0}}' doit être du même type que l'attribut '{{0}}' (${field.type}).`, ['default', 'type']));
    }
    if (field.validate !== undefined && typeof field.validate !== 'function') {
        throw new Error(i18n.t('api.validate.fieldFunction', "L'attribut '{{0}}' doit être une fonction.", ['validate']));
    }
    if (field.unique !== undefined && typeof field.unique !== 'boolean') {
        throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["unique"]));
    }
    if (field.placeholder !== undefined && typeof field.placeholder !== 'string') {
        throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["placeholder"]));
    }
    if (field.asMain !== undefined && typeof field.asMain !== 'boolean') {
        throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["asMain"]));
    }
    if (field.unit !== undefined && typeof field.unit !== 'string') {
        throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["unit"]));
    }

    return true;
};

const throttle = throttleMiddleware(maxBytesPerSecondThrottleData);

let modelsCache = new NodeCache( { stdTTL: 100, checkperiod: 120 } );


function convertDataTypes(dataArray, modelFields, sourceType = 'csv') {
    return dataArray.map(record => {
        const convertedRecord = { ...record };
        for (const field of modelFields) {
            if (convertedRecord.hasOwnProperty(field.name)) {
                let value = convertedRecord[field.name];

                // Gérer les chaînes vides pour les champs non requis
                if (typeof value === 'string' && value === '' && !field.required) {
                    convertedRecord[field.name] = getDefaultForType(field);
                    continue;
                }
                // Si la valeur est null ou undefined, on la laisse telle quelle, la validation s'en chargera
                if (value === null || value === undefined) {
                    continue;
                }

                switch (field.type) {
                case 'number':
                    if (typeof value !== 'number') { // Convertir si ce n'est pas déjà un nombre
                        const num = parseFloat(value);
                        if (!isNaN(num)) {
                            convertedRecord[field.name] = num;
                        } else {
                            logger.warn(`Import: Impossible de parser le nombre pour le champ ${field.name}, valeur: ${value}. Utilisation de la valeur par défaut/null.`);
                            convertedRecord[field.name] = getDefaultForType(field);
                        }
                    }
                    break;
                case 'boolean':
                    if (typeof value !== 'boolean') {
                        convertedRecord[field.name] = ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
                    }
                    break;
                case 'date':
                case 'datetime':
                    if (String(value).toLowerCase() === 'now') {
                        convertedRecord[field.name] = 'now';
                    } else {
                        const parsedDate = new Date(value);
                        if (!isNaN(parsedDate.getTime())) {
                            convertedRecord[field.name] = field.type === 'date' ? parsedDate.toISOString().split("T")[0] : parsedDate.toISOString();
                        } else if (value) { // Ne pas logger si la valeur était initialement vide/null
                            logger.warn(`Import: Impossible de parser la date pour le champ ${field.name}, valeur: ${value}. La validation ulture s'en chargera.`);
                        }
                    }
                    break;
                case 'array':
                    if (sourceType === 'csv' && typeof value === 'string') {
                        const arrayValues = value.split(/[,;]/).map(item => item.trim()).filter(item => item !== '');
                        if (field.itemsType === 'number') {
                            convertedRecord[field.name] = arrayValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
                        } else {
                            convertedRecord[field.name] = arrayValues;
                        }
                    } else if (sourceType === 'json' && typeof value === 'string') {
                        try {
                            const parsedArray = JSON.parse(value);
                            if (Array.isArray(parsedArray)) {
                                convertedRecord[field.name] = parsedArray;
                                // TODO: Potentiellement convertir les éléments de parsedArray ici si nécessaire
                            } else {
                                logger.warn(`Import: La chaîne JSON pour le champ tableau ${field.name} n'a pas été parsée en tableau. Valeur: ${value}.`);
                            }
                        } catch (e) {
                            logger.warn(`Import: Impossible de parser la chaîne JSON pour le champ tableau ${field.name}. Valeur: ${value}.`);
                        }
                    }
                    // Si c'est déjà un tableau (cas JSON typique), on suppose que les types des éléments sont corrects
                    // ou seront validés par pushDataUnsecure.
                    else if (!Array.isArray(convertedRecord[field.name])) {
                        convertedRecord[field.name] = getDefaultForType(field);
                    }
                    break;
                case 'object':
                    if (typeof value === 'string') {
                        try {
                            convertedRecord[field.name] = JSON.parse(value);
                        } catch (e) {
                            logger.warn(`Import: Impossible de parser la chaîne JSON pour le champ objet ${field.name}. Valeur: ${value}.`);
                        }
                    }
                    break;
                case 'code':
                    if (field.language === 'json' && typeof value === 'string') {
                        try {
                            convertedRecord[field.name] = JSON.parse(value);
                        } catch (e) {
                            logger.warn(`Import: Impossible de parser la chaîne JSON pour le champ code (json) ${field.name}. Valeur: ${value}.`);
                        }
                    }
                    break;
                }
            }
        }
        return convertedRecord;
    });
}

export  const cancelAlerts = async (user) => {

    const datasCollection = getCollection('datas'); // Alerts are in the global collection

    // 1. Fetch the latest state of the alert
    const alertDocs = await datasCollection.find({ _user: user.username, _model: 'alert' }).toArray();
    alertDocs.forEach(doc => {
        const jobId = `alert_${doc._id}`;
        schedule.scheduledJobs[jobId]?.cancel();
    });
}

/**
 * Executes a stateful alert job. It checks if a notification for an alert
 * has already been sent and only sends one if the condition is met and no
 * recent notification exists. The state is tracked via the 'lastNotifiedAt'
 * field in the alert document.
 * @param {string|ObjectId} alertId - The ID of the alert to process.
 */
async function runStatefulAlertJob(alertId) {
    const jobId = `alert_${alertId}`;
    logger.info(`[Scheduled Job] Cron triggered for stateful alert job ${jobId}.`);

    try {
        const datasCollection = getCollection('datas'); // Alerts are in the global collection

        // 1. Fetch the latest state of the alert
        const alertDoc = await datasCollection.findOne({ _id: new ObjectId(alertId) });

        // Safety checks
        if (!alertDoc) {
            logger.warn(`[Scheduled Job] Alert ${alertId} not found. Cancelling job.`);
            schedule.scheduledJobs[jobId]?.cancel();
            return;
        }

        if (!alertDoc.isActive || !alertDoc.frequency) {
            logger.info(`[Scheduled Job] Alert ${alertId} is no longer active or has no frequency. Cancelling job.`);
            schedule.scheduledJobs[jobId]?.cancel();
            return;
        }

        // 2. Check if a notification has already been sent for this state
        if (alertDoc.lastNotifiedAt) {
            logger.debug(`[Scheduled Job] Notification for alert ${alertId} has already been sent. Skipping evaluation.`);
            return;
        }

        // 3. Evaluate the trigger condition
        const apiFilter = (alertDoc.triggerCondition);
        const { count } = await searchData({
            user: { username: alertDoc._user },
            query: {
                model: alertDoc.targetModel,
                filter: apiFilter,
                limit: 1
            }
        });

        // 4. If condition is met, send notification and update state
        if (count > 0) {
            logger.info(`[Scheduled Job] Condition met for alert ${alertDoc.name} (ID: ${alertId}). Sending notification and updating state.`);

            // Send notification
            const alertPayload = {
                type: 'cron_alert',
                triggerId: alertDoc._id.toString(),
                triggerName: alertDoc.name,
                timestamp: new Date().toISOString(),
                message: `Alerte '${alertDoc.name}': ${count} élément(s) correspondent à votre condition.`
            };
            sendSseToUser(alertDoc._user, alertPayload);

            // Update state in DB to prevent re-notification
            await datasCollection.updateOne(
                { _id: new ObjectId(alertId) },
                { $set: { lastNotifiedAt: new Date() } }
            );
        } else {
            logger.debug(`[Scheduled Job] Condition not met for alert ${alertId}. No notification sent.`);
        }

    } catch (error) {
        logger.error(`[Scheduled Job] Error processing stateful alert job ${jobId}:`, error);
    }
}



export async function scheduleAlerts() {
    logger.info('[scheduleAlerts] Starting scheduling of oldest active alerts per user...');
    try {
        const datasCollection = getCollection('datas');

        // --- NOUVELLE LOGIQUE AVEC AGRÉGATION ---
        const aggregationPipeline = [
            // 1. Match: Ne sélectionner que les alertes actives avec une fréquence définie.
            {
                $match: {
                    _model: 'alert',
                    isActive: true,
                    frequency: { $exists: true, $ne: "" }
                }
            },
            // 2. Sort: Trier les alertes par utilisateur, puis par date de création (les plus anciennes en premier).
            // L'ObjectId contient un timestamp, donc trier par _id est équivalent à trier par date de création.
            {
                $sort: {
                    _user: 1, // Grouper par utilisateur
                    _id: 1    // Trier par date de création (ascendant)
                }
            },
            // 3. Group: Regrouper toutes les alertes par utilisateur dans un tableau.
            {
                $group: {
                    _id: "$_user", // La clé de groupement est le nom de l'utilisateur
                    alerts: { $push: "$$ROOT" } // $$ROOT pousse le document entier dans le tableau 'alerts'
                }
            },
            // 4. Project (Slice): Pour chaque utilisateur, ne garder que les X premières alertes du tableau trié.
            {
                $project: {
                    oldestAlerts: { $slice: ["$alerts", maxAlertsPerUser] }
                }
            },
            // 5. Unwind: Déconstruire le tableau 'oldestAlerts' pour obtenir un flux de documents, un par alerte.
            {
                $unwind: "$oldestAlerts"
            },
            // 6. ReplaceRoot: Remplacer la structure du document par le contenu de l'alerte elle-même.
            {
                $replaceRoot: { newRoot: "$oldestAlerts" }
            }
        ];

        const alertsToSchedule = await datasCollection.aggregate(aggregationPipeline).toArray();
        // --- FIN DE LA NOUVELLE LOGIQUE ---

        logger.info(`[scheduleAlerts] Found ${alertsToSchedule.length} oldest active alerts across all users to schedule.`);

        for (const alertDoc of alertsToSchedule) {
            const jobId = `alert_${alertDoc._id}`;
            try {
                // Annuler une tâche existante pour la même alerte si elle existe (logique de sécurité)
                if (schedule.scheduledJobs[jobId]) {
                    schedule.scheduledJobs[jobId].cancel();
                }
                // Planifier la tâche avec la nouvelle logique stateful
                schedule.scheduleJob(jobId, alertDoc.frequency, () => runStatefulAlertJob(alertDoc._id));
            } catch (scheduleError) {
                logger.error(`[scheduleAlerts] Failed to schedule job ${jobId} for alert ${alertDoc._id}. Error: ${scheduleError.message}`);
            }
        }
        logger.info('[scheduleAlerts] Finished scheduling alerts.');
    } catch (error) {
        logger.error('[scheduleAlerts] A critical error occurred during alert scheduling:', error);
    }
}

/**
 * Applique un masque et des valeurs par défaut à une expression cron.
 * @param {string} cronString - L'expression cron d'entrbooléens. `false` pour désactiver et appliquer la valeur par défaut.
 * @param {string[]} defaults - Un tableau de 5 chaînes de caractères pour les valeurs par défaut.
 * @returns {string} - L'expression cron modifiée.
 */
function applyCronMask(cronString, mask, defaults) {
    if (typeof cronString !== 'string' || cronString.trim() === '' || !mask || !defaults) {
        return cronString;
    }
    const parts = cronString.split(' ');
    if (parts.length < 5) {
        return cronString; // Laisse la validation standard gérer les formats incorrects
    }

    const newParts = parts.slice(0, 5).map((part, index) => {
        // Si le masque à cet index est `false`, on force la valeur par défaut.
        if (mask[index] === false) {
            return defaults[index];
        }
        // Sinon, on garde la valeur de l'utilisateur.
        return part;
    });

    return newParts.join(' ');
}


export const editModel = async (user, id, data) => {

    if( !(isDemoUser(user) && Config.Get("useDemoAccounts")) && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_EDIT_MODEL"], user)){
        return ({success: false, error: i18n.t('api.permission.editModel', 'Cannot edit models from the API')})
    }

    const dataModel = data;
    try {
        const collection = await getCollectionForUser(user);
        validateModelStructure(dataModel);

        const el = await modelsCollection.findOne({ $and: [
            {_user: {$exists: true}},
            { _id: new ObjectId(id) },
            {$and: [{_user: {$exists: true}}, {$or: [{_user: user._user}, {_user: user.username}]}]
            }
        ]});

        if( !el ){
            return ({success: false, statusCode: 404, error: i18n.t("api.model.notFound", { model: dataModel.name })});
        }

        // renommage du modèle
        if (typeof (data.name)==='string'&&el.name !== data.name && data.name ){
            await collection.updateMany({ _model: el.name }, { $set: { _model: data.name }});
            await modelsCollection.updateMany({ 'fields' : {
                '$elemMatch' : { relation: el.name }
            }}, {
                $set : {
                    'fields.$.relation' : data.name
                }
            })
        }

        const coll = await getCollectionForUser(user);
        // Update indexes
        // Update indexes
        if (await engine.userProvider.hasFeature(user, 'indexes')) {
            let indexes = [];
            try {
                // On essaie de récupérer les index existants
                indexes = await coll.indexes();
            } catch (e) {
                // Si la collection n'existe pas, c'est normal.
                // createIndex la créera. Il n'y a juste pas d'index à supprimer.
                if (e.codeName !== 'NamespaceNotFound') {
                    throw e; // On relance les autres erreurs
                }
            }

            // Le reste de votre logique de gestion d'index peut maintenant s'exécuter en toute sécurité
            for (const field of data.fields) {
                const elField = el.fields.find(f => f.name === field.name);
                if (!elField) continue;

                const index = indexes.find(i => i.key[field.name] === 1 &&
                    i.partialFilterExpression?._model === el.name &&
                    i.partialFilterExpression?._user === user.username);

                if (elField.index !== field.index && !field.index) {
                    if (index) {
                        await coll.dropIndex(index.name);
                    }
                } else if (elField.index !== field.index && field.index) {
                    if (!index) {
                        await coll.createIndex({ [field.name]: 1 }, {
                            partialFilterExpression: {
                                _model: data.name,
                                _user: user.username
                            }
                        });
                    }
                }
            }
        }
        // suppression des données à la suppression des champs
        const unset = {};
        el.fields.filter(f=> !dataModel.fields.some(dt => dt.name === f.name)).map(f => f.name).forEach(f => {
            unset[f] = 1;
        });
        await collection.updateMany({ _model: el.name }, { $unset: unset });

        // sauvegarde du modele
        const set = {...data};
        delete set['_id'];

        const oid = new ObjectId(id);
        await modelsCollection.updateOne({_id: oid}, {$set: set});

        modelsCache.del(user.username+'@@'+el.name);

        const model = await modelsCollection.findOne({_id: oid });
        triggerWorkflows(model, user, 'ModelEdited').catch(workflowError => {
            logger.error(`Erreur asynchrone lors du déclenchement des workflows pour ${model._model} ID ${model._id}:`, workflowError);
        });

        return ({ success: true, data: await modelsCollection.findOne({_id : oid}) });
    } catch (e) {
        logger.error(e);
        return ({ success: false, error: e.message, statusCode: 500 });
    }
};


export async function handleCustomEndpointRequest(req, res) {
    const { path } = req.params;
    const method = req.method.toUpperCase();

    const user = req.me;
    if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
        // 1. Trouver l'endpoint correspondant dans la base de données
        const endpointSearch = await searchData({
            user,
            query: {
                model: 'endpoint',
                filter: {
                    path: path,
                    method: method,
                    isActive: true
                },
                limit: 1
            }
        });

        if (endpointSearch.count === 0) {
            logger.warn(`[Endpoint] 404 - No active endpoint found for user '${user.username}', path '${path}', method '${method}'.`);
            return res.status(404).json({ success: false, message: 'Endpoint not found.' });
        }

        const endpointDef = endpointSearch.data[0];

        // 2. Préparer le contexte pour le script
        // On donne au script accès au corps, aux paramètres de la requête, etc.
        const contextData = {
            request:{
                body: req.fields,
                query: req.query,
                params: req.params,
                headers: req.headers
            }
        };

        // 3. Exécuter le code de l'endpoint en utilisant notre sandbox sécurisé
        logger.info(`[Endpoint] Executing endpoint '${endpointDef.name}' for user '${user.username}'.`);
        const result = await executeSafeJavascript(
            { script: endpointDef.code }, // On passe la définition du script
            contextData,
            user
        );

        // 4. Envoyer la réponse
        if (result.success) {
            // Le script a réussi, on retourne sa sortie
            res.status(200).json(result.data);
        } else {
            // Le script a échoué, on retourne une erreur 500 avec les logs
            logger.error(`[Endpoint] Execution failed for '${endpointDef.name}'. Error: ${result.message}`);

            const r = {
                success: false,
                message: 'Endpoint script execution failed.',
                // On peut choisir d'exposer les logs pour le débogage
                details: result.message
            };
            r.logs = result.logs;
            res.status(500).json(r);
        }

    } catch (error) {
        logger.error(`[Endpoint] Critical error handling request for path '${path}': ${error.message}`, process.env.NODE_ENV === 'development'? error.stack : error.stack[0]);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
}

export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    engine.use(middleware({ whitelist: [
        "$$NOW", "$in", "$eq", "$gt", "$gte", "$in", "$lt", "$lte", "$ne", "$nin", "$type", "$size",
        "$and", "$not", "$nor", "$or", "$regexMatch", "$find", "$elemMatch", "$filter", "$toString", "$toObjectId",
        "$concat",
        '$add', '$subtract', '$multiply', '$divide', '$mod', '$pow', "$sqrt",
        "$rand",
        "$abs", '$sin', '$cos', '$tan', '$asin', '$acos', '$atan',
        "$toDate", "$toBool", "$toString", "$toInt", "$toDouble",
        "$dateSubtract", "$dateAdd", "$dateToString",
        '$year', '$month', '$week', '$dayOfMonth', '$dayOfWeek', '$dayOfYear', '$hour', '$minute', '$second', '$millisecond'
    ]}));

    let userMiddlewares = await engine.userProvider.getMiddlewares();

    let modelsCollection, datasCollection, filesCollection, packsCollection, magnetsCollection;

    if( install ) {
        modelsCollection = await MongoDatabase.createCollection("models");
        datasCollection = await MongoDatabase.createCollection("datas");
        filesCollection = await MongoDatabase.createCollection("files");
        packsCollection = await MongoDatabase.createCollection("packs");
        magnetsCollection = await MongoDatabase.createCollection("magnets");
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

        const jobsCollection = await MongoDatabase.createCollection("job_locks");
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


    }else {
        modelsCollection = getCollection("models");
        datasCollection = getCollection("datas");
        filesCollection = getCollection("files");
        packsCollection = getCollection("packs");
    }

    // set backup scheduler
    schedule.scheduleJob("0 2 * * *", jobDumpUserData);
    //await jobDumpUserData();

    schedule.scheduleJob("0 0 * * *", async () => {
        const dt = new Date();
        dt.setTime(dt.getTime()-1000*3600*24*14);
        await deleteData("request", [], {"$lt": ["$timestamp",dt.toISOString()]}, null, false);
    });
    await scheduleWorkflowTriggers();

    await scheduleAlerts();

    engine.all('/api/actions/:path', [middlewareAuthenticator, userInitiator], handleCustomEndpointRequest);
    engine.post('/api/demo/initialize', [middlewareAuthenticator, userInitiator], handleDemoInitialization);

    engine.post('/api/magnets', [middlewareAuthenticator, userInitiator], async (req, res) => {
        const user = req.me;
        const { name, description, modelNames } = req.fields; // Noms des modèles à inclure

        if (!name || !Array.isArray(modelNames) || modelNames.length === 0) {
            return res.status(400).json({ error: 'Name and a list of model names are required.' });
        }

        try {
            const magnetId = new ObjectId(); // ID unique pour ce groupe de données/modèles
            const magnetUuid = uuidv4(); // UUID pour le lien public

            const modelsToCopy = await modelsCollection.find({
                name: { $in: modelNames },
                _user: user.username
            }).limit(maxMagnetsModels).toArray();

            if (modelsToCopy.length !== modelNames.length) {
                return res.status(404).json({ error: "One or more specified models were not found." });
            }

            // 1. Copier les modèles et les marquer avec le magnetId
            const newModels = modelsToCopy.map(m => {
                const { _id, ...modelData } = m;
                return {
                    ...modelData,
                    magnetId: magnetId.toString(),
                    locked: true, // Les modèles d'un magnet sont en lecture seule
                    _user: null // Le propriétaire est le magnet, pas un utilisateur
                };
            });
            await modelsCollection.insertMany(newModels);

            const coll = await getCollectionForUser(user);
            // 2. Copier les données associes marquer
            // C'est la partie la plus complexe à cause des relations
            const idMap = {}; // Map: old_id -> new_id
            for (const model of modelsToCopy) {
                const datasToCopy = await coll.find({
                    _model: model.name,
                    _user: user.username
                }).limit(maxMagnetsDataPerModel).toArray();

                if (datasToCopy.length === 0) continue;

                // Passe 1: Insérer les documents sans leurs relations pour obtenir les nouveaux IDs
                const newDatas = datasToCopy.map(d => {
                    const { _id, ...data } = d;
                    idMap[d._id.toString()] = new ObjectId(); // Pré-générer le nouvel ID
                    return {
                        ...data,
                        _id: idMap[d._id.toString()],
                        magnetId: magnetId.toString(),
                        _user: null
                    };
                });
                const coll = await getCollectionForUser(user);
                await coll.insertMany(newDatas);

                // Passe 2: Mettre à jour les relations dans les documents fraîchement copiés
                for (const newDoc of newDatas) {
                    const updatePayload = {};
                    for (const field of model.fields) {
                        if (field.type === 'relation' && newDoc[field.name]) {
                            if (Array.isArray(newDoc[field.name])) {
                                newDoc[field.name] = newDoc[field.name]
                                    .map(oldId => idMap[oldId.toString()]?.toString())
                                    .filter(Boolean);
                            } else {
                                newDoc[field.name] = idMap[newDoc[field.name].toString()]?.toString() || null;
                            }
                            updatePayload[field.name] = newDoc[field.name];
                        }
                    }
                    if (Object.keys(updatePayload).length > 0) {
                        const coll = await getCollectionForUser(user);
                        await coll.updateOne({ _id: newDoc._id }, { $set: updatePayload });
                    }
                }
            }

            // 3. Créer l'enregistrement du magnet lui-même
            const magnetData = {
                uuid: magnetUuid,
                name,
                description,
                owner: user.username,
                createdAt: new Date(),
                models: modelNames,
                _id: magnetId
            };
            await getCollection('magnets').insertOne(magnetData); // Nouvelle collection 'magnets'

            res.status(201).json({
                success: true,
                message: "Magnet link created successfully!",
                url: `https://data.primals.net/magnet/${magnetUuid}` // ou votre URL de dev
            });

        } catch (error) {
            logger.error("Error creating magnet link:", error);
            res.status(500).json({ error: "An internal server error occurred." });
        }
    });

    /**
     * Route pour vérifier si une condition de complétion est remplie.
     * Utilise la fonction `searchData` existante pour interroger les données.
     */
    engine.post('/api/tutorials/check-completion', middlewareAuthenticator, async (req, res) => {
        try {
            const { model, filter, limit } = req.fields;
            const user = req.me;

            if (!model || !filter || limit === undefined) {
                return res.status(400).json({ error: 'Payload de condition de complétion invalide.' });
            }

            const processedFilter = processFilterPlaceholders(filter, user);

            // On utilise la fonction de recherche interne de l'application
            const searchResult = await searchData({
                query: {
                    model,
                    filter: processedFilter,
                    limit, // Optimisation : pas besoin de plus de résultats
                    page: 1
                },
                user: user
            });

            // searchData devrait renvoyer un `count` total des documents correspondants
            const isCompleted = searchResult.count >= limit;

            res.json({ isCompleted });

        } catch (error) {
            console.error('[Tutoriel Check Error]', error);
            res.status(500).json({ error: 'Erreur lors de la vérification de la complétion.', details: error.message });
        }
    });



    engine.post('/api/tutorials/set-active', middlewareAuthenticator, async (req, res) => {
        try {
            const { tutorialState } = req.fields;
            const user = req.me;

            if (tutorialState !== null && (typeof tutorialState !== 'object' || !tutorialState.id)) {
                return res.status(400).json({ error: 'Invalid tutorial state payload.' });
            }

            // Créer une représentation de l'utilisateur mis à jour pour la réponse
            const updatedData = { activeTutorial: tutorialState };

            await engine.userProvider.updateUser(user, updatedData);

            // --- MODIFICATION ---
            res.json({
                success: true,
                updatedData // Renvoyer l'objet utilisateur complet
            });

        } catch (error) {
            console.error('[Tutoriel Set Active Error]', error);
            res.status(500).json({ error: 'Error setting active tutorial.', details: error.message });
        }
    });

    // ...

    engine.post('/api/tutorials/:tutorialId/claim-rewards', middlewareAuthenticator, async (req, res) => {
        try {
            const { tutorialId } = req.params;
            const user = req.me; // L'objet utilisateur est déjà chargé
            const tutorial = tutorialsConfig.find(t => t.id === tutorialId);

            if (!tutorial) return res.status(404).json({ error: 'Tutoriel non trouvé.' });
            if (!tutorial.rewards) return res.status(400).json({ error: 'Ce tutoriel n\'a pas de récompenses.' });
            if (user.completedTutorials?.includes(tutorialId)) {
                return res.status(400).json({ error: 'Tutoriel déjà terminé.' });
            }

            const { xpBonus, skill, achievement, notification } = tutorial.rewards;

            // --- LOGIQUE CORRIGÉE ---
            let newData= {};
            newData.xp = newData.xp || 0;
            newData.achievements = newData.achievements || [];
            newData.skills = newData.skills || [];
            newData.completedTutorials = newData.completedTutorials || [];

            // Appliquer les récompenses directement sur l'objet newData
            if (xpBonus) newData.xp += xpBonus;
            if (achievement && !newData.achievements.includes(achievement)) newData.achievements.push(achievement);
            if (skill) {
                const existingSkill = newData.skills.find(s => s.name === skill.name);
                if (existingSkill) {
                    existingSkill.points += skill.points;
                } else {
                    newData.skills.push({ name: skill.name, points: skill.points });
                }
            }

            newData.completedTutorials.push(tutorialId);
            newData.activeTutorial = null;

            await engine.userProvider.updateUser(user, newData);

            const translatedNotification = {
                title: i18n.t(notification.title, notification.title),
                message: i18n.t(notification.message, notification.message)
            };

            res.json({
                success: true,
                userUpdate: newData, // Renvoyer l'objet utilisateur complet et mis à jour
                notification: translatedNotification
            });

        } catch (error) {
            console.error('[Tutoriel Rewards Error]', error);
            res.status(500).json({ error: 'Erreur lors de l\'attribution des récompenses.', details: error.message });
        }
    });

    engine.get('/api/import/progress/:jobId', [middlewareAuthenticator], async (req, res) => {
        const { jobId } = req.params;
        const user = req.me;

        // Vérification d'autorisation: s'assurer que l'utilisateur est bien le propriétaire de la tâche
        if (!importJobs[jobId] || importJobs[jobId].userId !== user.username) {
            return res.status(403).send('Forbidden');
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Important pour désactiver le buffering de certains proxys (ex: Nginx)

        const sendProgress = () => {
            const job = importJobs[jobId];
            if (job) {
                res.write(`data: ${JSON.stringify(job)}\n\n`);
                if (job.status === 'completed' || job.status === 'failed') {
                    res.end(); // Terminer le stream lorsque la tâche est terminée
                    delete importJobs[jobId]; // Nettoyer la tâche de la mémoire
                }
            } else {
                // Si la tâche n'est plus là (déjà nettoyée ou jamais existé)
                res.write(`data: ${JSON.stringify({ status: 'not_found', message: 'Job not found or already completed.' })}\n\n`);
                res.end();
            }
        };

        // Envoyer la progression initiale immédiatement
        sendProgress();

        // Mettre en place un intervalle pour envoyer des mises à jour régulières
        // Pour une application plus complexe, vous pourriez utiliser un EventEmitter
        // pour déclencher des mises à jour uniquement quand la progression change.
        const intervalId = setInterval(sendProgress, 1000); // Mettre à jour toutes les secondes

        // Nettoyer l'intervalle lorsque le client se déconnecte
        req.on('close', () => {
            clearInterval(intervalId);
            logger.debug(`SSE client disconnected for job ${jobId}`);
        });
    });

    engine.get('/api/alerts/subscribe', [middlewareAuthenticator], (req, res) => {
        const user = req.me;

        // Configuration des headers pour une connexion SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Important pour Nginx

        // Stocker la connexion de l'utilisateur
        sseConnections.set(user.username, res);
        logger.info(`User ${user.username} subscribed to SSE alerts.`);

        // Envoyer un message de confirmation
        res.write(`data: ${JSON.stringify({ type: 'connection_established', message: 'Subscribed to alerts.' })}\n\n`);

        // Gérer la déconnexion du client
        req.on('close', () => {
            sseConnections.delete(user.username);
            logger.info(`User ${user.username} disconnected from SSE alerts.`);
        });
    });

    engine.post('/api/data/import', [middlewareAuthenticator, userInitiator, ...userMiddlewares, setTimeoutMiddleware(60000)], async (req, res) => {
        // ... (vérifications de permissions existantes) ...
        const result = await importData(req.fields, req.files, req.me);
        if( result.success ){
            res.status(202).json(result);
        }else{
            res.status(500).json(result);
        }
    });


    engine.post('/api/model/generate', [middlewareAuthenticator, userInitiator, assistantGlobalLimiter, generateLimiter, setTimeoutMiddleware(30000)], async (req, res) => {
        // --- NOUVELLE LOGIQUE : Accepter le prompt ET un modèle existant ---
        const { prompt, history = [], existingModel } = req.fields;
        const user = req.me;
        const lang = req.query.lang || 'en';

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        try {
            const existingModelsCursor = modelsCollection.find({
                $or: [
                    { _user: user.username },
                    { _user: { $exists: false } }
                ]
            });
            const existingModels = await existingModelsCursor.toArray();
            const modelNames = existingModels.map(m => m.name);

            let finalPrompt = prompt; // Par défaut, on utilise le prompt de l'utilisateur

            if (existingModel && typeof existingModel === 'object') {
                // Si un modèle existant est fourni, on crée une instruction d'édition
                // C'est l'injonction d'édition que vous souhaitiez.
                logger.info(`[AI Edit] Génération d'une modification pour le modèle : ${existingModel.name}`);
                finalPrompt = `Based on the user's request, improve or modify the following JSON model definition. The user request is: "${prompt}".\n\nHere is the original JSON model to edit:\n${JSON.stringify(existingModel, null, 2)}`;
            } else {
                logger.info(`[AI Create] Génération d'un nouveau modèle depuis le prompt.`);
            }

            // On passe le prompt final (soit de création, soit d'édition) à l'IA
            const generatedModels = await openaiJobModel(lang, finalPrompt, history, modelNames);

            if (typeof(generatedModels) !== 'object' || !generatedModels.models) {
                console.error("La réponse de l'IA n'est pas un objet avec une clé 'models':", generatedModels);
                return res.status(500).json({ success: false, error: "Erreur de format de réponse de l'IA." });
            }

            res.status(200).json(generatedModels.models);

        } catch (error) {
            console.error("Error during AI model generation:", error);
            res.status(500).json({ error: "An error occurred while generating the model.", details: error.message });
        }
    });

    engine.put('/api/model/:id', [middlewareAuthenticator, userInitiator, setTimeoutMiddleware(15000)], async (req, res) => {
        const result = await editModel(req.me, req.params.id, req.fields);
        if( result.success){
            return res.status(result.statusCode || 200).json(result);
        }else{
            return res.status(result.statusCode || 500).json(result);
        }
    });

    engine.post('/api/data/restore', [throttle, middlewareAuthenticator, userInitiator, ...userMiddlewares, setTimeoutMiddleware(60000)], async (req, res) => {

        if (!((user?.roles || []).includes("admin"))) {
            return res.status(403).json({success: false, error: 'Cannot backup data. Contact an administrator to get back your data'})
        }

        try {
            await loadFromDump({username: req.query.restoredUser});
            res.status(200).json({success: true});
        } catch (e) {
            logger.error(e);
            res.status(500).json({success: false, error: e.message});
        }
    });

    engine.post('/api/data/dump', [throttle, middlewareAuthenticator, ...userMiddlewares, setTimeoutMiddleware(60000)], async (req, res) => {

        if (!((req.me?.roles || []).includes("admin"))) {
            return res.status(403).json({success: false, error: 'Cannot dump data.'})
        }

        try {
            if( typeof(req.query.restoredUser) === 'string' && req.query.restoredUser.length < 100 ) {
                await dumpUserData({username: req.query.restoredUser});
                res.status(200).json({success: true});
            }else{
                throw new Error("User restoredUser must be defined in the URL query params.")
            }
        } catch (e) {
            logger.error(e);
            res.status(500).json({success: false, error: e.message});
        }
    });

    engine.post('/api/data', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, ...userMiddlewares, setTimeoutMiddleware(15000)], async (req, res) => {
        const body = req.files ? req.fields : req.fields;
        const modelName = body.model; // Les données à insérer/mettre à jour (assurez-vous de valider et nettoyer ces données côté client et serveur !)
        const data = body.data || (body._data && JSON.parse(body._data));

        try {
            const model = await getModel(modelName, req.me);
            if( model.fields.some(f => f.type ==='password'))
                req.hideApiLogs = true;
            const json = await insertData(modelName, data, req.files, req.me);
            res.status(200).json(json);
        } catch (e) {
            res.status(400).json({ success: false, error: e.message });
        }
    });

    engine.post('/api/data/search', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, ...userMiddlewares, setTimeoutMiddleware(30000)], async (req, res) => {
        const { pack } = req.fields;

        try {
            const {data, count} = await searchData({query: {...req.query, model: req.fields.model || req.query.model, filter: req.fields.filter, pack}, user: req.me });

            if( req.query.attachment ) {
                res.attachment(req.query.attachment);
                res.json(data.map(d=>{
                    let fd = {...d};
                    Object.keys(d).forEach(di =>{
                        if (['_model', '_user'].includes(di)){
                            delete fd[di];
                        }
                    });
                    return fd;
                }));
            }else
            {
                res.json({data, count: count});
            }
        } catch (error) {
            logger.error(error);
            res.status(400).json({ success: false, error: error.message });
        }
    });

    engine.delete('/api/data/:ids', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, setTimeoutMiddleware(15000)], async (req, res) => {
        const ids = req.params.ids.split(',');
        const r = await deleteData(req.fields.model, ids, {}, req.me);
        if( r.error) {
            return res.status(r.statusCode || 400).json(r);
        }else{
            return res.status(r.statusCode || 200).json(r);
        }
    });

    engine.delete('/api/data', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, setTimeoutMiddleware(15000)], async (req, res) => {
        const r = await deleteData(req.fields.model, [], req.fields.filter, req.me);
        if( r.error) {
            return res.status(r.statusCode || 400).json(r);
        }else{
            return res.status(r.statusCode || 200).json(r);
        }
    });

    // --- Export Endpoint ---
    engine.post('/api/data/export', [middlewareAuthenticator, throttle, userInitiator, ...userMiddlewares, setTimeoutMiddleware(60000)], async (req, res) => {
        try {
            const results = await exportData({...req.fields, depth:req.query.depth, lang: req.query.lang}, req.me);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `export-${req.fields.models.join('-')}-${timestamp}.json`;

            if (!results.success) {
                res.status(400).json(results); // Renvoyer l'objet d'erreur complet
                return;
            }

            const dataToSerialize = req.query.withModels ? {data: results.data, models: results.models } : results.data;

            // --- La sérialisation est maintenant déléguée au worker ---
            const jsonString = await runImportExportWorker('stringify-json', { data: dataToSerialize });

            // On envoie directement la chaîne de caractères JSON, sans que Express ne la re-traite.
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.send(jsonString);

        } catch (error) {
            console.error("General Export Error:", error);
            logger?.error("General Export Error:", error);
            return res.status(500).json({ success: false, error: i18n.t('api.data.error', 'An error occurred while processing the request.') });
        }
    });

    engine.patch('/api/data', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {
        const filter = req.fields.filter;
        const hash = req.params.id; // Récupérer l'identifiant de la ressource à modifier
        const data = req.fields.data || (req.fields._data && JSON.parse(req.fields._data));
        const r = await patchData(req.fields.model, filter || hash, data, req.files, req.me);
        if (r.error) {
            res.status(400).json(r);
        } else {
            res.status(200).json(r);
        }
    });

    engine.put('/api/data', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {
        try {
            const filter = req.fields.filter;
            const hash = req.params.id; // Récupérer l'identifiant de la ressource à modifier
            const data = req.fields.data || (req.fields._data && JSON.parse(req.fields._data));
            const r = await editData(req.fields.model, filter || hash, data, req.files, req.me)
            if (r.error)
                res.status(400).json(r);
            else
                res.status(200).json(r);
        } catch (e) {
            res.status(500).json({error: e.message});
        }
    });

    engine.patch('/api/data/:id', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {
        const filter = req.fields.filter;
        const hash = req.params.id; // Récupérer l'identifiant de la ressource à modifier
        const data = req.fields.data || (req.fields._data && JSON.parse(req.fields._data));
        const r = await patchData(req.fields.model, filter || hash, data, req.files, req.me);
        if (r.error) {
            res.status(400).json(r);
        } else {
            res.status(200).json(r);
        }
    });

    engine.put('/api/data/:id', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {
        try {
            const filter = req.fields.filter;
            const hash = req.params.id; // Récupérer l'identifiant de la ressource à modifier
            const data = req.fields.data || (req.fields._data && JSON.parse(req.fields._data));
            const r = await editData(req.fields.model, filter || hash, data, req.files, req.me)
            if (r.error)
                res.status(400).json(r);
            else
                res.status(200).json(r);
        } catch (e) {
            res.status(500).json({error: e.message});
        }
    });

    engine.get('/api/model', [throttle, middlewareAuthenticator, userInitiator,middlewareLogger], async (req, res) => {

        // get by name
        try {
            const modelName = req.query.name; // Récupérer le nom du modèle depuis les paramètres de la requête
            if (!modelName) {
                return res.status(400).json({error: "Le paramètre 'name' est requis."});
            }

            if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && !await hasPermission(["API_ADMIN", "API_GET_MODEL"], req.me) && !await hasPermission("API_GET_MODEL_"+modelName, req.me)){
                return res.json({success: false, error: i18n.t('api.permission.getModel')})
            }

            const model = await getModel(modelName, req.me);
            res.json(model);
        } catch (error) {
            logger.error(error);
            res.status(404).json({ success: false, error: error.message });
        }
    });
    engine.get('/api/models', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {

        if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && !await hasPermission(["API_ADMIN", "API_GET_MODELS"], req.me)){
            return res.status(403).json({success: false, error: i18n.t('api.permission.getModels')})
        }

        // get by name
        try {
            let models = await modelsCollection.find({$or: [{_user: {$exists: false}}]})
                .sort({_user:-1, _id: 1 }).limit(maxModelsPerUser).toArray();
            models = models
                .concat(
                    await modelsCollection.find({$or: [{_user: req.me._user}, {_user: req.me.username}]})
                        .sort({_user:-1, _id: 1 })
                        .limit(maxModelsPerUser).toArray());
            res.json(models);
        } catch (error) {
            console.log(error);
            logger.error(error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    engine.post('/api/model', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, ...userMiddlewares], async (req, res) => {

        if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && !await hasPermission(["API_ADMIN", "API_ADD_MODEL"], req.me) ){
            return res.status(403).json({success: false, error: i18n.t('api.permission.addModel')})
        }
        try {
            const modelData = req.fields;
            validateModelStructure(modelData);


            const existingModel = await modelsCollection.findOne({name: modelData.name, $and: [{_user: {$exists: true}}, {$or: [{_user: req.me._user}, {_user: req.me.username}]}] });
            if (existingModel) {
                /*await modelsCollection.updateOne({name: modelData.name,_user: req.query._user }, { $set: modelData });
                res.status(200).json({updated: true});*/
                res.status(400).json({ success: false, msg: i18n.t('api.model.alreadyExists') });
            }else {
                modelData._user = req.me._user || req.me.username;

                const count = await modelsCollection.count({
                    $and: [{_user: {$exists: true}}, {_user: req.me.username}]
                });
                if( count < maxModelsPerUser) {
                    if(await engine.userProvider.hasFeature(req.me, 'indexes')){
                        for (const field of modelData.fields) {
                            if( field.index ) {
                                await datasCollection.createIndex({[field.name]: 1}, {
                                    partialFilterExpression: {
                                        _model: modelData.name,
                                        _user: req.me.username
                                    }
                                });
                            }
                        }
                    }
                    const result = await modelsCollection.insertOne(modelData);

                    const model = await modelsCollection.findOne({_id: result.insertedId });
                    triggerWorkflows(model, req.me, 'ModelAdded').catch(workflowError => {
                        logger.error(`Erreur asynchrone lors du déclenchement des workflows pour ${model._model} ID ${model._id}:`, workflowError);
                    });

                    modelsCache.del(req.me.username+'@@'+modelData.name);

                    res.status(201).json({success: !!result.insertedId, insertedId: result.insertedId}); // 201 Created
                }else{
                    res.status(400).json({success: false, msg: i18n.t('api.model.maxModels')});
                }
            }
        } catch (error) {
            logger.error(error);
            res.status(400).json({success: false, error: error.message});
        }
    });

    engine.post('/api/models/import', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, ...userMiddlewares], async (req, res) => {

        if( isLocalUser(req.me) && !await hasPermission(["API_ADMIN","API_IMPORT_MODEL"], req.me)){
            return res.status(403).json({success: false, error: i18n.t('api.permission.importModels')})
        }
        try {
            const modelsToImport = await modelsCollection.find({name: { $in: req.fields.models }, _user: { $exists: false } }).toArray();
            const ids = [];

            const getPromise = () => {
                return Promise.allSettled(modelsToImport.map(model => modelsCollection.findOne({name: model.name, _user: req.me.username }).then(m => {
                    if( !m) {
                        return modelsCollection.insertOne({...model, _id: undefined, locked: undefined, fields: model.fields.map(f => ({...f, locked: undefined})), _user: req.me.username}).then(r =>{
                            if( r.insertedId ) ids.push(model.name);
                        })
                    }
                    return Promise.reject();
                })));
            }
            const install = !!req.fields.install;
            if( install && (isDemoUser(req.me) && Config.Get("useDemoAccounts")) ){

                await datasCollection.deleteMany({ _user: req.me.username});
                await modelsCollection.deleteMany({ _user: req.me.username});
                const files = await filesCollection.find({ mainUser: req.me.username}).toArray();
                try {
                    files.forEach(file =>removeFile(file.guid, req.me));
                } catch (e) {

                }

                await cancelAlerts(req.me);

                await getPromise();
                event_trigger('jobAddUserData', req.me.username);
            }else{
                await getPromise();
            }

            if( ids.length > 0 )
                res.status(201).json({ success: true, imported: ids }); // 201 Created
            else
                res.status(500).json({ success: false });
        } catch (error) {
            logger.error(error);
            res.status(400).json({success: false, error, badRequest: true});
        }
    });

    engine.delete('/api/model', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {

        const modelName = req.query.name;
        if (!modelName) {
            return res.status(400).json({error: "Le paramètre 'name' est requis."});
        }

        if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && (
            !await hasPermission(["API_ADMIN","API_DELETE_MODEL","API_DELETE_MODEL_"+modelName], req.me) ||
            await hasPermission(["API_DELETE_MODEL_NOT_"+modelName], req.me))){
            return res.status(403).json({success: false, error: i18n.t( "api.permission.deleteModel", { model: modelName})})
        }

        // delete the model (statut archivage + date butoire)
        // error otherwise
        try {
            const model = await modelsCollection.findOne({name: modelName, $and: [{_user: {$exists: true}}, {$or: [{_user: req.me._user}, {_user: req.me.username}]}] });
            if (!model) {
                return res.status(404).json({error: i18n.t( "api.model.notFound", { model: modelName})});
            }

            if( await engine.userProvider.hasFeature(req.me, 'indexes') ) {
                const indexes = await datasCollection.indexes();
                for (const index of indexes) {
                    if (index.partialFilterExpression?._model === model.name &&
                        index.partialFilterExpression?._user === req.me.username) {
                        await datasCollection.dropIndex(index.name);
                    }
                }
            }

            const filter=                 {name: modelName, $and: [{_user: {$exists: true}}, {$or: [{_user: req.me._user}, {_user: req.me.username}]}]};

            const modelDeleted = await modelsCollection.findOne(filter);
            triggerWorkflows(modelDeleted, req.me, 'ModelDeleted').catch(workflowError => {
                logger.error(`Erreur asynchrone lors du déclenchement des workflows pour ${modelDeleted._model} ID ${modelDeleted._id}:`, workflowError);
            });

            modelsCache.del(req.me.username+'@@'+model.name);

            const result = await modelsCollection.deleteOne(filter);
            if( result )
                res.status(200).json({success: true});
            else
                res.status(500).json({success: false, message: i18n.t('api.model.deleteFailed')});
        } catch (error) {
            // ... (gestion des erreurs)
            logger.error(error);
        }
    });
    engine.patch('/api/model/:modelId/renameField', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger], async (req, res) => {

        try {
            const modelId = req.params.modelId;
            const { oldFieldName, newFieldName } = req.fields;

            // Basic validation
            if (!oldFieldName || !newFieldName) {
                return res.status(400).json({ error: '`oldFieldName` and `newFieldName` are required.' });
            }

            if( ["_hash", "_id", "_model", "_user"].includes(newFieldName) ){
                return res.status(400).json({ error: 'Reserved field name : ' + newFieldName });
            }

            // Find the model
            const model = await modelsCollection.findOne({ _id: new ObjectId(modelId) });
            if (!model) {
                return res.status(404).json({ error: i18n.t('api.model.notFound', { model: modelId }) });
            }

            if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && (
                !await hasPermission(["API_ADMIN", "API_EDIT_MODEL", "API_EDIT_MODEL_"+model.name], req.me) ||
                await hasPermission(["API_EDIT_MODEL_NOT_"+model.name], req.me))){
                return res.status(403).json({success: false, error: i18n.t('api.permission.editModel')})
            }

            // Check if old field exists
            const oldField = model.fields.find(f => f.name === oldFieldName);
            if (!oldField) {
                return res.status(404).json({ error: `Field '${oldFieldName}' not found in the model.` });
            }
            const newField = model.fields.find(f => f.name === newFieldName);
            if (newField) {
                return res.status(404).json({ error: `A Field with the name '${newFieldName}' already exist in the model.` });
            }
            const result = await modelsCollection.updateOne({ _id: new ObjectId(modelId), 'fields.name': oldFieldName }, { $set: { 'fields.$.name': newFieldName } })

            if (result.modifiedCount !== 1)
                return res.status(404).json({ error: i18n.t('api.model.notFound', {model: model.name})});

            const collection = await getCollectionForUser(req.me);

            await collection.updateMany(
                { _model: model.name },
                { $rename: { [oldFieldName]: newFieldName } }
            );

            const set = {};
            model.fields.forEach(f => {
                if( f.name === oldFieldName ){
                    set[f.name] = newFieldName;
                }
            })
            await modelsCollection.updateOne({ _id: new ObjectId(modelId) }, { $set: set });

            modelsCache.del(req.me.username+'@@'+model.name);

            res.json({ success: true, message: `Field '${oldFieldName}' renamed to '${newFieldName}' in model '${model.name}'.` });
        } catch (error) {
            logger.error(error);
            res.status(500).json({ error: 'An error occurred while renaming the field.' });
        }
    });


    // Endpoint pour calculer la valeur d'UN KPI spécifique par son ID
    engine.get('/api/kpis/calculate/:id', [throttle, middlewareAuthenticator, userInitiator], async (req, res) => {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Invalid KPI ID format' });
        }

        let kpiDef; // Déclarer en dehors pour e accessible dans le catch final

        try { // <--- TRY PRINCIPAL

            // 1. Récupérer la définition du KPI
            try {
                kpiDef = await datasCollection.findOne({ _id: new ObjectId(id), _model: 'kpi', _user: req.me._user || req.me.username });
                if (!kpiDef) {
                    return res.status(404).json({ success: false, error: 'KPI definition not found' });
                }
            } catch (dbError) {
                console.error(">>> ERREUR LORS DE findOne KPI:", dbError); // Log spécifique
                throw dbError; // Relancer pour être attrapé par le catch principal
            }

            // ---> TODO: Vérifier droits sur targetModel

            // 2. Construire le pipeline
            const pipeline = [];
            let matchFilter = { _model: kpiDef.targetModel, $or: [{_user: req.me._user}, {_user: req.me.username}] };
            let totalCount = null;

            // Calcul du totalCount
            if (kpiDef.showTotal || kpiDef.showPercentTotal) {
                try {
                    const parsedTotalMatch = kpiDef.totalMatchFormula || {}; // Assurer un objet vide si null/undefined
                    const totalPipeline = [
                        { "$match": { ...matchFilter, ...parsedTotalMatch } },
                        { "$count": 'count' }
                    ];
                    const result = await datasCollection.aggregate(totalPipeline).toArray();
                    totalCount = result.length > 0 ? result[0]['count'] : 0;
                } catch (totalError) {
                    if (totalError instanceof SyntaxError) {
                        console.error(`>>> ERREUR JSON.parse (totalMatchFormula) pour KPI ${id}:`, kpiDef.totalMatchFormula, totalError);
                    } else {
                        console.error(`>>> ERREUR Aggregate (totalCount) pour KPI ${id}:`, totalError);
                    }
                    throw totalError; // Relancer
                }
            }

            // Filtre principal
            if (kpiDef.matchFormula) {
                try {
                    const parsedMatch = kpiDef.matchFormula || {}; // Assurer un objet vide
                    matchFilter = { ...matchFilter, ...parsedMatch };
                } catch (matchError) {
                    console.error(`>>> ERREUR JSON.parse (matchFormula) pour KPI ${id}:`, kpiDef.matchFormula, matchError);
                    throw matchError; // Relancer
                }
            }
            pipeline.push({ $match: matchFilter });

            // 3. Stage d'agrégation principal
            let resultValue = 0;
            const resultFieldName = 'calculatedValue';

            try { // <--- Try spécifique pour l'agrégation principale
                if (kpiDef.aggregationType === 'count') {
                    pipeline.push({ $count: resultFieldName });
                    const result = await datasCollection.aggregate(pipeline).toArray();
                    resultValue = result.length > 0 ? result[0][resultFieldName] : 0;

                } else if (['sum', 'avg', 'min', 'max'].includes(kpiDef.aggregationType)) {
                    if (!kpiDef.aggregationField) {
                        return res.status(400).json({ success: false, error: `aggregationField is required for type ${kpiDef.aggregationType}` });
                    }
                    const mongoOperator = `$${kpiDef.aggregationType}`;
                    const targetField = `$${kpiDef.aggregationField}`;

                    pipeline.push({
                        $group: {
                            _id: null,
                            [resultFieldName]: { [mongoOperator]: targetField }
                        }
                    });
                    const result = await datasCollection.aggregate(pipeline).toArray();
                    resultValue = result.length > 0 ? result[0][resultFieldName] : 0;
                    if (kpiDef.aggregationType === 'avg' && result.length === 0) {
                        resultValue = 0;
                    }
                } else {
                    return res.status(400).json({ success: false, error: `Unsupported aggregationType: ${kpiDef.aggregationType}` });
                }
            } catch (aggError) {
                console.error(`>>> ERREUR Aggregate (principal) pour KPI ${id}:`, aggError); // Log spécifique
                throw aggError; // Relancer
            }

            // 4. Retourner la valeur
            res.json({ success: true, value: resultValue, totalCount: totalCount });

        } catch (error) { // <--- CATCH PRINCIPAL
            // --- Log de l'erreur BRUTE interceptée ---
            console.log('--- CATCH PRINCIPAL - RAW ERROR OBJECT ---');
            console.log('Type:', typeof error);
            console.log('Instance of Error:', error instanceof Error);
            console.log('Error Object:', error); // Affiche la structure brute
            console.log('Error Message:', error?.message);
            console.log('Error Stack:', error?.stack);
            console.log('--- END CATCH PRINCIPAL ---');
            // --- Fin Log ---

            // Tentative de log via le logger standard (qui peut encore échouer si l'erreur est vraiment étrange)
            try {
                logger.error(`KPI Calculation Error for ID ${id} (Caught in main handler):`, error);
            } catch (loggerError) {
                console.error(">>> ERREUR DANS logger.error LUI-MEME:", loggerError);
            }

            // Réponse d'erreur générique
            const errorMsg = kpiDef ? `Internal server error during KPI calculation for '${kpiDef.name}'` : 'Internal server error during KPI calculation';
            res.status(500).json({ success: false, error: errorMsg });
        }
    });
    /**
     * Route: POST /api/charts/aggregate
     * Description: Aggregates data for chart generation based on provided configuration.
     * Body: {
     *   title: string,          // Chart title (not directly used in aggregation)
     *   model: string,          // The name of the model to query
     *   type: string,           // Chart type ('bar', 'line', 'pie', 'doughnut')
     *   xAxis?: string,          // Field for X-axis (for bar/line charts)
     *   yAxis?: string,          // Field for Y-axis (numeric, for bar/line charts)
     *   groupBy?: string,        // Field for grouping (enum, for pie/doughnut charts)
     *   aggregationType?: string // Aggregation type for Y-axis ('sum', 'avg', 'count', etc.)
     * }
     * Returns: Array of aggregated data points (e.g., [{ label: '...', value: ... }]) or an error.
     */
    // Dans server/src/modules/data.js, modifiez la route POST /api/charts/aggregate

    // Dans server/src/modules/data.js, modifiez la route POST /api/charts/aggregate
    // C:/Dev/hackersonline-engine/server/src/modules/data.js

    // ... (autres imports et code)

    engine.post('/api/charts/aggregate', [throttle, middlewareAuthenticator, userInitiator, ...userMiddlewares, setTimeoutMiddleware(15000)], async (req, res) => {
        // --- Récupérer groupByLabelField ---
        const { model: modelName, type, xAxis, yAxis, groupBy, aggregationType, groupByLabelField, filter: chartFilter } = req.fields;

        // --- Validation (inchangée) ---
        const isGroupingChart = ['pie', 'doughnut'].includes(type);
        if (!modelName || !type) {
            return res.status(400).json({ error: '`model` and `type` are required.' });
        }
        if (isGroupingChart && !groupBy) {
            return res.status(400).json({ error: '`groupBy` is required for pie/doughnut charts.' });
        }
        if (!isGroupingChart && !xAxis) {
            return res.status(400).json({ error: '`xAxis` is required for bar/line charts.' });
        }
        // Default aggregationType if not provided
        const effectiveAggregationType = aggregationType || 'count';

        // --- MODIF: 'value' requiert aussi yAxis ---
        // Define requiresYAxis based on the effective aggregation type
        const requiresYAxis = effectiveAggregationType && !['count'].includes(effectiveAggregationType); // 'value' requires yAxis

        // Validate yAxis presence if aggregation requires it
        if (requiresYAxis && !yAxis) {
            return res.status(400).json({ error: `\`yAxis\` is required for aggregation type '${effectiveAggregationType}'.` });
        }
        // --- FIN MODIF ---


        try {
            // --- Check Model Existence (inchangé) ---
            const modelDefinition = await modelsCollection.findOne({
                name: modelName,
                $or: [{ _user: { $exists: false } }, { _user: req.me._user || req.me.username }]
            });
            if (!modelDefinition) {
                return res.status(404).json({ error: `Model '${modelName}' not found or not accessible.` });
            }

            // --- Trouver la définition du champ groupBy ET vérifier s'il est multiple (inchangé) ---
            const groupByFieldDefinition = modelDefinition.fields.find(f => f.name === groupBy);
            const isRelationGroupBy = isGroupingChart && groupByFieldDefinition?.type === 'relation';
            const isMultipleRelation = isRelationGroupBy && groupByFieldDefinition?.multiple === true;

            // --- Build Aggregation Pipeline ---
            const collection = await getCollectionForUser(req.me);

            // --- MODIFICATION ICI pour inclure chartFilter ---
            let initialMatchStage = { $and : [{
                _model: modelName},{
                _user: req.me.username
            }]};
            if (chartFilter && typeof chartFilter === 'object' && Object.keys(chartFilter).length > 0) {
                // Fusionner le filtre fourni avec le filtre de base
                // Assurez-vous que chartFilter est bien "sanitized" ou construit de manière sécurisée
                // pour éviter les injections NoSQL si une partie est générée dynamiquement.
                // La fonction cleanFilter que vous avez pourrait être utile ici si le filtre vient d'une UI complexe.
                initialMatchStage = { $and: [...initialMatchStage['$and'], { $expr: chartFilter }] };
                logger.debug(`[charts/aggregate] Applying custom filter:`, util.inspect(initialMatchStage, false, 8, true));
            }


            const pipeline = [{ $match: initialMatchStage }];

            // --- Validation des opérateurs d'agrégation ---
            const validAggregations = {
                // count is handled separately by $sum: 1
                sum: '$sum',
                avg: '$avg',
                min: '$min',
                max: '$max'
                // median needs special handling later
                // *** AJOUT: 'value' sera géré par $first (ou $last) ***
            };
            const mongoAggregationOperator = validAggregations[effectiveAggregationType];

            // *** MODIF: Mettre à jour la vérification pour accepter 'value' ***
            if (effectiveAggregationType && !mongoAggregationOperator && !['median', 'value', 'count'].includes(effectiveAggregationType)) {
                return res.status(400).json({ error: `Unsupported aggregationType: ${effectiveAggregationType}` });
            }
            // La validation de yAxis est déjà faite plus haut avec requiresYAxis


            // --- Construction du stage $group ---
            let groupStage = { _id: null, value: {} };
            let idFieldForGrouping = null;

            if (isGroupingChart) {
                // --- Logique pour Pie/Doughnut (Relation ou autre) ---
                if (isRelationGroupBy) {
                    // ... (logique existante pour gérer les relations simples et multiples, inchangée) ...
                    // --- LOGIQUE EXISTANTE POUR RELATION SIMPLE/MULTIPLE ---
                    const relatedModelName = groupByFieldDefinition.relation;
                    if (!relatedModelName) { return res.status(400).json({ error: `Relation model not defined for groupBy field '${groupBy}'.` }); }
                    const relatedModelDef = await modelsCollection.findOne({ name: relatedModelName, $or: [{ _user: { $exists: false } }, { _user: req.me._user || req.me.username }] });
                    if (!relatedModelDef && groupByLabelField) { logger.warn(`[charts/aggregate] Related model '${relatedModelName}' not found, but proceeding with specified groupByLabelField '${groupByLabelField}'.`); }
                    else if (!relatedModelDef && !groupByLabelField) { return res.status(400).json({ error: `Related model '${relatedModelName}' not found and no groupByLabelField specified.` }); }
                    let labelField = groupByLabelField;
                    if (!labelField && relatedModelDef) {
                        const defaultLabelField = relatedModelDef.fields.find(f => f.asMain && ['string', 'string_t', 'enum'].includes(f.type))?.name || relatedModelDef.fields.find(f => f.name === 'name' && ['string', 'string_t', 'enum'].includes(f.type))?.name || relatedModelDef.fields.find(f => f.name === 'title' && ['string', 'string_t', 'enum'].includes(f.type))?.name;
                        if (defaultLabelField) { labelField = defaultLabelField; logger.debug(`[charts/aggregate] Using default label field '${labelField}' for relation '${relatedModelName}'.`); }
                    }
                    if (!labelField) labelField = '_id';

                    if (isMultipleRelation) {
                        pipeline.push({ $unwind: { path: `$${groupBy}`, preserveNullAndEmptyArrays: true } });
                        pipeline.push({ $addFields: { [`${groupBy}_oid`]: { $cond: { if: { $eq: [{ $type: `$${groupBy}` }, "string"] }, then: { $toObjectId: `$${groupBy}` }, else: `$${groupBy}` } } } });
                        pipeline.push({ $lookup: { from: collection.collectionName, localField: `${groupBy}_oid`, foreignField: '_id', as: 'relatedDoc' } });
                        pipeline.push({ $unwind: { path: '$relatedDoc', preserveNullAndEmptyArrays: true } });
                        idFieldForGrouping = { $ifNull: [`$relatedDoc.${labelField}`, null] };
                    } else {
                        pipeline.push({ $addFields: { [`${groupBy}_oid`]: { $cond: { if: { $eq: [{ $type: `$${groupBy}` }, "string"] }, then: { $toObjectId: `$${groupBy}` }, else: `$${groupBy}` } } } });
                        pipeline.push({ $lookup: { from: collection.collectionName, localField: `${groupBy}_oid`, foreignField: '_id', as: 'relatedDoc' } });
                        pipeline.push({ $unwind: { path: '$relatedDoc', preserveNullAndEmptyArrays: true } });
                        idFieldForGrouping = { $ifNull: [`$relatedDoc.${labelField}`, null] };
                    }
                    // --- FIN LOGIQUE RELATION ---
                } else {
                    // --- Logique pour Enum/String/Date etc. (inchangée) ---
                    idFieldForGrouping = `$${groupBy}`;
                }

                // --- Définir l'opération d'agrégation pour la valeur ---
                if (effectiveAggregationType === 'count') {
                    groupStage.value = { '$sum': 1 };
                }
                // *** AJOUT: Gérer le cas 'value' ***
                else if (effectiveAggregationType === 'value') {
                    // Utiliser $first pour prendre la valeur du champ yAxis du premier document du groupe.
                    // Note: Si l'ordre est important, un $sort peut être nécessaire AVANT le $group.
                    groupStage.value = { $first: `$${yAxis}` };
                }
                // *** FIN AJOUT ***
                else if (requiresYAxis) { // Pour sum, avg, min, max
                    // Convertir yAxis en nombre avant l'agrégation
                    pipeline.push({
                        $addFields: { numericYValue: { $cond: { if: { $ne: [`$${yAxis}`, null] }, then: { $toDouble: `$${yAxis}` }, else: null } } }
                    });
                    groupStage.value = { [mongoAggregationOperator]: '$numericYValue' };
                }
                // Note: 'median' n'est pas géré pour les graphiques de groupement dans ce code

            } else {
                // --- Logique pour Bar/Line ---
                idFieldForGrouping = `$${xAxis}`;

                if (effectiveAggregationType === 'count') {
                    groupStage.value = { '$sum': 1 };
                }
                else if (effectiveAggregationType === 'value') {
                    // Utiliser $first pour prendre la valeur du champ yAxis du premier document du groupe.
                    groupStage.value = { $first: `$${yAxis}` };
                    // Note: Si l'ordre est important (ex: dernier point d'une série temporelle),
                    // un $sort sur le champ date/heure AVANT $group et utiliser $last ici serait nécessaire.
                }
                else if (requiresYAxis) { // Pour sum, avg, min, max, median
                    pipeline.push({
                        $addFields: { numericYValue: { $cond: { if: { $ne: [`$${yAxis}`, null] }, then: { $toDouble: `$${yAxis}` }, else: null } } }
                    });

                    if (effectiveAggregationType === 'median') {
                        groupStage.valuesForMedian = { $push: '$numericYValue' }; // Collecter pour median
                        delete groupStage.value; // Supprimer le placeholder 'value'
                    } else {
                        groupStage.value = { [mongoAggregationOperator]: '$numericYValue' };
                    }
                }
            }

            // --- Assembler et exécuter le pipeline ---
            groupStage._id = idFieldForGrouping; // Assigner le champ de groupement
            pipeline.push({ $group: groupStage });

            // --- Handle Median Calculation (if applicable, inchangé) ---
            if (!isGroupingChart && effectiveAggregationType === 'median') {
                // ... (logique existante pour calculer la médiane après le $group, inchangée) ...
                pipeline.push(
                    { $project: { _id: 1, sortedValues: { $sortArray: { input: "$valuesForMedian", sortBy: 1 } } } },
                    { $addFields: { count: { $size: "$sortedValues" }, midIndex: { $floor: { $divide: [{ $subtract: [{ $size: "$sortedValues" }, 1] }, 2] } } } },
                    { $addFields: { value: { $cond: { if: { $eq: ["$count", 0] }, then: 0, else: { $cond: { if: { $eq: [{ $mod: ["$count", 2] }, 1] }, then: { $arrayElemAt: ["$sortedValues", "$midIndex"] }, else: { $avg: [ { $arrayElemAt: ["$sortedValues", "$midIndex"] }, { $arrayElemAt: ["$sortedValues", { $add: ["$midIndex", 1] }] } ] } } } } } } }
                );
            }


            // Projection finale pour formater la sortie (inchangée)
            pipeline.push({
                $project: {
                    _id: 0,
                    label: { $ifNull: ['$_id', i18n.t('charts.labelNull', '(Non défini)')] },
                    value: '$value' // Le champ 'value' contient maintenant soit l'agrégat, soit la valeur brute ($first)
                }
            });

            // Tri final par label (inchangé)
            const sort = typeof(req.query.sort) === 'string' ? req.query.sort : { _id: -1 };
            pipeline.push({ $sort: sort });
            pipeline.push({ $limit: 500 });

            console.log("[charts/aggregate] Pipeline:", util.inspect(pipeline, false, 8, true)); // Garder ce log pour vérifier

            // --- Execute Aggregation ---
            const results = await collection.aggregate(pipeline).toArray();
            const finalResults = results;

            // --- Send Response ---
            res.json(finalResults);

        } catch (error) {
            // ... (gestion des erreurs existante, inchangée) ...
            console.error("Error during chart aggregation:", error);
            logger.error("Error during chart aggregation:", error);
            if (error.message.includes('relation model not defined')) { return res.status(400).json({ error: error.message }); }
            if (error.codeName === 'TypeMismatch' || error.message.includes('$toDouble') || error.message.includes('must be numeric')) {
                // *** MODIF: S'assurer que yAxis est bien le champ problématique pour 'value' ***
                const problematicField = requiresYAxis ? yAxis : (isGroupingChart ? groupBy : xAxis);
                return res.status(400).json({ error: `Field type mismatch during aggregation. Ensure '${problematicField}' contains compatible data for the operation. Details: ${error.message}` });
            }
            res.status(500).json({ error: 'An error occurred during data aggregation.' });
        }
    });


    engine.post('/api/data/removeFromPack', [throttle, middlewareAuthenticator, userInitiator, ...userMiddlewares], async (req, res) => {
        if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && !await hasPermission(["API_ADMIN", "API_CREATE_PACK"], req.me)){
            return res.status(403).json({success: false, error: i18n.t('api.permission.createPack')})
        }
        const { itemIds } = req.fields;
        if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every(isObjectId)) { // Assurez-vous que isObjectId est importé/défini
            return res.status(400).json({ success: false, error: 'itemIds must be a non-empty array of valid ObjectIds.' });
        }
        const objectIds = itemIds.map(id => new ObjectId(id));
        const collection = await getCollectionForUser(req.me); // Obtenir la collection de l'utilisateur

        const results = await collection.find({
            _id: { $in: objectIds },
            _user: req.me._user || req.me.username
        }).toArray();
        const result = await collection.deleteMany(
            {
                _hash: { $in: results.map(r => r._hash) },
                _pack: { $exists: true },
                _user: req.me._user || req.me.username
            }
        );

        if (result.deletedCount > 0) {
            res.json({ success: true, modifiedCount: result.deletedCount });
        } else {
            // Gérer le cas où aucun document n'a été modifié (peut-être qu'ils n'avaient pas de _pack)
            res.json({ success: true, modifiedCount: 0, message: "No items found or modified." });
        }
    })

    // GET /api/packs - Liste les packs pour la galerie depuis la collection "packs"
    engine.get('/api/packs', [throttle, middlewareAuthenticator, userInitiator], async (req, res) => {
        try {
            // On accède directement à la collection 'packs'
            const packsCollection = getCollection('packs');
            const { sortBy = '_updatedAt', order = -1 } = req.query; // Ajout du tri pour la galerie

            const sortOptions = {};
            // Validation simple du champ de tri pour la sécurité
            if (['name', 'stars', '_createdAt', '_updatedAt'].includes(sortBy)) {
                sortOptions[sortBy] = parseInt(order, 10) === 1 ? 1 : -1;
            } else {
                sortOptions['_updatedAt'] = -1; // Tri par défaut
            }

            // On ne renvoie pas le champ 'datas' pour alléger la réponse de la liste
            const packs = await packsCollection.find({}, {
                projection: { datas: 0 }
            }).sort(sortOptions).toArray();

            res.json(packs);
        } catch (error) {
            logger.error('[GET /api/packs] Error fetching packs:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch packs.' });
        }
    });

    // GET /api/packs/:id - Récupère les détails complets d'un pack
    engine.get('/api/packs/:id', [throttle, middlewareAuthenticator, userInitiator], async (req, res) => {
        const { id } = req.params;
        if (!isObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid pack ID format.' });
        }

        try {
            const packsCollection = getCollection('packs');
            const pack = await packsCollection.findOne({ _id: new ObjectId(id) });

            if (!pack) {
                return res.status(404).json({ success: false, error: 'Pack not found.' });
            }

            // On retourne le pack complet, incluant les données pour la vue de détail
            res.json(pack);
        } catch (error) {
            logger.error(`[GET /api/packs/${id}] Error fetching pack details:`, error);
            res.status(500).json({ success: false, error: 'Failed to fetch pack details.' });
        }
    });

    // --- Endpoint DELETE pour supprimer un pack ---
    engine.delete('/api/packs/:packName', [throttle, middlewareAuthenticator, userInitiator], async (req, res) => {
        const { packName } = req.params;
        const { model } = req.query; // Récupmodèle depuis les query params
        const user = req.me;

        // --- Validation ---
        if (!packName) {
            return res.status(400).json({ success: false, error: 'Pack name is required in URL path.' });
        }
        if (!model) {
            return res.status(400).json({ success: false, error: 'Model query parameter is required.' });
        }

        try {
            // --- Vérification des permissions (Adaptez selon vos règles) ---
            // Exemple : Seul l'admin ou le propriétaire peut supprimer
            const isAdmin = await hasPermission(["API_ADMIN", "API_DELETE_PACK"], user); // Assurez-vous que hasPermission est bien défini et fonctionnel
            const isOwner = true; // Pour cet exemple, on suppose que l'utilisateur est propriétaire. Adaptez la logique si nécessaire.

            if (user.username !== 'demo' && !isAdmin && !isOwner) { // Adaptez cette condition
                return res.status(403).json({ success: false, error: i18n.t('api.permission.deletePack', 'Permission denied to delete this pack.') });
            }

            // --- Logique de suppression ---
            const collection = await getCollectionForUser(user); // Obtenir la collection spécifique à l'utilisateur

            const deleteFilter = {
                _pack: packName,
                _model: model,
                _user: user.username // Assurer que l'utilisateur ne supprime que ses propres données de pack
            };

            const result = await collection.deleteMany(deleteFilter);

            if (result.deletedCount > 0) {
                logger.info(`User ${user.username} deleted ${result.deletedCount} items from pack '${packName}' for model '${model}'.`);
                res.json({ success: true, deletedCount: result.deletedCount });
            } else {
                logger.warn(`User ${user.username} tried to delete pack '${packName}' for model '${model}', but no matching items found or deletion failed.`);
                // Renvoyer succès même si rien n'a été trouvé peut être acceptable
                res.json({ success: true, deletedCount: 0, message: 'No items found for this pack and model belonging to the user.' });
                // Ou renvoyer une erreur 404 si le pack n'existe pas du tout pour cet utilisateur/modèle
                // return res.status(404).json({ success: false, error: 'Pack not found for this user and model.' });
            }

        } catch (error) {
            logger.error(`Error deleting pack '${packName}' for model '${model}' by user ${user.username}:`, error);
            res.status(500).json({ success: false, error: 'An internal server error occurred.' });
        }
    });

    engine.post('/api/data/addToPack', [throttle, middlewareAuthenticator, userInitiator,...userMiddlewares], async (req, res) => {
        const { packName, itemIds } = req.fields;
        const user = req.me;

        if( !(isDemoUser(req.me) && Config.Get("useDemoAccounts")) && isLocalUser(req.me) && !await hasPermission(["API_ADMIN", "API_CREATE_PACK"], req.me)){
            return res.status(403).json({success: false, error: i18n.t('api.permission.createPack')})
        }
        // --- Validation ---
        if (!packName || typeof packName !== 'string' || packName.trim() === '') {
            return res.status(400).json({ success: false, error: 'Pack name is required and must be a non-empty string.' });
        }
        if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every(isObjectId)) { // Assurez-vous que isObjectId est importé/défini
            return res.status(400).json({ success: false, error: 'itemIds must be a non-empty array of valid ObjectIds.' });
        }

        // --- Logique Métier ---
        try {
            const collection = await getCollectionForUser(user); // Récupère la collection de l'utilisateur
            const objectIds = itemIds.map(id => new ObjectId(id)); // Convertit les strings en ObjectIds

            // Met à jour le champ _pack pour les documents sélectionnés appartenant à l'utilisateur
            const copyData = await collection.find({
                _id: { $in: objectIds },
                _user: user.username
            }).toArray();


            const result = await collection.insertMany(copyData.map(c => ({...c, _id: undefined, _pack: packName})));
            res.json({ success: true, modifiedCount: result.insertedCount, matchedCount: result.insertedCount });

        } catch (error) {
            logger.error(`Error adding items to pack for user ${user.username}, pack '${packName}':`, error);
            res.status(500).json({ success: false, error: 'An internal server error occurred.' });
        }
    });


    // --- NOUVEL ENDPOINT D'INSTALLATION DE PACK ---
    engine.post('/api/packs/:id/install', [throttle, middlewareAuthenticator, userInitiator, setTimeoutMiddleware(60000)], async (req, res) => {
        const { id } = req.params;
        const user = req.me;
        const lang   = req.query.lang;

        if (!isObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid pack ID format.' });
        }

        try {
            // Vérification des permissions
            if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_INSTALL_PACK"], user)) {
                return res.status(403).json({ success: false, error: i18n.t('api.permission.installPack') });
            }

            const result = await installPack(id, user, lang);

            if (result.success) {
                res.status(200).json({ success: true, message: `Pack installed successfully.`, summary: result.summary });
            } else if (!result.success && !result.modifiedCount) {
                res.status(200).json({ success: true, message: `No data to insert.`, summary: result.summary });
            } else {
                res.status(400).json({ success: false, error: 'Pack installation had errors.', errors: result.errors, summary: result.summary });
            }

        } catch (error) {
            logger.error(`[POST /api/packs/${id}/install] Critical error:`, error);
            res.status(500).json({ success: false, error: error.message || 'An internal server error occurred.' });
        }
    });
    /*
    engine.post('/api/packs/install', [throttle, middlewareAuthenticator, userInitiator, ...userMiddlewares], async (req, res) => {

        const { pack } = req.fields;
        const initialModelName = req.query.model; // The starting model
        const user = req.me;
        const collection = await getCollectionForUser(user);

        try {
            // --- Permission Check ---
            if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_INSTALL_PACK"], user)) {
                return res.status(403).json({ success: false, error: i18n.t('api.permission.installPack') });
            }

            // --- Input Validation ---
            if (!pack) { return res.status(400).json({ success: false, error: 'Pack name is required.' }); }
            if (!initialModelName) { return res.status(400).json({ success: false, error: 'Model name query parameter is required.' }); }

            // --- Initialize Shared State ---
            const idMap = {}; // Shared map: oldObjectIdString -> newObjectId
            const processedModels = new Set(); // Shared set to track processed models and detect cycles

            logger.info(`--- Starting Recursive Pack Installation --- User: ${user.username}, Pack: '${pack}', Initial Model: '${initialModelName}'`);


            // --- Start Recursive Installation ---
            await installPack(logger, pack, initialModelName, user, collection);

            logger.info(`--- Recursive Pack Installation Completed --- User: ${user.username}, Pack: '${pack}'. Final ID Map size: ${Object.keys(idMap).length}. Processed models: [${Array.from(processedModels).join(', ')}]`);

            res.status(200).json({ success: true, message: `Pack '${pack}' installation process completed starting from model '${initialModelName}'.` });

        } catch (error) {
            logger.error(`Critical error during pack installation for pack '${pack}', model '${initialModelName}':`, error);
            res.status(500).json({ success: false, error: error.message || 'An internal server error occurred during pack installation.' });
        }
    });
    */

    engine.get('/resources/:guid', [middlewareAuthenticator, userInitiator, throttle], async (req, res) => {
        try {
            const { guid } = req.params;
            const user = req.me;
            const resourceInfo = await getResource(guid, user); // Passez l'objet utilisateur
            res.setHeader('Content-Type', resourceInfo.mimeType);

            const fileStream = fs.createReadStream(resourceInfo.filepath);
            fileStream.on('error', (streamError) => {
                console.error(`Stream error for resource ${guid}:`, streamError); // ou logger.error
                res.status(404).json({ error: 'Resource file not found on server.' });
            });
            fileStream.pipe(res);

        } catch (error) {
            console.error(`Error serving resource ${req.params.guid}:`, error); // ou logger.error
            if (error.message.includes("n'êtes pas autorisé")) {
                res.status(403).json({ error: 'Forbidden: You are not authorized to access this file.' });
            } else if (error.message.includes("non trouvé")) { // "Fichier non trouvé" ou "GUID du fichier n'est pas valide"
                res.status(404).json({ error: 'Not Found: The requested resource does not exist or the GUID is invalid.' });
            } else {
                res.status(500).json({ error: 'Internal server error while serving the resource.' });
            }
        }
    });

    logger.info("Data module loaded");
}

export const createModel = async (data) => {
    return await getCollection('models').insertOne(data);
}

export const deleteModels = async (filter) => {
    return await getCollection('models').deleteMany(filter ? filter : {_user: { $exists: false }});
}

export const getModel = async (modelName, user) => {
    const modelInCache = modelsCache.get(user.username+"@@"+modelName);
    if(modelInCache)
        return modelInCache;
    const model = await getCollection('models').findOne({name: modelName, $and: [{_user: {$exists: true}}, {$or: [{_user: user._user}, {_user: user.username}]}]});
    if (!model) {
        throw new Error(i18n.t('api.model.notFound', {model: modelName}));
    }
    modelsCache.set(user.username+"@@"+modelName, model);
    return model;
}
export const getModels = async ()  => {
    return await getCollection('models').find({'$or': [{_user: { $exists: false}}]}).toArray();
}


const removeValue = (obj, containsKey, removeParent=false) => {
    // Base case: If the object is not an object or array, return it as is.
    if (!isPlainObject(obj) && !Array.isArray(obj)) {
        return obj;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if( removeParent ) {
                const value = obj[key]?.[containsKey];
                if (value !== undefined) {
                    delete obj[key];
                } else {
                    removeValue(obj[key], containsKey);
                }
            }else if (containsKey === key) {
                delete obj[key];
            }else{
                removeValue(obj[key], containsKey);
            }
        }
    }
    return obj;
};

const changeValue = (obj, keyToChange, changeFunction, excludeKeys = [], depth=0, parentKey='') => {
    if(!depth){
        depthFilter= 0;
    }
    if (!isPlainObject(obj) && !Array.isArray(obj)) {
        return obj;
    }

    const newObj = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const topLevel = depthFilter === 0;
            if( key === keyToChange){
                depthFilter++;
            }
            const value = obj[key];
            if(value instanceof RegExp){
                newObj[key] = value;
                continue;
            }
            if (isPlainObject(value) && !excludeKeys.includes(key)) {
                newObj[key] = changeValue(value, keyToChange, changeFunction, excludeKeys,depth+1, key);
            } else if (Array.isArray(value) && !excludeKeys.includes(key)) {
                newObj[key] = value.map(item => {
                    if (isPlainObject(item)) {
                        return changeValue(item, keyToChange, changeFunction, excludeKeys,depth+1, key);
                    }
                    return item;
                });
            } else {
                newObj[key] = value;
            }
            if (key === keyToChange) {
                if (typeof changeFunction === 'function') {
                    const newValue = changeFunction(parentKey, newObj[key], topLevel);
                    if (newValue !== undefined) {
                        if (isPlainObject(newValue)) {
                            return newValue;
                        } else {
                            newObj[key] = newValue;
                        }
                    }else{
                        //delete newObj[key];

                    }
                }
            }
        }
    }
    return newObj;
};

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

export const insertData = async (modelName, data, files, user, triggerWorkflow = true, waitForWorkflow = true) => {

    // --- Vérification des permissions (inchangée) ---
    if (!(isDemoUser(user) && Config.Get("useDemoAccounts")) && isLocalUser(user) && (
        !await hasPermission(["API_ADMIN", "API_ADD_DATA", "API_ADD_DATA_" + modelName], user) ||
        await hasPermission(["API_ADD_DATA_NOT_" + modelName], user))) {
        // Renvoyer une structure d'erreur cohérente
        return { success: false, error: i18n.t('api.permission.addData'), statusCode: 403 };
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
            return { success: false, unmodified: true, error: "Insertion failed, no IDs returned by core function.", statusCode: 500 };
        }

        // Convertir les IDs en ObjectId pour la recherche
        const objectIds = insertedIds.map(id => new ObjectId(id));
        const insertedDocs = await collection.find({ _id: { $in: objectIds } }).toArray();

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
                    if( waitForWorkflow){
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
                                    const sent = sendSseToUser(doc._user, alertPayload);

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
                }
                else if (doc._model === 'alert' && doc.isActive === true && doc.frequency) {
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

        // --- Retourner succès car l'insertion principale a réussi ---
        return { success: true, insertedIds: insertedIds.map(id => id.toString()) }; // Convertir les IDs en string pour la réponse

    } catch (error) { // Attrape les erreurs de permission ou de pushDataUnsecure
        logger.error(`[insertData] Main error during insertion process for model ${modelName}: ${error.message}`, error.stack);
        // Renvoyer une structure d'erreur cohérente
        return { success: false, unmodified: error.unmodified, error: error.message || "Insertion failed due to an unexpected error.", statusCode: error.statusCode || 500 };
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
        // 2. Vérification des limites
        await checkLimits(datas, model, collection, me);

        // 3. Traitement des documents
        const {allInsertedIds, idMap} = await processDocuments(datas, model, collection, me);

        // 4. Gestion des fichiers (optionnel)
        await handleFilesIfNeeded(allInsertedIds, files, model, collection);

        return allInsertedIds;
    } catch (e) {
        throw e;
    }
};

// ===== FONCTIONS AUXILIAIRES =====

/**
 * Initialise et valide les paramètres d'entrée
 */
async function initializeAndValidate(data, modelName, me) {
    const datas = normalizeInputData(data);
    if (datas.length === 0) return { datas: [], model: null, collection: null };

    const model = await getModel(modelName, me);
    const collection = await getCollectionForUser(me);
    validateModelStructure(model);

    return { datas, model, collection };
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
    const count = await collection.countDocuments({ _user: me._user || me.username });
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


async function processDocuments(datas, model, collection, me) {
    const idMap = new Map();
    const allInsertedIds = [];

    for (const doc of datas) {
        try {
            const newDocId = await insertAndResolveRelations(doc, model, collection, me, idMap);
            if (newDocId) {
                allInsertedIds.push(newDocId.toString());
            }
        } catch (error) {
            // Modification clé ici : on ne catch plus les erreurs de validation
            throw error;
        }
    }

    return { allInsertedIds, idMap };
}


/**
 * Traite toutes les relations du document
 */
async function processRelations(docToProcess, model, collection, me, idMap) {
    const batchFinds = [];

    // Phase 1: Préparation des requêtes
    for (const field of model.fields) {
        if (field.type !== 'relation') continue;

        const value = docToProcess[field.name];
        if (value?.$find) {
            batchFinds.push({
                field: field.name,
                promise: searchData({
                    user: me,
                    query: {
                        filter: value.$find,
                        limit: field.multiple ? 0 : 1,
                        model: field.relation
                    }
                }),
                multiple: field.multiple
            });
        }
    }

    // Phase 2: Exécution parallèle
    const findResults = await Promise.all(batchFinds.map(f => f.promise));

    // Phase 3: Traitement des résultats
    findResults.forEach((result, index) => {
        const { field, multiple } = batchFinds[index];
        if (result.data?.length > 0) {
            // Cas où des documents sont trouvés
            docToProcess[field] = multiple
                ? result.data.map(r => r._id.toString())
                : result.data[0]._id.toString();
        } else {
            // Cas où AUCUN document n'est trouvé : il faut nettoyer le champ !
            docToProcess[field] = multiple ? [] : null;
        }
    });


    for (const field of model.fields) {
        if (field.type !== 'relation') continue;

        const fieldName = field.name;
        const relationValue = docToProcess[fieldName];
        if (!relationValue || typeof relationValue !== 'object') continue;

        const relatedModel = await getModel(field.relation, me);

        if( !Array.isArray(relationValue) && relationValue['$find'] ) {

        }else if (Array.isArray(relationValue)) {
            // Relation multiple (tableau)
            docToProcess[fieldName] = await processMultipleRelations(
                relationValue,
                relatedModel,
                collection,
                me,
                idMap
            );
        } else if (isPlainObject(relationValue)) {
            // Relation simple (objet)
            docToProcess[fieldName] = await processSingleRelation(
                relationValue,
                relatedModel,
                collection,
                me,
                idMap
            );
        }
    }
}

/**
 * Traite une relation multiple (tableau)
 */
async function processMultipleRelations(items, relatedModel, collection, me, idMap) {
    const newRelationIds = await Promise.all(
        items.map(item => processRelationItem(item, relatedModel, collection, me, idMap))
    );
    return newRelationIds.filter(id => id).map(id => id.toString());
}

/**
 * Traite une relation simple (objet)
 */
async function processSingleRelation(item, relatedModel, collection, me, idMap) {
    const newId = await processRelationItem(item, relatedModel, collection, me, idMap);
    return newId ? newId.toString() : null;
}


async function processRelationItem(item, relatedModel, collection, me, idMap) {
    // Cas 1: ID existant (string ou ObjectId)
    if (isObjectId(item) || typeof item === 'string') {
        const originalId = typeof item === 'string' ? item : item.toString();

        // Vérifier si cet ID a déjà été mappé (cas d'une référence circulaire)
        if (idMap.has(originalId)) {
            return idMap.get(originalId);
        }

        // Sinon, vérifier si l'ID existe en base
        const existing = await collection.findOne({
            _id: new ObjectId(originalId),
            _model: relatedModel.name,
            $or: [{_user: me._user || me.username}, {_user: {$exists: false}}]
        });

        if (existing) {
            return existing._id; // Conserver l'ID original
        }
    }

    // Cas 2: Objet complet à importer
    if (isPlainObject(item)) {
        const relationDoc = prepareDocument(item, relatedModel, me);
        applyDefaultValues(relationDoc, relatedModel);

        // Si l'objet a un _id, essayer de le conserver
        if (item._id) {
            const originalId = item._id.toString();

            // Vérifier si l'ID existe déjà en base
            const existing = await collection.findOne({
                _id: new ObjectId(originalId),
                _model: relatedModel.name,
                $or: [{_user: me._user || me.username}, {_user: {$exists: false}}]
            });

            if (existing) {
                return existing._id; // Utiliser l'ID existant
            }

            // Si l'ID n'existe pas encore, l'utiliser pour le nouvel insert
            relationDoc._id = new ObjectId(originalId);
        }

        const relationHash = relationDoc._hash;
        const cacheKey = `${relatedModel.name}:${relationHash}`;

        // Vérification dans le cache
        const cachedId = relationCache.get(cacheKey);
        if (cachedId !== undefined) {
            return cachedId;
        }

        // Vérification en base de données par hash
        const existingByHash = await collection.findOne({
            _hash: relationHash,
            _model: relatedModel.name,
            _user: relationDoc._user
        }, { projection: { _id: 1 } });

        if (existingByHash) {
            relationCache.set(cacheKey, existingByHash._id);
            return existingByHash._id;
        }

        const newId = await insertAndResolveRelations(item, relatedModel, collection, me, idMap);
        relationCache.set(cacheKey, newId);
        return newId;
    }

    return null;
}
// Fonction pour vider le cache si besoin
function clearRelationCache() {
    relationCache.flushAll();
}

// Fonction pour obtenir les stats du cache (utile pour le debug)
function getCacheStats() {
    return relationCache.getStats();
}

/**
 * Applique les filtres de champ définis dans le modèle
 */
async function applyFieldFilters(docToProcess, model) {
    for (const field of model.fields) {
        docToProcess[field.name] = typeof(docToProcess[field.name]) === 'undefined' || docToProcess[field.name] === null ? field.default:docToProcess[field.name];
        if (dataTypes[field.type]?.filter) {
            docToProcess[field.name] = await dataTypes[field.type].filter(
                docToProcess[field.name],
                field
            );
        }
    }
}


/**
 * Valide la structure et le contenu du document selon le modèle
 */
function validateModelData(doc, model, isPatch = false) {
    if (!isPatch) {
        model.fields.forEach(field => {
            const value = doc[field.name];
            if (field.required) {
                if (value === undefined && !('default' in field)) {
                    throw new Error(i18n.t('api.field.missingRequired', { field: field.name + " (" + model.name + ")" }));
                }
                if (value === '' || value === null) {
                    throw new Error(i18n.t('api.field.requiredCannotBeEmpty', { field: field.name }));
                }
            }
        });
    }

    // 2. Validation des types de champs (toujours exécutée pour les champs fournis)
    for (const [fieldName, value] of Object.entries(doc)) {
        const fieldDef = model.fields.find(f => f.name === fieldName);
        if (!fieldDef) continue; // On ignore les champs supplémentaires

        const validator = dataTypes[fieldDef.type]?.validate;
        if (validator && !validator(value, fieldDef)) {
            throw new Error(i18n.t('api.field.validationFailed', { field: fieldName, value }));
        }
    }
}

/**
 * Applique les valeurs par défaut aux champs manquants
 */
function applyDefaultValues(doc, model) {
    for (const field of model.fields) {
        // Si le champ n'est pas défini et a une valeur par défaut
        if (!(field.name in doc) && 'default' in field) {
            doc[field.name] = typeof field.default === 'function'
                ? field.default()
                : field.default;
        }
    }
}

async function insertAndResolveRelations(doc, model, collection, me, idMap) {
    const originalId = doc._id?.toString();

    // Si cet ID a déjà été traité, retourner le nouvel ID mappé
    if (originalId && idMap.has(originalId)) {
        return idMap.get(originalId);
    }

    const docToProcess = prepareDocument(doc, model, me);
    applyDefaultValues(docToProcess, model);

    // Si le document a un _id original et qu'il n'existe pas encore, le conserver
    if (originalId && !await collection.findOne({ _id: new ObjectId(originalId) })) {
        docToProcess._id = new ObjectId(originalId);
    }

    validateModelData(docToProcess, model);
    await processRelations(docToProcess, model, collection, me, idMap);
    validateModelData(docToProcess, model);
    await applyFieldFilters(docToProcess, model);
    await checkUniqueFields(docToProcess, model, collection);

    const existingDoc = await findExistingDocument(docToProcess, collection);
    if (existingDoc) {
        cacheDocumentId(originalId, existingDoc._id, idMap);
        return existingDoc._id;
    }

    for (const field of model.fields) {
        if (field.type === 'relation' && field.relationFilter && docToProcess[field.name]) {
            const relatedIds = Array.isArray(docToProcess[field.name]) ? docToProcess[field.name] : [docToProcess[field.name]];
            for (const id of relatedIds) {
                const targetCollection = await getCollectionForUser(me, field.targetModel);
                const validationQuery = {
                    _id: new ObjectId(id), // L'ID doit correspondre
                    ...field.relationFilter // ET le document doit respecter le filtre
                };
                const relatedDoc = await targetCollection.findOne(validationQuery);
                if (!relatedDoc) {
                    // Si on ne trouve rien, c'est que l'ID est invalide ou ne respecte pas le filtre.
                    throw new Error(`La valeur '${id}' pour le champ '${field.name}' ne respecte pas le filtre de relation défini.`);
                }
            }
        }
    }

    // Insertion en conservant éventuellement l'ID original
    const result = docToProcess._id
        ? await collection.insertOne(docToProcess)
        : await collection.insertOne(docToProcess);

    const insertedId = result.insertedId;
    cacheDocumentId(originalId, insertedId, idMap);

    return insertedId;
}

// Nouvelle fonction pour vérifier les champs uniques
async function checkUniqueFields(doc, model, collection) {
    const uniqueFields = model.fields.filter(f => f.unique);

    for (const field of uniqueFields) {
        const value = doc[field.name];
        if (value === undefined || value === null) continue;

        const existing = await collection.findOne({
            [field.name]: value,
            _model: model.name,
            _user: doc._user
        });

        if (existing) {
            // Utilisation de i18n pour un message d'erreur standardisé
            throw new Error(i18n.t('api.data.duplicateValue', { field: field.name, value: value }));
        }
    }
}

function prepareDocument(doc, model, me) {
    const docToProcess = { ...doc };
    delete docToProcess._id;

    // AJOUT: Nettoyage des champs non définis dans le modèle
    for (const key of Object.keys(docToProcess)) {
        if (!model.fields.some(f => f.name === key) && !key.startsWith('_')) {
            delete docToProcess[key];
        }
    }

    docToProcess._model = model.name;
    docToProcess._user = me._user || me.username;
    docToProcess._hash = getFieldValueHash(model, docToProcess);

    return docToProcess;
}
/**
 * Cherche un document existant par son hash
 */
async function findExistingDocument(docToProcess, collection) {
    return await collection.findOne({
        _hash: docToProcess._hash,
        _model: docToProcess._model,
        _user: docToProcess._user
    });
}

/**
 * Insère le document dans la collection
 */
async function insertDocument(docToProcess, collection) {
    const result = await collection.insertOne(docToProcess);
    return result.insertedId;
}

/**
 * Met en cache la correspondance d'ID
 */
function cacheDocumentId(originalId, newId, idMap) {
    if (originalId && newId) {
        idMap.set(originalId, newId);
    }
}

/**
 * Gestion des fichiers (à implémenter selon besoins)
 */
async function handleFilesIfNeeded(insertedIds, files, model, collection) {
    // Implémentation spécifique à votre application
    // Ex: association des fichiers uploadés aux documents insérés
}
const checkHash = async (me, model, hash, excludeId = null) => {
    const collection = await getCollectionForUser(me);
    const query = {
        _model: model.name,
        _hash: hash,
        ...(excludeId && { _id: { $ne: new ObjectId(excludeId) } })
    };

    console.log("Query being executed:", JSON.stringify(query, null, 2));

    const count = await collection.countDocuments(query);
    return count > 0;
};

export const getResource = async (guid, user) => {
    if (!guid) throw new Error("Le GUID du fichier est requis.");
    if (!isGUID(guid)) throw new Error("Le GUID du fichier n'est pas valide.");

    const collection = getCollection("files");

    // Trouver le fichier et vérifier l'autorisation (propriétaire, admin ou utilisateur principal)
    const file = await collection.findOne({ guid });
    if (!file) throw new Error("Fichier non trouvé."+guid);

    if (user.username !== 'demo' && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_READ_FILE", `API_READ_FILE_privateFile_${guid}`], user)) {
        if (file._user !== (user._user || user.username)) { // Vérifier si l'utilisateur est le propriétaire
            throw new Error("Vous n'êtes pas autorisé à accéder à ce fichier.");
        }
    }
    // Construire le chemin vers le fichier
    const filepath = path.join(process.cwd(), 'uploads', 'private', guid)+'.'+getFileExtension(file.filename);
    if (!fs.existsSync(filepath)) throw new Error("Fichier non trouvé sur le serveur.");


    return { success: true, filepath, filename: file.filename, mimeType: file.mimeType }; // Retourner des informations utiles
};

export const patchData = async (modelName, filter, data, files, user, triggerWorkflow = true, waitForWorkflow = false) => {
    return await internalEditOrPatchData(modelName, filter, data, files, user, true, triggerWorkflow, waitForWorkflow);
};

export const editData = async (modelName, filter, data, files, user, triggerWorkflow = true, waitForWorkflow = false) => {
    return await internalEditOrPatchData(modelName, filter, data, files, user, false, triggerWorkflow, waitForWorkflow);
};

// Dans src/modules/data.js

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
        const existingDocs = (await searchData({user, query: {model: modelName, filter}}))?.data;
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
            if (files?.[field.name+'[0]']) {
                if (field.type === 'file') {
                    updateData[field.name] = await addFile(files[field.name+'[0]'][0], user);
                } else if (field.type === 'array' && field.itemsType === 'file') {
                    const currentFiles = existingDocs[0]?.[field.name] || [];
                    const newFiles = await processFileArray(files[field.name+'[0]'], currentFiles, user);
                    updateData[field.name] = newFiles;
                }
            }
        }

        // 4. Validation adaptée pour patch ou edit (inchangé)
        if (!isPatch) {
            const dataToValidate = { ...existingDocs[0], ...updateData };
            validateModelData(dataToValidate, model, false);
        } else {
            validateModelData(updateData, model, true);
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
                    throw new Error(i18n.t("api.data.duplicateValue", { field: field.name, value: updateData[field.name] }));
                }
            }
        }

        // 6. Traitement des relations (inchangé)
        const relationFields = model.fields.filter(f => f.type === 'relation');
        for (const field of relationFields) {
            if (updateData[field.name] !== undefined) {
                const relationValue = updateData[field.name];
                if (relationValue !== null && typeof relationValue === 'object') {
                    const insertedIds = await pushDataUnsecure(relationValue, field.relation, user, { preserveIds: true });
                    updateData[field.name] = field.multiple ? insertedIds || [] : insertedIds?.[0] || null;
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
            // On ne vérifie que si un champ de relation avec un filtre est en cours de modification.
            if (field.type === 'relation' && field.relationFilter && updateData[field.name] !== undefined) {
                const relatedIds = Array.isArray(updateData[field.name])
                    ? updateData[field.name]
                    : (updateData[field.name] ? [updateData[field.name]] : []);

                for (const id of relatedIds) {
                    if (!id || !isObjectId(id)) continue; // Ignorer les valeurs null/invalides

                    const targetCollection = await getCollectionForUser(user, field.relation);

                    const validationQuery = {
                        _id: new ObjectId(id),
                        ...field.relationFilter
                    };

                    const relatedDoc = await targetCollection.findOne(validationQuery);

                    if (!relatedDoc) {
                        // Si on ne trouve rien, c'est que l'ID est invalide ou ne respecte pas le filtre.
                        throw new Error(`La valeur '${id}' pour le champ '${field.name}' ne respecte pas le filtre de relation défini.`);
                    }
                }
            }
        }

        // 8. Calcul du nouveau hash et préparation des données finales
        const finalStateForHash = { ...existingDocs[0], ...updateData };
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
        const bulkOps = [{ updateMany: { filter: {_id: {$in: ids}}, update: {$set: finalDataForSet} } }];
        const bulkResult = await collection.bulkWrite(bulkOps);
        const modifiedCount = bulkResult.modifiedCount || 0;

        // 11. Tâches post-mise à jour (schedules, workflows) (inchangé)
        if (["workflowTrigger", "alert"].includes(modelName)) {
            await handleScheduledJobs(modelName, existingDocs, collection, finalDataForSet);
        }

        if (triggerWorkflow && modifiedCount > 0) {
            const updatedDoc = await collection.findOne({_id: ids[0]});
            if (updatedDoc) {
                const proms = triggerWorkflows(updatedDoc, user, 'DataEdited')
                    .catch(err => logger.error("[editData] Workflow trigger error:", err));
                if( waitForWorkflow ){
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

// Fonctions helper
async function processFileArray(files, currentFiles, user) {
    const newFiles = await Promise.allSettled(
        Object.keys(files).map(f=>files[f]).map(async (file, i) => {
            const oldFile = currentFiles.find(f => f.name === file.name);
            if (oldFile && !file.newFile) return oldFile;
            if (file.guid) return file;
            if (!file.newFile) return Promise.reject();
            return await addFile(files[i], user);
        })
    ).then(results => results.map(r => r.value).filter(Boolean));

    // Suppression des anciens fichiers non réutilisés
    await Promise.allSettled(
        currentFiles
            .filter(f => !newFiles.some(nf => nf._id === f._id))
            .map(f => removeFile(f, user))
    );

    return newFiles;
}

async function handleScheduledJobs(modelName, existingDocs, collection, updateData) {
    for (const doc of existingDocs) {
        const jobId = `${modelName}_${doc._id}`;
        const existingJob = schedule.scheduledJobs[jobId];
        if (existingJob) existingJob.cancel();

        const updatedDoc = {...doc, ...updateData};
        if (modelName === 'workflowTrigger' && updatedDoc.isActive && updatedDoc.cronExpression) {
            schedule.scheduleJob(jobId, updatedDoc.cronExpression, async () => {
                logger.info(`[Scheduled Job] Cron triggered for job ${jobId}`);
                await runScheduledJobWithDbLock(jobId, async () => {
                    sendSseToUser(updatedDoc._user, {
                        type: 'cron_alert',
                        triggerId: updatedDoc._id.toString(),
                        triggerName: updatedDoc.name,
                        timestamp: new Date().toISOString(),
                        message: `L'alerte planifiée '${updatedDoc.name || 'Sans nom'}' a été déclenchée.`
                    });
                }, updatedDoc.lockDurationMinutes || 5);
            });
        }

        if (modelName === 'alert' && updatedDoc.isActive && updatedDoc.frequency) {
            await collection.updateOne({_id: updatedDoc._id}, {$set: {lastNotifiedAt: null}});
            schedule.scheduleJob(jobId, updatedDoc.frequency, () => runStatefulAlertJob(updatedDoc._id));
        }
    }
}

export const deleteData = async (modelName, ids = [], filter, user ={}, triggerWorkflow, waitForWorkflow = false) => {

    try {
        const collection = await getCollectionForUser(user);

        // --- Début de la logique de suppression ---

        // 1. Construire le filtre de base pour trouver les documents à supprimer
        let findFilter = [];
        if(user)
            findFilter.push({
                '$eq': ["$_user", user.username]
            });

        // Ajouter le filtre par IDs si fourni
        if (ids && ids.length > 0) {
            findFilter.push({"$in": ["$_id", ids.map(m => new ObjectId(m))]});
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
        }else{

        }

        console.log(util.inspect(findFilter, false, 8, true));
        // 2. Récupérer les documents à supprimer pour vérifier leur type et annuler les schedules
        const documentsToDelete = await collection.aggregate([{ $match: { $expr: { "$and": findFilter } } }]).toArray();

        if (documentsToDelete.length === 0) {
            logger.info(`[deleteData] No documents found matching the criteria for user ${user?.username}.`);
            return ({ success: true, deletedCount: 0, message: "No documents found to delete." });
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
            }
            else if (docToDelete._model === 'alert') {
                const jobId = `alert_${docToDelete._id}`;
                const scheduledJob = schedule.scheduledJobs[jobId];
                if (scheduledJob) {
                    scheduledJob.cancel();
                    logger.info(`[deleteData] Cancelled scheduled job ${jobId} for deleted alert ${docToDelete._id}.`);
                }
            }
            // *** Fin de l'ajout ***

            if( user ){
                // --- Logique existante pour gérer les relations ---
                const relatedModels = await modelsCollection.aggregate([
                    {
                        $match: {
                            $and: [
                                {"fields.relation": {$eq: docToDelete._model}}, // Utilise le modèle du document actuel
                                {
                                    $and: [
                                        {_user: {$exists: true}},
                                        { $or: [
                                            {_user: {$eq:user._user}},
                                            {_user: {$eq:user.username}}
                                        ]}
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
                            const fieldCondition = { [f.name]: docToDelete._id.toString() };
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
                                { _user: { $exists: true } },
                                { _model: relatedModel.name },
                                { $or: [{ _user: user._user }, { _user: user.username }] },
                                { $or: filterConditions }
                            ]
                        };

                        const updateOps = {};
                        if (Object.keys(relsSet).length > 0) updateOps.$set = relsSet;
                        if (pullOps.$pull && Object.keys(pullOps.$pull).length > 0) updateOps.$pull = pullOps.$pull;

                        if (Object.keys(updateOps).length > 0) {
                            const elementsToUpdate = await collection.find(updateFilter).toArray();
                            const updateResult = await collection.updateMany(updateFilter, updateOps);
                            logger.debug(`[deleteData] Updated relations in model ${relatedModel.name} referencing ${docToDelete._id}. Modified: ${updateResult.modifiedCount}`);

                            if( triggerWorkflow ) {
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
                if( triggerWorkflow)
                {
                    const prom = triggerWorkflows(docToDelete, user, 'DataDeleted').catch(workflowError => {
                        logger.error(`[deleteData] Async error triggering DataDeleted workflow for ${docToDelete._model} ID ${docToDelete._id}:`, workflowError);
                    });

                    if( waitForWorkflow){
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
                _id: { $in: finalIdsToDelete }
                // Le filtre _user est déjà implicite car on a fetch les documents de l'utilisateur
            });
            deletedCount = result.deletedCount;
            logger.info(`[deleteData] Successfully deleted ${deletedCount} documents for user ${user?.username}.`);
        } else {
            logger.info(`[deleteData] No documents to delete for user ${user?.username} after permission checks or matching criteria.`);
        }

        return ({ success: true, deletedCount });

    } catch (error) {
        logger.error(`[deleteData] Error during deletion process for user ${user?.username}:`, error);
        // Renvoyer une structure d'erreur cohérente
        return ({ success: false, error: error.message || "An unexpected error occurred during deletion.", statusCode: error.statusCode || 500 });
    }
}

// ... (le reste du fichier data.js)

export const searchData = async ({user, query}) => {
    const { page, limit, sort, model, ids, timeout, pack } = query; // Les filtres de la requête (attention aux injections MongoDB !)

    if( user.username !== 'demo' && isLocalUser(user) && (
        !await hasPermission(["API_ADMIN", "API_SEARCH_DATA", "API_SEARCH_DATA_"+model], user) ||
        await hasPermission(["API_SEARCH_DATA_NOT_"+model], user))){
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

    let sortObj = {};
    sort?.split(',').forEach(s => {
        const v = s.split(':');
        sortObj[v[0] || s] = v[1] === 'DESC' ? -1 : 1;
    })
    if( !sort ){
        sortObj = {[modelElement.fields[0]?.name || '_id']: ['datetime','date'].includes(modelElement.fields[0].type) ? -1 : 1};
    }

    let i = 0;
    const f = {...filter};

    let depthParam = Math.max(1, Math.min(maxFilterDepth, typeof(query.depth) === 'string' ? parseInt(query.depth) : (typeof(query.depth) === 'number' ? query.depth : 1)));
    let autoExpand =  typeof(query.autoExpand)==='undefined' || (typeof(query.autoExpand)==='string' && ['1','true'].includes(query.autoExpand.toLowerCase()));

    const recursiveLookup = async (model, data, depth= 1, already = [], parentPath = '') => {

        if( depth > depthParam )
            return [];

        let pipelines = [], pipelinesLookups = [];
        let modelElement;
        try {
            modelElement = await getModel(model, user);
        } catch (e) {
            return [];
        }

        let dataRelationF= [], dataNoRelation = {};
        let dte=    changeValue(data, '$find', (name, d, topLevel) => {
            if (autoExpand)
                depthParam++;
            const field = modelElement.fields.find(f => f.name === name);
            if( !field || !name )
                return {};
            if( field.type === "relation") {
                const dt = {
                    '$ne': [
                        {
                            '$filter': {
                                'input': (depth === 1 ? "$" + name : "$this." + name),
                                'as': 'this',
                                'cond': d
                            }
                        }
                        , []]
                };
                dataRelationF.push(dt);
                dataRelationF.push({ "$ne": [(depth===1  ? "$" + name : "$this." + name), null] })
                return {"$internal": {}};
            }
            dataNoRelation[name] = d;
            return {"$internal": d};
        });

        dataNoRelation = changeValue(dte, '$internal', (name, d, topLevel) =>{
            return d;
        });

        for (let fi of modelElement.fields.sort((s1,s2)=>{
            const v = s1.type ==='relation' ? 1 :0;
            const v2 = s2.type ==='relation' ? 1 : 0;

            const t1 = s1.type === 'calculated' ? 1 : 0;
            const t2 = s2.type === 'calculated' ? 1 : 0;
            return v <= v2 ? -1 : (t1 <= t2 ? -1 : 1);
        } )) {

            // **Circular Reference Check:**
            if (already.includes(fi.relation)) {
                // Skip the lookup if we've already processed this relation in the current chain.
                console.warn(`Skipping circular reference to model: ${fi.relation}`);
                continue;
            }
            const relSort = {};
            if (fi.type === 'relation' && depthParam !== 1) {
                delete f[fi.name];
                if (sortObj[fi.name]) {

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

                // Création du lookup si l'expand est activé
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
                                                    $in: [{ $toString: "$_id" }, {
                                                        $map: {
                                                            input: { $ifNull: ["$$convertedId", []] }, // On utilise le tableau d'IDs, ou un tableau vide s'il est null
                                                            as: "relationId",
                                                            in: { $toString: "$$relationId" }
                                                        }
                                                    }]
                                                } : {
                                                    $eq: [
                                                        { $toString: "$_id" },
                                                        { $convert: { input: '$$convertedId', to: "string", onError: '' } }
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

                // Construct the path for the current field
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

                //found = true;
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

            }else if (fi.type === 'file') {
                // Logique pour enrichir un champ fichier unique

                // Stage 1: Lookup file details from the 'files' collection
                pipelinesLookups.push({
                    $lookup: {
                        from: "files", // The global collection where file metadata is stored
                        let: { fileGuid: '$' + fi.name }, // The GUID string from the current document's field
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$guid', '$$fileGuid'] },
                                            { $eq: ['$user', user.username] }
                                        ]
                                    }
                                }
                            },
                            { $limit: 1 } // GUIDs should be unique, so limit to 1
                        ],
                        as: fi.name + "_details_temp" // Temporary field to store the lookup result (an array)
                    }
                });

                // Stage 2: Replace the original GUID string with the fetched file object (or null if not found)
                pipelinesLookups.push({
                    $addFields: {
                        [fi.name]: {
                            // $lookup returns an array, take the first element.
                            // If lookup result is empty or null, set the field to null.
                            $ifNull: [ { $first: '$' + fi.name + "_details_temp" }, null ]
                        }
                    }
                });

                // Stage 3: Clean up the temporary lookup field
                pipelinesLookups.push({
                    $project: {
                        [fi.name + "_details_temp"]: 0
                    }
                });
            } else if (fi.type === 'array' && fi.itemsType === 'file' && depthParam !== 1) {
                // This field (e.g., 'myImageGallery') stores an array of GUID strings: ["guid1", "guid2"]
                pipelinesLookups.push(
                    {
                        $lookup: {
                            from: "files", // The global collection where file metadata is stored
                            let: { localGuidsArray: '$' + fi.name }, // The array of GUID strings from the current document
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            // Match documents in "files" collection where 'guid' is in the '$$localGuidsArray'
                                            $in: ['$guid', { $ifNull: ['$$localGuidsArray', []] }] // Handle null or missing array
                                        }
                                    }
                                }
                                // Optional: Project only necessary fields from the "files" collection if needed
                                // {
                                //     $project: {
                                //         _id: 0, // Exclude MongoDB's _id from the 'files' collection documents
                                //         // mainUser: 0, // Example: if you don't need these in the result
                                //         // user: 0,
                                //         // _model:0, // The _model "privateFile" might not be useful here
                                //         // Keep: guid, filename (as name), mimetype, size, timestamp etc.
                                //     }
                                // }
                            ],
                            as: fi.name + "_details_temp" // Temporary field to store the array of matched file detail objects
                        }
                    },
                    // The following $addFields and $project stages are what you had
                    // in your fi.type === 'file' block, and they are correct for this array scenario.
                    {
                        $addFields: {
                            [fi.name]: { // Remplacer le tableau de chaînes GUID par un tableau d'objets fichiers détaillés
                                $ifNull: [ // Gérer le cas où le champ fi.name est null (original array of GUIDs)
                                    {
                                        $map: {
                                            input: '$' + fi.name, // Itérer sur le tableau original de chaînes GUID
                                            as: "originalGuidString", // Each element from the input array (a GUID string)
                                            in: {
                                                $let: {
                                                    vars: {
                                                        // Trouver le détail correspondant dans _details_temp par GUID
                                                        matchedDetail: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: '$' + fi.name + "_details_temp", // Use the result from the $lookup above
                                                                        as: "detailFile", // Each document from _details_temp
                                                                        cond: { $eq: ["$$detailFile.guid", "$$originalGuidString"] }
                                                                    }
                                                                },
                                                                0 // Take the first match (GUIDs should be unique in "files")
                                                            ]
                                                        }
                                                    },
                                                    in: {
                                                        $cond: {
                                                            if: '$$matchedDetail', // Si des détails ont été trouvés
                                                            then: '$$matchedDetail', // Utiliser l'objet détaillé complet
                                                            else: { // Si aucun détail trouvé pour ce GUID (e.g., broken reference)
                                                                guid: '$$originalGuidString', // Conserver le GUID original
                                                                name: null, // Ou une valeur par défaut comme "Fichier inconnu"
                                                                _error: "File details not found"
                                                                // Ou simplement: '$$originalGuidString' si vous voulez juste garder la chaîne
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    [] // Si le champ original fi.name était null, le résultat est un tableau vide
                                ]
                            }
                        }
                    },
                    {
                        $project: { // Nettoyer le champ temporaire
                            [fi.name + "_details_temp"]: 0
                        }
                    }
                );
            } else if (fi.type === 'calculated' && fi.calculation && fi.calculation.pipeline && fi.calculation.final) {
                const calcPipelineAbstract = fi.calculation.pipeline;
                const calcFinalFieldName = fi.calculation.final;
                const tempLookupsForThisCalcField = []; // Pour stocker les noms 'as' des lookups de CE champ calculé

                // Ajouter les étapes $lookup définies par le calcul
                if (calcPipelineAbstract.lookups && calcPipelineAbstract.lookups.length > 0) {
                    for (const lookupDef of calcPipelineAbstract.lookups) {
                        // ... (votre logique existante de vérification de foreignModel et localField) ...
                        // Assurez-vous que cette logique est robuste comme discuté précédemment.
                        // Si une erreur se produit ici (foreignModel non trouvé, etc.),
                        // vous ajoutez déjà un $addFields pour initialiser lookupDef.as à null/[]
                        // et vous faites 'continue'. C'est bien.

                        // Si tout va bien, on construit le lookup :
                        const targetCollectionName = await getUserCollectionName(user);
                        const localFieldValueInPipeline = `$${lookupDef.localField}`;

                        // Vérification basique du localField (déjà présente dans votre code précédent)
                        if (!lookupDef.localField || typeof lookupDef.localField !== 'string' || lookupDef.localField.trim() === '') {
                            logger.warn(`[Calculated Field Error] ... localField ... invalide ...`);
                            pipelinesLookups.push({$addFields: {[lookupDef.as]: lookupDef.isMultiple ? [] : null}});
                            continue;
                        }

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
                                    // Optionnel: Projeter uniquement les champs nécessaires
                                ],
                                as: lookupDef.as
                            }
                        };
                        pipelinesLookups.push(mongoLookupStage);
                        tempLookupsForThisCalcField.push(lookupDef.as); // Suivre ce champ temporaire

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

                // Ajouter l'étape $addFields pour les calculs eux-mêmes
                if (calcPipelineAbstract.addFields && Object.keys(calcPipelineAbstract.addFields).length > 0) {
                    const addFields = Object.keys(calcPipelineAbstract.addFields).map(m => ({ $addFields: { [m] : calcPipelineAbstract.addFields[m] } }));
                    pipelinesLookups = pipelinesLookups.concat(addFields);
                }

                // S'assurer que le champ final du calcul (calcFinalFieldName) est bien accessible
                // sous le nom du champ du modèle (fi.name).
                if (calcFinalFieldName !== fi.name) {
                    pipelinesLookups.push({$addFields: {[fi.name]: `$${calcFinalFieldName}`}});
                }

                // --- NOUVEAU : Supprimer les champs de lookup temporaires pour CE champ calculé ---
                if (tempLookupsForThisCalcField.length > 0) {
                    const unsetProjection = {};
                    for (const tempField of tempLookupsForThisCalcField) {
                        // On peut supprimer tous les champs __calc_lookup_... car le CalculationBuilder
                        // empêche que outputAlias (et donc calcFinalFieldName, et donc fi.name)
                        // soit un de ces champs temporaires.
                        unsetProjection[tempField] = 0; // 0 signifie supprimer/exclure le champ
                    }
                    if (Object.keys(unsetProjection).length > 0) {
                        pipelinesLookups.push({$project: unsetProjection});
                    }
                }
            } else if (fi.type === 'array') {
                // Handle array filtering here
                if (data[fi.name]) {
                    console.log('array filtering', data[fi.name]);
                    pipelines.push({
                        $match: {
                            $expr: {
                                $in: [data[fi.name], '$' + fi.name] // Check if the array contains the value
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


        let addFields=[];
        /*modelElement.fields.forEach(field => {
            if( field.type==='relation' && !field.multiple && depthParam !== 1 && (dataRelationF.length)){
                addFields.push(
                    {$addFields: {[`${field.name}`]: {$first: '$'+field.name }}}
                )
            }
        })*/
        return pipelines.concat([{$match: { '_pack': pack ? pack : { $exists: false }}}, {$match:{$expr:dataNoRelation}}], pipelinesLookups, addFields, [{$match:{$expr:{$and:dataRelationF}}}]);
    };

    let pipelines = [];
    if( allIds.length ){
        console.log({allIds});
        const id = {$in: ["$_id", allIds.map(m => new ObjectId(m))]};
        pipelines.push({
            $match: { $expr: id }
        });

    }else {

        pipelines.push(
            {
                $match: {
                    $expr: {
                        $and: [{$eq: ["$_model", modelElement.name]},
                            {$eq: ["$_user", user.username]}]
                    }
                }
            }
        )
    }

    pipelines = pipelines.concat(await recursiveLookup(model, filter, 1, []))   ;
    if( depthParam ) {
        pipelines.push({$project: {_user: 0}});
        pipelines.push({$project: {_model: 0}});
    }

    console.log(util.inspect(pipelines, false, 29, true));

    // 4. Exécuter la pipeline
    const ts = parseInt(timeout, 10)/2.0 || searchRequestTimeout;
    const count = await collection.aggregate([...pipelines, { $count: "count" }]).maxTimeMS(ts).toArray();
    let prom = collection.aggregate(pipelines).maxTimeMS(ts);

    if( Object.keys(sortObj).length > 0 ) {
        prom.sort(sortObj);
    }
    prom.skip(p ? (p-1) * l : 0).limit(l);
    let data = await prom.toArray();
    data = await handleFields(modelElement, data, user);

    return {data, count: count[0]?.count || 0};
}

export const importData = async(options, files, user) => {

    if( !(isDemoUser(user) && Config.Get("useDemoAccounts")) && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_IMPORT_DATA"], user)){
        return ({ success: false, error: "API_IMPORT_DATA permission needed." });
    }

    const file = files.file;
    const hasHeaders = options.hasHeaders ? options.hasHeaders === 'true' : true;
    const csvHeadersString = options.csvHeaders;

    if (!file) {
        return ({ success: false, error: "No file uploaded." });
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
        const importResults = { success: true, counts: {}, errors: [] }; // Pour collecter les erreurs internes

        try {
            const fileContent = fs.readFileSync(file.path);
            // --- DÉBUT DE LA MODIFICATION ---
            // La variable allProcessedData est maintenant déclarée à l'intérieur de la boucle
            // let allProcessedData = [];
            // let modelNameForImport = '';
            // --- FIN DE LA MODIFICATION ---

            if (file.mimetype === 'application/json' || file.originalFilename.endsWith('.json')) {
                fileProcessed = true;
                const jsonData = await runImportExportWorker('parse-json', { fileContent: fileContent.toString() });

                // --- Logique d'importation des modèles (inchangée) ---
                if (jsonData.models && Array.isArray(jsonData.models)) {
                    logger.info(`[Model Import] Found ${jsonData.models.length} models to import for user ${user.username}.`);
                    const userModels = await modelsCollection.find({ _user: user.username }).toArray();
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

                            const modelData = { ...modelToInstall };
                            delete modelData._id;
                            modelData._user = user.username;
                            modelData.locked = false;
                            if (modelData.fields) {
                                modelData.fields.forEach(f => {
                                    delete f._id;
                                    f.locked = false;
                                });
                            }

                            validateModelStructure(modelData);
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
                        modelsToProcess.push({ name: modelNameForImport, data: dataToProcess });
                    }
                } else if (typeof dataToProcess === 'object' && dataToProcess !== null) {
                    for (const modelKey in dataToProcess) {
                        if (modelKey === 'models') continue;
                        if (Object.prototype.hasOwnProperty.call(dataToProcess, modelKey)) {
                            if (Array.isArray(dataToProcess[modelKey])) {
                                modelsToProcess.push({ name: modelKey, data: dataToProcess[modelKey] });
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
                            throw new Error(i18n.t('api.model.notFound', { model: modelName }));
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

            } else if (file.mimetype === 'text/csv' || file.originalFilename.endsWith('.csv')) {
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
                            throw new Error(i18n.t('api.model.notFound', { model: modelNameForImport }));
                        }

                        let userDefinedHeadersForMapping = [];
                        if (!hasHeaders && csvHeadersString && typeof csvHeadersString === 'string') {
                            userDefinedHeadersForMapping = csvHeadersString.split(',').map(h => h.trim());
                        }

                        const records = await runImportExportWorker('parse-csv', {
                            fileContent: fileContent.toString(),
                            options: { columns: hasHeaders }
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
        }
    });

    return ({ success: true, message: "Import initiated. Check progress via SSE.", job: importJob });
}

export const exportData= async (options, user) =>{
    // Extract parameters from request body and query
    const { models, ids, filter = {}, depth, lang } = options;
    const userId = getUserId(user);

    const effectiveMaxDepth = maxExportCount ?? maxFilterDepth; // Use defined constant or fallback
    i18n.changeLanguage(lang);

    // --- Input Validation ---
    if (!Array.isArray(models) || models.length === 0) {
        return { success: false, error: i18n.t('api.export.error.noModels', 'Models array is required.') };
    }
    const parsedDepth = parseInt(depth, 10);
    if (isNaN(parsedDepth) || parsedDepth < 0 || parsedDepth > effectiveMaxDepth) {
        return { success: false, error: i18n.t('api.export.error.invalidDepth', `Invalid depth parameter. Must be between 0 and ${effectiveMaxDepth}.`, { maxDepth: effectiveMaxDepth }) };
    }
    if (ids && !Array.isArray(ids)) {
        return { success: false, error: i18n.t('api.export.error.invalidIdsType', 'ids parameter must be an array if provided.') };
    }
    if (ids && !ids.every(id => typeof id === 'string' || isObjectId(id))) { // Allow string or ObjectId format
        return { success: false, error: i18n.t('api.export.error.invalidIdsContent', 'ids parameter must contain valid identifiers (strings or ObjectIds).') };
    }

    const exportResults = {};
    let totalDocsFetched = 0;
    const errors = [];

    let modelsToExport = [];

    // --- Permissions & Data Fetching Loop ---
    for (const modelName of models) {
        if (totalDocsFetched >= maxExportCount) {
            console.warn(`Export limit of ${maxExportCount} documents reached before processing model ${modelName}.`);
            errors.push(i18n.t('api.export.error.limitReached', 'Export document limit reached.', { limit: maxExportCount }));
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
                errors.push(i18n.t('api.model.notFound', 'Model {{model}} not found.', { model: modelName }));
                continue; // Skip this model
            }



            // Construct the query filter for the current model
            let modelSpecificFilter = { ... (filter[modelName] || {}) }; // Use model-specific filter from request if provided
            // _user filter is handled internally by searchData based on the user object passed

            if( ids && ids.length > 0)
                modelSpecificFilter = { $in : ['$_id', ids]};

            // Calculate remaining limit for this model
            const remainingLimit = maxExportCount - totalDocsFetched;

            // --- Fetch Data using searchData ---
            const searchParams = {
                user: user,
                query: {
                    model: modelName,
                    filter: modelSpecificFilter,
                    depth: parsedDepth,
                    limit: remainingLimit
                }
            };

            const { data: resultData, count } = await searchData(searchParams);

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
            errors.push(i18n.t('api.export.error.modelError', 'Error exporting model {{model}}.', { model: modelName }) + ` (${modelError.message})`);
        }
    } // End of loop through models

    // --- Prepare and Send Response ---
    if (Object.keys(exportResults).length === 0) {
        const finalError = errors.length > 0 ? errors.join('; ') : i18n.t('api.data.noExportData', 'No data found for the specified criteria or permissions denied.');
        // Use 404 if no data found/accessible, 400 if only errors occurred but no data attempt was possible
        const statusCode = errors.length > 0 && totalDocsFetched === 0 ? 400 : 404;
        return { success: false, error: finalError };
    }

    // Include errors in the response if any occurred but some data was fetched
    if (errors.length > 0) {
        exportResults._exportErrors = errors;
    }

    return { success: true, data: exportResults, models: modelsToExport };
}

function handleCalculationExpression(calcExpression, fi, modelElement, calculationName) {
    // Check if the calculation expression involves an operator
    if (typeof calcExpression === 'object' && calcExpression !== null && Object.keys(calcExpression).length === 1) {
        const operator = Object.keys(calcExpression)[0];
        const operands = calcExpression[operator];

        // Validation of isValidAggregationOperator
        if (!isValidAggregationOperator(operator)) {
            logger.warn(`Invalid aggregation operator '${operator}' in calculation. Skipping.`);
            return null;
        }

        // Check Operand Count and Apply $ifNull handling
        if (Array.isArray(operands)) {
            const handledOperands = operands.map(operand => handleOperand(operand, fi, modelElement, calculationName));
            if (handledOperands.some(op => op === null)) { // Skip if any operand is invalid
                return null;
            }
            return { [operator]: handledOperands };
        } else {
            logger.warn(`Invalid operands for operator '${operator}'. Expected an array. Skipping.`);
            return null;
        }
    } else if (typeof calcExpression === 'string' && calcExpression.startsWith('$')) {
        // This is a field reference
        return handleOperand(calcExpression, fi, modelElement, calculationName);
    } else {
        // This is a constant value, return as is.
        return calcExpression;
    }
}

function handleOperand(operand, fi, modelElement, calculationName) {
    if (typeof operand === 'object' && operand !== null && Object.keys(operand).length === 1) {
        // Nested Calculation: recursively handle
        return handleCalculationExpression(operand, fi, modelElement, calculationName);
    } else if (typeof operand === 'string' && operand.startsWith('$')) {
        // Field Reference: check field existence
        const fieldName = operand.slice(1);
        if (!isValidFieldReference(fieldName, modelElement)) {
            logger.warn(`Invalid field reference '${fieldName}' in calculation. Skipping.`);
            return null;
        }
        return operand;
    } else {
        // Constant Value
        return operand;
    }
}

function isValidFieldReference(fieldName, modelElement) {
    // Check if the field exists in the model
    return modelElement.fields.some(field => field.name === fieldName);
}
function isValidAggregationOperator(operator) {
    const arithmeticOperators = [
        '$add', '$subtract', '$multiply', '$divide', '$mod', '$pow',
        '$abs', '$ceil', '$floor', '$round', '$trunc', '$exp', '$log', '$log10'
    ];
    const comparisonOperators = [
        '$eq', '$gt', '$gte', '$lt', '$lte', '$ne'
        // ... (others like $cmp, $strcasecmp, etc.)
    ];
    const stringOperators = [
        '$concat', '$strLenCP', '$substrCP', '$toLower', '$toUpper'
        // ... (others)
    ];
    const conditionalOperators = ['$cond', '$ifNull'];
    // Add more categories and operators as needed

    return [...arithmeticOperators, ...comparisonOperators, ...stringOperators, ...conditionalOperators].includes(operator);
}
// C:/Dev/hackersonline-engine/server/src/modules/data.js

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

            if( item['_id']){
                item['_id'] = item['_id'].toString();
            }

            for (const field of model.fields) {
                const fieldName = field.name;
                const fieldValue = item[fieldName];

                if (fieldValue === undefined) continue;

                // 1. Anonymisation des champs si nécessaire
                if (field.anonymized && !canRead && dataTypes[field.type]?.anonymize) {
                    item[fieldName] = dataTypes[field.type].anonymize(fieldValue, field, getObjectHash({ id: item._id }));
                }

                if( field.type === 'string_t'){
                    item[fieldName] = { key: fieldValue, value: i18n.t(fieldValue, fieldValue) };
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

let restoreRequests = {};
export const validateRestoreRequest = (username, token) => {
    const request = restoreRequests[username];
    if (!request) {
        return { error: 'Invalid username.' };
    }

    if (request.token !== token) {
        return { error: 'Invalid token.' };
    }

    if (request.expiresAt < new Date()) {
        delete restoreRequests[username];
        return { error: 'Token has expired.' };
    }

    delete restoreRequests[username]; // Remove the request after validation
    return { success: true };
};


export const loadFromDump = async (user, options = {}) => {
    const { modelsOnly = false } = options;
    const action = modelsOnly ? 'restore-models' : 'full-restore';
    logger.info(`[${action}] Starting for user: ${user.username}`);

    let encryptedKey = readKeyFromFile(user);
    if (!encryptedKey) {
        throw new Error("No encryption key found for this user. Cannot restore.");
    }

    const userId = getObjectHash({user: user.username});
    // --- La logique pour trouver le fichier de backup (local ou S3) reste la même ---
    // (le code existant pour trouver/télécharger le backupFilePath va ici)
    // ...
    let backupFilePath; // Assurez-vous que cette variable est bien définie avec le chemin du fichier .tar.gz
    // Exemple simplifié :
    const backupDir = getBackupDir();
    const backupFilenameRegex = new RegExp(`^backup_${userId}_(\\d+)\\.tar\\.gz$`);
    const backupFiles = fs.readdirSync(backupDir).filter(filename => backupFilenameRegex.test(filename));
    if (backupFiles.length === 0) throw new Error(`Aucun fichier de sauvegarde local trouvé pour l'utilisateur ${user.username}.`);
    const latestBackupFile = backupFiles.sort((a, b) => parseInt(b.match(backupFilenameRegex)[1], 10) - parseInt(a.match(backupFilenameRegex)[1], 10))[0];
    backupFilePath = path.join(backupDir, latestBackupFile);
    // --- Fin de la logique de recherche de fichier ---

    const tmpRestoreDir = path.join(backupDir, `tmp_restore_${userId}_${Date.now()}`);

    try {
        await runCryptoWorkerTask('decrypt', { filePath: backupFilePath, password: encryptedKey });
        if (!fs.existsSync(tmpRestoreDir)) {
            fs.mkdirSync(tmpRestoreDir, { recursive: true });
        }
        await tar.extract({ file: backupFilePath, gzip: true, C: tmpRestoreDir, sync: true });

        // --- NETTOYAGE SÉCURISÉ AVANT RESTAURATION ---
        const datasCollection = getCollection("datas");

        if (modelsOnly) {
            // Supprime uniquement les modèles de l'utilisateur
            await modelsCollection.deleteMany({ _user: user.username });
            logger.info(`[${action}] Deleted existing models for user ${user.username}.`);
        } else {
            // Restauration complète : supprime les données, modèles, fichiers et alertes de l'utilisateur
            await datasCollection.deleteMany({ _user: user.username });
            await modelsCollection.deleteMany({ _user: user.username });

            const filesCollection = getCollection("files");
            const userFiles = await filesCollection.find({ user: user.username, _model: "privateFile" }).toArray();
            for (const file of userFiles) {
                await removeFile(file.guid, user).catch(e => logger.error(e.message));
            }
            await cancelAlerts(user);
            logger.info(`[${action}] Cleaned existing data, models, files, and alerts for user ${user.username}.`);
        }

        // --- EXÉCUTION DE MONGORESTORE ---
        const restoreSourceDir = path.join(tmpRestoreDir, dbName);
        if (!fs.existsSync(restoreSourceDir)) {
            throw new Error(`Restore source directory (${restoreSourceDir}) not found.`);
        }

        let command;
        const args = [
            '--uri', dbUrl,
            '--db', dbName
        ];

        if (modelsOnly) {
            args.push('--nsInclude', `${dbName}.models`);
        } else {
            // mongorestore accepte plusieurs fois l'option --nsInclude
            args.push('--nsInclude', `${dbName}.datas`);
            args.push('--nsInclude', `${dbName}.models`);
        }
        // Le répertoire source est le dernier argument
        args.push(restoreSourceDir);


        logger.info(`[${action}] Executing restore command: ${command}`);
        await execFileAsync('mongorestore', args);
        
        // --- Tâches Post-Restauration ---
        await scheduleAlerts();
        await scheduleWorkflowTriggers();
        modelsCache.flushAll(); // Vider le cache des modèles

        logger.info(`[${action}] Restore successful for user ${user.username}.`);

    } finally {
        // --- Nettoyage final ---
        if (fs.existsSync(tmpRestoreDir)) {
            await fs.promises.rm(tmpRestoreDir, { recursive: true, force: true });
        }
        // Il est préférable de rechiffrer le fichier de backup après l'avoir utilisé
        if (fs.existsSync(backupFilePath)) {
            await runCryptoWorkerTask('encrypt', { filePath: backupFilePath, password: encryptedKey });
        }
    }
};

// Fonction pour générer une clé aléatoire et la stocker dans un fichier
const generateAndStoreKey = (user) => {
    const backupDir = getBackupDir();
    const keyFile = path.join(backupDir, getObjectHash({id:getUserId(user)})+'_encryption.key');
    const key = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(keyFile, key, { mode: 0o600 }); // Permissions strictes
    return key;
};

// Fonction pour lire la clé depuis le fichier
const readKeyFromFile = (user) => {
    const backupDir = getBackupDir();
    const keyFile = path.join(backupDir, getObjectHash({id:getUserId(user)})+'_encryption.key');
    if (fs.existsSync(keyFile)) {
        return fs.readFileSync(keyFile, 'utf8');
    }
    return null;
};

// C:/Dev/data-primals-engine/src/modules/data.js

export const dumpUserData = async (user) => {
    const s3Config = user.configS3;
    const backupDir = getBackupDir();
    const userId = getObjectHash({ user: user.username });
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

        const collections = await MongoDatabase.listCollections().toArray();
        for (const collection of collections) {
            const collsToBackup = [await getUserCollectionName(user), 'models'];
            if (collsToBackup.includes(collection.name)) {
                const query = { _user: user.username };
                const args = [
                    '--uri', dbUrl,
                    '--db', dbName,
                    '--out', localTempDumpDir,
                    '--collection', collection.name,
                    '--query', JSON.stringify(query)
                ];
                logger.info(`Exécution de la commande : mongodump ${args.join(' ')}`);
                await execFileAsync('mongodump', args);
            }
        }

        const dumpSourceDir = path.join(localTempDumpDir, dbName);
        if (fs.existsSync(dumpSourceDir)) {
            await tar.create({ gzip: true, file: localArchivePath, C: localTempDumpDir }, [dbName]);
            logger.info(`Archive de sauvegarde locale créée : ${localArchivePath}`);
        } else {
            logger.warn(`Le répertoire de dump ${dumpSourceDir} était vide. Aucune archive n'a été créée.`);
            // On s'arrête ici car il n'y a rien à traiter
            return Promise.resolve();
        }

        await encryptFile(localArchivePath, encryptedKey);

        if (s3Config && s3Config.bucketName) {
            await uploadToS3(s3Config, localArchivePath, finalArchiveName);
            fs.unlinkSync(localArchivePath); // Supprime l'archive locale après l'upload
        } else {
            logger.info(`Aucune configuration S3 trouvée. La sauvegarde reste locale : ${localArchivePath}.`);
        }

        logger.info(`Sauvegarde réussie pour l'utilisateur ${user.username}.`);
        await manageBackupRotation(user, backupFrequency, s3Config);

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
            fs.rmSync(localTempDumpDir, { recursive: true, force: true });
            logger.info(`Répertoire de dump temporaire ${localTempDumpDir} supprimé.`);
        }
    }
};
async function manageBackupRotation(user, backupFrequency, s3Config = null) { // Accepter s3Config
    const userId = getObjectHash({user:user.username});
    let filesToManage = [];

    if (s3Config && s3Config.bucketName) {
        logger.info(`Gestion de la rotation des sauvegardes S3 pour ${userid}.`);
        const s3Backups = await listS3Backups(s3Config);
        // Filtrer pour ne garder que les backups de cet utilisateur et trier
        filesToManage = s3Backups
            .filter(f => f.filename.startsWith(`backup_${userId}_`) && f.filename.endsWith('.tar.gz'))
            .map(f => ({ name: f.filename, key: f.key, timestamp: f.timestamp })) // listS3Backups devrait fournir le timestamp
            .sort((a, b) => b.timestamp - a.timestamp); // Tri décroissant (plus récent en premier)

    } else {
        logger.info(`Gestion de la rotation des sauvegardes locales pour ${userId}.`);
        const backupDir = getBackupDir();
        const localFiles = fs.readdirSync(backupDir);
        filesToManage = localFiles
            .filter(f => !fs.lstatSync(path.join(backupDir, f)).isDirectory() && f.startsWith(`backup_${userId}_`) && f.endsWith('.tar.gz'))
            .map(f => {
                const match = f.match(/_(\d+)\.tar\.gz$/);
                return { name: f, key: path.join(backupDir, f), timestamp: match ? parseInt(match[1], 10) : 0 };
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
                    const s3 = new AWS.S3({ /* ... config ... */ accessKeyId: s3Config.accessKeyId, secretAccessKey: s3Config.secretAccessKey, region: s3Config.region });
                    await s3.deleteObject({ Bucket: s3Config.bucketName, Key: fileInfo.key }).promise();
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

const middlewareLogger = async (req, res, next) => {
    const startTime = process.hrtime();
    let responseBodyChunk = null; // Pour capturer le corps de la réponse si nécessaire

    //
    //Optionnel: Capturer le corps de la réponse (peut impacter la performance)
    const originalSend = res.send;
    res.send = function (body) {
        responseBodyChunk = body; // Capture le corps avant l'envoi
        originalSend.call(this, body);
    };

    res.on('finish', async () => {
        try {
            await logApiRequest(req, res, req.me, startTime, ( !req.hideApiLogs ) ? JSON.parse(responseBodyChunk) : { message: "The request log has been encrypted because of a clear password in the request."}, res.locals.error);
        } catch (e) {

        }
    });

    res.on('error', async (err) => {
        // Logger aussi en cas d'erreur avant 'finish'
        try{
            await logApiRequest(req, res, req.me, startTime, null, err);
        } catch (e) {

        }
    });

    next();
};

async function logApiRequest(req, res, user, startTime, responseBody = null, error = null) {
    const endTime = process.hrtime(startTime);
    const latencyMs = (endTime[0] * 1e3 + endTime[1] * 1e-6); // Calculer la latence en ms

    const headers = req.headers;
    delete headers['Cookie'];
    delete headers['Authorization'];

    // 1. Préparer l'objet de données pour le modèle 'request'
    const logEntryData = {
        // Champs requis
        timestamp: new Date(),
        method: req.method,
        url: req.originalUrl || req.url, // Utiliser originalUrl si disponible (Express)
        status: res.statusCode,
        latencyMs: parseFloat(latencyMs.toFixed(3)), // Arrondir et convertir en nombre

        // Champs optionnels
        ip: req.clientIp.substring('::ffff:'.length) || req.clientIp, // Obtenir l'IP du client
        //requestHeaders: JSON.stringify(req.headers).substring(0, maxStringLength), // Optionnel: Peut être volumineux
        requestBody: req.fields,
        responseBody: res.statusCode >= 400 && responseBody ? JSON.stringify(responseBody).substring(0, maxStringLength) : null, // Optionnel: Peut être volumineux
        error: error ? String(error.message || error) : null // Message d'erreur si applicable
    };

    try {
        // 2. Appeler insertData pour enregistrer le log
        //    - 'request' est le nom du modèle
        //    - logEntryData contient les données
        //    - [] car pas de fichiers associés à ce log
        //    - null pour l'utilisateur (le log est système) ou 'user' si tu veux lier l'action à l'utilisateur
        //    - false pour ne pas bypasser la validation (important !)
        const result = await insertData('request', logEntryData, [], user._user ? { username: user._user } : user, false);

        if (result.success) {
            console.log(`[API Log] Request logged successfully. ID: ${result.insertedIds?.join(', ')}`);
        } else {
            // Gérer l'échec de l'insertion du log (ne devrait pas bloquer la réponse principale)
            console.error(`[API Log] Failed to log request: ${result.error}`);
        }
    } catch (insertError) {
        // Gérer les erreurs inattendues lors de l'insertion
        console.error(`[API Log] Unexpected error during logging: ${insertError.message}`, insertError.stack);
    }
}


/**
 * Installe les modèles et les données d'un pack pour un utilisateur.
 * Gère les modèles, les données, et les relations complexes (y compris les références futures)
 * via un système en deux passes optimisé.
 *
 * @param {object} logger - L'instance du logger.
 * @param {string} packId - L'ID du pack à installer depuis la collection 'packs'.
 * @param {object} user - L'objet utilisateur pour qui installer le pack.
 * @param {string} lang - Le code de langue pour les données spécifiques.
 * @returns {Promise<{success: boolean, summary: object, errors: Array, modifiedCount: number}>}
 */
export async function installPack(packId, user, lang) {
    const packsCollection = getCollection('packs');
    const pack = await packsCollection.findOne({ _id: new ObjectId(packId) });

    if (!pack) {
        throw new Error(`Pack with ID ${packId} not found.`);
    }

    logger.info(`--- Starting installation of pack '${pack.name}' for user '${user.username}' ---`);

    const summary = {
        models: { installed: [], skipped: [], failed: [] },
        datas: { inserted: 0, updated: 0, skipped: 0, failed: 0 }
    };
    const errors = [];
    const collection = await getCollectionForUser(user);
    const tempIdToNewIdMap = {};
    const linkCache = new Map();

    // --- PHASE 1: Installation des Modèles ---
    if (Array.isArray(pack.models)) {
        const userModels = await modelsCollection.find({ _user: user.username }).toArray();
        const userModelNames = userModels.map(m => m.name);

        for (const modelOrName of pack.models) {
            try {
                const modelName = typeof modelOrName === 'string' ? modelOrName : modelOrName?.name;
                if (!modelName) throw new Error('Model definition in pack is missing a name.');

                if (userModelNames.includes(modelName)) {
                    logger.debug(`[Model Install] Skipping '${modelName}': already exists for user.`);
                    summary.models.skipped.push(modelName);
                    continue;
                }

                let modelToInstall;
                if (typeof modelOrName === 'string') {
                    const sharedModel = await modelsCollection.findOne({ name: modelName, _user: { $exists: false } });
                    if (!sharedModel) throw new Error(`Shared model '${modelName}' not found.`);
                    const { _id, ...sharedModelData } = sharedModel;
                    modelToInstall = sharedModelData;
                } else {
                    modelToInstall = { ...modelOrName };
                }

                modelToInstall._user = user.username;
                delete modelToInstall._id;
                modelToInstall.locked = false;
                if (modelToInstall.fields) modelToInstall.fields.forEach(f => f.locked = false);

                validateModelStructure(modelToInstall);
                await modelsCollection.insertOne(modelToInstall);
                summary.models.installed.push(modelName);

            } catch (e) {
                const modelName = typeof modelOrName === 'string' ? modelOrName : modelOrName?.name || 'unknown';
                errors.push(`Failed to install model '${modelName}': ${e.message}`);
                summary.models.failed.push(modelName);
            }
        }
    }

    // --- PHASE 2: Installation des Données ---
    const dataToInstall = { ...pack.data?.all, ...pack.data?.[user.lang || lang || 'en'] };
    if (!dataToInstall || typeof dataToInstall !== 'object' || Object.keys(dataToInstall).length === 0) {
        logger.warn(`Pack '${pack.name}' has no data to install.`);
        return { success: errors.length === 0, summary, errors, modifiedCount: 0 };
    }

    const linkQueue = [];
    for (const modelName in dataToInstall) {
        if (Array.isArray(dataToInstall[modelName])) {
            for (const docSource of dataToInstall[modelName]) {
                const tempId = new ObjectId().toString();
                docSource._temp_pack_id = tempId;

                for (const fieldName in docSource) {
                    if (isPlainObject(docSource[fieldName]) && docSource[fieldName].$link) {
                        // CORRECTION 1: On ajoute le nom du modèle source à la file d'attente
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

    // --- PASSE 1: INSERTION PAR LOT ---
    logger.info("[Pack Install] Starting Pass 1: Batch Insertion & ID Mapping.");
    for (const modelName in dataToInstall) {
        if (!Object.prototype.hasOwnProperty.call(dataToInstall, modelName) || !Array.isArray(dataToInstall[modelName])) continue;

        const documents = dataToInstall[modelName];
        if (documents.length === 0) continue;

        const docsToInsert = [];
        console.log(modelName, user);

        const modelDefForHash = await getModel(modelName, user);

        for (const docSource of documents) {
            let docForInsert = { ...docSource };

            for (const key in docForInsert) {
                if (isPlainObject(docForInsert[key]) && docForInsert[key].$link) {
                    docForInsert[key] = null;
                }
            }

            const tempId = docForInsert._temp_pack_id;
            delete docForInsert._id;
            delete docForInsert._temp_pack_id;

            docForInsert._user = user.username;
            docForInsert._model = modelName;
            docForInsert._hash = getFieldValueHash(modelDefForHash, docForInsert);

            const existingDoc = await collection.findOne({ _hash: docForInsert._hash, _user: user.username, _model: modelName }, { projection: { _id: 1 } });
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

                const result = await collection.insertMany(finalDocsToInsert, { ordered: false });
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

    // --- PASSE 2: LIAISON DES RÉFÉRENCES ---
    logger.info(`[Pack Install] Starting Pass 2: Linking ${linkQueue.length} references.`);
    for (const linkOp of linkQueue) {
        // CORRECTION 2: On récupère le nom du modèle source
        const { sourceTempId, sourceModelName, fieldName, linkSelector } = linkOp;

        const sourceId = tempIdToNewIdMap[sourceTempId];
        if (!sourceId) {
            logger.warn(`[LINK FAILED] Could not find newly inserted document for temp ID ${sourceTempId}. Skipping link.`);
            continue;
        }

        const cacheKey = JSON.stringify({ selector: linkSelector, user: user.username });
        let targetIds = null; // Renommé en 'targetIds' car c'est toujours un tableau

        const targetModelName = linkSelector._model;
        delete linkSelector['_model'];

        // CORRECTION 3: On récupère la définition du modèle SOURCE
        const sourceModelDef = await getModel(sourceModelName, user);

        try {
            if (linkCache.has(cacheKey)) {
                targetIds = linkCache.get(cacheKey);
                logger.debug(`[LINK CACHE HIT] for ${cacheKey}`);
            } else {
                const finalSelector = { ...linkSelector };
                delete finalSelector['_model']; // nécessaire
                // CORRECTION 4: Appel corrigé à searchData
                const { data: targetDocs } = await searchData({ user, query: { model: targetModelName, filter: finalSelector } });

                if (targetDocs && targetDocs.length > 0) {
                    targetIds = targetDocs.map(d => d._id); // Récupère un tableau d'ObjectIds
                    linkCache.set(cacheKey, targetIds);
                }
            }

            if (targetIds && targetIds.length > 0) {
                // CORRECTION 5: On cherche le champ dans la définition du modèle SOURCE
                const fieldDef = sourceModelDef.fields.find(f => f.name === fieldName);
                if (!fieldDef) {
                    logger.warn(`[LINK FAILED] Field '${fieldName}' not found in source model '${sourceModelName}' for doc ${sourceId}.`);
                    errors.push(`[LINK FAILED] Field '${fieldName}' not found in source model '${sourceModelName}' for doc ${sourceId}.`);
                    summary.datas.failed++;
                    continue;
                }

                // CORRECTION 6: On gère correctement les cas multiples et uniques
                const valueToSet = fieldDef.multiple ? targetIds.map(id => id.toString()) : targetIds[0].toString();

                await collection.updateOne(
                    { _id: sourceId },
                    { $set: { [fieldName]: valueToSet } }
                );
                summary.datas.updated++;
            } else {
                const errorMsg = `[LINK FAILED] Could not find target document for linking: ${JSON.stringify(linkSelector)}`;
                logger.warn(errorMsg);
                errors.push(errorMsg);
                summary.datas.failed++;
            }
        } catch (e) {
            const errorMsg = `[LINK CRITICAL] Error during linking for doc ${sourceId}: ${e.message}`;
            logger.error(errorMsg, e.stack);
            errors.push(errorMsg);
            summary.datas.failed++;
        }
    }

    const modifiedCount = summary.datas.inserted + summary.datas.updated;
    logger.info(`--- Installation of pack '${pack.name}' finished. ---`);
    return { success: errors.length === 0, summary, errors, modifiedCount };
}


export const installAllPacks = async () => {

    const packs = await getAllPacks();

    console.log(util.inspect(packs, false, 20, true));
    await packsCollection.deleteMany({ _user: { $exists : false }});
    await packsCollection.insertMany(packs);
}

// Dans C:/Dev/data-primals-engine/src/modules/data.js
// Dans C:/Dev/data-primals-engine/src/modules/data.js

// ... (imports inchangés)

export async function handleDemoInitialization(req, res) {
    const user = req.me;
    const body = req.fields;
    const models = (Object.keys(profiles).includes(body.profile) && profiles[body.profile]) || '';
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

        // Create and install pack
        const packsCollection = getCollection('packs');
        const tempPack = { ...packToInstall, _user: 'system_temp' };
        const tempInsert = await packsCollection.insertOne(tempPack);
        const packId = tempInsert.insertedId;

        const result = await installPack(packId, user, req.query.lang || 'en');

        await packsCollection.deleteOne({ _id: packId });

        if (result.success || result.modifiedCount > 0) {
            logger.info(`[Demo Init] Pack installed successfully for user '${user.username}'.`);
            res.status(200).json({ success: true, message: "Demo environment initialized successfully.", summary: result.summary });
        } else {
            logger.error(`[Demo Init] Pack installation failed for user '${user.username}'.`);
            res.status(500).json({ success: false, error: 'Demo pack installation failed.', errors: result.errors });
        }

    } catch (error) {
        logger.error(`[Demo Init] Critical error during initialization for user '${user.username}':`, error);
        res.status(500).json({ success: false, error: 'An internal server error occurred during initialization.' });
    }
}