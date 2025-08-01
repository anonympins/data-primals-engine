import i18n from "../i18n.js";
import {MongoDatabase} from "../engine.js";
import {getCollection, getCollectionForUser, getUserCollectionName} from "./mongodb.js";
import {isLocalUser} from "../data.js";
import {ObjectId} from "mongodb";
import {getAPILang} from "./data.js";
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

export async function hasPermission(permissionNames, user) {
    if( !isLocalUser(user)){
        return user.roles?.some(f => permissionNames.includes(f));
    }
    try {
        // Si on a une string on le transforme en tableau.
        const permissionNamesArray = Array.isArray(permissionNames) ? permissionNames : [permissionNames];
        const collection = await getCollectionForUser(user);

        const job = [
            {
                $lookup: {
                    from: 'datas',
                    let: { rolesIds: (user.roles ||[]).map(m => new ObjectId(m)) },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $in: ['$_id', '$$rolesIds'] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: 'datas',
                                let: { rolePermissions: {
                                    "$map": {
                                        "input": "$permissions",
                                        "in": { "$toObjectId": "$$this" }
                                    }
                                } },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $in: ['$_id', '$$rolePermissions'] }
                                                ]
                                            }
                                        }
                                    },
                                    { $limit: 1 }
                                ],
                                as: 'permissions'
                            }
                        },
                        { $unwind: { path: '$permissions', preserveNullAndEmptyArrays: true } }
                    ],
                    as: 'roles'
                }
            },
            { $unwind: { path: '$roles', preserveNullAndEmptyArrays: true } },
            { $match: { 'roles.permissions.name': { $in: permissionNamesArray } } }, // Match if permissions.name in array
            { $limit: 1 },
            { $project: { _id: 0, hasPermission: { $cond: [{ $in: ['$roles.permissions.name', permissionNamesArray] }, true, false] } } } //check the value
        ];
        const result = await collection.aggregate(job).toArray();
        return result.length === 1 && result[0].hasPermission;
    } catch (e) {
        logger.error(e);
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
