
import swaggerUi from 'swagger-ui-express';

import YAML from 'yaml';

import {Logger} from "../gameObject.js";
import fs from "node:fs";
let engine, logger;

export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
    
    const swaggerDocs = {
        en: YAML.parse(fs.readFileSync(process.cwd() + '/swagger-en.yml', 'utf8')),
        fr: YAML.parse(fs.readFileSync(process.cwd() + '/swagger-fr.yml', 'utf8'))
    };
    
    // Sers les assets de swagger-ui
    engine.use('/api-docs', swaggerUi.serve);
    
    // Route pour la langue par défaut (ex: /api-docs)
    engine.get('/api-docs', (req, res) => {
        return swaggerUi.setup(swaggerDocs['en'])(req, res);
    });
    
    // Route pour une langue spécifique (ex: /api-docs/fr)
    engine.get('/api-docs/:lang', (req, res) => {
        const lang = req.params.lang;
    
        // Si la langue demandée n'existe pas, on redirige vers la version anglaise.
        if (!swaggerDocs[lang]) {
            return res.redirect('/api-docs/en');
        }
    
        return swaggerUi.setup(swaggerDocs[lang])(req, res);
    });
};
