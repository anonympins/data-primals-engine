// events.test.js
import { Event } from '../src/events.js';
import {vitest} from "vitest";
import {expect, describe, it, beforeEach} from 'vitest';

describe('Event System', () => {
    beforeEach(() => {
        // This is a workaround to clear all events. A dedicated `Event.ClearAll()` would be better.
        Event.RemoveSystemCallbacks('priority');
        Event.RemoveSystemCallbacks('log');
    });

    it('should allow listening for and triggering an event', async() => {
        const mockCallback = vitest.fn();
        const eventName = 'testEvent';

        Event.Listen(eventName, mockCallback);
        await Event.Trigger(eventName);

        expect(mockCallback).toHaveBeenCalledTimes(1);
    });
    it('should pass arguments to the event callback', async() => {
        const mockCallback = vitest.fn();
        const eventName = 'testEventWithArgs';
        const arg1 = 'hello';
        const arg2 = 123;

        Event.Listen(eventName, mockCallback, "priority", "medium");
        await Event.Trigger(eventName, "priority", "medium", arg1, arg2);

        expect(mockCallback).toHaveBeenCalledTimes(1);
        expect(mockCallback).toHaveBeenCalledWith(arg1, arg2);
    });

    it('should allow removing a specific callback', async() => {
        const mockCallback1 = vitest.fn();
        const mockCallback2 = vitest.fn();
        const eventName = 'testEventRemoveCallback';

        Event.Listen(eventName, mockCallback1);
        Event.Listen(eventName, mockCallback2);
        Event.RemoveCallback(eventName, mockCallback1);
        await Event.Trigger(eventName);

        expect(mockCallback1).not.toHaveBeenCalled();
        expect(mockCallback2).toHaveBeenCalledTimes(1);
    });

    it('should allow removing all callbacks for an event', async () => {
        const mockCallback1 = vitest.fn();
        const mockCallback2 = vitest.fn();
        const eventName = 'testEventRemoveAll';

        Event.Listen(eventName, mockCallback1);
        Event.Listen(eventName, mockCallback2, { layer: 'high' }); // Different layer
        Event.RemoveAllCallbacks(eventName);
        await Event.Trigger(eventName); // Will trigger nothing
        await Event.Trigger(eventName, 'priority', 'high'); // Will trigger nothing

        expect(mockCallback1).not.toHaveBeenCalled();
        expect(mockCallback2).not.toHaveBeenCalled();
    });

    it('should allow removing callbacks by priority', async () => {
        const eventName = 'testEventRemoveByPriority';
        const cb_p10 = vitest.fn();
        const cb_p20 = vitest.fn();
        const cb_p10_another = vitest.fn();

        Event.Listen(eventName, cb_p10, { priority: 10 });
        Event.Listen(eventName, cb_p20, { priority: 20 });
        Event.Listen(eventName, cb_p10_another, { priority: 10 });

        Event.RemoveCallbacksByPriority(eventName, 10);
        await Event.Trigger(eventName);

        expect(cb_p10).not.toHaveBeenCalled();
        expect(cb_p10_another).not.toHaveBeenCalled();
        expect(cb_p20).toHaveBeenCalledTimes(1);
    });

    it('should not trigger a callback if the event is not listened to', async() => {
        const mockCallback = vitest.fn();
        const eventName = 'nonExistentEvent';

        await Event.Trigger(eventName);

        expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle different systems and layers', async() => {
        const mockCallbackPriority = vitest.fn();
        const mockCallbackLog = vitest.fn();
        const eventName = 'testEventMultiSystem';

        Event.Listen(eventName, mockCallbackPriority, 'priority', 'high');
        Event.Listen(eventName, mockCallbackLog, 'log', 'info');

        await Event.Trigger(eventName, 'priority', 'high');
        expect(mockCallbackPriority).toHaveBeenCalledTimes(1);
        expect(mockCallbackLog).not.toHaveBeenCalled();

        vitest.clearAllMocks(); // Reset mock counts

        await Event.Trigger(eventName, 'log', 'info');
        expect(mockCallbackPriority).not.toHaveBeenCalled();
        expect(mockCallbackLog).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if an invalid system or layer is used with Listen', () => {
        expect(() => {
            Event.Listen('invalidEvent', () => {}, 'invalidSystem', 'invalidLayer');
        }).toThrowError(/System 'invalidSystem' does not exist./);

        expect(() => {
            Event.Listen('invalidEvent', () => {}, 'priority', 'invalidLayer');
        }).toThrowError(/Layer 'invalidLayer' does not exist/);
    });

    describe('Priority Sorting', () => {
        it('should execute listeners in the correct priority order', async () => {
            const eventName = 'priorityTestEvent';
            const executionOrder = [];

            const cb_afterAll = vitest.fn(() => executionOrder.push('afterAll'));
            const cb_p50 = vitest.fn(() => executionOrder.push('p50'));
            const cb_identity1 = vitest.fn(() => executionOrder.push('identity1'));
            const cb_beforeAll = vitest.fn(() => executionOrder.push('beforeAll'));
            const cb_p10 = vitest.fn(() => executionOrder.push('p10'));
            const cb_identity2 = vitest.fn(() => executionOrder.push('identity2'));

            // Register in a random order
            Event.Listen(eventName, cb_afterAll, { priority: 'afterAll' });
            Event.Listen(eventName, cb_p50, { priority: 50 });
            Event.Listen(eventName, cb_identity1, { priority: 'identity' });
            Event.Listen(eventName, cb_beforeAll, { priority: 'beforeAll' });
            Event.Listen(eventName, cb_p10, { priority: 10 });
            Event.Listen(eventName, cb_identity2); // 'identity' is default

            await Event.Trigger(eventName);

            expect(executionOrder).toEqual([
                'beforeAll',
                'p10',
                'p50',
                'identity1',
                'identity2',
                'afterAll'
            ]);
        });
    });

    describe('Dynamic Systems and Layers', () => {
        it('should allow adding a new system and layer, then listening and triggering on it', async () => {
            const newSystem = 'customSystem';
            const newLayer = 'customLayer';
            const eventName = 'customEvent';
            const mockCallback = vitest.fn();

            // Add new system and layer
            Event.addSystem(newSystem);
            Event.addLayer(newSystem, newLayer);

            // Listen on the new system/layer
            Event.Listen(eventName, mockCallback, { system: newSystem, layer: newLayer });

            // Trigger on the new system/layer
            await Event.Trigger(eventName, newSystem, newLayer);

            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        it('should throw an error when adding a layer to a non-existent system', () => {
            expect(() => {
                Event.addLayer('nonExistentSystem', 'someLayer');
            }).toThrowError(/Le système 'nonExistentSystem' n'existe pas/);
        });
    });

    describe('Error Handling', () => {
        it('should propagate errors from callbacks and enrich them', async () => {
            const eventName = 'errorEvent';
            const errorMessage = 'Something went wrong!';
            const errorCallback = vitest.fn(() => { throw new Error(errorMessage); });

            Event.Listen(eventName, errorCallback, 'log', 'error');

            await expect(Event.Trigger(eventName, 'log', 'error')).rejects.toThrow(`Error in callback for event ${eventName} in system log layer error: ${errorMessage}`);
        });
    });

    describe('Event.Trigger result merging', () => {
        it('should merge objects from multiple callbacks using spread operator', async() => {
            const eventName = 'mergeObjectEvent';
            const callback1 = vitest.fn().mockReturnValue({ a: 1, b: 2 });
            const callback2 = vitest.fn().mockReturnValue({ b: 3, c: 4 }); // b will be overwritten

            Event.Listen(eventName, callback1);
            Event.Listen(eventName, callback2);

            const result = await Event.Trigger(eventName);

            expect(result).toEqual({ a: 1, b: 3, c: 4 });
        });

        it('should concatenate arrays from multiple callbacks', async() => {
            const eventName = 'mergeArrayEvent';
            const callback1 = vitest.fn().mockReturnValue([1, 2]);
            const callback2 = vitest.fn().mockReturnValue([3, 4]);

            Event.Listen(eventName, callback1);
            Event.Listen(eventName, callback2);

            const result = await Event.Trigger(eventName);

            expect(result).toEqual([1, 2, 3, 4]);
        });

        it('should concatenate strings from multiple callbacks', async() => {
            const eventName = 'mergeStringEvent';
            const callback1 = vitest.fn().mockReturnValue('Hello ');
            const callback2 = vitest.fn().mockReturnValue('World');

            Event.Listen(eventName, callback1);
            Event.Listen(eventName, callback2);

            const result = await Event.Trigger(eventName);

            expect(result).toBe('Hello World');
        });

        it('should add numbers from multiple callbacks', async() => {
            const eventName = 'mergeNumberEvent';
            const callback1 = vitest.fn().mockReturnValue(10);
            const callback2 = vitest.fn().mockReturnValue(20);

            Event.Listen(eventName, callback1);
            Event.Listen(eventName, callback2);

            const result = await Event.Trigger(eventName);

            expect(result).toBe(30);
        });

        it('should perform a logical AND on booleans from multiple callbacks', async() => {
            const eventName = 'mergeBooleanEvent';

            // Case 1: true && true -> true
            const cb_true1 = vitest.fn().mockReturnValue(true);
            const cb_true2 = vitest.fn().mockReturnValue(true);
            Event.Listen(eventName, cb_true1);
            Event.Listen(eventName, cb_true2);
            expect(await Event.Trigger(eventName)).toBe(true);
            Event.RemoveAllCallbacks(eventName); // Clean up for next case

            // Case 2: true && false -> false
            const cb_false1 = vitest.fn().mockReturnValue(false);
            Event.Listen(eventName, cb_true1);
            Event.Listen(eventName, cb_false1);
            expect(await Event.Trigger(eventName)).toBe(false);
            Event.RemoveAllCallbacks(eventName);

            // Case 3: false && true -> false
            Event.Listen(eventName, cb_false1);
            Event.Listen(eventName, cb_true1);
            expect(await Event.Trigger(eventName)).toBe(false);
        });

        it('should handle mixed-type return values', async() => {
            const eventName = 'mergeMixedEvent';
            const callback1 = vitest.fn().mockReturnValue(100); // number
            const callback2 = vitest.fn().mockReturnValue({ a: 1 }); // object

            Event.Listen(eventName, callback1);
            Event.Listen(eventName, callback2);

            const result = await Event.Trigger(eventName);

            // The logic initializes `ret` with the first value (100).
            // When the second callback returns an object, it re-initializes `ret` to {}
            // and merges the object. The final result is the object.
            expect(result).toEqual({ a: 1 });
        });

        it('should ignore null and undefined return values while merging', async() => {
            const eventName = 'ignoreNullsEvent';
            const callback1 = vitest.fn().mockReturnValue(null);
            const callback2 = vitest.fn().mockReturnValue({ data: 'important' });
            const callback3 = vitest.fn().mockReturnValue(undefined);

            Event.Listen(eventName, callback1);
            Event.Listen(eventName, callback2);
            Event.Listen(eventName, callback3);

            const result = await Event.Trigger(eventName);

            expect(result).toEqual({ data: 'important' });
        });
    });
});