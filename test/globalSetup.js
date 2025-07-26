import { initEngine } from '../src/setenv.js';
import { Config } from '../src/config.js';
import {getCollection} from "../src/modules/mongodb.js";

export default async function () {

// --- Configuration initiale ---
    Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant"]);

    console.log('\n--- Global Setup: Initializing engine and database for all tests ---');
    // The initEngine function is already a singleton, so this is safe.

    // Initialisez et exportez les collections
    console.log('--- Global Setup: Complete. Engine is running. ---');
}