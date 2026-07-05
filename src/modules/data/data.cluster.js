import { createHash } from 'node:crypto';
import { Config } from '../../config.js';
import { Logger } from '../../gameObject.js';
import { onInit as replicationInit, queueReplication } from './data.replication.js';

const logger = new Logger('DataCluster');

let engine; // L'instance du moteur sera injectée via onInit

/**
 * Diffuse un événement d'invalidation de cache à tous les nœuds du cluster.
 * @param {string} cacheType - Le type de cache à invalider (ex: 'model').
 * @param {string} key - La clé spécifique à invalider dans le cache.
 */
export async function broadcastCacheInvalidation(cacheType, key) {
    if (!engine || engine.peers.length <= 1) {
        return; // Pas de cluster, rien à faire.
    }

    logger.info(`[Cluster] Broadcasting direct cache invalidation for '${cacheType}' with key '${key}' to peers.`);

    // On envoie une requête à chaque autre nœud du cluster.
    const broadcastPromises = engine.peers.filter(p => p.url !== engine.selfUrl).map(peer => {
        const peerUrl = peer.url;
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
    const REPLICATION_FACTOR = Config.Get('replicationFactor', 2);

    if (!engine || engine.peers.length <= 1) {
        return [engine.selfUrl];
    }

    // 1. Filtrer les nœuds éligibles pour le sharding
    const shardingNodes = engine.peers.filter(p => p.sharding === true).sort((a, b) => a.url.localeCompare(b.url));
    if (shardingNodes.length === 0) {
        logger.warn('[Cluster] No nodes available for sharding (sharding:true). Using all nodes as fallback.');
        shardingNodes.push(...engine.peers.sort((a, b) => a.url.localeCompare(b.url)));
    }

    // 2. Déterminer le nœud maître basé sur le hachage de l'utilisateur
    const hash = createHash('sha256').update(username).digest('hex');
    const masterIndex = parseInt(hash.substring(0, 8), 16) % shardingNodes.length;
    const masterNode = shardingNodes[masterIndex];

    const responsibleNodes = [masterNode];

    // 3. Sélectionner les nœuds de réplication
    const replicaPool = engine.peers.filter(p => p.replica === true && p.id !== masterNode.id);
    const numReplicasToFind = Math.min(REPLICATION_FACTOR - 1, replicaPool.length);

    if (numReplicasToFind > 0) {
        // On utilise le même hash pour choisir les répliques de manière déterministe
        const replicaStartIndex = parseInt(hash.substring(8, 16), 16) % replicaPool.length;
        for (let i = 0; i < numReplicasToFind; i++) {
            responsibleNodes.push(replicaPool[(replicaStartIndex + i) % replicaPool.length]);
        }
    }

    return responsibleNodes;
}

export function getReplicaNodesForUser(username) {
    return getResponsibleNodesForUser(username).slice(1);
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
    return getMasterNodeForUser(username)?.url === engine.selfUrl;
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

    if (masterNodeUrl.url === engine.selfUrl) {
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
            if (nodeUrl.url === engine.selfUrl) {
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
    const targetUrl = new URL(req.originalUrl, nodeUrl.url);
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

export function onInit(defaultEngine) {
    engine = defaultEngine;
    // Tri des pairs pour garantir un ordre déterministe sur tous les nœuds. C'est crucial pour la cohérence du hachage.
    engine.peers.sort((a, b) => a.url.localeCompare(b.url));
    logger.info(`[Cluster] Initialized. Self: ${engine.selfUrl}. All peers (sorted): ${engine.peers.map(p => p.url).join(', ')}`);

    // Démarrer le processeur de la file d'attente de réplication
    replicationInit(engine);
}