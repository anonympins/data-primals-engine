// events.test.js
import { Event } from '../src/events.js';
import {vitest} from "vitest";
import {expect, describe, it, beforeEach, beforeAll, afterAll} from 'vitest';

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

    it('should allow listening for and triggering an event', () => {
        const mockCallback = vitest.fn();
        const eventName = 'testEvent';

        Event.Listen(eventName, mockCallback);
        Event.Trigger(eventName);

        expect(mockCallback).toHaveBeenCalledTimes(1);
    });
    it('should pass arguments to the event callback', () => {
        const mockCallback = vitest.fn();
        const eventName = 'testEventWithArgs';
        const arg1 = 'hello';
        const arg2 = 123;

        Event.Listen(eventName, mockCallback, "priority", "medium");
        Event.Trigger(eventName, "priority", "medium", arg1, arg2);

        expect(mockCallback).toHaveBeenCalledTimes(1);
        expect(mockCallback).toHaveBeenCalledWith(arg1, arg2);
    });

    it('should allow removing a specific callback', () => {
        const mockCallback1 = vitest.fn();
        const mockCallback2 = vitest.fn();
        const eventName = 'testEventRemoveCallback';

        Event.Listen(eventName, mockCallback1);
        Event.Listen(eventName, mockCallback2);
        Event.RemoveCallback(eventName, mockCallback1);
        Event.Trigger(eventName);

        expect(mockCallback1).not.toHaveBeenCalled();
        expect(mockCallback2).toHaveBeenCalledTimes(1);
    });

    it('should not trigger a callback if the event is not listened to', () => {
        const mockCallback = vitest.fn();
        const eventName = 'nonExistentEvent';

        Event.Trigger(eventName);

        expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle different systems and layers', () => {
        const mockCallbackPriority = vitest.fn();
        const mockCallbackLog = vitest.fn();
        const eventName = 'testEventMultiSystem';

        Event.Listen(eventName, mockCallbackPriority, 'priority', 'high');
        Event.Listen(eventName, mockCallbackLog, 'log', 'info');

        Event.Trigger(eventName, 'priority', 'high');
        expect(mockCallbackPriority).toHaveBeenCalledTimes(1);
        expect(mockCallbackLog).not.toHaveBeenCalled();

        vitest.clearAllMocks(); // Reset mock counts

        Event.Trigger(eventName, 'log', 'info');
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
});