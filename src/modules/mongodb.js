
import {Logger} from "../gameObject.js";
import {MongoDatabase} from "../engine.js"; // Assurez-vous que getMongoClientInstance est exporté par engine.js
import {ObjectId} from "mongodb";
import {isLocalUser} from "../data.js";
import {Event} from "../events.js";
import {Config} from "../config.js";
import {MongoUserProvider} from "../providers.js";

export let modelsCollection, datasCollection, filesCollection, packsCollection;

export { ObjectId };

let engine, logger, currentDb; // currentDb sera une instance de Db
let mongoClientInstance; // Référence à l'instance MongoClient
let dbStack = []; // Pile pour mémoriser les bases de données précédentes

let colls= [];
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    // Récupérer l'instance MongoClient et la DB par défaut directement depuis l'instance du moteur
    mongoClientInstance = engine.getMongoClient();
    const defaultDb = engine.getDatabase();

    await setDatabase(defaultDb); // Initialiser avec la base de données par défaut

    if (!engine.userProvider)
        engine.userProvider = new MongoUserProvider(engine);

    colls = await (currentDb.listCollections()).toArray();

    await Event.Trigger("OnDatabaseLoaded", "system", "calls", engine)
    logger.info(`MongoDB collections loaded for database '${currentDb.databaseName}'.`);
}

/**
 * Bascule la base de données active vers une nouvelle.
 * Cette fonction met à jour la variable globale `currentDb` et réinitialise toutes les références
 * de collections globales (`modelsCollection`, `datasCollection`, etc.).
 * @param {string|Db} dbIdentifier - Le nom de la base de données (chaîne de caractères) ou une instance MongoDB Db.
 */
export async function switchDatabase(dbIdentifier = null) {
    if (!mongoClientInstance) {
        throw new Error("Le client MongoDB n'est pas initialisé. Appelez onInit d'abord.");
    }

    // Si aucun identifiant n'est fourni, on revient à la base de données précédente.
    if (!dbIdentifier) {
        if (dbStack.length === 0) {
            logger.warn("[MongoDB] Tentative de retour à la base de données précédente, mais il n'y a pas d'historique.");
            return;
        }
        const previousDb = dbStack.pop();
        logger.info(`[MongoDB] Retour à la base de données précédente : '${previousDb.databaseName}'`);
        await setDatabase(previousDb);
        logger.info(`[MongoDB] Retour réussi vers la base de données : '${previousDb.databaseName}'`);
        return;
    }



    let newDb;
    if (typeof dbIdentifier === 'string') {
        newDb = mongoClientInstance.db(dbIdentifier);
    } else if (dbIdentifier && typeof dbIdentifier.collection === 'function') {
        newDb = dbIdentifier;
    } else {
        throw new Error("Identifiant de base de données invalide. Doit être une chaîne (nom de la base de données) ou une instance Db.");
    }

    if (currentDb && currentDb.databaseName === newDb.databaseName) {
        logger.debug(`[MongoDB] Déjà connecté à la base de données '${newDb.databaseName}'. Pas de changement nécessaire.`);
        return;
    }

    // Avant de basculer, on sauvegarde la base de données actuelle dans la pile.
    if (currentDb) {
        dbStack.push(currentDb);
    }

    logger.info(`[MongoDB] Basculement vers la base de données : '${newDb.databaseName}'`);
    await setDatabase(newDb);
    logger.info(`[MongoDB] Basculement réussi vers la base de données : '${newDb.databaseName}'`);
}

/**
 * Définit la base de données active actuelle et réinitialise les références de collections globales.
 * @param {Db} dbInstance - L'instance MongoDB Db à définir comme actuelle.
 */
async function setDatabase(dbInstance) {
    currentDb = dbInstance;

    // Réaffecter les variables de collection globales pour pointer vers les collections de la nouvelle base de données
    modelsCollection = currentDb.collection("models");
    datasCollection = currentDb.collection(Config.Get('dataCollection', 'datas'));
    filesCollection = currentDb.collection("files");
    packsCollection = currentDb.collection("packs");

    // Effacer et repeupler le cache des noms de collections pour la nouvelle base de données
    colls = await currentDb.listCollections().toArray();

    // Déclencher un événement pour informer les autres modules que la base de données a été changée
    await Event.Trigger("OnDatabaseSwitched", "system", "calls", currentDb.databaseName);
}

export const getCollections = async (forceRefresh)=>{
    if( !forceRefresh )
        return colls;
    colls = await currentDb.listCollections().toArray();
}

export const createCollection = async (coll)=>{
    const found =colls.find(f => f.name === coll);
    if( found){
        return getCollection(coll);
    }
    return await currentDb.createCollection(coll);
}

export const isObjectId = (id) => { // Cette fonction est une utilitaire et ne dépend pas de currentDb.
    // Elle n'a pas besoin d'être modifiée.
    return (typeof(id) === 'string' && id.match(/^[0-9a-fA-F]{24}$/));
};


export const getCollection = (str) => {
    if (typeof str !== 'string') {
        logger?.error(`[MongoDB] Tentative d'accès à une collection avec un type invalide: ${typeof str}`);
        throw new Error("Le nom de la collection doit être une chaîne de caractères.");
    }
    if (!currentDb) {
        throw new Error("La base de données MongoDB n'est pas initialisée.");
    }
    return currentDb.collection(str);
}

export const getDatabase = () => {
    return currentDb;
}

// New function to determine the collection name for a user
// Cette fonction dépend de `engine.userProvider` (initialisé dans `onInit`) et de `Config.Get`.
// Elle est déjà robuste et n'a pas besoin de modifications.
// Elle utilisera `getCollection` qui, à son tour, utilisera la `currentDb` active.
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
