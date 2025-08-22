import NodeCache from "node-cache";
import path from "node:path";
import {Worker} from 'worker_threads';
import {fileURLToPath} from "node:url";
export const modelsCache = new NodeCache( { stdTTL: 100, checkperiod: 120 } );

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const mongoDBWhitelist = [
    "$$NOW", "$in", "$eq", "$gt", "$gte", "$in", "$lt", "$lte", "$ne", "$nin", "$type", "$size",
    "$and", "$not", "$nor", "$or", "$regexMatch", "$find", "$elemMatch", "$filter", "$toString", "$toObjectId",
    "$concat",
    '$add', '$subtract', '$multiply', '$divide', '$mod', '$pow', "$sqrt",
    "$rand",
    "$abs", '$sin', '$cos', '$tan', '$asin', '$acos', '$atan',
    "$toDate", "$toBool", "$toString", "$toInt", "$toDouble",
    "$dateDiff", "$dateSubtract", "$dateAdd", "$dateToString",
    '$year', '$month', '$week', '$dayOfMonth', '$dayOfWeek', '$dayOfYear', '$hour', '$minute', '$second', '$millisecond'
];
export let importJobs = {};


/**
 * Exécute une tâche d'import/export (parsing, stringify) dans un worker thread.
 * @param {('parse-json'|'parse-csv'|'stringify-json')} action - L'action à effectuer.
 * @param {object} payload - Les données nécessaires pour l'action.
 * @returns {Promise<any>} - Une promesse qui se résout avec les données traitées.
 */
export function runImportExportWorker(action, payload) {
    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(process.cwd(), './src/workers/import-export-worker.js');
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
export function runCryptoWorkerTask(action, payload) {
    return new Promise((resolve, reject) => {
        const workerPath = path.resolve(__dirname, '../../workers/crypto-worker.js');
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