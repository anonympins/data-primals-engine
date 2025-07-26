import {getRandom} from "data-primals-engine/core";
import process from "node:process";
import {Engine} from "../src/index.js";
import {MongoMemoryServer} from "mongodb-memory-server";

let ports = [], engineInstance, mongod;
export const getUniquePort = () =>{
    let d, it=0;
    do{
        d = getRandom(10000, 20000);
        ++it;
    } while( ports.includes(d) && it < 10000);
    return d;
}

// --- Utilitaires pour les tests ---
export const generateUniqueName = (baseName) => `${baseName}_${getRandom(1000, 9999)}_${Date.now()}`;
export const initEngine = async () => {
    if( engineInstance )
        return engineInstance;


    mongod = await MongoMemoryServer.create({ instance: { port: getUniquePort() } });
    process.env.DB_URL = mongod.getUri();
    process.env.DB_NAME = "engine_test";
    process.env.OPENAI_API_KEY = "O000";

    const port = process.env.PORT || getUniquePort(); // Different port for this test suite
    engineInstance = await Engine.Create();
    await engineInstance.start(port);
    return engineInstance;


}



process.on('exit', async function (exception) {
    await engineInstance.stop();
});