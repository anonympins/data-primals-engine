import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as clusterModule from '../src/modules/data/data.cluster.js';
import * as fs from 'node:fs/promises';
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
                { id: 'node-1', url: 'http://node-1:3000', sharding: true, replica: true },
                { id: 'node-2', url: 'http://node-2:3000', sharding: true, replica: true },
                { id: 'node-3', url: 'http://node-3:3000', sharding: true, replica: true }
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
            expect(memberListV1.find(m => m.id === 'node-2')?.status).toBe('SUSPECT');

            // On avance le temps au-delà du timeout + un autre cycle de gossip pour que checkSuspectNodes s'exécute.
            await vi.advanceTimersByTimeAsync(8000); // 6000ms (timeout) + 2000ms (next gossip)

            const memberListV2 = clusterModule.getMemberList();
            expect(memberListV2.find(m => m.id === 'node-2')?.status).toBe('DOWN');

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

    describe('Mastership & Leasing (isSelfMasterForUser)', () => {
        const username = 'test-user';
        const resourceId = `mastership-${username}`;

        it('should return false if node is not the potential master based on hash', async () => {
            clusterModule.onInit(mockEngine);
            // Mock getMasterNodeForUser to return another node
            vi.spyOn(clusterModule, 'getMasterNodeForUser').mockReturnValue({ id: 'node-2' });

            const isMaster = await clusterModule.isSelfMasterForUser(username);

            expect(isMaster).toBe(false);
            expect(mockClusterLeaseModel.findOneAndUpdate).not.toHaveBeenCalled();
        });

        it('should return true if node is potential master and successfully acquires lease', async () => {
            clusterModule.onInit(mockEngine);
            vi.spyOn(clusterModule, 'getMasterNodeForUser').mockReturnValue({ id: 'node-1' });

            // Mock successful lease acquisition
            mockClusterLeaseModel.findOneAndUpdate.mockResolvedValue({
                resourceId: resourceId,
                ownerId: 'node-1'
            });

            const isMaster = await clusterModule.isSelfMasterForUser(username);

            expect(isMaster).toBe(true);
            expect(mockClusterLeaseModel.findOneAndUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ resourceId }),
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should return false if node is potential master but fails to acquire lease', async () => {
            clusterModule.onInit(mockEngine);
            vi.spyOn(clusterModule, 'getMasterNodeForUser').mockReturnValue({ id: 'node-1' });

            // Mock failed lease acquisition (another node holds it)
            mockClusterLeaseModel.findOneAndUpdate.mockResolvedValue(null);

            const isMaster = await clusterModule.isSelfMasterForUser(username);

            expect(isMaster).toBe(false);
            expect(mockClusterLeaseModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        });
    });
});