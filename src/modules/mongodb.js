
import {Logger} from "../gameObject.js";
import {MongoDatabase} from "../engine.js";
import {ObjectId} from "mongodb";

export let modelsCollection, datasCollection, filesCollection, packsCollection;

export {ObjectId};

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


export const createCollection = async (coll)=>{
    const colls= await MongoDatabase.listCollections().toArray();
    const found =colls.find(f => f.name === coll);
    if( found){
        return getCollection(coll);
    }
    return await MongoDatabase.createCollection(coll);
}

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


