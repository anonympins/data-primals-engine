import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as clusterModule from '../src/modules/data/data.cluster.js';
import { Logger } from "../src/index.js";
import { Config } from '../src/config.js';

// Mock Logger to prevent console output
vi.mock('../src/gameObject.js', () => ({
    Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        debug = vi.fn();
    }
}));

// Mock Config
vi.mock('../src/config.js', () => ({
    Config: {
        Get: vi.fn((key, defaultValue) => defaultValue)
    }
}));

describe('Data Cluster & Gossip Logic', () => {
    let mockEngine;
    let postHandlers = {};

    beforeEach(() => {
        vi.useFakeTimers();

        // Mock the engine
        mockEngine = {
            selfUrl: 'http://node-1:3000',
            peers: [
                { id: 'node-1', url: 'http://node-1:3000', sharding: true, replica: true },
                { id: 'node-2', url: 'http://node-2:3000', sharding: true, replica: true },
                { id: 'node-3', url: 'http://node-3:3000', sharding: true, replica: true }
            ],
            getComponent: vi.fn().mockReturnValue(new Logger('mock')),
            sendToPeer: vi.fn(),
            post: vi.fn((path, handler) => {
                postHandlers[path] = handler;
            }),
        };

        // Reset post handlers for each test
        postHandlers = {};
    });

    afterEach(() => {
        clusterModule.stopClusterServices();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Initialization (onInit)', () => {
        it('should initialize member list from static peer configuration', () => {
            clusterModule.onInit(mockEngine);
            const memberList = clusterModule.getMemberList();

            expect(memberList).toHaveLength(3);
            expect(memberList.find(m => m.id === 'node-1')).toBeDefined();
            expect(memberList.find(m => m.id === 'node-2')).toBeDefined();
            expect(memberList.find(m => m.id === 'node-3')).toBeDefined();

            const node1 = memberList.find(m => m.id === 'node-1');
            expect(node1.status).toBe('UP');
            expect(node1.version).toBe(1);
        });

        it('should correctly identify selfId', () => {
            clusterModule.onInit(mockEngine);
            expect(mockEngine.selfId).toBe('node-1');
        });

        it('should register the /api/internal/gossip endpoint', () => {
            clusterModule.onInit(mockEngine);
            expect(mockEngine.post).toHaveBeenCalledWith('/api/internal/gossip', expect.any(Function));
            expect(postHandlers['/api/internal/gossip']).toBeDefined();
        });

        it('should start the gossip interval', () => {
            const setIntervalSpy = vi.spyOn(global, 'setInterval');
            clusterModule.onInit(mockEngine);
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000); // Default interval
        });
    });

    describe('Gossip Execution', () => {
        it('should send its member list to a random UP peer', async () => {
            clusterModule.onInit(mockEngine);
            mockEngine.sendToPeer.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

            await vi.advanceTimersByTimeAsync(2000); // Trigger gossip

            expect(mockEngine.sendToPeer).toHaveBeenCalledTimes(1);
            const [peerId, path, payload] = mockEngine.sendToPeer.mock.calls[0];
            expect(['node-2', 'node-3']).toContain(peerId);
            expect(path).toBe('/api/internal/gossip');
            expect(payload).toHaveLength(3);
            expect(payload.find(p => p.id === 'node-1')).toBeDefined();
        });

        it('should mark a peer as SUSPECT if sendToPeer fails', async () => {
            clusterModule.onInit(mockEngine);
            mockEngine.sendToPeer.mockRejectedValue(new Error('Network error'));

            await vi.advanceTimersByTimeAsync(2000); // Trigger gossip

            expect(mockEngine.sendToPeer).toHaveBeenCalledTimes(1);
            const failedPeerId = mockEngine.sendToPeer.mock.calls[0][0];
            
            const memberList = clusterModule.getMemberList();
            const failedPeer = memberList.find(m => m.id === failedPeerId);
            expect(failedPeer.status).toBe('SUSPECT');
            expect(failedPeer.version).toBe(2); // Version incremented
        });

        it('should merge the list received from a peer on successful gossip', async () => {
            const remoteList = [
                { id: 'node-1', url: 'http://node-1:3000', status: 'UP', version: 1 },
                { id: 'node-2', url: 'http://node-2:3000', status: 'UP', version: 2 }, // Higher version
                { id: 'node-4', url: 'http://node-4:3000', status: 'UP', version: 1 }  // New node
            ];
            mockEngine.sendToPeer.mockResolvedValue({ ok: true, json: () => Promise.resolve(remoteList) });
            clusterModule.onInit(mockEngine);
            
            await vi.advanceTimersByTimeAsync(2000); // Trigger gossip

            const memberList = clusterModule.getMemberList();
            expect(memberList).toHaveLength(4);
            expect(memberList.find(m => m.id === 'node-4')).toBeDefined(); // New node added
            expect(memberList.find(m => m.id === 'node-2').version).toBe(2); // Node updated
        });
    });

    describe('Gossip Health Checks', () => {
        it('should mark a SUSPECT peer as DOWN after a timeout', async () => {
            Config.Get.mockImplementation((key, defaultValue) => {
                if (key === 'gossipSuspectTimeout') return 5000; // 5s timeout for test
                return defaultValue;
            });

            // Rendre le choix du pair déterministe en mockant Math.random
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            clusterModule.onInit(mockEngine);
            mockEngine.sendToPeer.mockRejectedValue(new Error('Network error'));

            // Le premier gossip échoue, node-2 devient SUSPECT
            await vi.advanceTimersByTimeAsync(2000); 
            const memberListV1 = clusterModule.getMemberList();
            expect(memberListV1.find(m => m.id === 'node-2').status).toBe('SUSPECT');

            // On avance le temps au-delà du timeout.
            await vi.advanceTimersByTimeAsync(6000);

            // On exécute manuellement la vérification qui aurait dû se produire lors d'un cycle de gossip.
            // Dans le code réel, `checkSuspectNodes` est appelé par `executeGossip`.
            clusterModule.checkSuspectNodes();

            const memberListV2 = clusterModule.getMemberList();
            expect(memberListV2.find(m => m.id === 'node-2').status).toBe('DOWN');

            randomSpy.mockRestore(); // Nettoyer le spy
        });
    });

    describe('Gossip Endpoint', () => {
        it('should merge received list and respond with its own updated list', () => {
            clusterModule.onInit(mockEngine);
            const gossipEndpointHandler = postHandlers['/api/internal/gossip'];

            const remoteList = [
                { id: 'node-3', url: 'http://node-3:3000', status: 'SUSPECT', version: 5 },
                { id: 'node-4', url: 'http://node-4:3000', status: 'UP', version: 1 }
            ];
            const mockReq = { fields: remoteList };
            const mockRes = { json: vi.fn() };

            gossipEndpointHandler(mockReq, mockRes);

            // Check if list was merged
            const memberList = clusterModule.getMemberList();
            expect(memberList).toHaveLength(4);
            expect(memberList.find(m => m.id === 'node-4')).toBeDefined();
            expect(memberList.find(m => m.id === 'node-3').status).toBe('SUSPECT');
            expect(memberList.find(m => m.id === 'node-3').version).toBe(5);

            // Check if it responded with the new list
            expect(mockRes.json).toHaveBeenCalledWith(memberList);
        });
    });
});