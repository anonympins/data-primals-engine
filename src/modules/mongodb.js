
import process from "process";
import {MongoClient as InternalMongoClient} from "mongodb";
import {Logger} from "../gameObject.js";
import {MongoClient, MongoDatabase} from "../engine.js";
import * as tls from "node:tls";
import fs from "node:fs";

export let modelsCollection, datasCollection, filesCollection, packsCollection;

let engine, logger;
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    const isProduction = process.env.NODE_ENV === 'production'

    let ca, cert, key;
    try {
        ca = fs.readFileSync('certs/mongodb-cert.crt');
        cert = fs.readFileSync('certs/mongodb.pem');
        key = fs.readFileSync(`certs/mongodb-cert.key`);
    } catch (e) {

    }

    modelsCollection = MongoDatabase.collection("models");
    datasCollection = MongoDatabase.collection("datas");
    filesCollection = MongoDatabase.collection("files");
    packsCollection = MongoDatabase.collection("packs");

    logger.info("MongoDB collections loaded.");

};


export const isObjectId = (id) => {
    return (typeof(id) === 'string' && id.match(/^[0-9a-fA-F]{24}$/));
};


export const getCollection = (str) => {
    return MongoDatabase.collection(str);
}



// New function to determine the collection name for a user
export const getUserCollectionName = async (user) => {
    const feat = await engine.userProvider.hasFeature(user, 'indexes');
    return feat ? `datas_${user.username}` : 'datas';
};


// Modify existing functions to use the correct collection
export const getCollectionForUser = async (user) => {
    const collectionName = await getUserCollectionName(user);
    return getCollection(collectionName);
};


