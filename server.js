

// ===============

//set ES modules to be loaded by the script
import process from "node:process";
import {Config, Engine, BenchmarkTool, GameObject, Logger} from "./src/index.js";

Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant", "swagger"])
Config.Set("middlewares", []);

const bench = GameObject.Create("Benchmark");
const timer = bench.addComponent(BenchmarkTool);
timer.start();

const engine = Engine.Create();

const port = process.env.PORT || 7633;
engine.start(port, async (r) => {
    const logger = engine.getComponent(Logger);

    timer.stop();
});
