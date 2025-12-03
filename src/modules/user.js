import i18n from "../i18n.js";
import {MongoDatabase} from "../engine.js";
import {
    createCollection,
    getCollection,
    getCollectionForUser,
    getCollections,
    getUserCollectionName
} from "./mongodb.js";
import {isLocalUser} from "../data.js";
import {ObjectId} from "mongodb";
import {getAPILang, searchData} from "./data/index.js";
import {Logger} from "../gameObject.js";
import rateLimit from "express-rate-limit";
import ivm from "isolated-vm";
import {emailDefaultConfig} from "../constants.js";
import {safeAssignObject} from "../core.js";
import {substituteVariables} from "../filter.js";
import NodeCache from "node-cache";
import {Config} from "../config.js";
import { Event } from '../events.js';

export const userInitiator = async (req, res, next) => {

    const engine = req.app.get('engine');
    const lang = getAPILang(req.query.lang || req.headers['Accept-Language']);

    req.lang = lang;
    if(req.me)
        req.me.lang = lang;
    res.setHeader('Content-Language', lang);

    // set current lang for user
    i18n.changeLanguage(lang);

    if (await engine.userProvider.hasFeature(req.me, 'indexes')) {
        const collections = await getCollections();
        const collectionNames = collections.map(c => c.name);
        const coll = await getUserCollectionName(req.me);
        if (collectionNames.includes(coll)) {
            const collection = await createCollection(coll);
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

    const invalidatePermissionsCache = (payload) => {
        const modelsToWatch = ['role', 'permission', 'userPermission'];

        // Le payload contient le nom du modèle qui a été modifié.
        if (payload && modelsToWatch.includes(payload.modelName)) {
            logger.info(`[Permissions] Invalidating permissions cache due to change in '${payload.modelName}'.`);
            permissionsCache.flushAll();
        }
    };

    // On attache notre fonction d'invalidation aux événements système.
    Event.Listen("OnDataAdded", invalidatePermissionsCache);
    Event.Listen("OnDataEdited", invalidatePermissionsCache);
    Event.Listen("OnDataDeleted", invalidatePermissionsCache);
}
/**
 * Cache pour les permissions des utilisateurs.
 * TTL de 10 minutes, vérification toutes les 2 minutes.
 */
const permissionsCache = new NodeCache({ stdTTL: 600, checkperiod: 120, useClones: false });

/**
 * Calcule et retourne l'ensemble des permissions actives pour un utilisateur.
 * Cette fonction interne est la pierre angulaire de la nouvelle logique de permission.
 * 1. Elle récupère toutes les permissions de base issues des rôles de l'utilisateur.
 * 2. Elle applique ensuite les "exceptions" (ajouts ou retraits de permissions) qui sont valides (non expirées).
 * @param {object} user - L'objet utilisateur pour lequel calculer les permissions.
 * @returns {Promise<Map<string, object|null>>} Une Map contenant les noms des permissions actives et leur filtre associé.
 * @private
 */
export async function getUserActivePermissions(user, env = null) {
    // Clé de cache unique pour l'utilisateur et l'environnement
    const cacheKey = `${user._id.toString()}:${env || 'global'}`;
    const cachedPermissions = permissionsCache.get(cacheKey);
    if (cachedPermissions) {
        logger.debug(`[Permissions] Cache hit for user ${user.username}`);
        return cachedPermissions;
    }
    logger.debug(`[Permissions] Cache miss for user ${user.username}. Calculating permissions...`);
    const datasCollection = await getCollectionForUser(user);
    const now = new Date();
    const activePermissions = new Map();

    // --- ÉTAPE 1: Récupérer les permissions de base des rôles ---
    if (user.roles && user.roles.length > 0) {
        const roleIds = user.roles.map(id => new ObjectId(id));

        // Étape 1: Récupérer tous les IDs de permission des rôles de l'utilisateur.
        const roles = await datasCollection.find(
            { _id: { $in: roleIds }, _model: "role", _user: user._user || user.username },
            { projection: { permissions: 1, _user: 1 } }
        ).toArray();

        // Aplatir tous les tableaux de permissions en un seul et supprimer les doublons.
        const permissionIdStrings = [...new Set(roles.flatMap(role => role.permissions || []))];
        const permissionObjectIds = permissionIdStrings.map(id => new ObjectId(id));

        // Étape 2: Récupérer tous les documents de permission correspondants en une seule requête.
        const rolePermissions = await datasCollection.find(
            { _id: { $in: permissionObjectIds }, _model: "permission", _user: user._user || user.username },
            { projection: { name: 1, filter: 1 } }
        ).toArray();

        rolePermissions.forEach(p => {
            if(p.name)
                activePermissions.set(p.name, p.filter ?? null)
        });
    }

    // --- ÉTAPE 2: Appliquer les exceptions de permission ---
    const exceptionsQuery = {
        _model: "userPermission",
        user: user._id.toString(),
        _user: user._user || user.username,
        $and: [
            { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
            { $or: [{ env: { $exists: false } }, { env: env }] }
        ]
    };

    const exceptions = await datasCollection.find(exceptionsQuery, {
        projection: { permission: 1, isGranted: 1, filter: 1 }
    }).toArray();

    if (exceptions.length > 0) {
        const exceptionPermIds = exceptions.map(ex => new ObjectId(ex.permission));
        const exceptionPermsDetails = await datasCollection.find(
            { _id: { $in: exceptionPermIds }, _model: "permission", _user: user._user || user.username },
            { projection: { name: 1, filter: 1 } }
        ).toArray();

        const permDetailsMap = new Map(exceptionPermsDetails.map(p => [p._id.toString(), p]));

        for (const exception of exceptions) {
            const permDetails = permDetailsMap.get(exception.permission);
            if (!permDetails?.name) continue;

            if (exception.isGranted) {
                // Priorité 1: Le filtre défini sur l'exception elle-même.
                // Priorité 2: Le filtre défini sur la permission de base.
                const finalFilter = exception.filter ?? permDetails.filter ?? null;
                activePermissions.set(permDetails.name, finalFilter);
            } else {
                activePermissions.delete(permDetails.name);
            }
        }
    }

    // Mettre le résultat en cache avant de le retourner
    permissionsCache.set(cacheKey, activePermissions);
    return activePermissions;
}

/**
 * Vérifie si un utilisateur possède au moins une des permissions spécifiées.
 * Cette fonction utilise la nouvelle logique basée sur les rôles et les exceptions de permission.
 * @param {string|string[]} permissionNames - Le nom de la permission ou un tableau de noms.
 * @param {object} user - L'objet utilisateur.
 * @param {string|null} env - L'environnement de la permission.
 * @param {object|null} req - L'objet requête Express optionnel.
 * @returns {Promise<boolean|object>} - `false` si aucune permission n'est trouvée. Sinon, retourne le filtre de la première permission trouvée (ou `true` si aucun filtre n'est défini).
 */
export async function hasPermission(permissionNames, user, env = null, req = null) {
    // Garde la compatibilité pour les utilisateurs non-locaux (ex: système)
    if (!isLocalUser(user)) {
        const userRoles = new Set(user.roles || []);
        const requiredPermissions = Array.isArray(permissionNames) ? permissionNames : [permissionNames];
        const hasPerm = requiredPermissions.some(p => userRoles.has(p));
        // Pour les non-locaux, on ne gère pas les filtres complexes, on retourne juste true/false.
        return hasPerm ? true : false;
    }

    try {
        // 1. Obtenir l'ensemble final et à jour des permissions de l'utilisateur
        const activePermissions = await getUserActivePermissions(user, env);

        const requiredPermissions = Array.isArray(permissionNames) ? permissionNames : [permissionNames];
        // Si aucune permission n'est requise, on autorise
        if (requiredPermissions.length === 0) {
            return true;
        }

        // 2. Chercher la première permission correspondante
        for (const pName of requiredPermissions) {
            if (activePermissions.has(pName)) {
                const filter = activePermissions.get(pName);
                // Si un filtre existe, on substitue les variables
                if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
                    // Le contexte de substitution est enrichi avec des données pertinentes
                    const context = {
                        user,
                        permissionName: pName,
                        env,
                        now: new Date(),
                        req: req ? { query: req.query, body: req.body, params: req.params, ip: req.ip } : null
                    };
                    return await substituteVariables(filter, context, user);
                }
                return true; // Pas de filtre ou filtre vide, on autorise sans condition supplémentaire
            }
        }

        return false; // Aucune permission trouvée
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


export async function getEnv(user){
    const result = await searchData({ model: 'env' }, user);
    const envObject = result.data.reduce((acc, v) => {
        safeAssignObject(acc, v.name, v.value);
        return acc;
    }, {});
    return envObject;
}

export async function getSmtpConfig(user) {

    const cfg = Config.Get('emailDefaultConfig', emailDefaultConfig);

    // 1. Récupérer la configuration SMTP depuis le modèle 'env' de l'utilisateur
    const envVars = await searchData({
        model: 'env',
        filter: { $in: ['$name', ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']] }
    }, user);

    const smtpConfig = envVars.data.reduce((acc, variable) => {
        acc[variable.name.replace('SMTP_', '').toLowerCase()] = variable.value;
        return acc;
    }, {});
    if( !smtpConfig.port )
        smtpConfig.port = cfg.port;

    return smtpConfig;
}