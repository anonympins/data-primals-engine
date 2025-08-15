// events.test.js
import { Event } from '../src/events.js';
import {vitest} from "vitest";
import {expect, describe, it, beforeEach} from 'vitest';

describe('Event System', () => {
    beforeEach(() => {
        // Clear all events before each test to ensure a clean state
        for (const system in Event) {
            if (Event.hasOwnProperty(system) && typeof Event[system] === 'object') {
                for (const eventName in Event[system]) {
                    if (Event[system].hasOwnProperty(eventName)) {
                        delete Event[system][eventName];
                    }
                }
            }
        }
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