// Exemple conceptuel dans la fonction de planification
import {getCollection, getCollectionForUser, isObjectId} from "./mongodb.js";
import schedule from "node-schedule";
import {ObjectId} from "mongodb";
import crypto from "node:crypto";

import {Logger} from "../gameObject.js";
import {deleteData, editData, insertData, patchData, searchData} from "./data.js";
import {maxExecutionsByStep, maxWorkflowSteps} from "../constants.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import i18n from "data-primals-engine/i18n";
import {sendEmail} from "../email.js";

// 1. ADD THIS IMPORT AT THE TOP OF THE FILE
// This allows the module to call its own exported functions.
import * as workflowModule from './workflow.js';

let logger = null;
export async function onInit(defaultEngine) {
    logger = defaultEngine.getComponent(Logger);
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


/**
 * Handles the 'Webhook' workflow action.
 * Sends an HTTP request to a specified URL with substituted data using native fetch.
 *
 * @param {object} actionDef - The definition of the 'Webhook' action.
 * @param {object} contextData - The current workflow run context data.
 * @param {object} user - The user object (peut être utilisé pour l'authentification ou le logging).
 * @param {object} dbCollection - The MongoDB collection (moins pertinent ici, mais gardé pour la cohérence).
 * @returns {Promise<{success: boolean, message?: string, responseStatus?: number, responseBody?: any}>} - Result of the action.
 */
async function handleWebhookAction(actionDef, contextData, user, dbCollection) {
    const { name: actionName, _id: actionId, url, method = 'POST', headers: headersTemplate, body: bodyTemplate } = actionDef;

    // 1. Basic Validation
    if (!url) {
        const msg = `[handleWebhookAction] Action ${actionName} (${actionId}): Missing 'url'.`;
        logger.error(msg);
        return { success: false, message: msg };
    }

    logger.info(`[handleWebhookAction] Action ${actionName} (${actionId}): Executing webhook. Method: ${method}`);

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
                logger.warn(`[handleWebhookAction] Action ${actionName} (${actionId}): 'headers' has an invalid type (${typeof headersTemplate}). Ignoring.`);
            }
        }

        // Substitute Body (JSON string or object) - only relevant for methods like POST, PUT, PATCH
        if (bodyTemplate && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            if (typeof bodyTemplate === 'string') {
                substitutedBodyString = await substituteVariables(bodyTemplate, contextData, user);
            } else if (typeof bodyTemplate === 'object') {
                bodyObject = await substituteVariables(bodyTemplate, contextData, user);
            } else {
                logger.warn(`[handleWebhookAction] Action ${actionName} (${actionId}): 'body' has an invalid type (${typeof bodyTemplate}). Ignoring.`);
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
                logger.error(`[handleWebhookAction] Action ${actionName} (${actionId}): Failed to parse substituted 'headers' JSON. Error: ${parseError.message}. Using default headers. Substituted string: ${substitutedHeadersString}`);
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
        logger.info(`[handleWebhookAction] Action ${actionName} (${actionId}): Calling URL: ${substitutedUrl}`);
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
            logger.error(`[handleWebhookAction] Action ${actionName} (${actionId}): Failed to parse response body. Error: ${responseParseError.message}`);
            // Try reading as text again in case of error during json parsing
            try {
                responseBody = await response.text();
            } catch (textError) {
                responseBody = "[Could not parse response body]";
            }
        }

        logger.info(`[handleWebhookAction] Action ${actionName} (${actionId}): Received response. Status: ${response.status}`);

        // 7. Return Result
        if (response.ok) { // Status code 200-299
            return {
                success: true,
                message: `Webhook executed successfully. Status: ${response.status}`,
                responseStatus: response.status,
                responseBody: responseBody
                // updatedContext: { webhookResponse: responseBody } // Optionnel: Ajouter la réponse au contexte
            };
        } else {
            // Handle non-successful responses (4xx, 5xx)
            const errorMsg = `Webhook execution failed. Status: ${response.status}. Response: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`;
            logger.error(`[handleWebhookAction] Action ${actionName} (${actionId}): ${errorMsg}`);
            return {
                success: false,
                message: errorMsg,
                responseStatus: response.status,
                responseBody: responseBody
            };
        }

    } catch (error) {
        // Catch network errors or other unexpected errors during the process
        const msg = `[handleWebhookAction] Action ${actionName} (${actionId}): Unexpected error during webhook execution. Error: ${error.message}`;
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
        const result = await insertData(targetModel, dataObject, [], user, true, true); // On attend la fin du workflow déclenché par cette création

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
            user
        );


        console.log(
            targetModel,
            selectorObject,
            updatesObject,
            {},
            user
        );

        // 6. Return result
        if (updateResult.success || updateResult.unmodified) {
            logger.info(`[handleUpdateDataAction] Action ${actionDef.name} (${actionDef._id}): Update successful for model '${targetModel}'. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
            return {
                success: true,
                modifiedCount: updateResult.modifiedCount,
                matchedCount: updateResult.matchedCount,
                message: updateResult.message
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
            targetModel, [],
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
        case 'Webhook':
            result = await handleWebhookAction(actionDef, contextData, user, dbCollection);
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
                
            // ... autres cases à venir ...
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
        return value !== undefined ? value : template;
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
 * Déclenche l'instanciation d'un workflowRun si les conditions sont remplies.
 * Vérifie le type d'événement et le filtre de données du déclencheur.
 * Crée un document 'workflowRun' pour une exécution asynchrone ultérieure.
 *
 * @param {object} triggerData - La donnée qui a déclenché le(s) workflow(s) (peut être un document de données ou un document de modèle).
 * @param {object} user - L'utilisateur associé.
 * @param {'DataAdded' | 'DataEdited' | 'DataDeleted' | 'ModelAdded' | 'ModelEdited' | 'ModelDeleted'} eventType - Le type d'événement.
 */
export async function triggerWorkflows(triggerData, user, eventType)  {
    const dataId = eventType.startsWith('Model') ? null : triggerData._id;

    const trigger = async (triggerData, user, eventType) => {

        // Basic validation
        if (!triggerData || !user || !eventType) {
            console.warn("triggerWorkflows: Appel invalide - triggerData, user, ou eventType manquant.", { hasTriggerData: !!triggerData, hasUser: !!user, eventType });
            return;
        }
        // Determine the model name and data ID based on the event type
        const targetModelName = eventType.startsWith('Model') ? triggerData.name : triggerData._model;
        const dataId = eventType.startsWith('Model') ? null : triggerData._id; // ID only relevant for data events

        if (!targetModelName) {
            console.warn(`triggerWorkflows: Impossible de déterminer le nom du modèle pour l'événement ${eventType}.`, triggerData);
            return;
        }

        console.log(`[Workflow Trigger] Event: ${eventType}, Model: ${targetModelName}${dataId ? `, Data ID: ${dataId}` : ''}, User: ${user.username}`);

        try {
            const dbCollection = await getCollectionForUser(user); // Collection des données utilisateur

            // 1. Trouver les WorkflowTriggers pertinents
            const workflowTriggers = await dbCollection.find({
                _model: 'workflowTrigger',
                targetModel: targetModelName,
                isActive: true,
                onEvent: eventType, // Assurez-vous que le champ s'appelle bien 'onEvent' dans votre modèle
                $or: [{_user: user._user}, {_user: user.username}]
            }).toArray();

            if (workflowTriggers.length === 0) {
                console.debug(`[Workflow Trigger] Aucun déclencheur actif trouvé pour ${targetModelName} / ${eventType}.`);
                return;
            }
            console.debug(`[Workflow Trigger] Trouvé ${workflowTriggers.length} déclencheur(s) potentiel(s) pour ${targetModelName} / ${eventType}.`);

            // 2. Pour chaque déclencheur trouvé, vérifier le filtre de données et créer un workflowRun
            for (const trigger of workflowTriggers) {
                console.debug(`[Workflow Trigger] Vérification du déclencheur ${trigger._id} (${trigger.name || 'Sans nom'})...`);

                // 3. Vérifier le filtre de données (dataFilter) si applicable
                if (eventType.startsWith('Data') && trigger.dataFilter && dataId) {
                    let dataFilterCondition = null;
                    try {
                        // dataFilter est supposé être stocké comme un objet (ou une string JSON valide)
                        if (typeof trigger.dataFilter === 'string') {
                            dataFilterCondition = JSON.parse(trigger.dataFilter);
                        } else if (typeof trigger.dataFilter === 'object' && trigger.dataFilter !== null) {
                            dataFilterCondition = trigger.dataFilter;
                        }
                    } catch (parseError) {
                        console.error(`[Workflow Trigger] Erreur de parsing JSON pour dataFilter du trigger ${trigger._id}:`, parseError);
                        continue; // Passer au trigger suivant si le filtre est invalide
                    }

                    try {
                        const finalFilter = {
                            '$and': [
                                dataFilterCondition                      // Applique la condition du trigger
                            ]
                        };

                        console.debug(`[Workflow Trigger] Vérification dataFilter pour trigger ${trigger._id} avec filtre combiné:`, JSON.stringify(finalFilter));

                        // Exécuter la vérification dans la base de données
                        // Utilisation de countDocuments pour une vérification rapide
                        const matchCount = await searchData({ user, query: { model: targetModelName, filter: finalFilter, limit: 1 } });

                        if (!matchCount.count) {
                            console.debug(`[Workflow Trigger] Trigger ${trigger._id}: dataFilter non satisfait par la donnée ${dataId}. WorkflowRun non créé.`);
                            continue; // Passer au trigger suivant
                        } else {
                            console.debug(`[Workflow Trigger] Trigger ${trigger._id}: dataFilter satisfait par la donnée ${dataId}.`);
                        }
                    } catch (filterError) {
                        console.error(`[Workflow Trigger] Erreur lors de la conversion ou de l'exécution du dataFilter pour le trigger ${trigger._id}:`, filterError);
                        continue; // Ne pas créer en cas d'erreur de filtre
                    }
                } // Fin de la vérification dataFilter

                // 4. Si les filtres (eventType, dataFilter) sont passés, créer l'instance workflowRun
                if (!trigger.workflow || !isObjectId(trigger.workflow)) {
                    console.warn(`[Workflow Trigger] Trigger ${trigger._id} n'a pas de workflow valide associé.`);
                    continue;
                }

                // a. Récupérer la définition du Workflow (juste pour vérifier qu'il existe)
                const workflowDefinition = await dbCollection.findOne({
                    _id: new ObjectId(trigger.workflow),
                    _model: 'workflow',
                    $or: [{_user: user._user}, {_user: user.username}]
                });

                if (!workflowDefinition) {
                    console.warn(`[Workflow Trigger] Workflow ${trigger.workflow} associé au trigger ${trigger._id} non trouvé.`);
                    continue;
                }

                // b. Créer le document workflowRun
                const workflowRunData = {
                    _model: 'workflowRun',
                    _user: user._user || user.username,
                    workflow: workflowDefinition._id, // Référence au workflow parent
                    contextData: {                        // Contexte initial
                        triggerDataModel: targetModelName,// Modèle de la donnée déclencheuse
                        triggerData: triggerData      // Inclure la donnée déclencheuse
                        // Vous pourriez ajouter d'autres infos ici si nécessaire
                    },
                    status: 'pending',                // Statut initial
                    owner: null,
                    startedAt: new Date()
                };

                try {
                    const insertResult = await dbCollection.insertOne(workflowRunData);
                    if (insertResult.insertedId) {
                        console.info(`[Workflow Trigger] WorkflowRun ${insertResult.insertedId} créé pour le workflow ${workflowDefinition.name} (ID: ${workflowDefinition._id}) déclenché par ${trigger._id}.`);

                        await workflowModule.processWorkflowRun(insertResult.insertedId, user);
                    } else {
                        console.error(`[Workflow Trigger] Échec de la création du WorkflowRun pour le workflow ${workflowDefinition._id} (Trigger: ${trigger._id}).`);
                    }
                } catch (insertError) {
                    console.error(`[Workflow Trigger] Erreur lors de l'insertion du WorkflowRun pour le workflow ${workflowDefinition._id} (Trigger: ${trigger._id}):`, insertError);
                }

            } // Fin de la boucle des triggers

        } catch (error) {
            console.error(`[Workflow Trigger] Erreur générale dans triggerWorkflows pour ${targetModelName}${dataId ? ` ID: ${dataId}` : ''} (Event: ${eventType}):`, error);
        }
    }

    return new Promise((resolve) => setTimeout(async () => {
        await trigger(triggerData, user, eventType);
        resolve();
    }, 0)
    );
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
// C:/Dev/hackersonline-engine/server/src/modules/workflow.js

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
            let stepError = null;
            let conditionsMet = true;

            try {
                // --- 7. Évaluation des conditions de l'étape ---
                if (currentStepDef.conditions && Object.keys(currentStepDef.conditions).length > 0) {
                    const searchResult = await searchData({ user, query: { model: contextData.triggerDataModel, filter: currentStepDef.conditions, limit: 1 } });
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
                            if (!actionResult.success) {
                                stepSucceeded = false;
                                stepError = actionResult.message || `Action ${actionDef.name || actionId} failed.`;
                                break;
                            }
                            if (actionResult.updatedContext) {
                                contextData = { ...contextData, ...actionResult.updatedContext };
                            }
                            logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}, Action ID: ${actionId}: Executed successfully.`);
                        }
                    }
                } else {
                    logger.info(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Conditions not met. Skipping actions.`);
                }
            } catch (error) {
                logger.error(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Error during condition/action execution: ${error.message}`);
                stepSucceeded = false;
                stepError = error.message;
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
                const reason = stepError ? `Action failed: ${stepError}` : 'Step conditions not met.';
                logger.warn(`[processWorkflowRun] Run ID: ${runId}, Step ID: ${currentStepId}: Taking failure/branching path. Reason: ${reason}`);
                nextStepId = currentStepDef.onFailureStep;

                if (!nextStepId || !isObjectId(nextStepId)) {
                    // Fin du workflow. Le statut est 'failed' seulement si une vraie erreur s'est produite.
                    finalStatusForRun = stepError ? 'failed' : 'completed';
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
                if (finalStatusForRun === 'failed' && stepError) {
                    updatePayload.error = stepError;
                }
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
            { $set: { status: 'failed', error: `Critical error: ${error.message}`, completedAt: new Date(), stepExecutionsCount } }
        );
    }
}
/**
 * Exécute une action de génération de contenu par IA ('GenerateAIContent').
 * Récupère la clé API (priorité à l'environnement de l'utilisateur), initialise un client LangChain,
 * formate un prompt avec les données du contexte, appelle le LLM, et retourne le résultat
 * pour l'ajouter au contexte du workflow.
 *
 * @param {object} action - La définition de l'action depuis le workflow.
 * @param {object} context - Le contexte d'exécution actuel du workflow.
 * @param {object} user - L'utilisateur qui exécute le workflow.
 * @returns {Promise<{success: boolean, updatedContext?: object, message?: string}>}
 */
async function executeGenerateAIContentAction(action, context, user) {
    const { aiProvider, aiModel, prompt } = action;

    // 1. Récupérer la clé API (Environnement de l'utilisateur > Environnement de la machine)
    let apiKey;

    const providers = {
        "OpenAI" : "OPENAI_API_KEY",
        "Google": "GOOGLE_API_KEY"
    }
    const envKeyName = providers[aiProvider];
    if( !envKeyName ) {
        return {success: false, message: i18n.t('aiContent.env', `Clé API pour ${aiProvider} (${envKeyName}) non trouvée dans l'environnement de l'utilisateur.`)};
    }

    // Cherche d'abord dans les variables d'environnement de l'utilisateur
    const envCollection = await getCollectionForUser(user);
    const userEnvVar = await envCollection.findOne({ _model: 'env', name: envKeyName, _user: user.username });

    if (userEnvVar && userEnvVar.value) {
        apiKey = userEnvVar.value;
        logger.debug(`[AI Action] Utilisation de la clé API de l'environnement de l'utilisateur pour ${aiProvider}.`);
    } else {
        apiKey = process.env[envKeyName];
        logger.debug(`[AI Action] Utilisation de la clé API de l'environnement de la machine pour ${aiProvider}.`);
    }

    if (!apiKey) {
        const message = `Clé API pour ${aiProvider} (${envKeyName}) non trouvée dans l'environnement de l'utilisateur ou de la machine.`;
        logger.error(`[AI Action] ${message}`);
        return { success: false, message };
    }

    // 2. Initialiser le client LLM avec LangChain
    let llm;
    try {
        switch (aiProvider) {
        case 'OpenAI':
            llm = new ChatOpenAI({ apiKey, modelName: aiModel, temperature: 0.7 });
            break;
        case 'GoogleGemini':
            llm = new ChatGoogleGenerativeAI({ apiKey, modelName: aiModel, temperature: 0.7 });
            break;
        default:
            throw new Error(`Fournisseur IA non supporté : ${aiProvider}`);
        }
    } catch (initError) {
        const message = `Échec de l'initialisation du client IA pour ${aiProvider}: ${initError.message}`;
        logger.error(`[AI Action] ${message}`);
        return { success: false, message };
    }

    try {
        const substitutedPrompt = await substituteVariables(prompt, context, user);
        // 3. Créer le "Prompt Template"
        // LangChain gère la substitution des variables comme {triggerData.name}
        const realPrompt = ChatPromptTemplate.fromTemplate(substitutedPrompt);

        // 4. Créer la chaîne de traitement (Prompt + Modèle)
        const chain = realPrompt.pipe(llm);

        // 5. Invoquer la chaîne avec le contexte complet
        // LangChain remplacera automatiquement les placeholders dans le prompt.
        logger.debug(`[AI Action] Invocation de l'IA avec le modèle ${aiModel}.`);
        const response = await chain.invoke(context);

        // 6. Préparer le résultat pour le fusionner dans le contexte du workflow
        const llmOutput = response.content;
        const outputVariable = 'aiContent';
        const updatedContext = {
            [outputVariable]: llmOutput
        };

        logger.info(`[AI Action] Contenu généré avec succès et stocké dans la variable de contexte '${outputVariable}'.`);

        return {
            success: true,
            updatedContext // Cet objet sera fusionné au contexte principal par le moteur de workflow
        };

    } catch (llmError) {
        const message = `Erreur durant la génération de contenu IA avec ${aiProvider}: ${llmError.message}`;
        logger.error(`[AI Action] ${message}`, llmError.stack);
        return { success: false, message };
    }
}


/**
 * Gère l'action d'envoi d'email d'un workflow.
 * @param {object} action - L'objet workflowAction.
 * @param {object} triggerData - Les données qui ont déclenché le workflow.
 * @param {object} user - L'utilisateur propriétaire du workflow.
 */
async function handleSendEmailAction(action, triggerData, user) {

    logger.info(`[Workflow] Exécution de l'action sendEmail pour l'utilisateur ${user.username}.`);

    // 1. Récupérer la configuration SMTP depuis le modèle 'env' de l'utilisateur
    const envVars = await searchData({
        user,
        query: { model: 'env', limit: 100 } // Limite raisonnable pour les variables d'env
    });

    if (!envVars.data || envVars.data.length === 0) {
        throw new Error("Aucune variable d'environnement (modèle 'env') trouvée pour la configuration SMTP.");
    }

    const smtpConfig = envVars.data.reduce((acc, variable) => {
        if (['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].includes(variable.name)) {
            acc[variable.name.replace('SMTP_', '').toLowerCase()] = variable.value;
        }
        return acc;
    }, {});

    // 2. Extraire la configuration de l'action et résoudre les placeholders
    const { emailRecipients, emailSubject, emailContent } = action;
    if (!emailRecipients || !emailSubject || !emailContent) {
        throw new Error("SendEmail incomplete (emailRecipients, emailSubject, emailContent are needed).");
    }

    try {
        const context = { data: triggerData, user }; // Contexte pour la résolution des placeholders

        const rto = (await Promise.all(emailRecipients.map(r => substituteVariables(r, context, user))));
        const rsubject = await substituteVariables(emailSubject, context, user);
        const rbody = await substituteVariables(emailContent, context, user);

        // 3. Préparer les données pour sendEmail
        const emailData = {
            title: rsubject,
            content: rbody
        };

        await sendEmail(rto, emailData, smtpConfig, user.lang);
        logger.info(`[Workflow] Action sendEmail terminée avec succès pour le destinataire: ${rto}`);

        return { success: true, message: `Email sent to ${rto.join(', ')}` };

    } catch (error) {
        logger.error(`[handleSendEmailAction] Erreur lors de l'envoi de l'email : ${error.message}`, error.stack);
        return { success: false, message: error.message };
    }
}