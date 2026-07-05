import { Logger } from '../../gameObject.js';
import { getResponsibleNodesForUser, clusterPeers } from './data.cluster.js';

const logger = new Logger('DataReplication');
const replicationQueue = [];
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

    // --- NOUVELLE LOGIQUE ---
    // On utilise la liste des pairs directement depuis l'engine
    const selfPrivateAddress = `http://127.0.0.1:${process.env.PORT || 7633}`; // Adaptez si nécessaire
    const selfPeer = engineInstance.peers.find(p => p.private_address === selfPrivateAddress);
    const selfId = selfPeer?.id;
    const otherPeers = engineInstance.peers.filter(p => p.id !== selfId);

    if (otherPeers.length === 0) {
        logger.debug("[ReplicationQueue] No other online peers to replicate to.");
        return;
    }

    // Étape 2: Envoyer le lot complet à chaque autre pair
    for (const peer of otherPeers) {
        // Découper les gros lots en plus petits morceaux (chunks)
        for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE_LIMIT) {
            const chunk = itemsToProcess.slice(i, i + BATCH_SIZE_LIMIT);

            logger.info(`[ReplicationBatch] Sending batch of ${chunk.length} operations to peer ${peer.id}`);

            // Utiliser la nouvelle fonction centralisée !
            engineInstance.sendToPeer(
                peer.id,
                '/api/internal/replicate',
                { operations: chunk } // Le corps de la requête contient le lot d'opérations
            ).catch(error => {
                logger.error(`[ReplicationBatch] Failed to send batch to peer ${peer.id}: ${error.message}`);
            });
        }
    }
}

/**
 * Démarre le processeur de la file d'attente de réplication.
 * @param {object} engine - L'instance du moteur.
 */
export function onInit(engine) {
    engineInstance = engine; // Stocker l'instance du moteur
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