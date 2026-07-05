import { Logger } from '../../gameObject.js';
import { getReplicaNodesForUser } from './data.cluster.js';
import process from "node:process";

const logger = new Logger('DataReplication');
const replicationQueue = [];
const failedBatchesByReplica = new Map(); // Map<peerId, Array<chunk>>
const BATCH_INTERVAL = 100; // Traiter la file toutes les 100ms
const BATCH_SIZE_LIMIT = 50; // Envoyer un maximum de 50 opérations par requête de batch

let intervalId = null;
let engineInstance = null; // Pour stocker l'instance du moteur

/**
 * Ajoute une tâche de réplication à la file d'attente.
 * C'est le point d'entrée pour toutes les opérations de données.
 * @param {string} operation - 'insert', 'update', 'delete'
 * @param {string} modelName - Le nom du modèle.
 * @param {object} user - L'objet utilisateur.
 * @param {object} payload - Les données de l'opération.
 */
export function queueReplication(operation, modelName, user, payload) {
    replicationQueue.push({ operation, modelName, user, payload, timestamp: new Date() });
}

/**
 * Tente de renvoyer les lots qui ont précédemment échoué pour chaque réplique.
 */
async function retryFailedBatches() {
    if (failedBatchesByReplica.size === 0) {
        return;
    }

    logger.debug(`[ReplicationRetry] Checking ${failedBatchesByReplica.size} replica(s) for failed batches to retry.`);

    for (const [peerId, batches] of failedBatchesByReplica.entries()) {
        if (batches.length > 0) {
            const batchToRetry = batches.shift(); // On prend le plus ancien lot en échec
            logger.info(`[ReplicationRetry] Retrying to send batch of ${batchToRetry.length} operations to replica peer ${peerId}`);

            try {
                await engineInstance.sendToPeer(peerId, '/api/internal/replicate', { operations: batchToRetry });
                // Si l'envoi réussit, le lot est retiré de la file. Sinon, il reste pour le prochain essai.
            } catch (error) {
                logger.error(`[ReplicationRetry] Retry failed for peer ${peerId}: ${error.message}. Re-queuing batch.`);
                batches.unshift(batchToRetry); // On le remet au début pour réessayer plus tard
            }
        }
    }
}
/**
 * Traite la file d'attente, groupe les opérations par réplique et les envoie en lots.
 */
async function processReplicationQueue() {
    // Si les instances partagent la même base de données, la réplication est inutile.
    if (process.env.CLUSTER_SHARED_DATABASE === 'true') {
        if (replicationQueue.length > 0) replicationQueue.length = 0;
        return;
    }

    // D'abord, on essaie de vider les anciennes tâches en échec
    await retryFailedBatches();

    if (replicationQueue.length === 0) {
        return;
    }

    const itemsToProcess = replicationQueue.splice(0, replicationQueue.length);
    logger.debug(`[ReplicationQueue] Processing ${itemsToProcess.length} items.`);

    // Regrouper les opérations par ID de nœud de réplique
    const batchesByReplica = new Map();

    for (const item of itemsToProcess) {
        // Pour chaque opération, on trouve les nœuds de réplique responsables
        const replicaNodes = getReplicaNodesForUser(item.user.username);

        for (const replica of replicaNodes) {
            if (!batchesByReplica.has(replica.id)) {
                batchesByReplica.set(replica.id, []);
            }
            batchesByReplica.get(replica.id).push(item);
        }
    }

    // Envoyer les lots à chaque réplique concernée
    for (const [peerId, operations] of batchesByReplica.entries()) {
        for (let i = 0; i < operations.length; i += BATCH_SIZE_LIMIT) {
            const chunk = operations.slice(i, i + BATCH_SIZE_LIMIT);

            logger.info(`[ReplicationBatch] Sending batch of ${chunk.length} operations to replica peer ${peerId}`);

            try {
                await engineInstance.sendToPeer(peerId, '/api/internal/replicate', { operations: chunk });
            } catch (error) {
                logger.error(`[ReplicationBatch] Failed to send batch to replica peer ${peerId}: ${error.message}. Queueing for retry.`);
                // En cas d'échec, on ajoute le lot à la file d'attente des échecs pour cette réplique
                if (!failedBatchesByReplica.has(peerId)) failedBatchesByReplica.set(peerId, []);
                failedBatchesByReplica.get(peerId).push(chunk);
            }
        }
    }
}

/**
 * Démarre le processeur de la file d'attente de réplication.
 * @param {object} engine - L'instance du moteur.
 */
export function onInit(engine) {
    engineInstance = engine; // Stocker l'instance du moteur
    if (engineInstance.peers.length > 1) {
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