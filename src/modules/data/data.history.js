import {isPlainObject} from "../../core.js";
import {getCollection, getCollectionForUser,  ObjectId} from "../mongodb.js";
import {getModel} from "./data.js";
import { Event} from "../../events.js"
import {Logger} from "../../gameObject.js";

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
            changes[fieldName] = {
                from: beforeValue,
                to: afterValue
            };
        }
    }
    // Retourne null si aucun changement n'a été détecté, ce qui est plus facile à vérifier qu'un objet vide.
    return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Initialise les écouteurs d'événements pour le module d'historique.
 * @param {object} engine - L'instance du moteur.
 */
export function onInit(engine) {
    const logger = engine.getComponent(Logger);

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
                const newVersion = lastVersionDoc ? lastVersionDoc.version + 1 : 2; // v1 est la création

                await historyCollection.insertOne({
                    documentId: afterDoc._id,
                    model: modelName,
                    timestamp: new Date(),
                    user: { _id: user._id, username: user.username },
                    version: newVersion,
                    operation: 'update',
                    changes: changes // On stocke uniquement les différences
                });
                logger.debug(`History v${newVersion} (update) created for ${modelName} document ${afterDoc._id}`);
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
        await Event.Trigger("OnDataPurged", { user, modelName, purgedIds: docIdsToPurge });

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