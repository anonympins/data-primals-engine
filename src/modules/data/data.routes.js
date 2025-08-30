import {Logger} from "../../gameObject.js";
import {ObjectId} from "mongodb";
import * as util from 'node:util';
import {setTimeoutMiddleware} from '../../middlewares/timeout.js';
import {isDemoUser, isLocalUser} from "../../data.js";
import {
    install,
    maxBytesPerSecondThrottleData,
    maxMagnetsDataPerModel,
    maxMagnetsModels,
    maxModelsPerUser, maxPackData, maxPackPreviewData
} from "../../constants.js";
import {datasCollection, getCollection, getCollectionForUser, isObjectId, modelsCollection} from "../mongodb.js";
import {countKeys, safeAssignObject, uuidv4} from "../../core.js";
import {Event} from "../../events.js";
import fs from "node:fs";
import i18n from "../../i18n.js";
import {executeSafeJavascript, triggerWorkflows} from "../workflow.js";
import {openaiJobModel} from "../../openai.jobs.js";
import {getS3Stream, getUserS3Config} from "../bucket.js";
import {generateLimiter, hasPermission, middlewareAuthenticator, userInitiator} from "../user.js";
import {assistantGlobalLimiter} from "../assistant/assistant.js";
import {Config} from "../../config.js";
import {processFilterPlaceholders} from "../../../client/src/filter.js";
import {tutorialsConfig} from "../../../client/src/tutorials.js";
import {getResource, handleDemoInitialization} from "./data.js";
import process from "node:process";
import {throttleMiddleware} from "../../middlewares/throttle.js";
import {importJobs, modelsCache, runImportExportWorker} from "./data.core.js";
import {validateModelStructure} from "./data.validation.js";
import {
    deleteData,
    editData,
    editModel,
    exportData,
    flushSearchCache,
    getModel,
    importData,
    insertData,
    installPack,
    patchData,
    searchData
} from "./data.operations.js";
import { dumpUserData, loadFromDump } from "./data.backup.js";
import { invalidateModelCache } from "./data.operations.js";

let logger, engine;

const sseConnections = new Map();



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

/**
 * Envoie un SSE à un utilisateur spécifique.
 * @param {string} username - Le nom de l'utilisateur à qui envoyer l'événement.
 * @param {object} data - L'objet de données à envoyer.
 * @returns {boolean} - True si l'événement a été envoyé, false sinon.
 */
export async function sendSseToUser(username, data) {
    const res = sseConnections.get(username);
    if (res) {
        const ssePlugin = await Event.Trigger("sendSseToUser", "system", "calls", data) || data;
        res.write(`data: ${JSON.stringify(ssePlugin)}\n\n`);
        return true;
    }
    return false;
}


export async function handleCustomEndpointRequest(req, res) {
    const endpointDef = req.endpointDef;

    try {
        let executionUser = null;

        // 1. Déterminer le contexte utilisateur pour l'exécution
        if (endpointDef.isPublic) {
            // Pour les endpoints publics, on exécute le script en tant que propriétaire de l'endpoint.
            if (!endpointDef._user) {
                logger.error(`[Endpoint] Misconfiguration: Public endpoint '${endpointDef.name}' (ID: ${endpointDef._id}) has no owner.`);
                return res.status(500).json({success: false, message: 'Endpoint misconfigured: owner missing.'});
            }
            executionUser = await engine.userProvider.findUserByUsername(endpointDef._user);
            if (!executionUser) {
                logger.error(`[Endpoint] Execution failed: Owner '${endpointDef._user}' for public endpoint '${endpointDef.name}' not found.`);
                return res.status(500).json({success: false, message: 'Endpoint owner not found.'});
            }
            logger.info(`[Endpoint] Public endpoint '${endpointDef.name}' running as owner '${executionUser.username}'.`);
        } else {
            // Pour les endpoints privés, l'utilisateur a déjà été authentifié par le middleware.
            // req.me est garanti d'exister ici.
            executionUser = req.me;
            logger.info(`[Endpoint] Private endpoint '${endpointDef.name}' running as authenticated user '${executionUser.username}'.`);
        }

        // 2. Préparer le contexte pour le script
        const contextData = {
            request: {
                // MODIFICATION: Utiliser req.body si disponible (pour les requêtes JSON comme les webhooks Stripe),
                // sinon, utiliser req.fields (pour les données de formulaire).
                body: (req.body && Object.keys(req.body).length > 0) ? req.body : (req.fields || {}),
                query: req.query,
                params: req.params,
                headers: req.headers
            }
        };

        // 3. Exécuter le code de l'endpoint
        const result = await executeSafeJavascript(
            {script: endpointDef.code},
            contextData,
            executionUser // Use the determined user for execution
        );

        // 4. Envoyer la réponse
        if (result.success) {
            res.status(200).json(result.data);
        } else {
            logger.error(`[Endpoint] Execution failed for '${endpointDef.name}'. Error: ${result.message}`);
            const responseError = {
                success: false,
                message: 'Endpoint script execution failed.',
                details: result.message,
                logs: result.logs
            };
            res.status(500).json(responseError);
        }

    } catch (error) {
        logger.error(`[Endpoint] Critical error handling request for path '${endpointDef.path}': ${error.message}`, error.stack);
        res.status(500).json({success: false, message: 'An internal server error occurred.'});
    }
}

export async function middlewareEndpointAuthenticator(req, res, next) {
    const {path} = req.params;
    const method = req.method.toUpperCase();
    const user = await engine.userProvider.findUserByUsername(req.query._user || req.params.user || req.me.username);
    const datasCollection = await getCollectionForUser(user);

    try {
        const endpointDef = await datasCollection.findOne({
            _model: 'endpoint',
            path: path,
            method: method,
            isActive: true
        });

        if (!endpointDef) {
            return res.status(404).json({success: false, message: 'Endpoint not found.'});
        }

        // Attacher la définition à la requête pour que le handler suivant puisse l'utiliser
        req.endpointDef = endpointDef;

        // Si l'endpoint n'est PAS public, on exécute le vrai middleware d'authentification
        if (!endpointDef.isPublic) {
            // On "chaîne" vers le middleware authenticator standard.
            // Il se chargera de vérifier le token et de renvoyer une 401 si nécessaire.
            return middlewareAuthenticator(req, res, next);
        }

        // Si l'endpoint EST public, on passe simplement à la suite.
        next();

    } catch (error) {
        logger.error(`[EndpointAuth] Critical error: ${error.message}`, error.stack);
        res.status(500).json({success: false, message: 'Internal server error during endpoint authentication.'});
    }
}

export async function registerRoutes(defaultEngine){

    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    const m = Config.Get('maxBytesPerSecondThrottleData', maxBytesPerSecondThrottleData)
    const throttle = throttleMiddleware(m);

    let userMiddlewares = await engine.userProvider.getMiddlewares();

    engine.all('/api/actions/:user/:path', [middlewareEndpointAuthenticator, userInitiator], handleCustomEndpointRequest);
    engine.all('/api/actions/:path', [middlewareAuthenticator, middlewareEndpointAuthenticator, userInitiator], handleCustomEndpointRequest);
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
                                safeAssignObject()
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
                model,
                filter: processedFilter,
                limit, // Optimisation : pas besoin de plus de résultats
                page: 1
            }, user);

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
            // On part des données existantes de l'utilisateur pour ne rien écraser
            let newData = {
                xp: user.xp || 0,
                achievements: [...(user.achievements || [])],
                skills: JSON.parse(JSON.stringify(user.skills || [])), // Copie profonde pour éviter les mutations directes
                completedTutorials: [...(user.completedTutorials || [])]
            };

            // Appliquer les récompenses directement sur l'objet newData
            if (xpBonus) newData.xp += xpBonus;
            if (achievement && !newData.achievements.includes(achievement)) newData.achievements.push(achievement);
            if (skill && skill.name) { // S'assurer que la compétence a un nom
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

    engine.get('/api/import/progress/:jobId', middlewareAuthenticator, async (req, res) => {
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


    engine.post('/api/model/search', [middlewareAuthenticator, userInitiator], async (req, res) => {
        const { query } = req.fields;
        const user = req.me;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, error: 'A search query string is required.' });
        }

        try {
            // Utilise une expression régulière pour une recherche insensible à la casse
            const searchRegex = new RegExp(query, 'i');

            const results = await modelsCollection.find({
                // Cherche dans les modèles de l'utilisateur OU les modèles partagés
                $or: [
                    { _user: user.username },
                    { _user: { $exists: false } }
                ],
                // Cherche dans le nom OU la description
                $and: [
                    { $or: [
                        { name: { $regex: searchRegex } },
                        { description: { $regex: searchRegex } }
                    ]}
                ]
            }, {
                // On ne retourne que les informations utiles pour l'IA, pas tout le modèle
                projection: {
                    name: 1,
                    description: 1,
                    _id: 0
                }
            }).limit(10).toArray(); // Limite à 10 résultats pour ne pas surcharger

            res.json({ success: true, models: results });

        } catch (error) {
            logger.error(`[Model Search] Error searching models for query "${query}":`, error);
            res.status(500).json({ success: false, error: 'An internal server error occurred.' });
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
            const {data, count} = await searchData({...req.query, model: req.fields.model || req.query.model, filter: req.fields.filter, pack}, req.me);

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
        const r = await deleteData(req.fields.model, ids, req.me);
        if( r.error) {
            return res.status(r.statusCode || 400).json(r);
        }else{
            return res.status(r.statusCode || 200).json(r);
        }
    });

    engine.delete('/api/data', [throttle, middlewareAuthenticator, userInitiator, middlewareLogger, setTimeoutMiddleware(15000)], async (req, res) => {
        const r = await deleteData(req.fields.model, req.fields.filter, req.me);
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
            const r = await editData(req.fields.model, filter || { "$eq": ["$_id", { "$toObjectId": hash}]}, data, req.files, req.me)
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
            const m = Config.Get('maxModelsPerUser', maxModelsPerUser);
            let models = await modelsCollection.find({$or: [{_user: {$exists: false}}]})
                .sort({_user:-1, _id: 1 }).limit(m).toArray();
            models = models
                .concat(
                    await modelsCollection.find({$or: [{_user: req.me._user}, {_user: req.me.username}]})
                        .sort({_user:-1, _id: 1 })
                        .limit(m).toArray());
            res.json(models);
        } catch (error) {
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
            await validateModelStructure(modelData);


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
                const m = Config.Get('maxModelsPerUser', maxModelsPerUser);
                if( count < m) {
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
            await getPromise();

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

            // Invalider le cache pour ce modèle avant de le supprimer
            invalidateModelCache(modelName);

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
                const coll = await getCollectionForUser(req.me);
                kpiDef = await coll.findOne({ _id: new ObjectId(id), _model: 'kpi', _user: req.me._user || req.me.username });
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
            // --- Send Response ---
            res.json(results);

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

            // On ne renvoie pas le champ 'data' pour alléger la réponse de la liste
            const packs = await packsCollection.find({
                _user: req.query.user ? req.query.user : { $exists: false }
            }, {
                projection: { data: 0 }
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

            const PACK_PREVIEW_LIMIT = Config.Get('maxPackPreviewData', maxPackPreviewData);

            const countPackEntries = (p) => {
                if (!p || !p.data) return 0;
                let totalEntries = 0;
                for (const langKey in p.data) {
                    const langData = p.data[langKey];
                    for (const modelKey in langData) {
                        if (Array.isArray(langData[modelKey])) {
                            totalEntries += langData[modelKey].length;
                        }
                    }
                }
                return totalEntries;
            };

            const totalEntries = countPackEntries(pack);

            if (totalEntries > PACK_PREVIEW_LIMIT) {
                logger.warn(`[GET /api/packs/${id}] Pack data is too large (${totalEntries} entries) and will be truncated for the client.`);
                const packForClient = { ...pack };
                delete packForClient.data;
                packForClient.dataTruncated = true;
                packForClient.totalDataEntries = totalEntries;
                return res.json(packForClient);
            }
            res.json(pack); // On retourne le pack complet si sa taille est raisonnable
        } catch (error) {
            logger.error(`[GET /api/packs/${id}] Error fetching pack details:`, error);
            res.status(500).json({ success: false, error: 'Failed to fetch pack details.' });
        }
    });

    // --- NOUVEL ENDPOINT POUR METTRE À JOUR UN PACK (ex: public/privé) ---
    engine.patch('/api/packs/:id', [throttle, middlewareAuthenticator, userInitiator], async (req, res) => {
        const { id } = req.params;
        const { private:pr } = req.fields; // Le front-end enverra { isPrivate: true/false }
        const user = req.me;

        if (!isObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid pack ID format.' });
        }

        if (typeof pr !== 'boolean') {
            return res.status(400).json({ success: false, error: 'A boolean `private` field is required.' });
        }

        try {
            const packsCollection = getCollection('packs');
            const pack = await packsCollection.findOne({ _id: new ObjectId(id) });

            if (!pack) {
                return res.status(404).json({ success: false, error: 'Pack not found.' });
            }

            // Vérification des permissions : seul le propriétaire peut modifier
            if (pack._user !== user.username) {
                return res.status(403).json({ success: false, error: 'You do not have permission to edit this pack.' });
            }

            await packsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { private: pr, _updatedAt: new Date() } } // Mettre à jour le statut et la date de modification
            );

            logger.info("Pack updated successfully.", pr);

            const updatedPack = await packsCollection.findOne({ _id: new ObjectId(id) });
            res.json({ success: true, pack: updatedPack });

        } catch (error) {
            logger.error(`[PATCH /api/packs/${id}] Error updating pack:`, error);
            res.status(500).json({ success: false, error: 'Failed to update pack.' });
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
    engine.post('/api/packs/install', [throttle, middlewareAuthenticator, userInitiator, setTimeoutMiddleware(60000)], async (req, res) => {
        const { id } = req.params;
        const user = req.me;
        const lang   = req.query.lang || req.fields.lang;

        const packName = req.fields.packName || null;

        try {
            // Vérification des permissions
            if (!isDemoUser(user) && isLocalUser(user) && !await hasPermission(["API_ADMIN", "API_INSTALL_PACK"], user)) {
                return res.status(403).json({ success: false, error: i18n.t('api.permission.installPack') });
            }

            const result = await installPack(packName? packName : {...req.fields.packData, private: true}, user, lang, { installForUser: true });

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

            if (resourceInfo.storage === 's3') {
                const s3Config = await getUserS3Config(user);
                const s3Stream = getS3Stream(s3Config, resourceInfo.s3Key);

                s3Stream.on('error', (s3Error) => {
                    logger.error(`S3 stream error for resource ${guid}:`, s3Error);
                    res.status(404).json({ error: 'Resource file not found in storage.' });
                });

                s3Stream.pipe(res);
            } else { // Stockage 'local'
                const fileStream = fs.createReadStream(resourceInfo.filepath);
                fileStream.on('error', (streamError) => {
                    console.error(`Stream error for resource ${guid}:`, streamError); // ou logger.error
                    res.status(404).json({error: 'Resource file not found on server.'});
                });
                fileStream.pipe(res);
            }

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