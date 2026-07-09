import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initializeCluster, getMemberList, stopClusterServices } from '../src/modules/data/data.cluster.js';
import * as fs from 'node:fs/promises';
import { Logger } from "../src/index.js";
import { Config } from '../src/config.js';

// Mock Logger to prevent console output
vi.mock('../src/gameObject.js', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original, // Keep original exports like 'Behaviour'
        Logger: class {
            info = vi.fn();
            warn = vi.fn();
            error = vi.fn();
            debug = vi.fn();
        },
        DataHandler: class {} // Provide a mock DataHandler class
    };
});

// Mock Config
vi.mock('../src/config.js', () => ({
    Config: {
        Get: vi.fn((key, defaultValue) => defaultValue)
    }
}));

// Mock fs.promises pour contrôler statfs
vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        statfs: vi.fn().mockResolvedValue({ bavail: 5000, bsize: 1024, blocks: 10000 }), // Mock de base
    };
});

describe('Data Cluster & Gossip Logic', () => {
    let mockEngine;
    let postHandlers = {};
    let mockDataHandler;
    let mockClusterLeaseModel;

    beforeEach(() => {
        vi.useFakeTimers();

        // Mock the engine
        mockEngine = {
            selfUrl: 'http://node-1:3000',
            peers: [
                { id: 'node-1', public_domain: 'http://node-1:3000', sharding: true, replica: true },
                { id: 'node-2', public_domain: 'http://node-2:3000', sharding: true, replica: true },
                { id: 'node-3', public_domain: 'http://node-3:3000', sharding: true, replica: true }
            ],
            getComponent: vi.fn(componentName => {
                if (componentName === 'DataHandler') return mockDataHandler;
                return new Logger('mock');
            }),
            sendToPeer: vi.fn(),
            post: vi.fn((path, handler) => {
                postHandlers[path] = handler;
            }),
        };

        // Mock Mongoose/DataHandler for leasing
        mockClusterLeaseModel = {
            findOneAndUpdate: vi.fn(),
        };
        mockDataHandler = {
            mongoose: {
                Schema: class Schema {},
                model: vi.fn().mockReturnValue(mockClusterLeaseModel),
            }
        };

        // Reset post handlers for each test
        postHandlers = {};
    });

    afterEach(() => {
        stopClusterServices();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Initialization (onInit)', () => {
        it('should initialize member list from static peer configuration', async () => {
            await initializeCluster(mockEngine);
            const memberList = getMemberList();

            expect(memberList).toHaveLength(3);
            expect(memberList.find(m => m.id === 'node-1')).toBeDefined();
            expect(memberList.find(m => m.id === 'node-2')).toBeDefined();
            expect(memberList.find(m => m.id === 'node-3')).toBeDefined();

            const node1 = memberList.find(m => m.id === 'node-1');
            expect(node1.status).toBe('UP');
            expect(node1.version).toBe(1);
        });

        it('should correctly identify selfId', async () => {
            await initializeCluster(mockEngine);
            expect(mockEngine.selfId).toBe('node-1');
        });

        it('should register the /api/internal/gossip endpoint', async () => {
            await initializeCluster(mockEngine);
            expect(mockEngine.post).toHaveBeenCalledWith('/api/internal/gossip', expect.any(Function));
            expect(postHandlers['/api/internal/gossip']).toBeDefined();
        });

        it('should start the gossip interval', async () => {
            const setIntervalSpy = vi.spyOn(global, 'setInterval');
            await initializeCluster(mockEngine);
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000); // Default interval
        });
    });

    describe('Gossip Execution', () => {
        it('should send its member list to a random UP peer', async () => {
            await initializeCluster(mockEngine);
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
            await initializeCluster(mockEngine);
            mockEngine.sendToPeer.mockRejectedValue(new Error('Network error'));

            await vi.advanceTimersByTimeAsync(2000); // Trigger gossip

            expect(mockEngine.sendToPeer).toHaveBeenCalledTimes(1);
            const failedPeerId = mockEngine.sendToPeer.mock.calls[0][0];

            const memberList = getMemberList();
            const failedPeer = memberList.find(m => m.id === failedPeerId); 
            expect(failedPeer.status).toBe('SUSPECT');
            expect(failedPeer.version).toBe(2); // Version incremented
        });

        it('should merge the list received from a peer on successful gossip', async () => {
            const remoteList = [
                { id: 'node-1', public_domain: 'http://node-1:3000', status: 'UP', version: 1 },
                { id: 'node-2', public_domain: 'http://node-2:3000', status: 'UP', version: 2 }, // Higher version
                { id: 'node-4', public_domain: 'http://node-4:3000', status: 'UP', version: 1 }  // New node
            ];
            mockEngine.sendToPeer.mockResolvedValue({ ok: true, json: () => Promise.resolve(remoteList) });
            await initializeCluster(mockEngine);

            await vi.advanceTimersByTimeAsync(2000); // Trigger gossip

            const memberList = getMemberList();
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

            await initializeCluster(mockEngine);
            mockEngine.sendToPeer.mockRejectedValue(new Error('Network error'));

            // Le premier gossip échoue, node-2 devient SUSPECT
            await vi.advanceTimersByTimeAsync(2000); 
            const memberListV1 = getMemberList();
            expect(memberListV1.find(m => m.id === 'node-2')?.status).toBe('SUSPECT');

            // On avance le temps au-delà du timeout + un autre cycle de gossip pour que checkSuspectNodes s'exécute.
            await vi.advanceTimersByTimeAsync(8000); // 6000ms (timeout) + 2000ms (next gossip)

            const memberListV2 = getMemberList();
            expect(memberListV2.find(m => m.id === 'node-2')?.status).toBe('DOWN');

            randomSpy.mockRestore(); // Nettoyer le spy
        });
    });

    describe('Gossip Endpoint', () => {
        it('should merge received list and respond with its own updated list', async () => {
            await initializeCluster(mockEngine);
            const gossipEndpointHandler = postHandlers['/api/internal/gossip'];

            const remoteList = [
                { id: 'node-3', public_domain: 'http://node-3:3000', status: 'SUSPECT', version: 5 },
                { id: 'node-4', public_domain: 'http://node-4:3000', status: 'UP', version: 1 }
            ];
            const mockReq = { fields: remoteList };
            const mockRes = { json: vi.fn() };

            gossipEndpointHandler(mockReq, mockRes);

            // Check if list was merged
            const memberList = getMemberList();
            expect(memberList).toHaveLength(4);
            expect(memberList.find(m => m.id === 'node-4')).toBeDefined();
            expect(memberList.find(m => m.id === 'node-3').status).toBe('SUSPECT');
            expect(memberList.find(m => m.id === 'node-3').version).toBe(5);

            // Check if it responded with the new list
            expect(mockRes.json).toHaveBeenCalledWith(memberList);
        });
    });

});