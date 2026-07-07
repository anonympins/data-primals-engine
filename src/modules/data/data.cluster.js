import { createHash } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { Config } from '../../config.js';
import { Event } from '../../events.js';
import { Logger } from '../../gameObject.js';
import { onInit as replicationInit, queueReplication, stopReplicationQueue } from './data.replication.js';

// Importer le module dans lui-même pour accéder aux exports (et donc aux mocks dans les tests)
import * as self from './data.cluster.js';

let logger;

let engine; // L'instance du moteur sera injectée via onInit
let dataHandler; // Pour l'accès à MongoDB
let ClusterLease; // Modèle Mongoose pour les baux

const LEASE_DURATION_MS = 10000; // Durée du bail en ms (10s)

let gossipInterval;

// La source de vérité sur l'état du cluster, gérée par le gossip.
// La clé est l'ID du noeud (ex: 'node-1'), la valeur contient les métadonnées.
const memberList = new Map();

/**
 * Structure d'un membre:
 * { id: 'node-1', url: 'http://node-1:3000', sharding: true, replica: true, status: 'UP' | 'SUSPECT' | 'FULL', version: 1, disk: { free: 123, total: 456 } }
 */

/**
 * Diffuse un événement d'invalidation de cache à tous les nœuds du cluster.
 * @param {string} cacheType - Le type de cache à invalider (ex: 'model').
 * @param {string} key - La clé spécifique à invalider dans le cache.
 */
async function broadcastCacheInvalidation(cacheType, key) {
    if (!engine || engine.peers.length <= 1) {
        return; // Pas de cluster, rien à faire.
    }

    logger.info(`[Cluster] Broadcasting direct cache invalidation for '${cacheType}' with key '${key}' to peers.`);

    const activePeers = getMemberList().filter(p => p.id !== engine.selfId && p.status === 'UP');

    // On envoie une requête à chaque autre nœud du cluster.
    const broadcastPromises = activePeers.map(peer => {
        const peerUrl = peer.public_domain;
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
function replicateOperation(operation, modelName, user, payload) {
    queueReplication(operation, modelName, user, payload);
}

/**
 * Détermine la liste ordonnée des nœuds responsables pour un utilisateur.
 * Le premier est le maître, les suivants sont les répliques.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {string[]} Une liste d'URLs de nœuds.
 */
function getResponsibleNodesForUser(username, vnodesPerNode = 100) {
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
    
    // 2. Amélioration avec des "nœuds virtuels" pour une meilleure distribution.
    // Au lieu de `hash % N`, on divise l'espace de hachage en `N * vnodesPerNode` partitions.
    // Cela lisse la distribution et réduit les "hot spots".
    const totalVNodes = shardingNodes.length * vnodesPerNode;
    const userHash = createHash('sha256').update(username).digest();
    // On prend les 4 premiers octets du hash pour avoir un grand nombre entier.
    const userHashInt = userHash.readUInt32BE(0);
    
    const partitionIndex = userHashInt % totalVNodes;
    const masterNodeIndex = Math.floor(partitionIndex / vnodesPerNode);
    const masterNode = shardingNodes[masterNodeIndex];

    const responsibleNodes = [masterNode];

    // 3. Sélectionner les nœuds de réplication
    // On filtre les noeuds éligibles et on les trie par espace disque libre (du plus grand au plus petit).
    // Cela garantit que nous choisissons toujours les nœuds les plus sains en premier.
    const replicaPool = allNodes.filter(p =>
        p.replica === true && 
        p.id !== masterNode.id &&
        p.status !== 'DOWN' && p.status !== 'SUSPECT' && // On exclut les nœuds en panne
        p.disk && p.disk.free > 0 // On s'assure d'avoir les infos disque et qu'il reste de la place
    ).sort((a, b) => b.disk.free - a.disk.free); // Tri descendant par espace libre

    const numReplicasToFind = Math.min(REPLICATION_FACTOR - 1, replicaPool.length);

    if (numReplicasToFind > 0) {
        // Au lieu d'une sélection par hash (qui peut assigner un user à un nœud presque plein),
        // on prend simplement les N premiers nœuds de la liste triée.
        // Ce sont les nœuds avec le plus d'espace libre.
        // Cette approche est "goulue" (greedy) mais très efficace pour l'équilibrage.
        const bestReplicas = replicaPool.slice(0, numReplicasToFind);
        responsibleNodes.push(...bestReplicas);
    }

    // La condition de log est mise à jour pour refléter la nouvelle logique.
    if (responsibleNodes.length < REPLICATION_FACTOR) {
        // Pas assez de répliques saines disponibles. C'est un problème.
        logger.warn(`[Cluster] Could not find enough healthy replicas for user '${username}'. Wanted ${REPLICATION_FACTOR}, found ${responsibleNodes.length}. Some data may be under-replicated.`);
    }

    return responsibleNodes;
}

function getReplicaNodesForUser(username) {
    return getResponsibleNodesForUser(username).slice(1);
}
/**
 * Détermine l'URL du nœud "maître" pour un utilisateur donné.
 * @param {string} username - Le nom de l'utilisateur.
 * @returns {string} L'URL du nœud maître.
 */
export function getMasterNodeForUser(username) {
    const nodes = getResponsibleNodesForUser(username);
    // --- FIX: Handle empty node list ---
    // If no responsible nodes are found (e.g., empty peer list in a single-node setup),
    // gracefully fall back to the current node itself.
    if (!nodes || nodes.length === 0) {
        return memberList.get(engine.selfId);
    }
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
 * @returns {Promise<boolean>}
 */
async function isSelfMasterForUser(username) {
    // 1. Détermination du maître potentiel par hash (logique inchangée)
    const potentialMaster = self.getMasterNodeForUser(username);
    if (potentialMaster?.id !== engine.selfId) {
        // Si le hash ne nous désigne pas, nous ne sommes pas le maître.
        return false;
    }

    // 2. Nous sommes le candidat. Tentons d'acquérir/renouveler le bail.
    // C'est l'étape de "fencing" qui prévient le split-brain.
    const resourceId = `mastership-${username}`;
    const hasLease = await acquireOrRenewLease(resourceId, engine.selfId);

    if (!hasLease) {
        logger.warn(`[Cluster] Failed to acquire/renew mastership lease for user '${username}'. Another node may be master despite hash assignment. Stepping down.`);
        return false;
    }

    // 3. Nous sommes le candidat désigné ET nous détenons le bail. Nous sommes le maître.
    return true;
}

/**
 * Tente d'acquérir ou de renouveler un bail pour une ressource donnée.
 * Cette opération est atomique.
 * @param {string} resourceId - L'identifiant unique de la ressource à verrouiller.
 * @param {string} nodeId - L'ID du nœud qui tente d'acquérir le bail.
 * @returns {Promise<boolean>} - `true` si le bail est acquis/renouvelé avec succès, `false` sinon.
 */
async function acquireOrRenewLease(resourceId, nodeId) {
    if (!ClusterLease) {
        logger.warn('[Lease] Lease model not initialized, cannot acquire lease. Assuming not master.');
        return false;
    }

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

    try {
        const result = await ClusterLease.findOneAndUpdate(
            { resourceId, $or: [{ ownerId: nodeId }, { expiresAt: { $lt: now } }] },
            { $set: { ownerId: nodeId, expiresAt: newExpiresAt } },
            { new: true, upsert: true }
        );
        return result && result.ownerId === nodeId;
    } catch (error) {
        logger.error(`[Lease] Error during lease acquisition for '${resourceId}': ${error.message}`);
        return false;
    }
}
/**
 * Relaye une requête (lecture ou écriture) vers le nœud maître approprié de manière performante (streaming).
 * @param {object} req - L'objet requête Express.
 * @param {object} res - L'objet réponse Express.
 * @param {string} username - Le nom de l'utilisateur concerné.
 * @returns {Promise<boolean>} - Retourne `true` si la requête a été relayée, `false` sinon.
 */
async function proxyRequest(req, res, username) {
    // La vérification de maîtrise est maintenant asynchrone et basée sur le bail.
    const isMaster = await isSelfMasterForUser(username);

    if (isMaster) {
        // Ce nœud est le maître, on ne relaie pas.
        return false;
    }

    // Pour les écritures (POST, PUT, PATCH, DELETE), on cible toujours le maître.
    if (req.method !== 'GET') {
        const masterNode = getMasterNodeForUser(username); // Le maître désigné par le hash
        // SÉCURITÉ : Vérifier que le nœud maître a bien été trouvé avant de l'utiliser.
        if (!masterNode) {
            logger.error(`[Cluster] Cannot proxy WRITE for user ${username}: No master node found.`);
            res.status(503).json({ success: false, error: "Service Unavailable: No master node available to handle the request." });
            return true; // La requête est gérée (avec une erreur), on arrête le traitement.
        }

        logger.info(`[Cluster] Proxying WRITE ${req.method} for user ${username} to master node ${masterNode.public_domain}`);
        await attemptProxy(req, res, masterNode);
        return true; // La requête a été traitée (relayée ou a échoué).
    }

    // Pour les lectures (GET), on tente le maître, puis les répliques en cas d'échec.
    const responsibleNodes = getResponsibleNodesForUser(username);
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
            logger.warn(`[Cluster] Proxy attempt to ${node.public_domain} failed: ${error.message}. Trying next node...`);
        }
    }

    // Si tous les nœuds ont échoué
    logger.error(`[Cluster] All responsible nodes for user ${username} are down. Cannot serve request.`);
    res.status(503).json({ success: false, error: `Service Unavailable: All responsible nodes for user ${username} are currently down.` });
    return true; // La requête a été traitée (a échoué).
}

async function attemptProxy(req, res, node) {
    const targetUrl = new URL(req.originalUrl, `https://${node.public_domain}`);
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
            "Accept": "application/json", // Indiquer explicitement que nous attendons du JSON
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
function isProxiedRequest(req) {
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

        if (remoteMember.id !== engine.selfId && remoteMember.version > (localMember.version || 0)) {
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

    // Si un noeud redevient 'UP', on réinitialise son état disque en attendant la prochaine mise à jour de sa part.
    if (newStatus === 'UP' && member.status !== 'UP') {
        member.disk = null; 
    }
}

/**
 * Vérifie périodiquement les nœuds suspects pour les réactiver ou les marquer comme DOWN.
 */
function checkSuspectNodes() {
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

/**
 * Met à jour les informations de disque pour le noeud local.
 * Cette fonction sera appelée périodiquement.
 */
async function updateSelfDiskUsage() {
    const self = memberList.get(engine.selfId);
    if (!self) return;

    try {
        // Utilisation de la fonction native de Node.js pour obtenir l'espace disque
        const stats = await statfs(process.cwd()); // Vérifie le disque de l'application
        const free = stats.bavail * stats.bsize; // Espace libre disponible pour l'utilisateur
        const total = stats.blocks * stats.bsize; // Espace total
        self.disk = { free, total };
        
        // Si l'espace libre est < 10%, on se marque comme 'FULL' pour ne plus accepter de répliques.
        const usagePercentage = 1 - (free / total);
        updateMemberStatus(self.id, usagePercentage > 0.9 ? 'FULL' : 'UP');
    } catch (err) {
        logger.error(`[Gossip] Could not read disk usage: ${err.message}`);
    }
}
async function executeGossip() {
    const peersToGossip = getMemberList().filter(m => m.id !== engine.selfId && m.status === 'UP');
    
    // On exécute la vérification des nœuds suspects à chaque cycle, même si aucun pair n'est UP.
    checkSuspectNodes();
    if (peersToGossip.length === 0) {
        return;
    }

    const targetPeer = peersToGossip[Math.floor(Math.random() * peersToGossip.length)];

    try {
        // Avant d'envoyer notre liste, on met à jour nos propres infos
        await updateSelfDiskUsage();

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
}

function getMemberList() {
    return Array.from(memberList.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function stopClusterServices() {
    clearInterval(gossipInterval);
    stopReplicationQueue();
    logger.info('[Cluster] Gossip and replication services stopped.');
}

function initializeCluster(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger) || new Logger('DataCluster');
    engine.selfId = engine.peers.find(p => p.public_domain === engine.selfUrl)?.id || 'unknown-node';

    // 1. Initialiser la liste des membres à partir de la configuration statique
    memberList.clear();
    for (const peer of engine.peers) {
        memberList.set(peer.id, { ...peer, status: 'UP', version: 1, lastUpdate: Date.now(), disk: null });
    }
    logger.info(`[Cluster] Initialized. Self: ${engine.selfId} @ ${engine.selfUrl}.`);
    logMemberList();

    // Initialiser le système de baux si un DataHandler est présent
    if (dataHandler) {
        const leaseSchema = new dataHandler.mongoose.Schema({
            resourceId: { type: String, required: true, unique: true, index: true },
            ownerId: { type: String, required: true },
            expiresAt: { type: Date, required: true, index: { expires: '1m' } }
        }, { timestamps: true });

        ClusterLease = dataHandler.mongoose.model('ClusterLease', leaseSchema);
        logger.info('[Cluster] Lease manager initialized with MongoDB backend.');
    } else {
        logger.warn('[Cluster] DataHandler not found. Lease-based master verification is disabled. Cluster may be vulnerable to split-brain.');
    }

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
    replicationInit(engine, { getReplicaNodesForUser: self.getReplicaNodesForUser });
}


export { broadcastCacheInvalidation, replicateOperation, getResponsibleNodesForUser, getReplicaNodesForUser, isSelfMasterForUser, proxyRequest, isProxiedRequest, checkSuspectNodes, getMemberList, stopClusterServices };

export function onInit(engine) {
    // On attend que le serveur soit démarré pour avoir engine.selfUrl et engine.peers
    Event.Listen("OnServerStart", () => initializeCluster(engine), "event", "system");
}