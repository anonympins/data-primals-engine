import { createHash } from 'node:crypto';
import { clusterPeers, getHost, port } from '../../constants.js';
import { Logger } from '../../gameObject.js';

const logger = new Logger('DataCluster');

// La liste de tous les nœuds inclut le nœud actuel.
// On la trie pour s'assurer que l'ordre est le même sur toutes les instances.
const selfUrl = `http://${getHost()}:${process.env.PORT || port}`;
const allNodes = [selfUrl, ...clusterPeers].sort();


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
 * Détermine l'URL du nœud "maître" pour un utilisateur donné en utilisant un hashage cohérent.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {string} L'URL du nœud maître.
 */
export function getMasterNodeForUser(username) {
    if (allNodes.length <= 1) {
        return selfUrl;
    }
    // Utilise un hash SHA256 pour une distribution uniforme
    const hash = createHash('sha256').update(username).digest('hex');
    // Prend une partie du hash et utilise le modulo pour choisir un index de nœud
    const index = parseInt(hash.substring(0, 8), 16) % allNodes.length;
    return allNodes[index];
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
    const masterNodeUrl = getMasterNodeForUser(username);

    if (masterNodeUrl === selfUrl) {
        // Ce nœud est le maître, on ne relaie pas.
        return false;
    }

    logger.info(`[Cluster] Proxying (stream) ${req.method} ${req.originalUrl} for user ${username} to master node ${masterNodeUrl}`);

    const targetUrl = new URL(req.originalUrl, masterNodeUrl);

    try {
        // On propage la plupart des en-têtes, en ajoutant ceux nécessaires pour le proxying.
        const headers = { ...req.headers };
        delete headers['host']; // Le 'host' sera celui du nœud cible.
        headers['X-Federation-Proxy'] = 'true'; // Marqueur anti-boucle.
        // S'il n'y a pas de Content-Type, on en met un par défaut pour `fetch`.
        if (!headers['content-type']) {
            headers['content-type'] = 'application/json';
        }

        const proxyResponse = await fetch(targetUrl.toString(), {
            method: req.method,
            headers: headers,
            body: JSON.stringify(req.fields)
        });

        // --- AMÉLIORATION MAJEURE : STREAMING ---
        // On propage le statut et les en-têtes de la réponse du pair vers le client.
        // C'est crucial pour les téléchargements de fichiers (Content-Disposition), etc.
        res.status(proxyResponse.status);
        proxyResponse.headers.forEach((value, name) => {
            // On évite de propager des en-têtes liés à la connexion interne du cluster.
            if (name.toLowerCase() !== 'transfer-encoding' && name.toLowerCase() !== 'connection') {
                res.setHeader(name, value);
            }
        });

        // On pipe le corps de la réponse du pair directement vers la réponse du client.
        // `Readable.fromWeb` est nécessaire pour convertir le stream de `fetch` en stream Node.js.
        const { Readable } = await import('node:stream');
        Readable.fromWeb(proxyResponse.body).pipe(res);

    } catch (error) {
        logger.error(`[Cluster] Proxy request to ${masterNodeUrl} failed: ${error.message}`);
        res.status(502).json({ success: false, error: `Failed to proxy request to master node: ${error.message}` });
    }

    return true; // La requête a été traitée (relayée).
}

/**
 * Vérifie si une requête a déjà été relayée pour éviter les boucles.
 * @param {object} req - L'objet requête Express.
 * @returns {boolean}
 */
export function isProxiedRequest(req) {
    return req.headers['x-federation-proxy'] === 'true';
}