import {isPlainObject, safeAssignObject} from "../../core.js";
import {getCollection, getCollectionForUser, isObjectId, ObjectId} from "../mongodb.js";
import {handleDemoInitialization} from "./data.js";
import { Event} from "../../events.js"
import {Logger} from "../../gameObject.js";
import {hasPermission, middlewareAuthenticator, userInitiator} from "../user.js";
import {isLocalUser} from "../../data.js";
import {getModel} from "./data.operations.js";

/**
 * Compare deux valeurs de manière récursive. Gère les ObjectId, les objets, les tableaux et les primitives.
 * @param {*} a - Première valeur.
 * @param {*} b - Deuxième valeur.
 * @returns {boolean} - True si les valeurs sont sémantiquement égales.
 */
function isEqual(a, b) {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof ObjectId && b instanceof ObjectId) return a.toString() === b.toString();
    if (!a || !b || (typeof a !== 'object' && typeof b !== 'object')) return a === b;
    if (a.constructor !== b.constructor) return false;

    if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) return false;
        }
        return true;
    }

    if (isPlainObject(a)) {
        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) return false;
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(b, key) || !isEqual(a[key], b[key])) {
                return false;
            }
        }
        return true;
    }

    return false;
}
/**
 * Calcule la différence entre deux documents pour les champs historisés.
 * @param {object} beforeDoc - Le document avant modification.
 * @param {object} afterDoc - Le document après modification.
 * @param {string[]} historizedFields - La liste des champs à surveiller.
 * @returns {object} - Un objet contenant les changements, ou un objet vide si rien n'a changé.
 */
function calculateDiff(beforeDoc, afterDoc, historizedFields) {
    const changes = {};
    for (const fieldName of historizedFields) {
        const beforeValue = beforeDoc[fieldName];
        const afterValue = afterDoc[fieldName];

        if (!isEqual(beforeValue, afterValue)) {
            safeAssignObject(changes, fieldName, {
                from: beforeValue,
                to: afterValue
            });
        }
    }
    // Retourne null si aucun changement n'a été détecté, ce qui est plus facile à vérifier qu'un objet vide.
    return Object.keys(changes).length > 0 ? changes : null;
}
/**
 * @route   POST /api/data/history/:modelName/:recordId/revert/:version
 * @desc    Restaure un document à l'état d'une version spécifique.
 * @access  Private
 */
export async function handleRevertToRevisionRequest(req, res) {
    const { modelName, recordId, version } = req.params;
    const user = req.me;

    try {
        // 1. Permissions check (user must be able to edit the data)
        if (user && user.username !== 'demo' && isLocalUser(user) && (
            !await hasPermission(["API_ADMIN", "API_EDIT_DATA", "API_EDIT_DATA_"+modelName], user) ||
            await hasPermission(["API_EDIT_DATA_NOT_"+modelName], user))) {
            return res.status(403).json({ success: false, error: i18n.t('api.permission.editData') });
        }

        // 2. Input validation
        const versionInt = parseInt(version, 10);
        if (!modelName || !recordId || !isObjectId(recordId) || !version || isNaN(versionInt)) {
            return res.status(400).json({ success: false, error: "Invalid model name, record ID, or version." });
        }

        // 3. Get the current state of the document (for history diff)
        const dataCollection = await getCollectionForUser(user);
        const docId = new ObjectId(recordId);
        const beforeDoc = await dataCollection.findOne({ _id: docId });

        if (!beforeDoc) {
            return res.status(404).json({ success: false, error: "Current document not found." });
        }

        // 4. Reconstruct the document to the target version
        const documentStateAtVersion = await getDocumentAtVersion(recordId, modelName, versionInt);

        if (!documentStateAtVersion) {
            return res.status(404).json({ success: false, error: "Could not reconstruct document at the specified version." });
        }

        // 5. Calculate changes between current version and target version
        const model = await getModel(modelName, user);
        const historizedFields = model?.history?.fields
            ? Object.keys(model.history.fields).filter(f => model.history.fields[f] === true)
            : model.fields.map(f => f.name);

        const changes = calculateDiff(beforeDoc, documentStateAtVersion, historizedFields);

        // 6. Replace the document with the reverted state
        const { _id, ...payloadForReplacement } = documentStateAtVersion;
        const replaceResult = await dataCollection.replaceOne({ _id: docId }, payloadForReplacement);

        // On ne crée une entrée d'historique que si des champs historisés ont changé.
        // Le document a pu être modifié à cause de champs non-historisés, mais cela
        // ne devrait pas créer une nouvelle version dans l'historique.
        if (changes) {
            // 7. Create a new history entry manually
            const historyCollection = getCollection('history');

            // Get last version number
            const lastVersionDoc = await historyCollection.findOne(
                { documentId: docId },
                { projection: { version: 1 }, sort: { version: -1 } }
            );
            const newVersion = lastVersionDoc ? lastVersionDoc.version + 1 : 1;

            await historyCollection.insertOne({
                documentId: docId,
                model: modelName,
                timestamp: new Date(),
                user: { _id: user._id, username: user.username },
                version: newVersion,
                operation: 'update', // Une restauration est enregistrée comme une 'update'
                changes: changes
            });

            logger.info(`User ${user.username} reverted document ${modelName}:${recordId} to version ${version}. New history entry created (v${newVersion}).`);
        } else if (replaceResult.modifiedCount > 0) {
            logger.info(`Document ${modelName}:${recordId} was modified during revert, but no historized fields changed. No new history entry created.`);
        }

        res.json({ success: true, message: "Document successfully reverted." });

    } catch (error) {
        logger.error(`[handleRevertToRevisionRequest] Error reverting document ${modelName}:${recordId} to version ${version}:`, error);
        res.status(500).json({
            success: false,
            error: 'An internal server error occurred during the revert operation.'
        });
    }
}


/**
 * @route   GET /api/data/history/:modelName/:recordId
 * @desc    Récupère l'historique d'un enregistrement spécifique pour le frontend.
 * @access  Private (géré par middlewareAuthenticator)
 */
export async function handleGetHistoryRequest(req, res) {
    const { modelName, recordId } = req.params;
    const { limit = 10, page = 1, startDate, endDate } = req.query;
    const user = req.me; // Le middleware d'authentification attache l'utilisateur à req.me

    try {
        // 1. Vérification des permissions (similaire à searchData)
        if (user && user.username !== 'demo' && isLocalUser(user) && (
            !await hasPermission(["API_ADMIN", "API_SEARCH_DATA", "API_SEARCH_DATA_"+modelName], user) ||
            await hasPermission(["API_SEARCH_DATA_NOT_"+modelName], user))) {
            return res.status(403).json({ success: false, error: i18n.t('api.permission.searchData') });
        }

        // 2. Validation des entrées
        if (!modelName || !recordId || !isObjectId(recordId)) {
            return res.status(400).json({ success: false, error: "Invalid model name or record ID." });
        }

        // 3. Récupération des données depuis la collection 'history'
        const historyCollection = getCollection('history');
        const filterConditions = [
            { "$eq": ["$documentId", new ObjectId(recordId)]},
            { "$eq": ["$model", modelName]}
        ];

        // Ajout du filtre par plage de dates
        if (startDate) {
            try {
                filterConditions.push({ $gte: ["$timestamp", new Date(startDate)] });
            } catch (e) { /* ignore invalid date */ }
        }
        if (endDate) {
            try {
                const endOfDay = new Date(endDate);
                endOfDay.setUTCHours(23, 59, 59, 999); // Inclusif pour toute la journée de fin
                filterConditions.push({ $lte: ["$timestamp", endOfDay] });
            } catch (e) { /* ignore invalid date */ }
        }

        const filter = { "$and": filterConditions };

        const limitInt = parseInt(limit, 10);
        const pageInt = parseInt(page, 10);
        const skip = (pageInt - 1) * limitInt;

        // Utiliser une agrégation pour le comptage afin de s'assurer que le filtre $expr est correctement appliqué.
        const countPipeline = [
            { $match: { $expr: filter } },
            { $count: "count" }
        ];

        const [countResult, historyData] = await Promise.all([
            historyCollection.aggregate(countPipeline).toArray(),
            historyCollection.aggregate([{$match: {$expr: filter}}])
                .sort({ version: -1 })
                .skip(skip)
                .limit(limitInt)
                .toArray()
        ]);

        const totalCount = countResult.length > 0 ? countResult[0].count : 0;

        // 4. Transformation des données pour correspondre au format attendu par le composant HistoryDialog.jsx
        const opMap = {
            create: 'i',
            update: 'u',
            delete: 'd'
        };

        const transformedHistory = historyData.map(entry => {
            const { documentId, version, operation, timestamp, user: historyUser, snapshot, changes, ...rest } = entry;

            // Pour l'affichage, on priorise les 'changes' pour une mise à jour,
            // et le 'snapshot' pour une création ou suppression.
            let dataPayload;
            if (operation === 'update') {
                dataPayload = changes || {};
            } else { // 'create', 'delete'
                dataPayload = snapshot || {};
            }

            // On exclut les métadonnées du payload pour ne pas les dupliquer
            const { _id: originalDocId, _model, _user, _hash, ...payloadFields } = dataPayload;

            return {
                ...rest, // Conserve l'_id du document d'historique lui-même
                _rid: documentId,
                _v: version,
                _op: opMap[operation] || operation, // 'create' -> 'i', 'update' -> 'u', etc.
                _updatedAt: timestamp,
                _user: historyUser?.username,
                ...payloadFields // Étale les champs du document (snapshot ou changes)
            };
        });

        res.json({ success: true, data: transformedHistory, count: totalCount });

    } catch (error) {
        logger.error(`[handleGetHistoryRequest] Error fetching history for model ${modelName}, record ${recordId}:`, error);
        res.status(500).json({
            success: false,
            error: 'An internal server error occurred while fetching history.'
        });
    }
}

/**
 * @route   GET /api/data/history/:modelName/:recordId/:version
 * @desc    Récupère un document à une version spécifique de son historique.
 * @access  Private (géré par middlewareAuthenticator)
 */
export async function handleGetRevisionRequest(req, res) {
    const { modelName, recordId, version } = req.params;
    const user = req.me;

    try {
        // 1. Permissions check (same as getting history)
        if (user && user.username !== 'demo' && isLocalUser(user) && (
            !await hasPermission(["API_ADMIN", "API_SEARCH_DATA", "API_SEARCH_DATA_"+modelName], user) ||
            await hasPermission(["API_SEARCH_DATA_NOT_"+modelName], user))) {
            return res.status(403).json({ success: false, error: i18n.t('api.permission.searchData') });
        }

        // 2. Input validation
        if (!modelName || !recordId || !isObjectId(recordId) || !version || isNaN(parseInt(version, 10))) {
            return res.status(400).json({ success: false, error: "Invalid model name, record ID, or version." });
        }

        // 3. Reconstruct the document
        const documentState = await getDocumentAtVersion(recordId, modelName, parseInt(version, 10));

        if (!documentState) {
            return res.status(404).json({ success: false, error: "Could not reconstruct document at the specified version." });
        }

        res.json({ success: true, data: documentState });

    } catch (error) {
        logger.error(`[handleGetRevisionRequest] Error fetching revision for model ${modelName}, record ${recordId}, version ${version}:`, error);
        res.status(500).json({
            success: false,
            error: 'An internal server error occurred while fetching the revision.'
        });
    }
}



let engine, logger;
/**
 * Initialise les écouteurs d'événements pour le module d'historique.
 * @param {object} defaultEngine - L'instance du moteur.
 */
export function onInit(defaultEngine) {

    engine = defaultEngine;
    logger = engine.getComponent(Logger);
    engine.get('/api/data/history/:modelName/:recordId', [middlewareAuthenticator, userInitiator], handleGetHistoryRequest);
    engine.get('/api/data/history/:modelName/:recordId/:version', [middlewareAuthenticator, userInitiator], handleGetRevisionRequest);
    engine.post('/api/data/history/:modelName/:recordId/revert/:version', [middlewareAuthenticator, userInitiator], handleRevertToRevisionRequest);

    // --- Écouteur pour la CRÉATION de données (Version 1 - Snapshot) ---
    Event.Listen("OnDataAdded", async (engine, { modelName, insertedIds, user }) => {
        try {
            const model = await getModel(modelName, user);
            if (!model?.history?.enabled) return;

            const dataCollection = await getCollectionForUser(user);
            const historyCollection = getCollection('history');

            const newDocs = await dataCollection.find({ _id: { $in: insertedIds.map(id => new ObjectId(id)) } }).toArray();

            for (const doc of newDocs) {
                await historyCollection.insertOne({
                    documentId: doc._id,
                    model: modelName,
                    timestamp: new Date(),
                    user: { _id: user._id, username: user.username },
                    version: 1,
                    operation: 'create',
                    snapshot: doc // Pour la création, on stocke un snapshot complet
                });
                logger.debug(`History v1 (create) created for ${modelName} document ${doc._id}`);
            }
        } catch (error) {
            logger.error("History Module (OnDataAdded) Error:", error);
        }
    }, "event", "system");

    // --- Écouteur pour la MODIFICATION de données (Versions > 1 - Diff) ---
    Event.Listen("OnDataEdited", async (engine, { modelName, user, before, after }) => {
        try {
            const model = await getModel(modelName, user);
            if (!model?.history?.enabled) return;

            // Détermine les champs à historiser. Si non spécifié, tous les champs le sont.
            const historizedFields = model.history.fields
                ? Object.keys(model.history.fields).filter(f => model.history.fields[f] === true)
                : model.fields.map(f => f.name);

            if (historizedFields.length === 0) return; // Pas de champs à suivre

            const historyCollection = getCollection('history');

            for (const afterDoc of after) {
                const beforeDoc = before.find(b => b._id.toString() === afterDoc._id.toString());
                if (!beforeDoc) {
                    logger.warn(`History Module: Could not find 'before' state for document ${afterDoc._id}. Skipping history record.`);
                    continue;
                }

                const changes = calculateDiff(beforeDoc, afterDoc, historizedFields);

                // S'il n'y a aucun changement sur les champs surveillés, on ne crée pas d'entrée.
                if (!changes) {
                    continue;
                }

                // Récupérer la dernière version pour incrémenter
                const lastVersionDoc = await historyCollection.findOne({ documentId: afterDoc._id }, { sort: { version: -1 } });
                const newVersion = lastVersionDoc ? lastVersionDoc.version + 1 : 1; // If no history, this is version 1.

                const historyEntry = {
                    documentId: afterDoc._id,
                    model: modelName,
                    timestamp: new Date(),
                    user: { _id: user._id, username: user.username },
                    version: newVersion,
                    operation: 'update',
                    changes: changes // On stocke uniquement les différences
                }

                // If this is the first history record for this document, add a snapshot of the 'before' state.
                if (!lastVersionDoc) {
                    historyEntry.snapshot = beforeDoc;
                    logger.debug(`History v${newVersion} (update with initial snapshot) created for ${modelName} document ${afterDoc._id}`);
                } else {
                    logger.debug(`History v${newVersion} (update) created for ${modelName} document ${afterDoc._id}`);
                }

                await historyCollection.insertOne(historyEntry);
            }
        } catch (error) {
            logger.error("History Module (OnDataEdited) Error:", error);
        }
    }, "event", "system");

    // --- Écouteur pour la SUPPRESSION de données (Snapshot final) ---
    Event.Listen("OnDataDeleted", async (engine, { modelName, user, before }) => {
        // 'before' est un tableau des documents complets juste avant leur suppression.
        try {
            const model = await getModel(modelName, user);
            if (!model?.history?.enabled) return;

            const historyCollection = getCollection('history');

            for (const deletedDoc of before) {
                // Récupérer la dernière version pour incrémenter
                const lastVersionDoc = await historyCollection.findOne({ documentId: deletedDoc._id }, { sort: { version: -1 } });
                // Si aucune version n'existe, c'est peut-être un cas où l'historique a été activé après la création.
                // On commence à 1, sinon on incrémente.
                const newVersion = lastVersionDoc ? lastVersionDoc.version + 1 : 1;

                await historyCollection.insertOne({
                    documentId: deletedDoc._id,
                    model: modelName,
                    timestamp: new Date(),
                    user: { _id: user._id, username: user.username },
                    version: newVersion,
                    operation: 'delete',
                    // On stocke un snapshot final du document supprimé pour audit ou restauration.
                    snapshot: deletedDoc
                });
                logger.debug(`History v${newVersion} (delete) created for ${modelName} document ${deletedDoc._id}`);
            }
        } catch (error) {
            logger.error("History Module (OnDataDeleted) Error:", error);
        }
    }, "event", "system");

    logger.info("History module initialized and listening for data events.");
}

/**
 * Reconstructs a document to a specific version from its history by finding the last
 * available snapshot and applying subsequent changes.
 * @param {ObjectId|string} documentId - The ID of the document.
 * @param {string} modelName - The model name.
 * @param {number} targetVersion - The version to reconstruct to.
 * @returns {Promise<object|null>} - The reconstructed document object, or null if not found.
 */
export async function getDocumentAtVersion(documentId, modelName, targetVersion) {
    const historyCollection = getCollection('history');
    const docId = typeof documentId === 'string' ? new ObjectId(documentId) : documentId;
    const version = parseInt(targetVersion, 10);

    // 1. Find the most recent snapshot at or before the target version.
    const lastSnapshotEntry = await historyCollection.findOne({
        documentId: docId,
        model: modelName,
        version: { $lte: version },
        snapshot: { $exists: true }
    }, { sort: { version: -1 } });

    if (!lastSnapshotEntry) {
        logger.warn(`No snapshot found for ${modelName}:${documentId} up to version ${version}. Cannot reconstruct.`);
        return null;
    }

    // 2. Start with this snapshot.
    let reconstructedDoc = lastSnapshotEntry.snapshot;

    // If the snapshot entry itself is an update, apply its changes to the base snapshot.
    // This handles the case where the first history entry is an update with a snapshot.
    if (lastSnapshotEntry.operation === 'update' && lastSnapshotEntry.changes) {
        for (const fieldName in lastSnapshotEntry.changes) {
            if (Object.prototype.hasOwnProperty.call(lastSnapshotEntry.changes, fieldName)) {
                reconstructedDoc[fieldName] = lastSnapshotEntry.changes[fieldName].to;
            }
        }
    }

    if (lastSnapshotEntry.version === version) {
        return reconstructedDoc;
    }

    // 3. Find all 'update' operations between our snapshot's version and the target version.
    const updatesToApply = await historyCollection.find({
        documentId: docId,
        model: modelName,
        version: { $gt: lastSnapshotEntry.version, $lte: version },
        operation: 'update'
    }).sort({ version: 1 }).toArray();

    // 4. Apply the changes sequentially.
    for (const update of updatesToApply) {
        if (update.changes) {
            for (const fieldName in update.changes) {
                if (Object.prototype.hasOwnProperty.call(update.changes, fieldName)) {
                    reconstructedDoc[fieldName] = update.changes[fieldName].to;
                }
            }
        }
    }

    return reconstructedDoc;
}

/**
 * Purge (supprime définitivement) des documents et tout leur historique associé.
 * C'est une opération destructive à utiliser avec précaution.
 * @param {object} user - L'utilisateur effectuant l'opération (pour les permissions).
 * @param {string} modelName - Le nom du modèle concerné.
 * @param {object} filter - Le filtre MongoDB pour trouver les documents à purger.
 * @returns {Promise<{success: boolean, purgedCount: number, historyPurgedCount: number, error?: string}>}
 */
export async function purgeData(user, modelName = null, filter=null) {
    const logger = new Logger("purgeData");
    try {
        const dataCollection = await getCollectionForUser(user);
        const historyCollection = getCollection('history');

        let m = modelName || { _model: modelName };
        const f= filter || { _user: user.username };
        // 1. Trouver les documents à purger pour récupérer leurs IDs
        const docsToPurge = await dataCollection.find({ ...m, ...f }).project({ _id: 1 }).toArray();
        if (docsToPurge.length === 0) {
            return { success: true, purgedCount: 0, historyPurgedCount: 0 };
        }
        const docIdsToPurge = docsToPurge.map(d => d._id);

        // 2. Purger l'historique associé à ces documents
        const historyResult = await historyCollection.deleteMany({ documentId: { $in: docIdsToPurge } });

        // 3. Purger les documents eux-mêmes
        const dataResult = await dataCollection.deleteMany({ _id: { $in: docIdsToPurge } });

        logger.info(`Purged ${dataResult.deletedCount} documents and ${historyResult.deletedCount} history entries for model '${modelName}'.`);

        // On pourrait aussi émettre un événement "OnDataPurged" ici si nécessaire
        await Event.Trigger("OnDataPurged", "event","system",{ user, modelName, purgedIds: docIdsToPurge });

        return {
            success: true,
            purgedCount: dataResult.deletedCount,
            historyPurgedCount: historyResult.deletedCount
        };

    } catch (error) {
        logger.error(`Error during data purge for model '${modelName}':`, error);
        return { success: false, purgedCount: 0, historyPurgedCount: 0, error: error.message };
    }
}