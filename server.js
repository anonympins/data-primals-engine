

// ===============

//set ES modules to be loaded by the script
import process from "node:process";
import {Config, Engine, BenchmarkTool, GameObject, Logger} from "./src/index.js";
import path from "node:path";
import sirv from "sirv";
import {searchData} from "data-primals-engine/modules/data";
import util from "node:util";
import {middlewareAuthenticator} from "data-primals-engine/modules/user";

Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant", "swagger"])
Config.Set("middlewares", []);

const bench = GameObject.Create("Benchmark");
const timer = bench.addComponent(BenchmarkTool);
timer.start();


const engine = await Engine.Create();

if (process.argv.length === 3) {
    let arg = process.argv[2];
    if( arg === 'reset-models'){
        console.log("resetting models");
        await engine.resetModels();
    }
}

const port = process.env.PORT || 7633;
engine.start(port, async (r) => {
    const logger = engine.getComponent(Logger);
    console.log("Server started on port" + port);
    timer.stop();

    // 2. Use sirv to serve static files from 'client/dist'
    // The 'single: true' option is key for SPAs. It will serve 'index.html'
    // for any route that doesn't match a file, enabling client-side routing.
    engine.use(sirv('client/dist', {
        single: true,
        dev: process.env.NODE_ENV === 'development'
    }));
});
