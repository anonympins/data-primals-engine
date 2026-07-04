import { Logger } from '../../gameObject.js';
import { clusterPeers } from '../../constants.js';
import { getResponsibleNodesForUser } from './data.cluster.js';

const logger = new Logger('DataReplication');
const replicationQueue = [];
const BATCH_INTERVAL = 100; // Traiter la file toutes les 100ms
const BATCH_SIZE_LIMIT = 50; // Envoyer un maximum de 50 opérations par requête de batch

let intervalId = null;

/**
 * Ajoute une tâche de réplication à la file d'attente.
 * C'est le point d'entrée pour toutes les opérations de données.
 * @param {string} operation - 'insert', 'update', 'delete'
 * @param {string} modelName - Le nom du modèle.
 * @param {object} user - L'objet utilisateur.
 * @param {object} payload - Les données de l'opération.
 */
export function queueReplication(operation, modelName, user, payload) {
    if (clusterPeers.length === 0) {
        return; // Pas de cluster, pas de réplication.
    }
    replicationQueue.push({ operation, modelName, user, payload, timestamp: new Date() });
}

/**
 * Traite la file d'attente, groupe les opérations par réplique et les envoie en lots.
 */
async function processReplicationQueue() {
    if (replicationQueue.length === 0) {
        return;
    }

    const itemsToProcess = replicationQueue.splice(0, replicationQueue.length);
    logger.debug(`[ReplicationQueue] Processing ${itemsToProcess.length} items.`);

    // Étape 1: Regrouper les opérations par URL de réplique
    const batches = new Map(); // Map<peerUrl, operation[]>

    for (const item of itemsToProcess) {
        const responsibleNodes = getResponsibleNodesForUser(item.user.username);
        const replicas = responsibleNodes.slice(1); // Exclut le maître

        for (const replicaUrl of replicas) {
            if (!batches.has(replicaUrl)) {
                batches.set(replicaUrl, []);
            }
            // On ne garde que les informations nécessaires pour la réplique
            batches.get(replicaUrl).push({
                operation: item.operation,
                modelName: item.modelName,
                user: { username: item.user.username }, // On ne passe que le username
                payload: item.payload
            });
        }
    }

    // Étape 2: Envoyer les lots à chaque réplique
    for (const [peerUrl, operations] of batches.entries()) {
        // Découper les gros lots en plus petits morceaux (chunks)
        for (let i = 0; i < operations.length; i += BATCH_SIZE_LIMIT) {
            const chunk = operations.slice(i, i + BATCH_SIZE_LIMIT);
            const targetUrl = `${peerUrl}/api/internal/replicate`;
            const authToken = `Bearer ${process.env.INTERNAL_CLUSTER_TOKEN}`;

            logger.info(`[ReplicationBatch] Sending batch of ${chunk.length} operations to ${peerUrl}`);

            // Envoyer la requête sans attendre la réponse pour ne pas bloquer la boucle
            fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken
                },
                body: JSON.stringify({ operations: chunk }) // Le corps contient maintenant un tableau d'opérations
            }).catch(error => {
                logger.error(`[ReplicationBatch] Failed to send batch to peer ${peerUrl}: ${error.message}`);
                // On pourrait ré-ajouter les opérations échouées à la queue avec une logique de retry
            });
        }
    }
}

/**
 * Démarre le processeur de la file d'attente de réplication.
 * @param {object} engine - L'instance du moteur.
 */
export function onInit(engine) {
    if (clusterPeers.length > 0) {
        intervalId = setInterval(processReplicationQueue, BATCH_INTERVAL);
        logger.info(`Replication Queue processor started with a ${BATCH_INTERVAL}ms interval.`);
    }
}

/**
 * Arrête le processeur de la file d'attente.
 */
export function stopReplicationQueue() {
    if (intervalId) {
        clearInterval(intervalId);
        logger.info('Replication Queue processor stopped.');
    }
}