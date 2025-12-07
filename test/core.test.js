import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    sleep,
    escapeRegex,
    sequential,
    isValidRegex,
    escapeHtml,
    isUnsecureKey,
    parseSafeJSON,
    isDate,
    safeAssignObject,
    debounce,
    uuidv4,
    cssProps,
    removeDir,
    wordWrap,
    getObjectHash,
    isPathRelativeTo,
    isGUID,
    isPlainObject,
    escapeRegExp,
    shuffle,
    setSeed,
    getRand,
    getRandom,
    randomDate,
    isLightColor,
    tryParseJson,
    isIsoDate,
    event_trigger,
    event_on,
    event_off,
    slugify,
    getFileExtension,
    object_equals,
    isValidPath,
    stringToHslColor,
    countKeys
} from '../src/core.js';

describe('Core Utility Functions', () => {

    describe('isPlainObject', () => {
        it('should return true for plain objects', () => {
            expect(isPlainObject({})).toBe(true);
            expect(isPlainObject({ a: 1 })).toBe(true);
        });

        it('should return false for non-plain objects or other types', () => {
            expect(isPlainObject([])).toBe(false);
            expect(isPlainObject(null)).toBe(false);
            expect(isPlainObject(new Date())).toBe(false);
            expect(isPlainObject("string")).toBe(false);
            expect(isPlainObject(123)).toBe(false);
        });
    });

    describe('slugify', () => {
        it('should convert string to a slug', () => {
            expect(slugify('Hello World!')).toBe('hello-world');
            expect(slugify('  Test avec des espaces  ')).toBe('test-avec-des-espaces');
            expect(slugify('CaractèresSpéciaux-123', '-', true)).toBe('caracteresspeciaux-123');
        });
    });
    
    describe('sleep', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('should resolve after the specified duration', async () => {
            const sleepPromise = sleep(1000);
            vi.advanceTimersByTime(1000);
            await expect(sleepPromise).resolves.toBeUndefined();
        });
    });


    describe('getObjectHash', () => {
        it('should generate a consistent hash for the same object', () => {
            const obj1 = { name: 'test', value: 1 };
            const obj2 = { value: 1, name: 'test' }; // Ordre différent
            expect(getObjectHash(obj1)).toBe(getObjectHash(obj2));
        });

        it('should generate a different hash for different objects', () => {
            const obj1 = { name: 'test', value: 1 };
            const obj2 = { name: 'test', value: 2 };
            expect(getObjectHash(obj1)).not.toBe(getObjectHash(obj2));
        });
    });
    
    describe('escapeRegex and escapeRegExp', () => {
        it('should escape special regex characters', () => {
            const specialString = '.*+?^${}()|[]\\';
            const expected = '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\';
            expect(escapeRegex(specialString)).toBe(expected);
            expect(escapeRegExp(specialString)).toBe(expected);
        });
    });

    describe('sequential', () => {
        it('should execute async tasks sequentially', async () => {
            const order = [];
            const task1 = async () => { await sleep(20); order.push(1); return 'a'; };
            const task2 = async () => { await sleep(10); order.push(2); return 'b'; };

            const results = await sequential([task1, task2]);

            expect(order).toEqual([1, 2]);
            expect(results).toEqual(['a', 'b']);
        });
    });

    describe('isValidRegex', () => {
        it('should validate correct regex strings', () => {
            expect(isValidRegex('/hello/g')).toBe(true);
            expect(isValidRegex('#[0-9]+#')).toBe(true);
        });

        it('should invalidate incorrect regex strings', () => {
            expect(isValidRegex('/[a-z/')).toBe(false); // Unmatched bracket
            expect(isValidRegex('hello')).toBe(false); // No delimiters
        });
    });

    describe('escapeHtml', () => {
        it('should escape HTML tags and dangerous protocols', () => {
            const input = '<script>alert("xss")</script><a href="javascript:void(0)">link</a>'; // Le protocole "javascript:" sera supprimé
            const expected = '&#60;script&#62;alert&#40;&#34;xss&#34;&#41;&#60;&#47;script&#62;&#60;a href&#61;&#34;void&#40;0&#41;&#34;&#62;link&#60;&#47;a&#62;';
            expect(escapeHtml(input)).toBe(expected);
        });
    });

    describe('isUnsecureKey', () => {
        it('should identify unsecure keys', () => {
            expect(isUnsecureKey('__proto__')).toBe(true);
            expect(isUnsecureKey('constructor')).toBe(true);
            expect(isUnsecureKey('prototype')).toBe(true);
            expect(isUnsecureKey('safeKey')).toBe(false);
        });
    });

    describe('parseSafeJSON', () => {
        it('should parse valid JSON', () => {
            expect(parseSafeJSON('{"a":1}')).toEqual({ a: 1 });
        });

        it('should prevent prototype pollution', () => {
            const polluted = parseSafeJSON('{"__proto__":{"polluted":true}}');
            expect(polluted.polluted).toBeUndefined();
            const obj = {};
            expect(obj.polluted).toBeUndefined();
        });
    });

    describe('isDate', () => {
        it('should return true for valid date strings and objects', () => {
            expect(isDate(new Date())).toBe(true);
            expect(isDate('2023-01-01')).toBe(true);
        });

        it('should return false for invalid dates', () => {
            expect(isDate('not a date')).toBe(false);
            expect(isDate(null)).toBe(false);
        });
    });

    describe('safeAssignObject', () => {
        it('should assign property for a safe key', () => {
            const obj = {};
            safeAssignObject(obj, 'a', 1);
            expect(obj.a).toBe(1);
        });

        it('should not assign property for an unsecure key', () => {
            const obj = {};
            safeAssignObject(obj, '__proto__', { polluted: true });
            expect(obj.polluted).toBeUndefined();
        });
    });

    describe('debounce', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('should call the function only once after the delay', () => {
            const spy = vi.fn();
            const debounced = debounce(spy, 500);

            debounced();
            debounced();
            debounced();

            vi.advanceTimersByTime(500);
            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    describe('uuidv4', () => {
        it('should generate a valid v4 UUID', () => {
            const uuid = uuidv4();
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuid).toMatch(uuidV4Regex);
        });
    });

    describe('cssProps', () => {
        it('should convert a CSS string to a style object', () => {
            const css = 'background-color: red; font-size: 16px;';
            const expected = { backgroundColor: 'red', fontSize: '16px' };
            expect(cssProps(css)).toEqual(expected);
        });
    });

    describe('wordWrap', () => {
        it('should wrap a long string at a specified width', () => {
            const str = 'this is a long string to be wrapped';
            const wrapped = wordWrap(str, 10);
            expect(wrapped).toBe('this is a\nlong\nstring to\nbe wrapped');
        });
    });

    describe('isPathRelativeTo', () => {
        it('should correctly identify relative paths', () => {
            expect(isPathRelativeTo('/a/b/c', '/a/b')).toBe(true);
            expect(isPathRelativeTo('/a/d', '/a/b')).toBe(false);
            expect(isPathRelativeTo('/a/b', '/a/b/c')).toBe(false);
        });
    });

    describe('isGUID', () => {
        it('should validate correct GUIDs', () => {
            expect(isGUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        });
        it('should invalidate incorrect GUIDs', () => {
            expect(isGUID('not-a-guid')).toBe(false);
        });
    });

    describe('shuffle', () => {
        it('should contain the same elements after shuffling', () => {
            const original = [1, 2, 3, 4, 5];
            const shuffled = [...original];
            shuffle(shuffled);
            expect(shuffled).toHaveLength(original.length);
            expect(shuffled.sort()).toEqual(original.sort());
        });
    });

    describe('Seeded Random', () => {
        it('should produce consistent random numbers for the same seed', () => {
            setSeed(12345);
            const rand1 = getRand();
            const rand2 = getRand();

            setSeed(12345);
            const rand3 = getRand();
            const rand4 = getRand();

            expect(rand1).toBe(rand3);
            expect(rand2).toBe(rand4);
            expect(rand1).not.toBe(rand2);
        });
    });

    describe('isLightColor', () => {
        it('should identify light and dark colors', () => {
            expect(isLightColor('#FFFFFF')).toBe(true);
            expect(isLightColor('#000000')).toBe(false);
            expect(isLightColor('#f0f0f0')).toBe(true);
            expect(isLightColor('#3498db')).toBe(false); // primary-color from scss
        });
    });

    describe('tryParseJson', () => {
        it('should parse valid JSON strings', () => {
            expect(tryParseJson('{"a": 1}')).toEqual({ a: 1 });
        });
        it('should return null for invalid JSON strings', () => {
            expect(tryParseJson('{"a": 1')).toBeNull();
            expect(tryParseJson('not json')).toBeNull();
        });
    });

    describe('isIsoDate', () => {
        it('should validate correct ISO date strings', () => {
            expect(isIsoDate('2023-10-26T10:00:00.000Z')).toBe(true);
        });
        it('should invalidate incorrect ISO date strings', () => {
            expect(isIsoDate('2023-10-26')).toBe(false);
            expect(isIsoDate(new Date().toString())).toBe(false);
        });
    });

    describe('event system', () => {
        beforeEach(() => {
            event_off('test');
        });
        it('should trigger a registered event', () => {
            const spy = vi.fn();
            event_on('test', spy);
            event_trigger('test', 'arg1');
            expect(spy).toHaveBeenCalledWith('arg1');
        });
    });

    describe('getFileExtension', () => {
        it('should return the file extension', () => {
            expect(getFileExtension('file.txt')).toBe('txt');
            expect(getFileExtension('archive.tar.gz')).toBe('gz');
            expect(getFileExtension('noextension')).toBe('');
        });
    });

    describe('object_equals', () => {
        it('should correctly compare objects', () => {
            expect(object_equals({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
            expect(object_equals({ a: 1 }, { a: 2 })).toBe(false);
        });
    });

    describe('stringToHslColor', () => {
        it('should generate a consistent HSL color string', () => {
            expect(stringToHslColor('test')).toBe('hsl(58, 70%, 55%)');
        });
    });

    describe('countKeys', () => {
        it('should count keys in nested objects and arrays', () => {
            const obj = { a: 1, b: { c: 2, d: [1, { e: 3 }] } };
            expect(countKeys(obj)).toBe(5);
        });
    });

});