
import swaggerUi from 'swagger-ui-express';

import YAML from 'yaml';

import {Logger} from "../gameObject.js";
import fs from "node:fs";
let engine, logger;

export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    const swaggerDocument = YAML.parse(fs.readFileSync(process.cwd() + '/swagger-en.yml', 'utf8'));

    engine.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

};
