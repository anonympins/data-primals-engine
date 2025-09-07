import {GameObject, Logger} from "./gameObject.js";
import {Config} from "./config.js";
import fs from 'node:fs'
import express from 'express'
import {MongoClient as InternalMongoClient} from 'mongodb'
import process from "process";
import {
    cookiesSecret,
    databasePoolSize,
    dbName as dbNameBase,
    tlsAllowInvalidCertificates, tlsAllowInvalidHostnames
} from "./constants.js";
import http from "http";
import cookieParser from "cookie-parser";
import requestIp from 'request-ip';
import {defaultModels} from "./defaultModels.js";
import {DefaultUserProvider} from "./providers.js";
import formidableMiddleware from 'express-formidable';
import sirv from "sirv";
import * as tls from "node:tls";
import {Event} from "./events.js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from 'node:url';
import {validateModelStructure} from "./modules/data/data.validation.js";
import { setSafeRegex } from "./filter.js";
import safeRegexCallback from "safe-regex";
import {createModel, deleteModels, getModels, installAllPacks} from "./modules/data/data.operations.js";
// Constants

// On définit __dirname pour obtenir le chemin absolu du répertoire courant,
// ce qui est la méthode standard en ES Modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbName = Config.Get('dbName', dbNameBase);
let caFile, certFile, keyFile;
try {
    if (process.env.CA_CERT)
        caFile = fs.readFileSync(process.env.CA_CERT);
} catch (e) {}
try {
    if (process.env.CERT)
        certFile = fs.readFileSync(process.env.CERT);
}catch (e) {}
try{
    if (process.env.CERT_KEY)
        keyFile = fs.readFileSync(process.env.CERT_KEY);
} catch (e) {}

const secureContext = tls.createSecureContext({
    ca: caFile, cert: certFile, key: keyFile
});

export const dbUrl = process.env.CI ? 'mongodb://mongodb:27017' : (process.env.MONGO_DB_URL || 'mongodb://127.0.0.1:27017');

const isTlsActive = !(!process.env.TLS || ["0", "false"].includes(process.env.TLS.toLowerCase()));

const clientOptions = {
    maxPoolSize: databasePoolSize
};

// We add TLS options if enabled
if (isTlsActive) {
    clientOptions.tls = true;

    // is mTLS ? (client certificate required instead of password)
    if (process.env.CERT) {
        clientOptions.secureContext = tls.createSecureContext({
            ca: fs.readFileSync(process.env.CA_CERT),
            cert: fs.readFileSync(process.env.CERT),
            key: fs.readFileSync(process.env.CERT_KEY)
        });
    }else {
        // Path to the authority certificate
        if (process.env.CA_CERT) {
            clientOptions.tlsCAFile = process.env.CA_CERT;
        }
        // Path to the certificate key
        if (process.env.CERT_KEY) {
            clientOptions.tlsCertificateKeyFile = process.env.CERT_KEY;
        }
    }
    if (tlsAllowInvalidCertificates) {
        clientOptions.tlsAllowInvalidCertificates = true;
        console.warn("🚨 [SECURITY WARNING] tlsAllowInvalidCertificates is ON. Server certificate will not be validated.");
    }
    if (tlsAllowInvalidHostnames) {
        clientOptions.tlsAllowInvalidHostnames = true;
        console.warn("🚨 [SECURITY WARNING] tlsAllowInvalidHostnames is ON. Server hostname will not be validated.");
    }
}

export const MongoClient = new InternalMongoClient(dbUrl, clientOptions);


// Database Name
export const MongoDatabase = MongoClient.db(dbName);


export const Engine = {
    Create: async (options = { app : null}) => {
        // On injecte la dépendance safe-regex dans le module de filtrage au tout début.
        setSafeRegex(safeRegexCallback);

        const engine = GameObject.Create("Engine");
        console.log("Creating engine", Config.Get('modules'));
        const logger = engine.addComponent(Logger);

        // Expose the Event bus on the engine instance for dependency injection
        engine.Event = Event;

        engine.userProvider = new DefaultUserProvider(engine);

        engine.setUserProvider = (providerInstance) => {
            engine.userProvider = providerInstance;
            logger.info(`Custom UserProvider '${providerInstance.constructor.name}' has been set.`);
        };

        if (!options.app) {
            options.app = express();
        }

        const { app }  = options;
        // Allows you to set port in the project properties.
        app.set('port', process.env.PORT || 3000);
        app.set('engine', engine);

        app.use(formidableMiddleware({
            encoding: 'utf-8',
            uploadDir: process.cwd()+'/uploads/tmp',
            multiples: true // req.files to be arrays of files
        }));

        const cs = Config.Get('cookieSecret', process.env.COOKIES_SECRET || cookiesSecret)
        app.use(cookieParser(cs));
        app.use(requestIp.mw())

        engine.use = (...args) => {
            return app.use(...args);
        }
        engine.post = (...args) => {
            return app.post(...args);
        };
        engine.get = (...args) => {
            return app.get(...args);
        };
        engine.delete = (...args) => {
            return app.delete(...args);
        };
        engine.patch = (...args) => {
            return app.patch(...args);
        };
        engine.put = (...args) => {
            return app.put(...args);
        };
        engine.all = (...args) => {
            return app.all(...args);
        };
        engine.getModule = (module) => {
            return engine._modules.find(m => m.module === module);
        };

        const importAndPrepareModule = async (moduleEntryPoint, moduleName) => {
            const moduleA = await import(moduleEntryPoint);

            let moduleInstance = null;
            let onInitFunction = null;

            // Cas 1: `export default { onInit }`
            if (moduleA.default && typeof moduleA.default.onInit === 'function') {
                moduleInstance = moduleA.default;
                onInitFunction = moduleA.default.onInit;
            }
            // Cas 2: `export async function onInit() {}`
            else if (typeof moduleA.onInit === 'function') {
                moduleInstance = moduleA;
                onInitFunction = moduleA.onInit;
            }

            if (moduleInstance) {
                // On stocke la fonction onInit pour plus tard et on retourne l'instance
                // avec le nom court du module.
                return { ...moduleInstance, onInit: onInitFunction, module: moduleName };
            }

            logger.warn(`Module loaded from ${moduleEntryPoint} does not export an onInit function or a default object with onInit.`);
            return null;
        };

        engine._modules = [];

        // On charge uniquement les modules spécifiés dans la configuration.
        const allModules = Config.Get('modules', []);
        const loadedModules = []; // Liste temporaire pour la phase 1
        for (const moduleIdentifier of allModules) {
            let moduleEntryPoint = null;
            const moduleName = path.basename(moduleIdentifier, '.js');
            try {
                // 1. Tenter de résoudre comme un chemin (relatif au projet ou absolu)
                const externalPath = path.resolve(process.cwd(), moduleIdentifier);
                if (fs.existsSync(externalPath)) {
                    const stats = fs.statSync(externalPath);
                    if (stats.isDirectory()) {
                        // C'est un répertoire, on cherche le point d'entrée
                        const indexJsPath = path.join(externalPath, 'index.js');
                        const moduleJsPath = path.join(externalPath, `${moduleName}.js`);
                        if (fs.existsSync(indexJsPath)) moduleEntryPoint = pathToFileURL(indexJsPath).href;
                        else if (fs.existsSync(moduleJsPath)) moduleEntryPoint = pathToFileURL(moduleJsPath).href;
                    } else {
                        // C'est un fichier
                        moduleEntryPoint = pathToFileURL(externalPath).href;
                    }
                } else {
                    // 2. Si ce n'est pas un chemin, tenter de résoudre comme un module interne
                    const internalDir = path.resolve(__dirname, 'modules', moduleIdentifier);
                    const internalFile = path.resolve(__dirname, 'modules', `${moduleIdentifier}.js`);

                    if (fs.existsSync(internalDir) && fs.statSync(internalDir).isDirectory()) {
                        // C'est un répertoire de module interne
                        const indexJsPath = path.join(internalDir, 'index.js');
                        const moduleJsPath = path.join(internalDir, `${moduleIdentifier}.js`);
                        if (fs.existsSync(indexJsPath)) moduleEntryPoint = pathToFileURL(indexJsPath).href;
                        else if (fs.existsSync(moduleJsPath)) moduleEntryPoint = pathToFileURL(moduleJsPath).href;
                    } else if (fs.existsSync(internalFile)) {
                        // C'est un fichier de module interne
                        moduleEntryPoint = pathToFileURL(internalFile).href;
                    }
                }

                if (moduleEntryPoint) {
                    const loadedModule = await importAndPrepareModule(moduleEntryPoint, moduleName);
                    if (loadedModule) {
                        loadedModules.push(loadedModule);
                    }
                } else {
                    logger.warn(`Could not resolve or find an entry point for module '${moduleIdentifier}'.`);
                }
            } catch (e) {
                logger.error(`Could not load module '${moduleName}' (${moduleIdentifier}):`, e.stack);
            }
        }

        // Phase 2: Enregistrer et Initialiser tous les modules chargés
        engine._modules = loadedModules; // On enregistre tous les modules dans le moteur
        for (const moduleInstance of engine._modules) {
            if (typeof moduleInstance.onInit === 'function') {
                logger.info(`Initializing module '${moduleInstance.module}'...`);
                await moduleInstance.onInit(engine);
                logger.info(`Module '${moduleInstance.module}' loaded and initialized.`);
            }
        }

        let server;

        engine.start = async (port, cb) =>{
            // Use connect method to connect to the server

            // Start http server
            server = http.createServer(app);

            // Server Timeout Settings
            server.timeout = 120000;
            server.headersTimeout = 20000;
            server.requestTimeout = 30000;
            server.keepAliveTimeout = 5000;

            server.listen(port);

            await setupInitialModels();
            await installAllPacks();

            if (cb)
                await cb();

            engine.get('/api/health', (req, res) => {
                res.status(200).json({
                    status: 'ok',
                    timestamp: new Date().toISOString()
                });
            });

            if( fs.existsSync('client/dist') ){
                app.use(sirv('client/dist', {
                    single: true,
                    dev: process.env.NODE_ENV === 'development'
                }));
            }

            process.on('uncaughtException', function (exception) {
                console.error(exception);
                fs.appendFile('issues.txt', JSON.stringify({ code: exception.code, message: exception.message, stack: exception.stack }), function (err) {
                    if (err){
                        throw err;
                    }
                });
                process.exit(1);
            });

            await Event.Trigger("OnServerStart", "event", "system", engine);
        }

        engine.stop = async () => {
            await server.close();
            await Event.Trigger("OnServerStop", "event", "system", engine);
        };

        async function setupInitialModels() {
            logger.info("Validating structures of default models...");
            const ms = Object.values(Config.Get('defaultModels', defaultModels));

            let dbModels = await getModels();

            for(let i = 0; i < ms.length; ++i){
                const model = ms[i];
                await validateModelStructure(model);
                // Création des modèles
                if( !dbModels.find(m =>m.name === model.name) )
                {
                    model.locked = true;
                    const r = await createModel(model);
                    dbModels.push({...model, _id: r.insertedId });
                    logger.info(`Model ${model.name} inserted.`);
                }else
                    logger.info(`Model ${model.name} loaded`);
            }
            logger.info("All models loaded.");
            await Event.Trigger("OnModelsLoaded", "event", "system", engine, dbModels);
        }
        engine.resetModels = async () => {
            await deleteModels();
            await Event.Trigger("OnModelsDeleted", "event", "system", engine);
        };
        return engine;
    }
}
