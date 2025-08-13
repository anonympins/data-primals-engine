import {getCollection, getCollectionForUser, isObjectId} from "./mongodb.js";
import schedule from "node-schedule";
import {ObjectId} from "mongodb";
import crypto from "node:crypto";

import ivm from 'isolated-vm';

import {Logger} from "../gameObject.js";
import {deleteData, getModel, insertData, patchData, scheduleAlerts, searchData} from "./data/index.js";
import {emailDefaultConfig, maxExecutionsByStep, maxWorkflowSteps} from "../constants.js";
import {ChatOpenAI} from "@langchain/openai";
import {ChatGoogleGenerativeAI} from "@langchain/google-genai";
import {ChatPromptTemplate} from "@langchain/core/prompts";
import { ChatDeepSeek } from "@langchain/deepseek";
import i18n from "../../src/i18n.js";
import {sendEmail} from "../email.js";

import * as workflowModule from './workflow.js';
import util from "node:util";
import {object_equals} from "../core.js";
import {isConditionMet} from "../filter.js";
import {urlData} from "../../client/src/core/data.js";
import { services } from '../services/index.js';
import {getEnv} from "./user.js";

let logger = null;
export async function onInit(defaultEngine) {
    logger = defaultEngine.getComponent(Logger);

    await scheduleWorkflowTriggers();
}



/**
 * Déclenche un workflow par son nom et lui passe des données de contexte.
 * C'est la fonction clé à exposer aux endpoints pour lancer des processus métier.
 *
 * @param {string} name - Le nom du workflow à exécuter.
 * @param {object} data - Les données à injecter dans context.triggerData.
 * @param {object} user - L'objet utilisateur qui initie l'action.
 * @returns {Promise<{success: boolean, message?: string, runId?: ObjectId}>}
 */
export async function runWorkflowByName(name, data, user) {
    if (!name) {
        return { success: false, message: "Workflow name is required." };
    }

    const dbCollection = await getCollectionForUser(user);

    // 1. Trouver la définition du workflow par son nom
    const workflowDefinition = await dbCollection.findOne({ _model: 'workflow', name });

    if (!workflowDefinition) {
        const msg = `Workflow with name "${name}" not found.`;
        logger.error(`[runWorkflowByName] ${msg}`);
        return { success: false, message: msg };
    }

    // 2. Créer le document workflowRun
    const workflowRunData = {
        _model: 'workflowRun',
        _user: user._user || user.username,
        workflow: workflowDefinition._id,
        contextData: { triggerData: data }, // Les données passées deviennent le triggerData
        status: 'pending',
        startedAt: new Date()
    };

    const insertResult = await dbCollection.insertOne(workflowRunData);
    logger.info(`[runWorkflowByName] Created workflowRun ${insertResult.insertedId} for workflow "${name}".`);

    // 3. Lancer le traitement de manière asynchrone
    await processWorkflowRun(insertResult.insertedId, user);

    return { success: true, runId: insertResult.insertedId };
}
/**
 * Exécute une fonction de manière sécurisée en s'assurant qu'une seule instance
 * s'exécute à la fois, grâce à un système de verrouillage distribué basé sur la base de données.
 * Cette fonction est atomique et conçue pour éviter les conditions de course.
 *
 * @param {string} jobId - Un identifiant unique pour la tâche (ex: 'workflowTrigger_monId').
 * @param {Function} jobFunction - La fonction asynchrone à exécuter si le verrou est acquis.
 * @param {number} [lockDurationMinutes=5] - La durée en minutes pendant laquelle le verrou est considéré comme valide.
 * @returns {Promise<void>}
 */
export async function runScheduledJobWithDbLock(jobId, jobFunction, lockDurationMinutes = 5) {
    const jobsCollection = getCollection('job_locks');
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockDurationMinutes * 60 * 1000);
    let lockAcquired = false; // Drapeau pour savoir si nous devons libérer le verrou

    // Le bloc try...finally garantit que la libération du verrou est tentée
    // même si la fonction jobFunction lève une exception.
    try {
        // --- PHASE 1: ACQUISITION DU VERROU (de manière atomique) ---

        // Tentative 1: Mettre à jour un verrou existant qui a expiré.
        // C'est le cas le plus courant après la première exécution.
        // L'opération `updateOne` est atomique.
        const updateResult = await jobsCollection.updateOne(
            {
                jobId: jobId,
                lockedUntil: { $lt: now } // Le verrou est disponible si sa date d'expiration est dans le passé
            },
            {
                $set: { lockedUntil: lockExpiresAt, lastStarted: now },
                $inc: { runCount: 1 }
            }
        );

        if (updateResult.modifiedCount === 1) {
            // Succès : nous avons mis à jour le verrou expiré et l'avons acquis.
            lockAcquired = true;
            logger.info(`[Lock] Verrou existant acquis pour la tâche ${jobId}.`);
        } else {
            // Si aucun document n'a été modifié, soit le verrou n'existe pas,
            // soit il est actuellement détenu par un autre processus.
            // Tentative 2: Insérer un nouveau document de verrou.
            // Cette opération échouera avec une erreur de clé dupliquée (code 11000)
            // si un autre processus a réussi à créer le verrou entre-temps.
            try {
                await jobsCollection.insertOne({
                    jobId: jobId,
                    lockedUntil: lockExpiresAt,
                    lastStarted: now,
                    runCount: 1
                });
                // Succès : nous avons créé un nouveau verrou et l'avons acquis.
                lockAcquired = true;
                logger.info(`[Lock] Nouveau verrou créé pour la tâche ${jobId}.`);
            } catch (insertError) {
                if (insertError.code === 11000) {
                    // Comportement attendu : un autre processus a acquis le verrou.
                    // Ce n'est pas une erreur, on saute simplement l'exécution.
                    logger.info(`[Lock] Impossible d'acquérir le verrou pour ${jobId}, un autre processus le dent. Exécution ignorée.`);
                } else {
                    // Une erreur de base de données inattendue s'est produite.
                    throw insertError;
                }
            }
        }

        // --- PHASE 2: EXÉCUTION DE LA TÂCHE ---
        if (lockAcquired) {
            logger.info(`[Lock] Exécution de la fonction pour la tâche ${jobId}...`);
            await jobFunction();
            logger.info(`[Lock] La fonction pour la tâche ${jobId} s'est terminée.`);
        }

    } catch (error) {
        // Capture les erreurs de la `jobFunction` ou les erreurs inattendues de la base de données.
        logger.error(`Erreur durant l'exécution de la tâche verrouillée ${jobId}:`, error);
    } finally {
        // --- PHASE 3: LIBÉRATION DU VERROU ---
        if (lockAcquired) {
            try {
                // On libère le verrou en mettant sa date d'expiration dans le passé,
                // le rendant immédiatement disponible pour la prochaine exécution.
                await jobsCollection.updateOne(
                    { jobId: jobId },
                    { $set: { lockedUntil: new Date(0) } }
                );
                logger.info(`[Lock] Verrou libéré pour la tâche ${jobId}.`);
            } catch (releaseError) {
                // Il est crucial de logger cette erreur, car un verrou non libéré peut bloquer les futures exécutions.
                logger.error(`CRITIQUE: Échec de la libération du verrou pour la tâche ${jobId}. Une intervention manuelle peut être nécessaire.`, releaseError);
            }
        }
    }
}


/**
 * Planifie l'exécution des workflows déclenchés par une cronExpression.
 * Utilise runScheduledJobWithDbLock pour assurer l'exécution unique à travers plusieurs instances.
 */
export async function scheduleWorkflowTriggers() {
    logger.info('Starting scheduling of workflow triggers...');
    try {
        const datasCollection = getCollection('datas'); // Ou la collection appropriée pour les workflows

        // Trouver tous les workflows actifs avec une cronExpression définie
        const workflowsToSchedule = await datasCollection.find({
            _model: 'workflowTrigger',
            cronExpression: { $exists: true, $ne: "" }
            // Ajoutez d'autres conditions si nécessaire (ex: active: true)
        }).toArray();

        console.log(`Found ${workflowsToSchedule.length} workflow triggers with cron expressions to schedule.`);

        for (const workflow of workflowsToSchedule) {
            const jobId = `workflowTrigger_${workflow._id}`; // ID unique pour le verrou du job
            const cronExpression = workflow.cronExpression;
            if( !cronExpression )
                continue;
            // Planifier la tâche en utilisant node-schedule
            schedule.scheduleJob(cronExpression, async () => {
                console.log(`Cron triggered for job ${jobId}. Attempting to run with lock...`);

                // Utiliser runScheduledJobWithDbLock pour exécuter la tâche
                await runScheduledJobWithDbLock(
                    jobId,
                    async () => {
                        // --- Début de la logique spécifique au workflow ---
                        // C'est ici que vous mettriez le code qui doit être exécuté
                        // lorsque le workflow est déclenché par le cron.
                        // Par exemple:
                        console.log(`Executing task logic for workflow ${workflow.name} (ID: ${workflow._id})`);

                        // Exemple:
                        // const targetModel = workflow.targetModel;
                        // const action = workflow.action;
                        // await executeWorkflowAction(targetModel, action, workflow.parameters);

                        // Simule une tâche asynchrone
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        console.log(`Task logic completed for workflow ${workflow.name} (ID: ${workflow._id})`);
                        // --- Fin de la logique spécifique au workflow ---
                    },
                    workflow.lockDurationMinutes || 5 // Utilise la durée du workflow ou une valeur par défaut
                );
            });

        }

        console.log('Finished scheduling workflow triggers.');

    } catch (error) {
        console.error('Error during scheduling of workflow triggers:', error);
    }
}

async function handleWaitAction(actionDef, contextData, user) {
    const { duration, durationUnit } = actionDef;
    if (!duration || !durationUnit) {
        return { success: false, message: "Wait action requires 'duration' and 'durationUnit'." };
    }

    // Retourne un statut spécial que le moteur de workflow comprendra
    return {
        success: true,
        status: 'paused', // Statut spécial
        duration,
        durationUnit,
        message: `Workflow will be paused for ${duration} ${durationUnit}.`
    };
}


export async function executeSafeJavascript(actionDef, context, user) {
    const code = actionDef.script;
    const collectedLogs = [];
    const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128MB memory limit

    try {
        const vmContext = await isolate.createContext();
        const jail = vmContext.global;

        const find = async (modelName, filter) => {
            const result = await searchData({ model: modelName, filter: JSON.parse(filter) }, user);
            return new ivm.ExternalCopy(result).copyInto();
        };
        const findOne = async (modelName, filter) => {
            const result = await searchData({ model: modelName, filter: JSON.parse(filter), limit: 1 }, user);
            return new ivm.ExternalCopy(result.data?.[0] || null).copyInto();
        };

        // 1. Build the sandboxed API methods
        await jail.set('_workflow_run', new ivm.Reference(async (name, contextData) => {
            const result = await runWorkflowByName(name, JSON.parse(contextData), user);
            return new ivm.ExternalCopy(result).copyInto();
        }));
        await jail.set('_db_create', new ivm.Reference(async (modelName, dataObject) => {
            const result = await insertData(modelName, JSON.parse(dataObject), {}, user, false);
            if (result.success && result.insertedIds) {
                result.insertedIds = result.insertedIds.map(id => id.toString());
            }
            return new ivm.ExternalCopy(result).copyInto();
        }));
        await jail.set('_db_find', new ivm.Reference(find));
        await jail.set('_db_findOne', new ivm.Reference(findOne));

        await jail.set('_db_update', new ivm.Reference(async (modelName, filter, updateObject) => patchData(modelName, JSON.parse(filter), JSON.parse(updateObject), {}, user, false)));
        await jail.set('_db_delete', new ivm.Reference(async (modelName, filter) => deleteData(modelName, JSON.parse(filter), user, false)));

        const createLoggerMethod = (level) => {
            return (...args) => {
                const message = args.join(' ');
                collectedLogs.push({
                    level,
                    message,
                    timestamp: new Date().toISOString()
                });
                logger.trace(level, '[VM Script]', message);
            };
        };

        await jail.set('_log_info', createLoggerMethod('info'));
        await jail.set('_log_warn', createLoggerMethod('warn'));
        await jail.set('_log_error', createLoggerMethod('error'));
        await jail.set('_env_get', new ivm.Reference(async (variableName) => {
            if (!variableName) return null;
            const result = await searchData({ model: 'env', filter: { name: variableName }, limit: 1 }, user);
            return new ivm.ExternalCopy(result.data?.[0]?.value || null).copyInto();
        }));
        await jail.set('_env_get_all', new ivm.Reference(async () => {
            const result = await getEnv(user);
            return new ivm.ExternalCopy(result).copyInto();
        }));

        // Contexte sécurisé
        const safeContext = JSON.parse(JSON.stringify(context));
        await jail.set('context', new ivm.ExternalCopy(safeContext).copyInto());

        // Exécution
        const fullScript = `
            const normalizeArgs = args => args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    return JSON.stringify(arg); // Convert objects to strings
                }
                return arg;
            });
            const db = {
                create: (...args) => _db_create.applySyncPromise(null, normalizeArgs(args)),
                find: (...args) => _db_find.applySyncPromise(null, normalizeArgs(args)),
                findOne: (...args) => _db_findOne.applySyncPromise(null, normalizeArgs(args)),
                update: (...args) => _db_update.applySyncPromise(null, normalizeArgs(args)),
                delete: (...args) => _db_delete.applySyncPromise(null, normalizeArgs(args))
            };
            
            const workflow = {
                run: (...args) => _workflow_run.applySyncPromise(null, normalizeArgs(args))
            };

            const logger = {
                info: _log_info,
                warn: _log_warn,
                error: _log_error
            };

            const env = {
                get: _env_get,
                getAll: _env_get_all
            };
            
            (async function() {
                ${code}
            })();
        `;

        const TIMEOUT = 5000;
        const script = await isolate.compileScript(fullScript, { timeout: TIMEOUT });
        const result = await script.run(vmContext, {
            timeout: TIMEOUT,
            promise: true,
            copy: true // Copie automatique du résultat
        });

        return {
            success: true,
            data: result,
            logs: collectedLogs,
            updatedContext: { result }
        };

    } catch (error) {
        const errorMessage = `Script execution failed: ${error.message}`;
        const finalErrorMessage = logger.trace('critical', `[VM Script] ${errorMessage}\n${error.stack}`);
        collectedLogs.push({
            level: 'critical',
            message: finalErrorMessage,
            timestamp: new Date().toISOString()
        });
        return { success: false, message: errorMessage, logs: collectedLogs };
    } finally {
        // 3. CRUCIAL: Dispose of the isolate to prevent memory leaks
        if (isolate && !isolate.isDisposed) {
            isolate.dispose();
        }
    }
}

/**
 * Handles the 'HttpRequest' workflow action.
 * Sends an HTTP request to a specified URL with substituted data using native fetch.
 *
 * @param {object} actionDef - The definition of the 'Webhook' action.
 * @param {object} contextData - The current workflow run context data.
 * @param {object} user - The user object (peut être utilisé pour l'authentification ou le logging).
 * @param {object} dbCollection - The MongoDB collection (moins pertinent ici, mais gardé pour la cohérence).
 * @returns {Promise<{success: boolean, message?: string, responseStatus?: number, responseBody?: any}>} - Result of the action.
 */
async function handleHttpRequestAction(actionDef, contextData, user, dbCollection) {
    const { name: actionName, _id: actionId, url, method = 'POST', headers: headersTemplate, body: bodyTemplate } = actionDef;

    // 1. Basic Validation
    if (!url) {
        const msg = `[handleHttpRequestAction] Action ${actionName} (${actionId}): Missing 'url'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }

    logger.info(`[handleHttpRequestAction] Action ${actionName} (${actionId}): Executing webhook. Method: ${method}`);

    try {
        // 2. Substitute Variables
        const substitutedUrl = await substituteVariables(url, contextData, user);
        let substitutedHeadersString;
        let substitutedBodyString;
        let headersObject = {};
        let bodyObject = null;

        // Substitute Headers (JSON string or object)
        if (headersTemplate) {
            if (typeof headersTemplate === 'string') {
                substitutedHeadersString = await substituteVariables(headersTemplate, contextData, user);
            } else if (typeof headersTemplate === 'object') {
                headersObject = await substituteVariables(headersTemplate, contextData, user);
            } else {
                logger.warn(`[handleHttpRequestAction] Action ${actionName} (${actionId}): 'headers' has an invalid type (${typeof headersTemplate}). Ignoring.`);
            }
        }

        // Substitute Body (JSON string or object) - only relevant for methods like POST, PUT, PATCH
        if (bodyTemplate && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            if (typeof bodyTemplate === 'string') {
                substitutedBodyString = await substituteVariables(bodyTemplate, contextData, user);
            } else if (typeof bodyTemplate === 'object') {
                bodyObject = await substituteVariables(bodyTemplate, contextData, user);
            } else {
                logger.warn(`[handleHttpRequestAction] Action ${actionName} (${actionId}): 'body' has an invalid type (${typeof bodyTemplate}). Ignoring.`);
            }
        }

        // 3. Parse substituted JSON strings
        if (substitutedHeadersString) {
            try {
                headersObject = JSON.parse(substitutedHeadersString);
                if (typeof headersObject !== 'object' || headersObject === null) {
                    throw new Error("Parsed headers is not a valid object.");
                }
            } catch (parseError) {
                logger.error(`[handleHttpRequestAction] Action ${actionName} (${actionId}): Failed to parse substituted 'headers' JSON. Error: ${parseError.message}. Using default headers. Substituted string: ${substitutedHeadersString}`);
                headersObject = { 'Content-Type': 'application/json' }; // Fallback
            }
        }
        // Ensure Content-Type if body is present and headers don't specify it
        if (bodyObject !== null || substitutedBodyString) {
            if (!headersObject['Content-Type'] && !headersObject['content-type']) {
                headersObject['Content-Type'] = 'application/json';
            }
        }


        if (substitutedBodyString) {
            try {
                // Try parsing first, maybe it's valid JSON already
                bodyObject = JSON.parse(substitutedBodyString);
            } catch (parseError) {
                // If parsing fails, treat it as a plain string body
                bodyObject = substitutedBodyString;
                // Adjust Content-Type if it was assumed to be JSON
                if (headersObject['Content-Type'] === 'application/json') {
                    headersObject['Content-Type'] = 'text/plain';
                }
            }
        }

        // 4. Prepare Fetch Options
        const fetchOptions = {
            method: method.toUpperCase(),
            headers: headersObject // Native fetch accepts an object directly
        };

        if (bodyObject !== null && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
            // Stringify if it's an object and content type is JSON, otherwise use as is
            if (typeof bodyObject === 'object' && headersObject['Content-Type'] === 'application/json') {
                fetchOptions.body = JSON.stringify(bodyObject);
            } else {
                fetchOptions.body = bodyObject; // Use string directly
            }
        }

        // 5. Execute Fetch Request using native fetch
        logger.info(`[handleHttpRequestAction] Action ${actionName} (${actionId}): Calling URL: ${substitutedUrl}`);
        const response = await fetch(substitutedUrl, fetchOptions); // Utilisation de fetch natif

        // 6. Process Response
        let responseBody;
        const contentType = response.headers.get('content-type');
        try {
            if (contentType && contentType.includes('application/json')) {
                responseBody = await response.json();
            } else {
                responseBody = await response.text();
            }
        } catch (responseParseError) {
            logger.error(`[handleHttpRequestAction] Action ${actionName} (${actionId}): Failed to parse response body. Error: ${responseParseError.message}`);
            // Try reading as text again in case of error during json parsing
            try {
                responseBody = await response.text();
            } catch (textError) {
                responseBody = "[Could not parse response body]";
            }
        }

        logger.info(`[handleHttpRequestAction] Action ${actionName} (${actionId}): Received response. Status: ${response.status}`);

        // 7. Return Result
        if (response.ok) { // Status code 200-299
            return {
                success: true,
                message: `Webhook executed successfully. Status: ${response.status}`,
                responseStatus: response.status,
                responseBody: responseBody,
                updatedContext: { httpResponse: responseBody }
            };
        } else {
            // Handle non-successful responses (4xx, 5xx)
            const errorMsg = `Webhook execution failed. Status: ${response.status}. Response: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`;
            logger.error(`[handleHttpRequestAction] Action ${actionName} (${actionId}): ${errorMsg}`);
            return {
                success: false,
                message: errorMsg,
                responseStatus: response.status,
                responseBody: responseBody
            };
        }

    } catch (error) {
        // Catch network errors or other unexpected errors during the process
        const msg = `[handleHttpRequestAction] Action ${actionName} (${actionId}): Unexpected error during webhook execution. Error: ${error.message}`;
        logger.error(msg, error.stack);
        return { success: false, message: msg };
    }
}

/**
 * Handles the 'CreateData' workflow action.
 * Substitutes variables, validates, and inserts a new document.
 *
 * @param {object} actionDef - The definition of the 'CreateData' action.
 * @param {object} contextData - The current workflow run context data.
 * @param {object} user - The user object.
 * @param {object} dbCollection - The MongoDB collection for the user.
 * @returns {Promise<{success: boolean, message?: string, insertedId?: ObjectId}>} - Result of the action.
 */
async function handleCreateDataAction(actionDef, contextData, user, dbCollection) {
    const { targetModel, dataToCreate } = actionDef;

    // 1. Basic Validation
    if (!targetModel || typeof targetModel !== 'string') {
        const msg = `[handleCreateDataAction] Action ${actionDef.name} (${actionDef._id}): Missing or invalid 'targetModel'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }
    if (!dataToCreate) {
        const msg = `[handleCreateDataAction] Action ${actionDef.name} (${actionDef._id}): Missing 'dataToCreate' template.`;
        logger.error(msg);
        return { success: false, message: msg };
    }

    logger.info(`[handleCreateDataAction] Action ${actionDef.name} (${actionDef._id}): Creating data for model '${targetModel}'.`);

    try {
        // 2. Substitute Variables in the data template
        let dataObject;

        if (typeof dataToCreate === 'string') {
            const substitutedDataString = await substituteVariables(dataToCreate, contextData, user);
            try {
                // CORRECTION : Utiliser la bonne variable (substitutedDataString)
                dataObject = JSON.parse(substitutedDataString);
            } catch (parseError) {
                const msg = `Failed to parse substituted JSON string: ${substitutedDataString}. Error: ${parseError.message}`;
                logger.error(`[handleCreateDataAction] ${msg}`);
                return { success: false, message: msg };
            }
        } else if (typeof dataToCreate === 'object') {
            // CORRECTION : Assigner le résultat de la substitution à dataObject.
            // On passe une copie pour ne pas muter le template original.
            dataObject = await substituteVariables(JSON.parse(JSON.stringify(dataToCreate)), contextData, user);
        } else {
            const msg = `[handleCreateDataAction] 'dataToCreate' has an invalid type (${typeof dataToCreate}). Expected string (JSON) or object.`;
            logger.error(msg);
            return { success: false, message: msg };
        }

        // Log pour débogage
        logger.debug('Final data object after substitution:', dataObject);

        // 3. Appeler insertData avec l'objet correctement substitué
        const result = await insertData(targetModel, dataObject, [], user, false, true); // On attend la fin du workflow déclenché par cette création

        if (result.success) {
            return { success: true, insertedIds: result.insertedIds };
        } else {
            // Propage l'erreur venant de insertData
            return { success: false, message: result.error || "Insertion failed." };
        }

    } catch (error) {
        const msg = `[handleCreateDataAction] Action ${actionDef.name} (${actionDef._id}): Unexpected error during creation for model '${targetModel}'. Error: ${error.message}`;
        logger.error(msg, error.stack);
        return { success: false, message: msg };
    }
}


/**
 * Handles the 'UpdateData' workflow action.
 * Finds document(s) based on a selector, substitutes variables in updates,
 * validates, and updates the document(s) using the updateData function.
 *
 * @param {object} actionDef - The definition of the 'UpdateData' action.
 * @param {object} contextData - The current workflow run context data.
 * @param {object} user - The user object.
 * @param {object} dbCollection - The MongoDB collection for the user (bien que updateData utilise getCollectionForUser).
 * @returns {Promise<{success: boolean, message?: string, modifiedCount?: number, matchedCount?: number}>} - Result of the action.
 */
async function handleUpdateDataAction(actionDef, contextData, user) {
    const { targetModel, targetSelector, fieldsToUpdate, updateMultiple = false } = actionDef; // updateMultiple optionnel, défaut false

    // 1. Basic Validation
    if (!targetModel || typeof targetModel !== 'string') {
        const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Missing or invalid 'targetModel'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }
    if (!targetSelector) {
        const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Missing 'targetSelector'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }
    if (!fieldsToUpdate) {
        const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Missing 'fieldsToUpdate'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }

    logger.info(`[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Updating data for model '${targetModel}'. Multiple: ${updateMultiple}`);

    try {
        // 2. Substitute Variables in selector and updates
        let substitutedSelectorString;
        let substitutedUpdatesString;
        let selectorObject;
        let updatesObject;

        // Substitute targetSelector (assuming it's a JSON string or object)
        if (typeof targetSelector === 'string') {
            substitutedSelectorString = await substituteVariables(targetSelector, contextData, user);
        } else if (typeof targetSelector === 'object') {
            selectorObject = await substituteVariables(targetSelector, contextData, user); // Substitute values within the object
        } else {
            const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): 'targetSelector' has an invalid type (${typeof targetSelector}). Expected string (JSON) or object.`;
            logger.error(msg);
            return { success: false, message: msg };
        }

        // Substitute fieldsToUpdate (assuming it's a JSON string or object)
        if (typeof fieldsToUpdate === 'string') {
            substitutedUpdatesString = await substituteVariables(fieldsToUpdate, contextData, user);
        } else if (typeof fieldsToUpdate === 'object') {
            updatesObject = await substituteVariables(fieldsToUpdate, contextData, user); // Substitute values within the object
        } else {
            const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): 'fieldsToUpdate' has an invalid type (${typeof fieldsToUpdate}). Expected string (JSON) or object.`;
            logger.error(msg);
            return { success: false, message: msg };
        }

        // 3. Parse substituted JSON strings
        if (substitutedSelectorString) {
            try {
                selectorObject = JSON.parse(substitutedSelectorString);
                if (typeof selectorObject !== 'object' || selectorObject === null) {
                    throw new Error("Parsed selector is not a valid object.");
                }
            } catch (parseError) {
                const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Failed to parse substituted 'targetSelector' JSON. Error: ${parseError.message}. Substituted string: ${substitutedSelectorString}`;
                logger.error(msg);
                return { success: false, message: msg };
            }
        }
        if (substitutedUpdatesString) {
            try {
                updatesObject = JSON.parse(substitutedUpdatesString);
                if (typeof updatesObject !== 'object' || updatesObject === null) {
                    throw new Error("Parsed updates is not a valid object.");
                }
            } catch (parseError) {
                const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Failed to parse substituted 'fieldsToUpdate' JSON. Error: ${parseError.message}. Substituted string: ${substitutedUpdatesString}`;
                logger.error(msg);
                return { success: false, message: msg };
            }
        }

        // Remove system fields potentially included in updates by mistake
        delete updatesObject._id;
        delete updatesObject._model;
        delete updatesObject._user;
        delete updatesObject._hash;

        if (Object.keys(updatesObject).length === 0) {
            const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): 'fieldsToUpdate' resulted in an empty update object after substitution/parsing. Nothing to update.`;
            logger.warn(msg);
            return { success: true, message: "No fields to update.", modifiedCount: 0, matchedCount: 0 };
        }

        const updateResult = await patchData(
            targetModel,
            selectorObject,
            updatesObject,
            {},
            user, false
        );

        // 6. Return result
        if (updateResult.success || updateResult.unmodified) {
            logger.info(`[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Update successful for model '${targetModel}'. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
            return {
                success: true,
                modifiedCount: updateResult.modifiedCount,
                matchedCount: updateResult.matchedCount,
                message: updateResult.message,
                updatedContext: {
                    triggerData: {...contextData.triggerData || {}, ...updatesObject}
                }
            };
        } else {
            // updateData now throws errors, so this 'else' might not be reached often,
            // but kept for safety in case it returns { success: false } in some scenarios.
            const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): updateData function reported failure. Message: ${updateResult.error}`;
            logger.error(msg);
            return { success: false, message: msg };
        }

    } catch (error) {
        // Catch errors thrown by updateData (validation, permissions, DB errors) or other unexpected errors
        const msg = `[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Unexpected error during update for model '${targetModel}'. Error: ${error.message}`;
        logger.error(msg, error.stack);
        return { success: false, message: msg };
    }
}



/**
 * Handles the 'DeleteData' workflow action.
 * Finds document(s) based on a selector, substitutes variables,
 * and deletes the document(s) using the deleteData function.
 *
 * @param {object} actionDef - The definition of the 'DeleteData' action.
 * @param {object} contextData - The current workflow run context data.
 * @param {object} user - The user object.
 * @param {object} dbCollection - The MongoDB collection for the user (bien que deleteData utilise getCollectionForUser).
 * @returns {Promise<{success: boolean, message?: string, deletedCount?: number}>} - Result of the action.
 */
async function handleDeleteDataAction(actionDef, contextData, user, dbCollection) {
    // deleteMultiple optionnel, défaut false (supprime un seul par défaut)
    const { targetModel, targetSelector, deleteMultiple = false } = actionDef;

    // 1. Basic Validation
    if (!targetModel || typeof targetModel !== 'string') {
        const msg = `[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): Missing or invalid 'targetModel'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }
    if (!targetSelector) {
        const msg = `[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): Missing 'targetSelector'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }

    logger.info(`[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): Deleting data for model '${targetModel}'. Multiple: ${deleteMultiple}`);

    try {
        // 2. Substitute Variables in selector
        let substitutedSelectorString;
        let selectorObject;

        // Substitute targetSelector (assuming it's a JSON string or object)
        if (typeof targetSelector === 'string') {
            substitutedSelectorString = await substituteVariables(targetSelector, contextData, user);
        } else if (typeof targetSelector === 'object') {
            selectorObject = await substituteVariables(targetSelector, contextData, user); // Substitute values within the object
        } else {
            const msg = `[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): 'targetSelector' has an invalid type (${typeof targetSelector}). Expected string (JSON) or object.`;
            logger.error(msg);
            return { success: false, message: msg };
        }

        // 3. Parse substituted JSON string
        if (substitutedSelectorString) {
            try {
                selectorObject = JSON.parse(substitutedSelectorString);
                if (typeof selectorObject !== 'object' || selectorObject === null) {
                    throw new Error("Parsed selector is not a valid object.");
                }
            } catch (parseError) {
                const msg = `[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): Failed to parse substituted 'targetSelector' JSON. Error: ${parseError.message}. Substituted string: ${substitutedSelectorString}`;
                logger.error(msg);
                return { success: false, message: msg };
            }
        }

        // 5. Call the centralized deleteData function (à créer dans data.js)
        // Cette fonction devra gérer la recherche préalable pour les workflows 'DataDeleted' et la suppression des fichiers.
        const deleteResult = await deleteData(
            targetModel,
            selectorObject,
            user
        );

        // 6. Return result
        if (deleteResult.success) {
            logger.info(`[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): Delete successful for model '${targetModel}'. Deleted: ${deleteResult.deletedCount}`);
            return {
                success: true,
                deletedCount: deleteResult.deletedCount,
                message: deleteResult.message // Pass along messages like "not found"
            };
        } else {
            // deleteData devrait lancer des erreurs, mais on garde ce else par sécurité.
            const msg = `[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): deleteData function reported failure. Message: ${deleteResult.message}`;
            logger.error(msg);
            return { success: false, message: msg };
        }

    } catch (error) {
        // Catch errors thrown by deleteData (permissions, DB errors) or other unexpected errors
        const msg = `[handleDeleteDataAction] Action ${actionDef.name} (${actionDef._id}): Unexpected error during deletion for model '${targetModel}'. Error: ${error.message}`;
        logger.error(msg, error.stack);
        return { success: false, message: msg };
    }
}

/**
 * Handles the 'ExecuteServiceFunction' workflow action.
 * Acts as a secure bridge between the workflow engine and native service modules.
 *
 * @param {object} actionDef - The action definition.
 * @param {object} contextData - The current workflow context.
 * @param {object} user - The user object.
 * @returns {Promise<{success: boolean, message?: string, updatedContext?: object}>}
 */
async function handleExecuteServiceFunction(actionDef, contextData, user) {
    const { serviceName, functionName, args: argsTemplate } = actionDef;

    if (!serviceName || !functionName) {
        return { success: false, message: "Action requires 'serviceName' and 'functionName'." };
    }

    const service = services[serviceName];
    if (!service) {
        return { success: false, message: `Service '${serviceName}' not found in the registry.` };
    }

    const func = service[functionName];
    if (typeof func !== 'function') {
        return { success: false, message: `Function '${functionName}' not found in service '${serviceName}'.` };
    }

    try {
        // Substitute variables in the arguments array
        const substitutedArgs = Array.isArray(argsTemplate)
            ? await substituteVariables(argsTemplate, contextData, user)
            : [];

        logger.info(`[Service Call] Calling ${serviceName}.${functionName} with ${substitutedArgs.length} argument(s).`);
        const result = await func(...substitutedArgs, user);

        return {
            success: true,
            updatedContext: { serviceResult: result } // Store result in context
        };
    } catch (error) {
        const msg = `Error executing ${serviceName}.${functionName}: ${error.message}`;
        logger.error(`[Service Call] ${msg}`, error.stack);
        return { success: false, message: msg };
    }
}

// Dans workflow.js
export async function executeStepAction(actionDef, contextData, user, dbCollection) {
    logger.info(`[executeStepAction] Executing action type ${actionDef.type} for action ${actionDef._id} (${actionDef.name})`);

    try {
        let result;
        switch (actionDef.type) {
        case 'Log':
            logger.info(`[Workflow Log Action] Action: ${actionDef.name}. Contexte:`, contextData);
            result = { success: true, message: 'Log action executed successfully.' }; // <--- CORRECTION
            break;
        case 'HttpRequest':
            result = await handleHttpRequestAction(actionDef, contextData, user, dbCollection);
            break;
        case 'CreateData':
            result = await handleCreateDataAction(actionDef, contextData, user, dbCollection);
            break;
        case 'UpdateData':
            result = await handleUpdateDataAction(actionDef, contextData, user);
            break;
        case 'DeleteData':
            result = await handleDeleteDataAction(actionDef, contextData, user, dbCollection);
            break;
        case 'GenerateAIContent':
            result = await executeGenerateAIContentAction(actionDef, contextData, user);
            break;
        case 'SendEmail':
            result = await handleSendEmailAction(actionDef, contextData, user);
            break;
        case 'Wait':
            result = await handleWaitAction(actionDef, contextData, user);
            break;
        case 'ExecuteScript':
            result = await executeSafeJavascript(actionDef, contextData, user);
            break;
        case 'ExecuteServiceFunction':
            result = await handleExecuteServiceFunction(actionDef, contextData, user);
            break;
        default:
            logger.error(`[executeStepAction] Unknown action type: ${actionDef.type}`);
            return { success: false, message: `Unknown action type: ${actionDef.type}` };
        }
        return result;
    } catch (error) {
        logger.error(`[executeStepAction] Error executing action ${actionDef.name} (${actionDef._id}): ${error.message}`, error.stack);
        return { success: false, message: error.message || 'Action execution failed' };
    }
}
/**
 * Récupère une valeur imbriquée dans un objet en utilisant une chaîne de chemin.
 * Gère les tableaux et les objets. Retourne undefined si le chemin n'est pas trouvé.
 * Exemple: getNestedValue({ a: { b: [ { c: 1 } ] } }, 'a.b.0.c') -> 1
 *
 * @param {object} obj L'objet source.
 * @param {string} path La chaîne de chemin (ex: 'user.address.city').
 * @returns {*} La valeur trouvée ou undefined.
 */
function getNestedValue(obj, path) {
    // Vérifie si l'objet ou le chemin est invalide
    if (!obj || typeof path !== 'string') {
        return undefined;
    }
    // Sépare le chemin en clés individuelles (ex: 'a.b.0.c' -> ['a', 'b', '0', 'c'])
    const keys = path.split('.');
    let current = obj; // Commence à la racine de l'objet

    // Parcourt chaque clé dans le chemin
    for (const key of keys) {
        // Si à un moment donné on atteint null ou undefined, le chemin est invalide
        if (current === null || current === undefined) {
            return undefined;
        }
        // Récupère la valeur pour la clé actuelle
        const value = current[key];
        // Si la valeur est undefined, le chemin est invalide
        if (value === undefined) {
            return undefined;
        }
        // Passe au niveau suivant de l'objet/tableau
        current = value;
    }
    // Retourne la valeur finale trouvée
    return current;
}

/**
 * Résout un chemin de variable complexe (ex: "triggerData.order.customer.contact.email")
 * en construisant un pipeline d'agrégation dynamique pour tout récupérer en une seule requête.
 *
 * @param {string} pathString - Le chemin de la variable, ex: "triggerData.order.customer.contact.email".
 * @param {object} initialContext - L'objet de départ (le triggerData).
 * @param {object} user - L'objet utilisateur pour les requêtes DB.
 * @returns {Promise<any>} La valeur résolue.
 */
async function resolvePathValue(pathString, initialContext, user) {
    const pathParts = pathString.split('.');
    const rootObjectKey = pathParts.shift(); // ex: "triggerData"

    // Si le chemin ne commence pas par triggerData ou context, essayer de résoudre directement
    if (rootObjectKey !== 'triggerData' && rootObjectKey !== 'context') {
        let current = initialContext;
        for (const part of [rootObjectKey, ...pathParts]) {
            if (current === null || typeof current === 'undefined') return undefined;
            current = current[part];
        }
        return current;
    }

    // Vérifier si c'est un chemin simple qui peut être résolu sans aggregation
    if (pathParts.length === 1) {
        return initialContext[pathParts[0]];
    }

    let currentModelName = initialContext._model;
    let currentDocId = new ObjectId(initialContext._id);
    const collection = await getCollectionForUser(user);

    // Construire le pipeline d'agrégation
    const pipeline = [
        { $match: { _id: currentDocId } }
    ];

    // Itérer sur chaque segment du chemin pour construire les lookups
    for (let i = 0; i < pathParts.length; i++) {
        const segment = pathParts[i];

        // Si c'est le dernier segment, on n'a pas besoin de faire un lookup
        if (i === pathParts.length - 1) break;

        const modelDef = await getModel(currentModelName, user);
        const fieldDef = modelDef.fields.find(f => f.name === segment);

        if (!fieldDef || fieldDef.type !== 'relation') {
            // Si ce n'est pas une relation, on ne peut pas continuer le chemin
            return undefined;
        }

        const nextModelName = fieldDef.relation;
        const asField = `__resolved_${segment}`;

        pipeline.push({
            $lookup: {
                from: collection.collectionName,
                let: { relationId: `$${segment}` },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ["$_id", {
                                    $cond: {
                                        if: { $eq: [{ $type: "$$relationId" }, "string"] },
                                        then: { $toObjectId: "$$relationId" },
                                        else: "$$relationId"
                                    }
                                }]
                            }
                        }
                    }
                ],
                as: asField
            }
        });

        pipeline.push({
            $unwind: {
                path: `$${asField}`,
                preserveNullAndEmptyArrays: true
            }
        });

        pipeline.push({
            $addFields: {
                [segment]: `$${asField}`
            }
        });

        pipeline.push({ $project: { [asField]: 0 } });

        currentModelName = nextModelName;
    }

    const results = await collection.aggregate(pipeline).toArray();

    if (results.length === 0) {
        return undefined;
    }

    // Extraire la valeur finale
    let finalValue = results[0];
    for (const part of pathParts) {
        if (finalValue === null || typeof finalValue === 'undefined') {
            return undefined;
        }
        finalValue = finalValue[part];
    }

    return finalValue;
}

/**
 * Remplace les placeholders dans un template (string, object, array) par des valeurs du contextData.
 * Version améliorée avec support des chemins complexes via resolvePathValue.
 */
export async function substituteVariables(template, contextData, user) {
    // 1. Retourner les types non substituables tels quels
    if (template === null || (typeof template !== 'string' && typeof template !== 'object')) {
        return template;
    }

    // 2. Gérer les tableaux de manière récursive
    if (Array.isArray(template)) {
        return Promise.all(template.map(item => substituteVariables(item, contextData, user)));
    }

    // 3. Gérer les objets de manière récursive
    if (typeof template === 'object') {
        const newObj = {};
        for (const key in template) {
            if (Object.prototype.hasOwnProperty.call(template, key)) {
                newObj[key] = await substituteVariables(template[key], contextData, user);
            }
        }
        return newObj;
    }

    // --- À partir d'ici, nous savons que `template` est une chaîne de caractères ---

    // 4. Construire le contexte complet pour la substitution
    const dbCollection = await getCollectionForUser(user);
    const userEnvVars = await dbCollection.find({ _model: 'env', _user: user.username }).toArray();
    const userEnv = userEnvVars.reduce((acc, v) => ({ ...acc, [v.name]: v.value }), {});

    // `contextToSearch` contient toutes les données disponibles à sa racine
    const contextToSearch = { ...contextData, env: userEnv };

    // 5. Logique de résolution de valeur améliorée avec resolvePathValue
    const findValue = async (key) => {
        let path = key.trim();
        if (path.startsWith('context.')) {
            path = path.substring('context.'.length);
        }
        if (path.endsWith('._id')) {
            const basePath = path.slice(0, -4);
            const value = await findValue(basePath);
            return value?._id?.toString(); // Convertit l'ObjectId en string
        }

        // Gérer les valeurs dynamiques spéciales
        if (path === 'now') {
            return new Date().toISOString();
        } else if (path === 'randomUUID') {
            return crypto.randomUUID();
        } else if( path === "baseUrl" ){
            return urlData;
        }

        // Détecter si le chemin est complexe (contient plus d'un point)
        if (path.split('.').length > 1) {
            try {
                // Essayer de résoudre le chemin avec resolvePathValue
                const [root, ...rest] = path.split('.');
                // On vérifie si la racine du chemin (ex: 'triggerData') existe dans notre contexte
                if (contextToSearch[root]) {
                    const resolvedValue = await resolvePathValue(
                        rest.join('.'),
                        contextToSearch[root], // On passe le bon objet de départ (ex: l'objet triggerData)
                        user
                    );
                    if (resolvedValue !== undefined) {
                        return resolvedValue;
                    }
                }
            } catch (error) {
                console.warn(`Erreur lors de la résolution du chemin "${path}":`, error.message);
                // On continue avec la méthode normale si la résolution échoue
            }
        }

        // Fallback: chercher le chemin dans l'objet de contexte normal
        return getNestedValue(contextToSearch, path);
    };

    // CAS A : La chaîne est un unique placeholder (ex: "{context.triggerData.product.price}")
    const singlePlaceholderMatch = template.match(/^\{([^}]+)\}$/);
    if (singlePlaceholderMatch) {
        const key = singlePlaceholderMatch[1];
        const value = await findValue(key);

        if (value === undefined) {
            return template; // Placeholder not found, return as is.
        }

        // If the resolved value is a string, it might contain more placeholders.
        // We recursively call substituteVariables on it, but only if it's different
        // from the original template to prevent infinite loops.
        if (typeof value === 'string' && value !== template) {
            return substituteVariables(value, contextData, user);
        }

        // For non-string values or if value is same as template, return the value.
        return value;
    }

    // CAS B : La chaîne contient plusieurs placeholders ou mix texte/variables
    const placeholderRegex = /\{([^}]+)\}/g;
    const placeholders = [...template.matchAll(placeholderRegex)];

    // Si aucun placeholder trouvé, retourner la chaîne telle quelle
    if (placeholders.length === 0) {
        return template;
    }

    // Remplacer chaque placeholder de manière asynchrone
    let result = template;
    for (const [match, key] of placeholders) {
        const value = await findValue(key);
        const replacement = value !== undefined
            ? (value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value))
            : match;
        result = result.replace(match, replacement);
    }

    return result;
}

/**
 * Triggers the instantiation of a workflowRun if conditions are met.
 * Checks the event type and trigger's data filter.
 * Creates a 'workflowRun' document for later asynchronous execution.
 *
 * @param {object} triggerData - The data that triggered the workflow(s) (can be a data document or model document).
 * @param {object} user - The associated user.
 * @param {'DataAdded' | 'DataEdited' | 'DataDeleted' | 'ModelAdded' | 'ModelEdited' | 'ModelDeleted'} eventType - The event type.
 */
export async function triggerWorkflows(triggerData, user, eventType) {
    const trigger = async (triggerData, user, eventType) => {
        // Basic validation
        if (!triggerData || !user || !eventType) {
            console.warn("triggerWorkflows: Invalid call - missing triggerData, user, or eventType.", {
                hasTriggerData: !!triggerData,
                hasUser: !!user,
                eventType
            });
            return;
        }

        // Determine model name and data ID based on event type
        const targetModelName = eventType.startsWith('Model') ? triggerData.name : triggerData._model;
        const dataId = eventType.startsWith('Model') ? null : triggerData._id;

        if (!targetModelName) {
            console.warn(`triggerWorkflows: Cannot determine model name for event ${eventType}.`, triggerData);
            return;
        }

        console.log(`[Workflow Trigger] Event: ${eventType}, Model: ${targetModelName}${dataId ? `, Data ID: ${dataId}` : ''}, User: ${user.username}`);

        try {
            const dbCollection = await getCollectionForUser(user);

            // 1. Find relevant WorkflowTriggers
            const workflowTriggers = await dbCollection.find({
                _model: 'workflowTrigger',
                targetModel: targetModelName,
                isActive: true,
                onEvent: eventType,
                $or: [{_user: user._user}, {_user: user.username}]
            }).toArray();

            if (workflowTriggers.length === 0) {
                console.debug(`[Workflow Trigger] No active triggers found for ${targetModelName}/${eventType}.`);
                return;
            }
            console.debug(`[Workflow Trigger] Found ${workflowTriggers.length} potential trigger(s) for ${targetModelName}/${eventType}.`);

            // 2. For each trigger, verify data filter and create workflowRun
            for (const trigger of workflowTriggers) {
                console.debug(`[Workflow Trigger] Evaluating trigger ${trigger._id} (${trigger.name || 'Unnamed'})...`);

                // 3. Check data filter if applicable
                if (eventType.startsWith('Data') && trigger.dataFilter) {
                    let dataFilterCondition = null;
                    try {
                        // dataFilter is expected to be stored as an object or valid JSON string
                        if (typeof trigger.dataFilter === 'string') {
                            dataFilterCondition = JSON.parse(trigger.dataFilter);
                        } else if (typeof trigger.dataFilter === 'object' && trigger.dataFilter !== null) {
                            dataFilterCondition = trigger.dataFilter;
                        }
                    } catch (parseError) {
                        console.error(`[Workflow Trigger] JSON parsing error for dataFilter in trigger ${trigger._id}:`, parseError);
                        continue; // Skip to next trigger if filter is invalid
                    }

                    try {
                        const mod = await getModel(targetModelName, user);
                        const filterMatches = isConditionMet(mod, dataFilterCondition, triggerData, [], user);

                        if (!filterMatches) {
                            console.debug(`[Workflow Trigger] Trigger ${trigger._id}: dataFilter not satisfied by data. Skipping workflowRun creation.`);
                            continue;
                        }
                        console.debug(`[Workflow Trigger] Trigger ${trigger._id}: dataFilter satisfied.`);
                    } catch (filterError) {
                        console.error(`[Workflow Trigger] Error evaluating dataFilter for trigger ${trigger._id}:`, filterError);
                        continue;
                    }
                }

                // 4. If filters passed, create workflowRun instance
                if (!trigger.workflow || !isObjectId(trigger.workflow)) {
                    console.warn(`[Workflow Trigger] Trigger ${trigger._id} has no valid associated workflow.`);
                    continue;
                }

                // a. Verify workflow exists
                const workflowDefinition = await dbCollection.findOne({
                    _id: new ObjectId(trigger.workflow),
                    _model: 'workflow',
                    $or: [{_user: user._user}, {_user: user.username}]
                });

                if (!workflowDefinition) {
                    console.warn(`[Workflow Trigger] Workflow ${trigger.workflow} associated with trigger ${trigger._id} not found.`);
                    continue;
                }

                // b. Create workflowRun document
                const workflowRunData = {
                    _model: 'workflowRun',
                    _user: user._user || user.username,
                    workflow: workflowDefinition._id,
                    contextData: {
                        triggerDataModel: targetModelName,
                        triggerData: triggerData
                    },
                    status: 'pending',
                    owner: null,
                    startedAt: new Date()
                };

                try {
                    const insertResult = await dbCollection.insertOne(workflowRunData);
                    if (insertResult.insertedId) {
                        console.info(`[Workflow Trigger] Created workflowRun ${insertResult.insertedId} for workflow ${workflowDefinition.name} (ID: ${workflowDefinition._id}) triggered by ${trigger._id}.`);
                        await workflowModule.processWorkflowRun(insertResult.insertedId, user);
                    } else {
                        console.error(`[Workflow Trigger] Failed to create workflowRun for workflow ${workflowDefinition._id} (Trigger: ${trigger._id}).`);
                    }
                } catch (insertError) {
                    console.error(`[Workflow Trigger] Error creating workflowRun for workflow ${workflowDefinition._id} (Trigger: ${trigger._id}):`, insertError);
                }
            }
        } catch (error) {
            console.error(`[Workflow Trigger] General error in triggerWorkflows for ${targetModelName}${dataId ? ` ID: ${dataId}` : ''} (Event: ${eventType}):`, error);
        }
    }

    return new Promise((resolve) => setTimeout(async () => {
        await trigger(triggerData, user, eventType);
        resolve();
    }, 0));
}
/**
 * Processes a workflowRun instance step-by-step.
 * Fetches the run, evaluates conditions, executes actions, and transitions
 * to the next step based on success or failure, updating the workflowRun status.
 *
 * @param {string|ObjectId} workflowRunId - The ID of the workflowRun to process.
 * @param {object} user - The user context for database access.
 * @returns {Promise<void>}
 */

export async function processWorkflowRun(workflowRunId, user) {
    const dbCollection = await getCollectionForUser(user);
    const runId = typeof workflowRunId === 'string' ? new ObjectId(workflowRunId) : workflowRunId;

    logger.info(`[processWorkflowRun] Starting processing for workflowRun ID: ${runId}`);

    let currentRunState;
    let contextData = {};
    let stepExecutionsCount = {};

    try {
        currentRunState = await dbCollection.findOne({ _id: runId, _model: 'workflowRun' });

        if (!currentRunState) {
            logger.error(`[processWorkflowRun] WorkflowRun ID: ${runId} not found.`);
            return;
        }

        stepExecutionsCount = currentRunState.stepExecutionsCount || {};
        if (['completed', 'failed', 'cancelled'].includes(currentRunState.status)) {
            logger.info(`[processWorkflowRun] WorkflowRun ID: ${runId} is already in a terminal state (${currentRunState.status}). Skipping.`);
            return;
        }

        const logError = async (error) => {
            logger.error(error);
            await dbCollection.updateOne(
                { _id: runId },
                { $set: { status: 'failed', error, completedAt: new Date(), stepExecutionsCount } }
            );
        };

        const workflowDefinition = await dbCollection.findOne({ _id: new ObjectId(currentRunState.workflow), _model: 'workflow' });
        if (!workflowDefinition) {
            return await logError(`Workflow definition ID: ${currentRunState.workflow} not found.`);
        }

        contextData = currentRunState.contextData || {};
        let currentStepId = currentRunState.currentStep || workflowDefinition.startStep;

        if (!currentStepId || !isObjectId(currentStepId)) {
            const finalStatus = workflowDefinition.startStep ? 'failed' : 'completed';
            const errorMessage = workflowDefinition.startStep ? 'No valid starting step defined in workflow or run state.' : null;
            await dbCollection.updateOne(
                { _id: runId },
                { $set: { status: finalStatus, error: errorMessage, completedAt: new Date(), currentStep: null, stepExecutionsCount } }
            );
            return;
        }

        let stepCount = 0;
        while (currentStepId) {
            if (stepCount++ >= maxWorkflowSteps) {
                return await logError(`Maximum workflow step executions exceeded (${maxWorkflowSteps} max).`);
            }

            const execCount = (stepExecutionsCount[currentStepId] || 0) + 1;
            if (execCount > maxExecutionsByStep) {
                return await logError(`Maximum executions (${maxExecutionsByStep}) exceeded for step ${currentStepId}.`);
            }
            stepExecutionsCount[currentStepId] = execCount;
            logger.info(`[processWorkflowRun] Run ID: ${runId}, Current Step ID: ${currentStepId}`);

            const currentStepDef = await dbCollection.findOne({ _id: new ObjectId(currentStepId), _model: 'workflowStep' });
            if (!currentStepDef) {
                return await logError(`Step definition ID: ${currentStepId} not found.`);
            }

            await dbCollection.updateOne(
                { _id: runId },
                { $set: { status: 'running', currentStep: currentStepId, contextData, stepExecutionsCount } }
            );

            let stepSucceeded = true;
            let logInfo = null;
            let conditionsMet = true;

            try {
                // Add logging to see the actual pipeline being executed
                logger.debug('Executing pipeline:', JSON.stringify(await substituteVariables(currentStepDef.conditions, contextData, user), null, 2));

                // And log the context data to verify processedChunk exists
                logger.debug('Context data:', JSON.stringify(contextData, null, 2));
                
                // --- 7. Évaluation des conditions de l'étape ---
                if (currentStepDef.conditions && Object.keys(currentStepDef.conditions).length > 0) {
                    const substitutedConditions = await substituteVariables(currentStepDef.conditions, contextData, user);
                    const searchResult = await searchData({ model: contextData.triggerDataModel, filter: substitutedConditions, limit: 1}, user);
                    conditionsMet = searchResult && searchResult.count > 0;
                    logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Conditions evaluated. Found ${searchResult ? searchResult.count : 0} match(es). Result: ${conditionsMet}`);
                }

                // --- 8. Exécution des actions si les conditions sont remplies ---
                if (conditionsMet) {
                    if (currentStepDef.actions && currentStepDef.actions.length > 0) {
                        logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Executing ${currentStepDef.actions.length} action(s)...`);
                        for (const actionId of currentStepDef.actions) {
                            if (!isObjectId(actionId)) continue;
                            const actionDef = await dbCollection.findOne({ _id: new ObjectId(actionId), _model: 'workflowAction' });
                            if (!actionDef) return await logError(`Action definition ${actionId} not found.`);
                            const actionResult = await workflowModule.executeStepAction(actionDef, contextData, user, dbCollection);

                            if (actionResult.status === 'paused') {
                                // L'action demande une pause !
                                const { duration, durationUnit } = actionResult;
                                const now = new Date();
                                let resumeAt = new Date(now);

                                // Calculer la date de reprise
                                const ms = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
                                resumeAt.setTime(now.getTime() + (duration * ms[durationUnit]));

                                logger.info(`[processWorkflowRun] Run ID: ${runId} is pausing. Will resume at: ${resumeAt.toISOString()}`);

                                // Mettre à jour le workflowRun avec le statut 'paused' et la date de reprise
                                await dbCollection.updateOne({ _id: runId }, {
                                    $set: {
                                        status: 'paused',
                                        currentStep: currentStepDef.onSuccessStep, // On prépare la prochaine étape
                                        contextData,
                                        log: actionResult.message
                                    }
                                });

                                // Planifier le réveil du workflow
                                schedule.scheduleJob(resumeAt, async () => {
                                    logger.info(`[Scheduler] Waking up paused workflowRun ID: ${runId}`);
                                    // On relance le traitement pour ce workflow spécifique
                                    await workflowModule.processWorkflowRun(runId, user);
                                });

                                // Arrêter le traitement actuel de cette exécution
                                return; // Très important de stopper la boucle ici
                            }
                            if (!actionResult.success) {
                                stepSucceeded = false;
                                logInfo = actionResult.message || `Action ${actionDef.name || actionId} failed.`;
                                break;
                            }else{
                                logInfo = `Action ${actionDef.name || actionId} : ${actionResult.message}`;
                            }
                            if (actionResult.updatedContext) {
                                contextData = { ...contextData, ...actionResult.updatedContext };
                            }
                            //console.log("action", util.inspect(actionResult, false, 8, true));
                            logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}, Action ID: ${actionId}: Executed successfully.`);
                        }
                    }
                } else {
                    logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Conditions not met. Skipping actions.`);
                }
            } catch (error) {
                logger.error(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Error during condition/action execution: ${error.message}`);
                stepSucceeded = false;
                logInfo = error.message;
            }

            // --- 9. Détermination de la prochaine étape ---
            let nextStepId = null;
            let finalStatusForRun = null;

            if (stepSucceeded && conditionsMet) {
                // CHEMIN SUCCÈS : Les conditions sont remplies et les actions ont réussi.
                logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Step path succeeded.`);
                nextStepId = currentStepDef.onSuccessStep;
                if (currentStepDef.isTerminal || !nextStepId) {
                    finalStatusForRun = 'completed';
                    nextStepId = null;
                }
            } else {
                // CHEMIN ÉCHEC/BRANCHE : Une action a échoué OU les conditions n'ont pas été remplies.
                const reason = logInfo ? `Action failed: ${logInfo}` : 'Step conditions not met.';
                logger.warn(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Taking failure/branching path. Reason: ${reason}`);
                nextStepId = currentStepDef.onFailureStep;

                if (!nextStepId || !isObjectId(nextStepId)) {
                    // Fin du workflow. Le statut est 'failed' seulement si une vraie erreur s'est produite.
                    finalStatusForRun = logInfo ? 'failed' : 'completed';
                    nextStepId = null;
                }
            }

            // --- 10. Mise à jour de l'état de l'exécution ---
            currentStepId = nextStepId;
            const updatePayload = { contextData };

            if (finalStatusForRun) {
                updatePayload.status = finalStatusForRun;
                updatePayload.completedAt = new Date();
                updatePayload.currentStep = null;
                updatePayload.log = logInfo;
            } else {
                updatePayload.currentStep = currentStepId;
            }
            await dbCollection.updateOne({ _id: runId }, { $set: updatePayload });

            if(finalStatusForRun) {
                logger.info(`[processWorkflowRun] Finished processing for workflowRun ID: ${runId}. Final Status: ${finalStatusForRun}`);
            }
        }
    } catch (error) {
        logger.error(`[processWorkflowRun] Critical error during processing of workflowRun ID: ${runId}. Error: ${error.message}`, error.stack);
        await dbCollection.updateOne(
            { _id: runId, status: { $nin: ['completed', 'failed', 'cancelled'] } },
            { $set: { status: 'failed', log: `Critical error: ${error.message}`, completedAt: new Date(), stepExecutionsCount } }
        );
    }
}
/**
 * Executes an AI content generation action ('GenerateAIContent').
 * Retrieves the API key (prioritizing the user's environment), initializes a LangChain client,
 * formats a prompt with context data, calls the LLM, and returns the result
 * to be added to the workflow context.
 *
 * @param {object} action - The action definition from the workflow.
 * @param {object} context - The current workflow execution context.
 * @param {object} user - The user executing the workflow.
 * @returns {Promise<{success: boolean, updatedContext?: object, message?: string}>}
 */
async function executeGenerateAIContentAction(action, context, user) {
    const { aiProvider, aiModel, prompt } = action;

    // 1. Retrieve the API key (User Environment > Machine Environment)
    let apiKey;

    const providers = {
        "OpenAI" : "OPENAI_API_KEY",
        "Google": "GOOGLE_API_KEY",
        "DeepSeek": "DEEPSEEK_API_KEY"
    }
    const envKeyName = providers[aiProvider];
    if( !envKeyName ) {
        return {success: false, message: i18n.t('aiContent.env', `API key for provider ${aiProvider} (${envKeyName}) not found in user environment.`)};
    }

    // First look in the user's environment variables
    const envCollection = await getCollectionForUser(user);
    const userEnvVar = await envCollection.findOne({ _model: 'env', name: envKeyName, _user: user.username });

    if (userEnvVar && userEnvVar.value) {
        apiKey = userEnvVar.value;
        logger.debug(`[AI Action] Using user environment API key for ${aiProvider}.`);
    } else {
        apiKey = process.env[envKeyName];
        logger.debug(`[AI Action] Using machine environment API key for ${aiProvider}.`);
    }

    if (!apiKey) {
        const message = `API key for ${aiProvider} (${envKeyName}) not found in user or machine environment.`;
        logger.error(`[AI Action] ${message}`);
        return { success: false, message };
    }

    // 2. Initialize the LLM client with LangChain
    let llm;
    try {
        switch (aiProvider) {
        case 'OpenAI':
            llm = new ChatOpenAI({ apiKey, model: aiModel, temperature: 0.7 });
            break;
        case 'Google':
            llm = new ChatGoogleGenerativeAI({ apiKey, model: aiModel, temperature: 0.7 });
            break;
        case 'DeepSeek':
            llm = new ChatDeepSeek({ apiKey, model: aiModel, temperature: 0.7 });
            break;
        default:
            throw new Error(`Unsupported AI provider: ${aiProvider}`);
        }
    } catch (initError) {
        const message = `Failed to initialize AI client for ${aiProvider}: ${initError.message}`;
        logger.error(`[AI Action] ${message}`);
        return { success: false, message };
    }

    try {
        const substitutedPrompt = await substituteVariables(prompt, context, user);
        // 3. Create the "Prompt Template"
        // LangChain handles variable substitution like {triggerData.name}
        const realPrompt = ChatPromptTemplate.fromTemplate(substitutedPrompt);

        // 4. Create the processing chain (Prompt + Model)
        const chain = realPrompt.pipe(llm);

        // 5. Invoke the chain with the complete context
        // LangChain will automatically replace placeholders in the prompt.
        logger.debug(`[AI Action] Invoking AI with model ${aiModel}.`);
        const response = await chain.invoke(context);

        // 6. Prepare the result to be merged into the workflow context
        const llmOutput = response.content;
        const outputVariable = 'aiContent';
        const updatedContext = {
            [outputVariable]: llmOutput
        };

        logger.info(`[AI Action] Content generated successfully and stored in context variable '${outputVariable}'.`);

        return {
            success: true,
            updatedContext // This object will be merged into the main context by the workflow engine
        };

    } catch (llmError) {
        const message = `Error during AI content generation with ${aiProvider}: ${llmError.message}`;
        logger.error(`[AI Action] ${message}`, llmError.stack);
        return { success: false, message };
    }
}

/**
 * Gère l'action d'envoi d'e-mail d'un workflow.
 * Cette version améliorée peut traiter une liste de destinataires, en envoyant un e-mail
 * individuel et personnalisé à chacun. Elle gère les placeholders dans le sujet et le corps
 * de l'e-mail en se basant sur le contexte de chaque destinataire.
 *
 * @param {object} action - La définition de l'action 'SendEmail'.
 * @param {object} contextData - Le contexte d'exécution actuel du workflow.
 * @param {object} user - L'utilisateur propriétaire du workflow.
 * @returns {Promise<{success: boolean, message: string, data?: {sent: string[], failed: any[]}}>}
 */
async function handleSendEmailAction(action, contextData, user) {
    logger.info(`[handleSendEmailAction] Executing for user ${user.username}.`);

    // 1. Récupérer la configuration SMTP depuis le modèle 'env' de l'utilisateur
    const envVars = await searchData({
        model: 'env',
        filter: { $in: ['$name', ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']] }
    }, user);

    const smtpConfig = envVars.data.reduce((acc, variable) => {
        acc[variable.name.replace('SMTP_', '').toLowerCase()] = variable.value;
        return acc;
    }, {});
    if( !smtpConfig.port )
        smtpConfig.port = emailDefaultConfig.port;

    // 2. Valider la configuration de l'action
    const { emailRecipients, emailSubject, emailContent } = action;
    if (!emailRecipients || !emailSubject || !emailContent) {
        const msg = "SendEmail action is incomplete. 'emailRecipients', 'emailSubject', and 'emailContent' are required.";
        logger.error(`[handleSendEmailAction] ${msg}`);
        return { success: false, message: msg };
    }

    try {
        // 3. Résoudre la liste des destinataires. Peut être un placeholder qui retourne un tableau.
        let resolvedRecipients = await substituteVariables(emailRecipients, contextData, user);

        // S'assurer que nous avons toujours un tableau à parcourir
        if (!Array.isArray(resolvedRecipients)) {
            resolvedRecipients = [resolvedRecipients];
        }

        resolvedRecipients = resolvedRecipients.flat();

        if (resolvedRecipients.length === 0) {
            return { success: true, message: "No recipients found after substitution. Nothing to send." };
        }

        logger.info(`[handleSendEmailAction] Preparing to send emails to ${resolvedRecipients.length} recipient(s).`);

        const allPromises = [];
        const sentTo = [];
        const failedFor = [];

        // 4. Itérer sur chaque destinataire pour envoyer un e-mail personnalisé
        for (const recipient of resolvedRecipients) {
            // Le destinataire peut être une simple chaîne (email) ou un objet { email: '...', nom: '...' }
            const recipientEmail = typeof recipient === 'object' && recipient !== null ? recipient.email : recipient;

            if (!recipientEmail || typeof recipientEmail !== 'string') {
                logger.warn(`[handleSendEmailAction] Skipping an invalid recipient entry:`, recipient);
                failedFor.push(recipient); // Garder une trace de l'entrée invalide
                continue;
            }


            // 5. Créer un contexte personnalisé pour ce destinataire spécifique
            // Cela permet d'utiliser des placeholders comme {recipient.name}
            const personalizedContext = { ...contextData, recipient };

            // 6. Substituer les variables dans le sujet et le contenu pour ce destinataire
            const personalizedSubject = await substituteVariables(emailSubject, personalizedContext, user);
            const personalizedBody = await substituteVariables(emailContent, personalizedContext, user);

            const emailData = { title: personalizedSubject, content: personalizedBody };

            // 7. Envoyer l'e-mail et suivre son résultat
            const sendPromise = sendEmail([recipientEmail], emailData, smtpConfig, user.lang)
                .then(() => {
                    sentTo.push(recipient);
                })
                .catch(err => {
                    logger.error(`[handleSendEmailAction] Failed to send email to ${recipientEmail}: ${err.message}`);
                    failedFor.push({ recipient: recipientEmail, error: err.message });
                });

            allPromises.push(sendPromise);
        }

        // Attendre que toutes les tentatives d'envoi soient terminées
        await Promise.all(allPromises);

        const summaryMessage = `Email process completed. Sent: ${sentTo.length}. Failed: ${failedFor.length}.`;
        logger.info(`[handleSendEmailAction] ${summaryMessage}`);

        // L'action elle-même a réussi, même si certains e-mails ont échoué.
        // Le message de retour et les données fournissent les détails.
        return {
            success: true,
            message: summaryMessage,
            data: {
                sent: sentTo,
                failed: failedFor
            },
            updatedContext: {
                emailResult: {
                    sent: sentTo,
                    failed: failedFor
                }
            }
        };

    } catch (error) {
        const msg = `[handleSendEmailAction] Unexpected error during email processing: ${error.message}`;
        logger.error(msg, error.stack);
        return { success: false, message: msg };
    }
}