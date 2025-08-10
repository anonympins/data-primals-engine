

// ===============

//set ES modules to be loaded by the script
import process from "node:process";
import {Config, Engine, BenchmarkTool, GameObject, Logger} from "./src/index.js";
import sirv from "sirv";
import express from "express";

Config.Set("modules", ["data", "mongodb", "file", "bucket", "workflow","user", "assistant", "swagger"])
Config.Set("middlewares", []);

const bench = GameObject.Create("Benchmark");
const timer = bench.addComponent(BenchmarkTool);
timer.start();

const app = express();
const engine = await Engine.Create({app});

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
    console.log("Server started on port " + port);
    timer.stop();

});
