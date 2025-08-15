
import { stopEngine } from '../src/setenv.js';

export default async function () {
    console.log('\n--- Global Teardown: Stopping engine and database ---');

    await stopEngine();
    console.log('--- Global Teardown: Cleanup complete. ---');
}