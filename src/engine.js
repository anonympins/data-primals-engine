import {GameObject, Logger} from "./gameObject.js";
import {Config} from "./config.js";
import fs from 'node:fs'
import express from 'express'
import {MongoClient as InternalMongoClient} from 'mongodb'
import process from "process";
import {cookiesSecret, dbName} from "./constants.js";
import http from "http";
import cookieParser from "cookie-parser";
import requestIp from 'request-ip';
import {createModel, deleteModels, getModels, validateModelStructure} from "./modules/data.js";
import {defaultModels} from "./defaultModels.js";
import {DefaultUserProvider} from "./providers.js";
import formidableMiddleware from 'express-formidable';

// Constants
const isProduction = process.env.NODE_ENV === 'production'

// Connection URL
export const dbUrl = process.env.CI ? 'mongodb://mongodb:27017' : (process.env.MONGO_DB_URL || 'mongodb://127.0.0.1:27017');
export const MongoClient = new InternalMongoClient(dbUrl, { maxPoolSize: 20 });

// Database Name
export const MongoDatabase = MongoClient.db(dbName);


export const Engine = {
    Create: async (options) => {
        const engine = GameObject.Create("Engine");
        console.log("Creating engine", Config.Get('modules'));
        engine.addComponent(Logger);

        engine.userProvider = new DefaultUserProvider(engine);

        engine.setUserProvider = (providerInstance) => {
            engine.userProvider = providerInstance;
            engine.getComponent(Logger).info(`Custom UserProvider '${providerInstance.constructor.name}' has been set.`);
        };

        const app = express();
        // Allows you to set port in the project properties.
        app.set('port', process.env.PORT || 3000);
        app.set('engine', engine);

        app.use(formidableMiddleware({
            encoding: 'utf-8',
            uploadDir: process.cwd()+'/uploads/tmp',
            multiples: true, // req.files to be arrays of files
        }));
        app.use(cookieParser(process.env.COOKIES_SECRET || cookiesSecret));
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


        const logger = engine.getComponent(Logger);

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

        await Promise.all(Config.Get('modules', []).map(async module => {
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
            return Promise.resolve();
        });
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

            if (cb)
                await cb();

            process.on('uncaughtException', function (exception) {
                console.error(exception);
                fs.appendFile('issues.txt', JSON.stringify({ code: exception.code, message: exception.message, stack: exception.stack }), function (err) {
                    if (err){
                        throw err;
                    }
                });
                process.exit(0);
            });
        }

        engine.stop = async () => {
            await server.close();
        };

        async function setupInitialModels() {
            logger.info("Validating structures of default models...");
            const ms = Object.values(Config.Get('defaultModels', defaultModels));

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
                    logger.info('Model inserted (' + model.name + ')');
                }else
                logger.info('Model loaded (' + model.name + ')');
            }
            logger.info("All models loaded.");
        }
        engine.resetModels = async () => {
            await deleteModels();
        };
       return engine;
    }
}

