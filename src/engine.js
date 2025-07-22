import {GameObject, Logger} from "./gameObject.js";
import {Config} from "./config.js";
import fs from 'node:fs'
import express from 'express'
import {MongoClient as InternalMongoClient} from 'mongodb'
import process from "process";
import multipart from 'connect-multiparty';
import path from 'node:path';
import bodyParser from "body-parser";
import {cookiesSecret, dbName, install, maxDataSize} from "./constants.js";
import http from "http";
import cookieParser from "cookie-parser";
import requestIp from 'request-ip';
import {createModel, getModels, installAllPacks, validateModelStructure} from "./modules/data.js";
import {defaultModels} from "./defaultModels.js";
import {DefaultUserProvider} from "./providers.js";

// Constants
const isProduction = process.env.NODE_ENV === 'production'

// Connection URL
export const dbUrl = process.env.MONGO_DB_URL || 'mongodb://127.0.0.1:27017';
export const MongoClient = new InternalMongoClient(dbUrl, { maxPoolSize: 20 });

// Database Name
export const MongoDatabase = MongoClient.db(dbName);


export const Engine = {
    Create:  (options) => {
        const engine = GameObject.Create("Engine");
        console.log("Creating engine", Config.Get('modules'));

        engine.userProvider = new DefaultUserProvider(engine);

        engine.setUserProvider = (providerInstance) => {
            engine.userProvider = providerInstance;
            engine.getComponent(Logger).info(`Custom UserProvider '${providerInstance.constructor.name}' has been set.`);
        };

        var app = express();

// Allows you to set port in the project properties.
        app.set('port', process.env.PORT || 3000);
        app.set('engine', engine);

        app.use(bodyParser.urlencoded({extended: true, limit: 4096 }))
        app.use(bodyParser.json({ limit: maxDataSize }))
        app.use(cookieParser(isProduction ? cookiesSecret : 'secret'));

        var multipartMiddleware = multipart();
        app.use(multipartMiddleware);

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
        engine.getModule = (module) => {
            return engine._modules.find(m => m.module === module);
        };

        let server;
        engine.start = async (port, cb) =>{
    // Use connect method to connect to the server
            await MongoClient.connect();

            // Start http server
            server = http.createServer(app);

            // Server Timeout Settings
            server.timeout = 120000;
            server.headersTimeout = 20000;
            server.requestTimeout = 30000;
            server.keepAliveTimeout = 5000;

            server.listen(port);

            const importModule = async (module) => {
                const moduleA = await import(module);
                if (moduleA.onInit){
                    await moduleA.onInit(engine);
                    return {...moduleA, module};
                }else {
                    const mod = moduleA.default();
                    await mod?.onInit(engine);
                    return { ...mod, module};
                }
            };

            await Promise.all(Config.Get('modules').map(async module => {
                try {
                    if( fs.existsSync(module)){
                        return await importModule(module);
                    }else {
                        return await importModule('./modules/' + module + ".js");
                    }
                } catch (e){
                    console.log('ERROR at loading module '+ module + ' in /modules dir.'+ e);
                }
            })).then(async e => {
                engine._modules = e;
                if (cb)
                    return await cb();
                return Promise.resolve();
            });

            await setupInitialModels();

            process.on('uncaughtException', function (exception) {
                console.error(exception);
                fs.appendFile('bugs.txt', JSON.stringify({ code: exception.code, message: exception.message, stack: exception.stack }), function (err) {
                    if (err){
                        throw err;
                    }
                });
                process.exit(0);
            });
        }
        engine.addComponent(Logger);

        engine.stop = async () => {
            await server.close();
        };

        const logger = engine.getComponent(Logger);

        async function setupInitialModels() {
            logger.info("Validation des structures de modèles et insertion");
            const ms = Object.values(Config.Get('defaultModels', []));

            let dbModels = await getModels();

            for(let i = 0; i < ms.length; ++i){
                const model = ms[i];
                validateModelStructure(model);
                // Création des modèles
                if( !dbModels.find(m =>m.name === model.name) )
                {
                    model.locked = true;
                    const r = await createModel(model);
                    dbModels.push({...model, _id: r.insertedId });
                }
                else
                    logger.info('Model loaded (' + model.name + ')', {});
            }
            logger.info("All models loaded.");
        }

       return engine;
    }
}

