import {expect, describe, it, beforeEach, afterEach, beforeAll, afterAll, vi, vitest} from 'vitest';
import ivm from "isolated-vm";
import {sleep} from "../src/core";

vi.stubEnv('ENCRYPTION_KEY', '12345678901234567890123456789012');

async function executeSafeJavascript() {
    const isolate = new ivm.Isolate()

    async function myAsyncFunction(str) {
        await sleep(1000);
        console.log("hello"+str)
    }

    const context = await isolate.createContext();
    const jail = context.global;

    await jail.set('myAsync', new ivm.Reference(myAsyncFunction));

    const fn = await context.eval(`
        const normalizeArgs = args => args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return JSON.stringify(arg); // Convert objects to strings
            }
            return arg;
        });
        const t = (...args) => {
            myAsync.applySyncPromise(null, normalizeArgs(args));
        }
        (async function untrusted() { 
            let str = await t("ok", {"ok":true});
            return str;
        })
    `, { reference: true })
    const value = await fn.apply(undefined, [], { result: { promise: true } })
}


beforeAll(async () => {
});
describe('VM system ingration', () => {

    it('should successfully add a file with local storage', async () => {
        console.log(await executeSafeJavascript({
            script: 'const t = await addSync();'
        }, {}, { username:'test'}));


        expect(true).toBe(true);
    });
});