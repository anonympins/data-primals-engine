import { createHash } from 'node:crypto';
import { Config } from '../../config.js';
import { Logger } from '../../gameObject.js';
import { onInit as replicationInit, queueReplication, stopReplicationQueue } from './data.replication.js';

let logger;

let engine; // L'instance du moteur sera injectée via onInit
let gossipInterval;

// La source de vérité sur l'état du cluster, gérée par le gossip.
// La clé est l'ID du noeud (ex: 'node-1'), la valeur contient les métadonnées.
const memberList = new Map();

/**
 * Structure d'un membre:
 * { id: 'node-1', url: 'http://node-1:3000', sharding: true, replica: true, status: 'UP' | 'SUSPECT', version: 1 }
 */

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

    const activePeers = getMemberList().filter(p => p.id !== engine.selfId && p.status === 'UP');

    // On envoie une requête à chaque autre nœud du cluster.
    const broadcastPromises = activePeers.map(peer => {
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
    const allNodes = getMemberList().filter(m => m.status === 'UP');

    if (!engine || allNodes.length <= 1) {
        return allNodes.length > 0 ? [allNodes[0]] : [];
    }

    // 1. Filtrer les nœuds éligibles pour le sharding
    const shardingNodes = allNodes.filter(p => p.sharding === true);
    if (shardingNodes.length === 0) {
        logger.warn('[Cluster] No nodes available for sharding (sharding:true). Using all nodes as fallback.');
        shardingNodes.push(...allNodes);
    }

    // 2. Déterminer le nœud maître basé sur le hachage de l'utilisateur
    const hash = createHash('sha256').update(username).digest('hex');
    const masterIndex = parseInt(hash.substring(0, 8), 16) % shardingNodes.length;
    const masterNode = shardingNodes[masterIndex];

    const responsibleNodes = [masterNode];

    // 3. Sélectionner les nœuds de réplication
    const replicaPool = allNodes.filter(p => p.replica === true && p.id !== masterNode.id);
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
    const nodes = getResponsibleNodesForUser(username);
    if (nodes && nodes.length > 0) {
        return nodes[0];
    }
    // Fallback to self if no nodes are found (e.g., single node cluster)
    return memberList.get(engine.selfId);
}

/**
 * Vérifie si le nœud actuel est le maître pour cet utilisateur.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {boolean}
 */
export function isSelfMasterForUser(username) {
    const master = getMasterNodeForUser(username);
    return master?.id === engine.selfId;
}

/**
 * Relaye une requête (lecture ou écriture) vers le nœud maître approprié de manière performante (streaming).
 * @param {object} req - L'objet requête Express.
 * @param {object} res - L'objet réponse Express.
 * @param {string} username - Le nom de l'utilisateur concerné.
 * @returns {Promise<boolean>} - Retourne `true` si la requête a été relayée, `false` sinon.
 */
export async function proxyRequest(req, res, username) {
    const masterNode = getMasterNodeForUser(username);
    const responsibleNodes = getResponsibleNodesForUser(username); // Recalculate to get the full list

    if (masterNode.id === engine.selfId) {
        // Ce nœud est le maître, on ne relaie pas.
        return false;
    }

    // Pour les écritures (POST, PUT, PATCH, DELETE), on cible toujours le maître.
    if (req.method !== 'GET') {
        logger.info(`[Cluster] Proxying WRITE ${req.method} for user ${username} to master node ${masterNode.url}`);
        await attemptProxy(req, res, masterNode);
        return true; // La requête a été traitée (relayée ou a échoué).
    }

    // Pour les lectures (GET), on tente le maître, puis les répliques en cas d'échec.
    logger.info(`[Cluster] Proxying READ for user ${username}. Node preference: ${responsibleNodes.map(n => n.id).join(' -> ')}`);
    for (const node of responsibleNodes) {
        try {
            if (node.id === engine.selfId) {
                logger.info(`[Cluster] Failover to self. Handling request locally.`);
                return false;
            }
            await attemptProxy(req, res, node);
            return true; // Succès, on arrête la boucle de failover.
        } catch (error) {
            logger.warn(`[Cluster] Proxy attempt to ${node.url} failed: ${error.message}. Trying next node...`);
        }
    }

    // Si tous les nœuds ont échoué
    logger.error(`[Cluster] All responsible nodes for user ${username} are down. Cannot serve request.`);
    res.status(503).json({ success: false, error: `Service Unavailable: All responsible nodes for user ${username} are currently down.` });
    return true; // La requête a été traitée (a échoué).
}

async function attemptProxy(req, res, node) {
    const targetUrl = new URL(req.originalUrl, node.url);
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


// --- GOSSIP PROTOCOL LOGIC ---

function logMemberList() {
    const simplifiedList = getMemberList().map(m => `${m.id}(${m.status}, v${m.version})`);
    logger.debug(`[Gossip] Member list: [${simplifiedList.join(', ')}]`);
}

function mergeLists(remoteList) {
    let updated = false;
    for (const remoteMember of remoteList) {
        const localMember = memberList.get(remoteMember.id);

        if (!localMember) {
            memberList.set(remoteMember.id, remoteMember);
            logger.info(`[Gossip] Discovered new member: ${remoteMember.id} at ${remoteMember.url}`);
            updated = true;
            continue;
        }

        if (remoteMember.id !== engine.selfId && remoteMember.version > localMember.version) {
            logger.debug(`[Gossip] Updating member ${remoteMember.id} from v${localMember.version} to v${remoteMember.version}`);
            memberList.set(remoteMember.id, remoteMember);
            updated = true;
        }
    }
    if (updated) {
        logMemberList();
    }
}

function updateMemberStatus(memberId, newStatus) {
    const member = memberList.get(memberId);
    if (!member) return;

    const statusChanged = member.status !== newStatus;

    // Si le statut change, ou si on reconfirme qu'un noeud est SUSPECT, on met à jour.
    if (statusChanged || newStatus === 'SUSPECT') {
        if (statusChanged) {
            logger.info(`[Gossip] Updating status for ${memberId} from ${member.status} to ${newStatus}`);
            member.status = newStatus;
            member.version++; // On propage le changement uniquement si le statut change.
        }
        member.lastUpdate = Date.now();
        logMemberList();
    }
}

/**
 * Vérifie périodiquement les nœuds suspects pour les réactiver ou les marquer comme DOWN.
 */
export function checkSuspectNodes() {
    const now = Date.now();
    const SUSPECT_TIMEOUT = Config.Get('gossipSuspectTimeout', 10000); // 10 secondes

    const suspectNodes = getMemberList().filter(m => m.status === 'SUSPECT');

    for (const member of suspectNodes) {
        // Si un nœud est suspect depuis trop longtemps, on le considère comme DOWN.
        // La logique de suppression effective des nœuds DOWN peut être ajoutée ici si nécessaire.
        if (now - (member.lastUpdate || 0) > SUSPECT_TIMEOUT) {
            if (member.status !== 'DOWN') {
                logger.warn(`[Gossip] Member ${member.id} is now considered DOWN (was SUSPECT for too long).`);
                updateMemberStatus(member.id, 'DOWN');
            }
        }
    }
}

async function executeGossip() {
    const peersToGossip = getMemberList().filter(m => m.id !== engine.selfId && m.status === 'UP');
    if (peersToGossip.length === 0) {
        return;
    }

    const targetPeer = peersToGossip[Math.floor(Math.random() * peersToGossip.length)];

    try {
        const payload = getMemberList();
        const response = await engine.sendToPeer(targetPeer.id, '/api/internal/gossip', payload);

        if (response.ok) {
            const remoteList = await response.json();
            mergeLists(remoteList);
            // Si la communication a réussi, on s'assure que le pair est bien 'UP'
            // Utile si le pair était 'SUSPECT' et est revenu en ligne.
            if (memberList.get(targetPeer.id)?.status !== 'UP') {
                updateMemberStatus(targetPeer.id, 'UP');
            }
        } else {
            logger.warn(`[Gossip] Failed to gossip with ${targetPeer.id}. Status: ${response.status}`);
            updateMemberStatus(targetPeer.id, 'SUSPECT');
        }
    } catch (error) {
        logger.error(`[Gossip] Error while gossiping with ${targetPeer.id}: ${error.message}`);
        updateMemberStatus(targetPeer.id, 'SUSPECT');
    }

    // Exécuter la vérification des nœuds suspects à chaque cycle
    checkSuspectNodes();
}

export function getMemberList() {
    return Array.from(memberList.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function stopClusterServices() {
    clearInterval(gossipInterval);
    stopReplicationQueue();
    logger.info('[Cluster] Gossip and replication services stopped.');
}

export function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger) || new Logger('DataCluster');
    engine.selfId = engine.peers.find(p => p.url === engine.selfUrl)?.id;

    // 1. Initialiser la liste des membres à partir de la configuration statique
    memberList.clear();
    for (const peer of engine.peers) {
        memberList.set(peer.id, { ...peer, status: 'UP', version: 1, lastUpdate: Date.now() });
    }
    logger.info(`[Cluster] Initialized. Self: ${engine.selfId} @ ${engine.selfUrl}.`);
    logMemberList();

    // 2. Enregistrer l'endpoint pour recevoir les "gossips"
    engine.post('/api/internal/gossip', (req, res) => {
        const remoteList = req.fields;
        if (Array.isArray(remoteList)) {
            mergeLists(remoteList);
        }
        // En réponse, on renvoie notre propre liste mise à jour
        res.json(getMemberList());
    });

    // 3. Démarrer la boucle de gossip
    const interval = Config.Get('gossipInterval', 2000);
    if (gossipInterval) clearInterval(gossipInterval); // Clear previous interval if re-initializing
    gossipInterval = setInterval(executeGossip, interval);

    // Démarrer le processeur de la file d'attente de réplication
    replicationInit(engine);
}