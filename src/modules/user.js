import i18n from "../i18n.js";
import {MongoDatabase} from "../engine.js";
import {getCollection, getCollectionForUser, getUserCollectionName} from "./mongodb.js";
import {isLocalUser} from "../data.js";
import {ObjectId} from "mongodb";
import {getAPILang} from "./data/index.js";
import {Logger} from "../gameObject.js";
import rateLimit from "express-rate-limit";

export const userInitiator = async (req, res, next) => {

    const lang = getAPILang(req.query.lang || req.headers['Accept-Language']);

    req.lang = lang;
    if(req.me)
        req.me.lang = lang;
    res.setHeader('Content-Language', lang);

    // set current lang for user
    i18n.changeLanguage(lang);

    if (await engine.userProvider.hasFeature(req.me, 'indexes')) {
        const collections = await MongoDatabase.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        const coll = await getUserCollectionName(req.me);
        if (collectionNames.includes(coll)) {
            const collection = await MongoDatabase.createCollection(coll);
            const indexes = await collection.indexes();
            if (!indexes.find(i => i.name === 'genericPartialIndex')) {
                await collection.createIndex({"$**": 1}, {
                    name: 'genericPartialIndex',
                    partialFilterExpression: {
                        _model: 1,
                        _user: 1
                    }
                });
            }
            if (!await collection.indexExists("_hash")) {
                await collection.createIndex({_hash: 1});
            }
            if (!indexes.find(i => i.name === 'modelUserIndex')) {
                await collection.createIndex({_model: 1, _user: 1}, {name: 'modelUserIndex'});
            }
        }
    }
    next();
}


export const middlewareAuthenticator = async (req, res, next) => {
    const engine = req.app.get('engine');
    if (!engine || !engine.userProvider) {
        // Sécurité pour s'assurer que le moteur est bien configuré
        return res.status(500).json({ error: "UserProvider not configured in engine." });
    }

    try {
        // 1. On demande au provider (votre PrimalsUserProvider) d'identifier l'utilisateur
        await engine.userProvider.initiateUser(req);

        // 2. On vérifie simplement si le provider a attaché un utilisateur
        if (req.me) {
            // L'utilisateur est authentifié, on continue
            return next();
        } else {
            // Le provider n'a trouvé aucun utilisateur valide
            return res.status(401).json({ error: "Authentication required" });
        }
    } catch (e) {
        // Le provider peut lever une erreur (ex: token invalide, compte non vérifié)
        return res.status(401).json({ error: e.message || "Authentication failed" });
    }
};

export const generateLimiter = rateLimit({
    windowMs: 7000,
    limit: 1,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return !!req.fields?.confirmedAction;
    }
});


let logger,engine;
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
}
/**
 * Calcule et retourne l'ensemble des permissions actives pour un utilisateur.
 * Cette fonction interne est la pierre angulaire de la nouvelle logique de permission.
 * 1. Elle récupère toutes les permissions de base issues des rôles de l'utilisateur.
 * 2. Elle applique ensuite les "exceptions" (ajouts ou retraits de permissions) qui sont valides (non expirées).
 * @param {object} user - L'objet utilisateur pour lequel calculer les permissions.
 * @returns {Promise<Set<string>>} Un Set contenant les noms de toutes les permissions actives.
 * @private
 */
export async function getUserActivePermissions(user) {
    const datasCollection = await getCollectionForUser(user);
    const now = new Date();
    const activePermissions = new Set();

    // --- ÉTAPE 1: Récupérer les permissions de base des rôles ---
    if (user.roles && user.roles.length > 0) {
        const roleIds = user.roles.map(id => new ObjectId(id));

        const rolePermissions = await datasCollection.aggregate([
            { $match: { _id: { $in: roleIds }, _model: "role" } },
            { $unwind: "$permissions" },
            { $addFields: { "permissionId": { "$toObjectId": "$permissions" } } },
            {
                $lookup: {
                    from: datasCollection.collectionName, // Utiliser la même collection
                    localField: "permissionId",
                    foreignField: "_id",
                    as: "permissionDoc"
                }
            },
            { $unwind: "$permissionDoc" },
            { $group: { _id: "$permissionDoc.name" } }
        ]).toArray();

        rolePermissions.forEach(p => p._id && activePermissions.add(p._id));
    }

    // --- ÉTAPE 2: Appliquer les exceptions de permission ---
    const exceptions = await datasCollection.aggregate([
        {
            $match: {
                _model: "userPermission",
                user: user._id, // Pas besoin de convertir en ObjectId si c'est déjà une string
                $or: [
                    { expiresAt: { $exists: false } },
                    { expiresAt: { $gt: now } }
                ]
            }
        },
        {
            $lookup: {
                from: datasCollection.collectionName,
                let: { permissionId: "$permission" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: [
                                    "$_id",
                                    { $toObjectId: "$$permissionId" } // Conversion ici
                                ]
                            }
                        }
                    },
                    { $project: { name: 1 } }
                ],
                as: 'permissionDoc'
            }
        },
        { $unwind: '$permissionDoc' }
    ]).toArray();

    // Appliquer les exceptions
    for (const exception of exceptions) {
        const permissionName = exception.permissionDoc?.name;
        if (!permissionName) continue;

        if (exception.isGranted) {
            activePermissions.add(permissionName);
        } else {
            activePermissions.delete(permissionName);
        }
    }

    return activePermissions;
}

/**
 * Vérifie si un utilisateur possède au moins une des permissions spécifiées.
 * Cette fonction utilise la nouvelle logique basée sur les rôles et les exceptions de permission.
 * @param {string|string[]} permissionNames - Le nom de la permission ou un tableau de noms.
 * @param {object} user - L'objet utilisateur authentifié.
 * @returns {Promise<boolean>} - True si l'utilisateur a la permission, sinon false.
 */
export async function hasPermission(permissionNames, user) {
    // Garde la compatibilité pour les utilisateurs non-locaux (ex: système)
    if (!isLocalUser(user)) {
        const userRoles = new Set(user.roles || []);
        const requiredPermissions = Array.isArray(permissionNames) ? permissionNames : [permissionNames];
        return requiredPermissions.some(p => userRoles.has(p));
    }

    try {
        const requiredPermissions = Array.isArray(permissionNames) ? permissionNames : [permissionNames];
        // Si aucune permission n'est requise, on autorise
        if (requiredPermissions.length === 0) {
            return true;
        }

        // 1. Obtenir l'ensemble final et à jour des permissions de l'utilisateur
        const activePermissions = await getUserActivePermissions(user);

        // 2. Vérifier si au moins une des permissions requises est dans l'ensemble des permissions actives
        return requiredPermissions.some(pName => activePermissions.has(pName));

    } catch (e) {
        logger.error("Erreur lors de la vérification des permissions :", e);
        return false;
    }
}


/**
 * Calcule l'utilisation totale de l'espace de stockage pour un utilisateur en octets.
 * Cela inclut la taille des documents dans sa collection de données et la taille de ses fichiers uploadés.
 * @param {object} user - L'objet utilisateur.
 * @returns {Promise<number>} - L'utilisation totale en octets.
 */
export async function calculateTotalUserStorageUsage(user) {
    const userId = user._user || user.username;
    const datasCollection = await getCollectionForUser(user);
    const filesCollection = getCollection("files");

    // Pipeline pour calculer la taille des documents de données
    const dataSizePipeline = [
        { $match: { _user: userId } },
        {
            $group: {
                _id: null, // Grouper tous les documents ensemble
                totalSize: { $sum: { $bsonSize: "$$ROOT" } } // Sommer la taille BSON de chaque document
            }
        }
    ];

    // Pipeline pour calculer la taille des fichiers
    const fileSizePipeline = [
        // Le champ est 'user' dans la collection 'files' selon votre fonction addFile
        { $match: { user: userId, _model: "privateFile" } },
        {
            $group: {
                _id: null,
                totalSize: { $sum: "$size" }
            }
        }
    ];

    // Exécuter les deux calculs en parallèle pour plus d'efficacité
    const [dataResult, fileResult] = await Promise.all([
        datasCollection.aggregate(dataSizePipeline).toArray(),
        filesCollection.aggregate(fileSizePipeline).toArray()
    ]);

    const dataSize = dataResult.length > 0 ? dataResult[0].totalSize : 0;
    const filesSize = fileResult.length > 0 ? fileResult[0].totalSize : 0;

    logger.debug(`[Storage] User ${userId}: Data size = ${dataSize} bytes, Files size = ${filesSize} bytes. Total = ${dataSize + filesSize} bytes.`);
    return dataSize + filesSize;
}
