
import process from "process";
import {Logger} from "../gameObject.js";
import {MongoDatabase} from "../engine.js";

export let modelsCollection, datasCollection, filesCollection, packsCollection;

let engine, logger;
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    modelsCollection = getCollection("models");
    datasCollection = getCollection("datas");
    filesCollection = getCollection("files");
    packsCollection = getCollection("packs");

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


