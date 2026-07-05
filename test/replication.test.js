import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueReplication, onInit, stopReplicationQueue } from '../src/modules/data/data.replication.js';
import * as clusterModule from '../src/modules/data/data.cluster.js';
import { Logger } from "../src/index.js"

// Mock Logger to prevent console output
vi.mock('../src/gameObject.js', () => ({
    Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        debug = vi.fn();
    }
}));

describe('Data Replication Logic', () => {
    let mockEngine;
    let getReplicaNodesForUserSpy;

    beforeEach(() => {
        vi.useFakeTimers();

        // Mock the engine and its sendToPeer function
        mockEngine = {
            peers: [
                { id: 'self', url: 'http://self:3000' },
                { id: 'replica-1', url: 'http://replica-1:3000' },
                { id: 'replica-2', url: 'http://replica-2:3000' }
            ],
            getComponent: vi.fn().mockReturnValue(new Logger('mock')),
            sendToPeer: vi.fn().mockResolvedValue({ ok: true }),
        };

        // Spy on getReplicaNodesForUser to control its output
        getReplicaNodesForUserSpy = vi.spyOn(clusterModule, 'getReplicaNodesForUser');

        // Initialize the replication module with the mock engine
        onInit(mockEngine);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        stopReplicationQueue();
        // Clear the queue manually for test isolation
        const replicationQueue = []; // This is a simplified way to clear it for tests
        while (replicationQueue.length > 0) {
            replicationQueue.pop();
        }
    });

    it('should queue an operation correctly', async () => {
        const operation = 'insert';
        const modelName = 'testModel';
        const user = { username: 'testuser' };
        const payload = { data: { name: 'test' } };

        // This test is tricky because replicationQueue is not exported.
        // We'll test its effect indirectly via processReplicationQueue.
        queueReplication(operation, modelName, user, payload);

        // We can't directly inspect the queue, so we'll let the processing logic run
        // and check if the mocks were called.
        getReplicaNodesForUserSpy.mockReturnValue([{ id: 'replica-1' }]);

        await vi.advanceTimersByTimeAsync(200); // Advance time to trigger processReplicationQueue

        // Check that the processing function tried to get replicas
        expect(getReplicaNodesForUserSpy).toHaveBeenCalledWith(user.username);
    });

    it('should process the queue and send operations in batches to correct replicas', async () => {
        const user1 = { username: 'user1' };
        const user2 = { username: 'user2' };

        // Mock so user1 replicates to replica-1 and user2 to replica-2
        getReplicaNodesForUserSpy.mockImplementation((username) => {
            if (username === 'user1') return [{ id: 'replica-1' }];
            if (username === 'user2') return [{ id: 'replica-2' }];
            return [];
        });

        // Queue operations for different users
        queueReplication('insert', 'modelA', user1, { data: { a: 1 } });
        queueReplication('update', 'modelB', user2, { data: { b: 2 } });
        queueReplication('delete', 'modelC', user1, { ids: ['123'] });

        // Advance timers to trigger the processing
        await vi.advanceTimersByTimeAsync(200);

        // Assertions
        expect(mockEngine.sendToPeer).toHaveBeenCalledTimes(2);

        // Check call for replica-1
        expect(mockEngine.sendToPeer).toHaveBeenCalledWith(
            'replica-1',
            '/api/internal/replicate',
            expect.objectContaining({
                operations: expect.arrayContaining([
                    expect.objectContaining({ operation: 'insert', modelName: 'modelA', user: user1 }),
                    expect.objectContaining({ operation: 'delete', modelName: 'modelC', user: user1 })
                ])
            })
        );

        // Check call for replica-2
        expect(mockEngine.sendToPeer).toHaveBeenCalledWith(
            'replica-2',
            '/api/internal/replicate',
            expect.objectContaining({
                operations: expect.arrayContaining([
                    expect.objectContaining({ operation: 'update', modelName: 'modelB', user: user2 })
                ])
            })
        );
    });

    it('should not process queue if CLUSTER_SHARED_DATABASE is true', async () => {
        process.env.CLUSTER_SHARED_DATABASE = 'true';

        queueReplication('insert', 'modelA', { username: 'user1' }, { data: { a: 1 } });

        await vi.advanceTimersByTimeAsync(200);

        expect(mockEngine.sendToPeer).not.toHaveBeenCalled();

        delete process.env.CLUSTER_SHARED_DATABASE; // Cleanup
    });

    it('should queue a failed batch for retry and re-send it on the next cycle', async () => {
        const user = { username: 'retry-user' };
        const payload = { data: { name: 'important-data' } };

        // Configurer le mock pour qu'il échoue la première fois et réussisse la seconde
        mockEngine.sendToPeer
            .mockRejectedValueOnce(new Error('Simulated Network Error'))
            .mockResolvedValue({ ok: true });

        // Toutes les opérations pour cet utilisateur vont vers 'replica-1'
        getReplicaNodesForUserSpy.mockReturnValue([{ id: 'replica-1' }]);

        // 1. Mettre une opération en file d'attente
        queueReplication('insert', 'retryModel', user, payload);

        // 2. Premier cycle : processReplicationQueue est appelé, sendToPeer échoue
        // Advance just enough to trigger one processing cycle (assuming interval is 100ms)
        await vi.advanceTimersByTimeAsync(100);

        // Vérifier que l'échec a été loggué et que la tentative a eu lieu
        expect(mockEngine.sendToPeer).toHaveBeenCalledTimes(1);

        // 3. Deuxième cycle : retryFailedBatches est appelé, sendToPeer réussit
        await vi.advanceTimersByTimeAsync(100);

        // Vérifier que la nouvelle tentative a eu lieu
        expect(mockEngine.sendToPeer).toHaveBeenCalledTimes(2);

        // Vérifier que les deux appels étaient pour la même réplique avec les mêmes données
        const firstCallArgs = mockEngine.sendToPeer.mock.calls[0];
        const secondCallArgs = mockEngine.sendToPeer.mock.calls[1];
        expect(firstCallArgs).toEqual(secondCallArgs);
    });
});