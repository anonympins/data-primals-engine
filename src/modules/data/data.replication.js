// --- NOUVEAU FICHIER : src/modules/data/data.replication.js ---
import { Event } from '../../events.js';
import { Logger } from '../../gameObject.js';
import { getResponsibleNodesForUser, isSelfMasterForUser } from './data.cluster.js';

let logger;

/**
 * Réplique une opération de données vers les nœuds répliques.
 * @param {string} operation - 'insert', 'update', 'delete'
 * @param {string} modelName - Le nom du modèle.
 * @param {object} user - L'objet utilisateur.
 * @param {object} payload - Les données de l'opération.
 */
async function replicateOperation(operation, modelName, user, payload) {
    if (!isSelfMasterForUser(user.username)) {
        // Seul le nœud maître est autorisé à initier une réplication.
        return;
    }

    const nodes = getResponsibleNodesForUser(user.username);
    const replicas = nodes.slice(1); // Tous les nœuds sauf le premier (le maître)

    if (replicas.length === 0) {
        return; // Pas de répliques à notifier.
    }

    logger.debug(`[Replication] Replicating '${operation}' on model '${modelName}' for user '${user.username}' to replicas: ${replicas.join(', ')}`);

    const replicationPayload = {
        operation,
        modelName,
        user: { username: user.username, _user: user._user }, // Envoyer juste l'essentiel
        payload
    };

    const promises = replicas.map(replicaUrl => {
        const targetUrl = `${replicaUrl}/api/internal/replicate`;
        const authToken = process.env.INTERNAL_CLUSTER_TOKEN ? `Bearer ${process.env.INTERNAL_CLUSTER_TOKEN}` : null;

        return fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            },
            body: JSON.stringify(replicationPayload)
        }).catch(err => {
            logger.error(`[Replication] Failed to replicate to ${replicaUrl}: ${err.message}`);
        });
    });

    // On ne bloque pas la réponse à l'utilisateur, la réplication est asynchrone.
    Promise.allSettled(promises);
}

export function onInit(engine) {
    logger = engine.getComponent(Logger);

    // Écouter les événements de modification de données
    Event.Listen("OnDataAdded", (eng, { modelName, insertedDocs, user }) => {
        replicateOperation('insert', modelName, user, { data: insertedDocs });
    }, "event", "system");

    Event.Listen("OnDataEdited", (eng, { modelName, user, after }) => {
        // Pour une mise à jour, on a besoin du filtre et des données modifiées.
        // C'est un peu plus complexe car l'événement ne fournit pas le filtre original.
        // Pour une réplication simple, on peut envoyer l'ID et le payload de mise à jour.
        after.forEach(doc => {
            replicateOperation('update', modelName, user, {
                filter: { _id: doc._id.toString() },
                data: doc // Envoyer le document complet est plus simple pour la réplique.
            });
        });
    }, "event", "system");

    Event.Listen("OnDataDeleted", (eng, { modelName, user, before }) => {
        const idsToDelete = before.map(doc => doc._id.toString());
        replicateOperation('delete', modelName, user, { ids: idsToDelete });
    }, "event", "system");

    logger.info("Replication module initialized and listening for data events.");
}