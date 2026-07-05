import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import {
    onInit,
    getResponsibleNodesForUser,
    isSelfMasterForUser,
    getMasterNodeForUser,
    getReplicaNodesForUser
} from '../src/modules/data/data.cluster.js';
import { Config } from '../src/config.js';

// Mock Logger to avoid console output during tests
vi.mock('../src/gameObject.js', () => ({
    Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        debug = vi.fn();
    }
}));

describe('Data Clustering Logic', () => {

    const mockPeers = [
        { id: 'node-1', url: 'http://node-1:3000', sharding: true, replica: true },
        { id: 'node-2', url: 'http://node-2:3000', sharding: true, replica: false }, // Sharding only
        { id: 'node-3', url: 'http://node-3:3000', sharding: false, replica: true }, // Replica only
        { id: 'node-4', url: 'http://node-4:3000', sharding: true, replica: true },
    ];

    // Tri pour simuler le comportement déterministe de l'initialisation du moteur
    mockPeers.sort((a, b) => a.url.localeCompare(b.url));

    const mockEngine = {
        selfUrl: 'http://node-1:3000',
        peers: mockPeers,
    };

    beforeAll(() => {
        // Inject the mock engine into the cluster module
        onInit(mockEngine);
    });

    beforeEach(() => {
        // Reset config before each test to ensure isolation
        Config.Set('replicationFactor', 2);
    });

    it('should return only the current node if no peers are available', () => {
        const singleNodeEngine = { selfUrl: 'http://localhost:3000', peers: [{ id: 'self', url: 'http://localhost:3000' }] };
        onInit(singleNodeEngine); // Re-initialize for this test

        const nodes = getResponsibleNodesForUser('anyuser');
        expect(nodes).toHaveLength(1);
        expect(nodes[0]).toBe('http://localhost:3000');

        // Restore the main engine for other tests
        onInit(mockEngine);
    });

    it('should select the master node from sharding-enabled peers', () => {
        // Nodes eligible for sharding are node-1, node-2, node-4
        const shardingNodes = mockPeers.filter(p => p.sharding).map(p => p.url).sort();
        expect(shardingNodes).toEqual(['http://node-1:3000', 'http://node-2:3000', 'http://node-4:3000']);

        // Hashing 'user1' should deterministically select one of these three.
        const masterNode = getMasterNodeForUser('user1');
        expect(shardingNodes).toContain(masterNode.url);
    });

    it('should select replica nodes from replica-enabled peers, excluding the master', () => {
        Config.Set('replicationFactor', 3);

        // For 'user1', the master node is 'node-1' based on its hash.
        const masterNode = getMasterNodeForUser('user1');
        expect(masterNode.id).toBe('node-1');

        // Nodes eligible for replica are node-1, node-3, and node-4.
        // Since node-1 is master, the pool for replicas is [node-3, node-4].
        const replicaNodes = getReplicaNodesForUser('user1');

        expect(replicaNodes).toHaveLength(2); // REPLICATION_FACTOR - 1
        expect(replicaNodes.map(n => n.id)).toEqual(expect.arrayContaining(['node-3', 'node-4']));
        expect(replicaNodes.map(n => n.id)).not.toContain('node-1'); // Master excluded
        expect(replicaNodes.map(n => n.id)).not.toContain('node-2'); // Not a replica node
    });

    it('should be deterministic for the same username', () => {
        const nodes1 = getResponsibleNodesForUser('deterministic_user');
        const nodes2 = getResponsibleNodesForUser('deterministic_user');
        expect(nodes1).toEqual(nodes2);
    });

    it('should correctly identify if the current node is the master', () => {
        // 'user1' hash results in node-1 being master, which is selfUrl
        const isMaster = isSelfMasterForUser('user1');
        expect(isMaster).toBe(true);

        // 'user_for_node2' hash results in node-2 being master
        const isNotMaster = isSelfMasterForUser('user_for_node2');
        expect(isNotMaster).toBe(false);
    });

    it('should handle the case where there are not enough replica nodes', () => {
        Config.Set('replicationFactor', 5); // Request more replicas than available

        const masterNode = getMasterNodeForUser('user1'); // master is node-1
        const replicaPool = mockPeers.filter(p => p.replica && p.id !== masterNode.id); // pool is [node-3, node-4]

        const responsibleNodes = getResponsibleNodesForUser('user1');

        // Should return master + all available replica nodes
        expect(responsibleNodes).toHaveLength(1 + replicaPool.length); // 1 (master) + 2 (replicas) = 3
        expect(responsibleNodes.map(n => n.id)).toEqual(expect.arrayContaining(['node-1', 'node-3', 'node-4'])); // Master + the two available replicas
    });

    it('should use all peers for sharding if no node is explicitly marked for sharding', () => {
        const noShardingPeers = [
            { id: 'node-a', url: 'http://node-a:3000', replica: true },
            { id: 'node-b', url: 'http://node-b:3000', replica: true },
        ];
        const tempEngine = { selfUrl: 'http://node-a:3000', peers: noShardingPeers };
        onInit(tempEngine);

        const masterNode = getMasterNodeForUser('some_user');
        // The master must be one of the two nodes
        expect(['node-a', 'node-b']).toContain(masterNode.id);

        // Restore main engine
        onInit(mockEngine);
    });
});