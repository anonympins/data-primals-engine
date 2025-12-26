
import {Logger} from "../gameObject.js";
import {MongoDatabase} from "../engine.js";
import {ObjectId} from "mongodb";
import {isLocalUser} from "../data.js";
import {Event} from "../events.js";
import {Config} from "../config.js";

export let modelsCollection, datasCollection, filesCollection, packsCollection;

export {ObjectId};

let engine, logger;
let colls= [];
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    modelsCollection = getCollection("models");
    datasCollection = getCollection(Config.Get('dataCollection', 'datas'));
    filesCollection = getCollection("files");
    packsCollection = getCollection("packs");

    colls = await MongoDatabase.listCollections().toArray();

    await Event.Trigger("OnDatabaseLoaded", "system", "calls", engine)
    logger.info("MongoDB collections loaded.");
}

export const getCollections= async (forceRefresh)=>{
    if( !forceRefresh )
        return colls;
    colls = await MongoDatabase.listCollections().toArray();
}

export const createCollection = async (coll)=>{
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
    const dataCollectionName = Config.Get('dataCollection', 'datas');
    return feat ? (isLocalUser(user) ? `${dataCollectionName}_${user._user}` :`${dataCollectionName}_${user.username}` ) : dataCollectionName;
};


// Modify existing functions to use the correct collection
export const getCollectionForUser = async (user) => {
    const collectionName = await getUserCollectionName(user);
    return getCollection(collectionName);
};


