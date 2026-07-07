import path from "node:path";
import {fileURLToPath} from 'node:url';
import process from "process";
// Charger les variables d'environnement depuis le fichier .env
import dotenv from "dotenv";

// Charger le .env depuis la racine du projet appelant, et non depuis la lib.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {GameObject, Logger} from "./gameObject.js";
import {Config} from "./config.js";
import fs from 'node:fs'
import express from 'express'
import {MongoClient as InternalMongoClient} from 'mongodb'
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
import { pathToFileURL } from 'node:url';
import {validateModelStructure} from "./modules/data/data.validation.js";
import { setSafeRegex } from "./filter.js";
import safeRegexCallback from "safe-regex";
import {createModel, deleteModels, getModels, installAllPacks} from "./modules/data/data.operations.js";
// Constants

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

export const InitMongo = () => {
    const isTlsActive = !(!process.env.TLS || ["0", "false"].includes(process.env.TLS.toLowerCase()));
    const clientOptions = {
        maxPoolSize: databasePoolSize,
        authSource: 'admin'
    };
    if (isTlsActive) {
        clientOptions.tls = true;
        console.log("TLS ACTIVE");
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
    }else{
        console.log("🚨[SEC] TLS INACTIVE", dbUrl, clientOptions);
    }
    return new InternalMongoClient(dbUrl, clientOptions);
}

export let MongoClient = null;

// Database Name
export const MongoDatabase = () => {
    let dbName = Config.Get('dbName', dbNameBase);
    if( !MongoClient)
        MongoClient = InitMongo();
    console.log('SELECTING ' + dbName + " database.");
    return MongoClient.db(dbName);
}


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

        /**
         * Envoie une requête à un pair spécifique du cluster.
         * Cette fonction gère la recherche du pair, la construction de l'URL,
         * et l'ajout du header 'X-Target-Peer-Id' nécessaire pour le reverse proxy.
         * @param {string} peerId - L'ID du pair cible (ex: "vox-main-1").
         * @param {string} path - Le chemin de l'API à appeler sur le pair (ex: "/api/internal/replicate").
         * @param {object} payload - Le corps de la requête (sera converti en JSON).
         * @param {object} [options={}] - Options supplémentaires pour la requête fetch (method, headers, etc.).
         * @returns {Promise<Response>} La promesse retournée par fetch.
         */
        engine.sendToPeer = async (peerId, path, payload, options = {}) => {
            const targetPeer = engine.peers.find(p => p.id === peerId);

            if (!targetPeer) {
                const errorMessage = `[sendToPeer] Cannot send request: Peer '${peerId}' is not in the list of online peers.`;
                logger.error(errorMessage);
                return Promise.reject(new Error(errorMessage));
            }

            // Utilise le protocole défini dans les données du pair, ou https par défaut.
            const protocol = targetPeer.protocol || 'https';
            const apiPath = path.startsWith('/') ? path : `/${path}`;
            const url = `${protocol}://${targetPeer.public_domain}${apiPath}`;

            const fetchOptions = {
                method: 'POST', // POST par défaut
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Target-Peer-Id': peerId, // Le header crucial pour le routage
                    ...(options.headers || {})
                },
                body: JSON.stringify(payload)
            };

            try {
                logger.info(`[sendToPeer] Sending request to peer '${peerId}' at ${url}`);
                return await fetch(url, fetchOptions);
            } catch (error) {
                logger.error(`[sendToPeer] Network error while sending to peer '${peerId}':`, error.message);
                throw error; // Relancer l'erreur pour que l'appelant puisse la gérer
            }
        };

        engine.peers = []; // Initialise la liste des pairs

        const discoverPeers = async () => {
            const endpoint = process.env.PEERS_ENDPOINT;
            if (!endpoint) {
                logger.info("PEERS_ENDPOINT not set. Skipping peer discovery.");
                return;
            }

            try {
                logger.info(`Discovering peers from ${endpoint}...`);
                // Ajout d'un AbortController pour gérer le timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // Timeout de 30 secondes

                const response = await fetch(endpoint, { signal: controller.signal });
                clearTimeout(timeoutId); // Annuler le timeout si la requête réussit

                if (!response.ok) {
                    throw new Error(`Failed to fetch peers: ${response.status} ${response.statusText}`);
                }
                const data = await response.json(); // Parser en JSON

                if (!data || !Array.isArray(data.peers)) { // Valider la structure
                    throw new Error("Invalid peer discovery response: 'peers' array not found.");
                }

                const allOnlinePeers = data.peers.filter(p => p.status === 'online');

                // --- NOUVELLE LOGIQUE DE FILTRAGE PAR PRÉFIXE ---
                // On se base sur le nom de domaine public de l'instance pour plus de robustesse.
                if (process.env.PEER_DOMAIN) {
                    const selfHostname = process.env.PEER_DOMAIN; // ex: data-api-shard-1.primals.net
                    logger.info(`[Cluster] Self hostname identified as '${selfHostname}'.`);
                    // Extrait le préfixe du nom de domaine (ex: "data-api-shard" de "data-api-shard-1.primals.net")
                    const selfPrefixMatch = selfHostname.match(/^([a-z0-9-]+?)(?:-[0-9]+)?\./);
                    if (selfPrefixMatch) {
                        const selfPrefix = selfPrefixMatch[1];
                        logger.info(`[Cluster] Detected prefix: '${selfPrefix}'. Filtering peers...`);
                        // Ne garder que les pairs qui ont le même préfixe
                        engine.peers = allOnlinePeers.filter(p => {
                            return (p.public_domain || '').startsWith(selfPrefix);
                        });
                    } else {
                        engine.peers = allOnlinePeers; // Pas de préfixe, on garde tout
                    }
                } else {
                    engine.peers = allOnlinePeers; // Pas de selfUrl, on garde tout pour éviter une erreur
                }

                logger.info(`[Cluster] Final peer list: [${engine.peers.map(p => p.id).join(', ')}]`);
            } catch (error) {
                logger.error(`Could not discover peers from endpoint ${endpoint}:`, error.message);
                engine.peers = []; // En cas d'erreur, on s'assure que la liste est vide.
            }
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
        logger.info("Modules to load : ", JSON.stringify(allModules));
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
                }

                if (!moduleEntryPoint) {
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

            await discoverPeers();

            // Server Timeout Settings
            server.timeout = 120000;
            server.headersTimeout = 20000;
            server.requestTimeout = 30000;
            server.keepAliveTimeout = 5000;
            server.listen(port);

            await setupInitialModels();
            await installAllPacks();

            engine.get('/api/health', (req, res) => {
                res.status(200).json({
                    status: 'ok',
                    timestamp: new Date().toISOString()
                });
            });
            
            // --- CORRECTION DE L'ORDRE DES MIDDLEWARES ---
            // Les routes API doivent être enregistrées AVANT le serveur de fichiers statiques.
            await Event.Trigger("OnServerStart", "event", "system", engine);
            
            // Le serveur de fichiers statiques doit être le DERNIER middleware "catch-all".
            if( fs.existsSync('client/dist') ){
                app.use(sirv('client/dist', {
                    single: true,
                    dev: process.env.NODE_ENV === 'development'
                }));
            }

            if (cb) {
                await cb();
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
