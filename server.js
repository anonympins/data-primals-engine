

// ===============

//set ES modules to be loaded by the script
import process from "node:process";
import {Config} from "../data-primals-engine/src/config.js";
import {Engine} from "../data-primals-engine/src/engine.js";
import {BenchmarkTool, GameObject, Logger} from "../data-primals-engine/src/gameObject.js";
import {
    createModel, DATAS_API_TOKEN,
    getModels, getResource,
    searchData,
    validateModelStructure
} from "../data-primals-engine/src/modules/data.js";
import {availableLangs, install, langs, maxBytesPerSecondThrottleFile} from "../data-primals-engine/src/constants.js";
import fs from "node:fs";
import {
    event_on, getFileExtension,
    shuffle,
    uuidv4
} from "../data-primals-engine/src/core.js";
import {datasCollection, filesCollection, modelsCollection, packsCollection} from "../data-primals-engine/src/modules/mongodb.js";
import {translations} from "../data-primals-engine/src/i18n.js";
import {getFieldValueHash} from "../data-primals-engine/src/data.js";

import swaggerUi from 'swagger-ui-express';

import YAML from 'yaml';
import util from "node:util";
import path from "node:path";
import { getAllPacks} from "../data-primals-engine/src/packs.js";
import {middlewareAuthenticator, userInitiator} from "../data-primals-engine/src/modules/user.js";
import {defaultModels} from "../data-primals-engine/src/defaultModels.js";
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
