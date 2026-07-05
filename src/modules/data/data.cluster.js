import { createHash } from 'node:crypto';
import { getHost, port } from '../../constants.js';
import { Config } from '../../config.js';
import { Logger } from '../../gameObject.js';
import { onInit as replicationInit, queueReplication } from './data.replication.js';

const logger = new Logger('DataCluster');

/**
 * Cluster configuration for data federation, read from environment variables.
 * @type {string[]}
 */
export const clusterPeers = (process.env.CLUSTER_PEERS || '').split(',').filter(Boolean);

// La liste de tous les nœuds inclut le nœud actuel.
// On la trie pour s'assurer que l'ordre est le même sur toutes les instances.
const selfUrl = `http://${getHost()}:${process.env.PORT || port}`;
const allNodes = clusterPeers.length > 0 ? Array.from(new Set([selfUrl, ...clusterPeers])).sort() : [selfUrl];
const REPLICATION_FACTOR = Config.Get('replicationFactor', 2); // Maître + 1 réplique par défaut


logger.info(`[Cluster] Initialized. Self: ${selfUrl}. All nodes: ${allNodes.join(', ')}`);

/**
 * Diffuse un événement d'invalidation de cache à tous les nœuds du cluster.
 * @param {string} cacheType - Le type de cache à invalider (ex: 'model').
 * @param {string} key - La clé spécifique à invalider dans le cache.
 */
export async function broadcastCacheInvalidation(cacheType, key) {
    if (clusterPeers.length === 0) {
        return; // Pas de cluster, rien à faire.
    }

    logger.info(`[Cluster] Broadcasting direct cache invalidation for '${cacheType}' with key '${key}' to peers.`);

    // On envoie une requête à chaque autre nœud du cluster.
    const broadcastPromises = clusterPeers.map(peerUrl => {
        const targetUrl = `${peerUrl}/api/internal/cache-invalidate`;
        // On suppose que les nœuds partagent un token/secret pour s'authentifier.
        // Le token de l'utilisateur actuel est une bonne option s'il est admin ou a des droits étendus.
        const authToken = (process.env.INTERNAL_CLUSTER_TOKEN) ? `Bearer ${process.env.INTERNAL_CLUSTER_TOKEN}` : null;
        if (!authToken) {
            logger.warn(`[Cluster] INTERNAL_CLUSTER_TOKEN is not set. Cannot broadcast cache invalidation securely.`);
            return Promise.resolve(); // Ne rien faire si pas de token
        }

        return fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            },
            body: JSON.stringify({ cacheType, key })
        }).catch(error => {
            logger.error(`[Cluster] Failed to send cache invalidation to peer ${peerUrl}: ${error.message}`);
        });
    });

    await Promise.allSettled(broadcastPromises);
}

/**
 * Ajoute une opération à la file d'attente de réplication.
 * @param {string} operation - 'insert', 'update', 'delete'.
 * @param {string} modelName - Le nom du modèle.
 * @param {object} user - L'objet utilisateur.
 * @param {object} payload - Les données de l'opération.
 */
export function replicateOperation(operation, modelName, user, payload) {
    queueReplication(operation, modelName, user, payload);
}

/**
 * Détermine la liste ordonnée des nœuds responsables pour un utilisateur.
 * Le premier est le maître, les suivants sont les répliques.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {string[]} Une liste d'URLs de nœuds.
 */
export function getResponsibleNodesForUser(username) {
    if (allNodes.length <= 1) {
        return [selfUrl];
    }

    const numNodes = allNodes.length;
    const numReplicas = Math.min(REPLICATION_FACTOR, numNodes);
    const responsibleNodes = [];

    const hash = createHash('sha256').update(username).digest('hex');
    const startIndex = parseInt(hash.substring(0, 8), 16) % numNodes;

    for (let i = 0; i < numReplicas; i++) {
        responsibleNodes.push(allNodes[(startIndex + i) % numNodes]);
    }

    return responsibleNodes;
}

/**
 * Détermine l'URL du nœud "maître" pour un utilisateur donné.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {string} L'URL du nœud maître.
 */
export function getMasterNodeForUser(username) {
    return getResponsibleNodesForUser(username)[0];
}

/**
 * Vérifie si le nœud actuel est le maître pour cet utilisateur.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {boolean}
 */
export function isSelfMasterForUser(username) {
    return getMasterNodeForUser(username) === selfUrl;
}

/**
 * Relaye une requête (lecture ou écriture) vers le nœud maître approprié de manière performante (streaming).
 * @param {object} req - L'objet requête Express.
 * @param {object} res - L'objet réponse Express.
 * @param {string} username - Le nom de l'utilisateur concerné.
 * @returns {Promise<boolean>} - Retourne `true` si la requête a été relayée, `false` sinon.
 */
export async function proxyRequest(req, res, username) {
    const responsibleNodes = getResponsibleNodesForUser(username);
    const masterNodeUrl = responsibleNodes[0];

    if (masterNodeUrl === selfUrl) {
        // Ce nœud est le maître, on ne relaie pas.
        return false;
    }

    // Pour les écritures (POST, PUT, PATCH, DELETE), on cible toujours le maître.
    if (req.method !== 'GET') {
        logger.info(`[Cluster] Proxying WRITE ${req.method} for user ${username} to master node ${masterNodeUrl}`);
        await attemptProxy(req, res, masterNodeUrl);
        return true; // La requête a été traitée (relayée ou a échoué).
    }

    // Pour les lectures (GET), on tente le maître, puis les répliques en cas d'échec.
    logger.info(`[Cluster] Proxying READ for user ${username}. Node preference: ${responsibleNodes.join(' -> ')}`);
    for (const nodeUrl of responsibleNodes) {
        try {
            // Si le nœud est nous-mêmes, on arrête le proxying et on laisse le handler local prendre le relais.
            if (nodeUrl === selfUrl) {
                logger.info(`[Cluster] Failover to self. Handling request locally.`);
                return false;
            }
            await attemptProxy(req, res, nodeUrl);
            return true; // Succès, on arrête la boucle de failover.
        } catch (error) {
            logger.warn(`[Cluster] Proxy attempt to ${nodeUrl} failed: ${error.message}. Trying next node...`);
        }
    }

    // Si tous les nœuds ont échoué
    logger.error(`[Cluster] All responsible nodes for user ${username} are down. Cannot serve request.`);
    res.status(503).json({ success: false, error: `Service Unavailable: All responsible nodes for user ${username} are currently down.` });
    return true; // La requête a été traitée (a échoué).
}

async function attemptProxy(req, res, nodeUrl) {
    const targetUrl = new URL(req.originalUrl, nodeUrl);
    const headers = { ...req.headers };
    delete headers['host'];
    headers['X-Federation-Proxy'] = 'true';
    if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
    }

    // Utilisation d'un AbortController pour gérer les timeouts de connexion
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout de 5 secondes
    
    try {
        const proxyResponse = await fetch(targetUrl.toString(), {
            method: req.method,
            headers: headers,
            body: (req.method !== 'GET' && req.method !== 'HEAD') ? JSON.stringify(req.fields) : undefined,
            signal: controller.signal
        });

        if (!proxyResponse.ok) {
            throw new Error(`Node responded with status ${proxyResponse.status}`);
        }

        res.status(proxyResponse.status);
        proxyResponse.headers.forEach((value, name) => {
            // On évite de propager des en-têtes liés à la connexion interne du cluster.
            if (name.toLowerCase() !== 'transfer-encoding' && name.toLowerCase() !== 'connection') {
                res.setHeader(name, value);
            }
        });
        const { Readable } = await import('node:stream');
        Readable.fromWeb(proxyResponse.body).pipe(res);
    } catch (error) {
        throw error; // Relancer l'erreur pour que la boucle de failover puisse l'attraper.
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Vérifie si une requête a déjà été relayée pour éviter les boucles.
 * @param {object} req - L'objet requête Express.
 * @returns {boolean}
 */
export function isProxiedRequest(req) {
    return req.headers['x-federation-proxy'] === 'true';
}

export function onInit(engine) {
    // Démarrer le processeur de la file d'attente de réplication
    replicationInit(engine);
}