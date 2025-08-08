import process from "node:process";
import AWS from "aws-sdk";
import fs from "node:fs";
import path from "node:path";
import {decryptValue, encryptValue} from "../data.js";
import {loadFromDump, validateRestoreRequest} from "./data.js";
import {Logger} from "../gameObject.js";
import {middlewareAuthenticator, userInitiator} from "./user.js";
import {awsDefaultConfig, maxBytesPerSecondThrottleData} from "../constants.js";
import crypto from "node:crypto";
import i18n from "../../src/i18n.js";
import {sendEmail} from "../email.js";
import {throttleMiddleware} from "../middlewares/throttle.js";
import {getCollectionForUser} from "./mongodb.js";

const restoreRequests = {};

export const requestRestore = async (user, lang) => {
    // On génère deux tokens uniques
    const fullRestoreToken = crypto.randomBytes(32).toString('hex');
    const modelsRestoreToken = crypto.randomBytes(32).toString('hex');
    const expiration = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    restoreRequests[user?.username] = {
        fullToken: fullRestoreToken,
        modelsToken: modelsRestoreToken,
        expiresAt: expiration
    };

    i18n.changeLanguage(lang);

    try {
        // On utilise une nouvelle clé de traduction pour l'email
        await sendEmail(user.email, {
            title: i18n.t('email.backup.restoreRequest.subject'),
            content: i18n.t('email.backup.restoreRequest.content', {
                user: user?.username,
                fullToken: fullRestoreToken,
                modelsToken: modelsRestoreToken
            })
        });
        return { message: 'Restore links sent to your email.' };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Error sending email.');
    }
};

const getDefaultS3Config = () => {
    return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Utiliser la clé déchiffrée
        region: process.env.AWS_REGION || awsDefaultConfig.region,
        bucketName: process.env.AWS_BUCKET || awsDefaultConfig.bucketName
    };
}

/**
 * Récupère la configuration S3 depuis les variables d'environnement de l'utilisateur en base de données.
 * @param {object} user - L'objet utilisateur.
 * @returns {Promise<object>} - Un objet contenant la configuration S3 trouvée pour l'utilisateur.
 */
async function _getUserS3ConfigFromDb(user) {
    if (!user || !user.username) {
        return {}; // Pas d'utilisateur, pas de configuration spécifique.
    }

    try {
        const collection = await getCollectionForUser(user);
        const userEnvVars = await collection.find({
            _model: 'env',
            _user: user.username,
            // On ne cherche que les clés pertinentes pour optimiser la requête
            key: { $in: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_BUCKET_NAME'] }
        }).toArray();

        // Transforme le tableau de documents [{key, value}, ...] en un objet de configuration.
        return userEnvVars.reduce((config, envVar) => {
            if (envVar.key === 'AWS_ACCESS_KEY_ID') config.accessKeyId = envVar.value;
            if (envVar.key === 'AWS_SECRET_ACCESS_KEY') config.secretAccessKey = envVar.value; // La clé est déjà chiffrée en BDD
            if (envVar.key === 'AWS_REGION') config.region = envVar.value;
            if (envVar.key === 'AWS_BUCKET_NAME') config.bucketName = envVar.value;
            return config;
        }, {});

    } catch (error) {
        logger.error(`Failed to fetch user S3 config from DB for ${user.username}:`, error);
        return {}; // Retourne un objet vide en cas d'erreur pour utiliser le fallback.
    }
}

/**
 * Récupère la configuration S3 effective en priorisant celle de l'utilisateur
 * puis en se rabattant sur la configuration globale de l'environnement.
 * C'est la fonction à utiliser pour toute opération S3.
 * @param {object} user - L'objet utilisateur.
 * @returns {Promise<object>} - L'objet de configuration S3 final.
 */
export async function getUserS3Config(user) {
    // 1. Récupérer la configuration globale par défaut
    const defaultConfig = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || awsDefaultConfig.region,
        bucketName: process.env.AWS_BUCKET_NAME || awsDefaultConfig.bucketName
    };

    // 2. Récupérer la configuration spécifique de l'utilisateur
    const userConfig = await _getUserS3ConfigFromDb(user);

    if( userConfig.bucketName && userConfig.accessKeyId && userConfig.secretAccessKey) {
        // 3. Fusionner les configurations, en donnant la priorité à celle de l'utilisateur
        return {
            accessKeyId: userConfig.accessKeyId || defaultConfig.accessKeyId,
            secretAccessKey: userConfig.secretAccessKey || defaultConfig.secretAccessKey,
            region: userConfig.region || defaultConfig.region,
            bucketName: userConfig.bucketName || defaultConfig.bucketName
        };
    }
    console.log({defaultConfig})
    return defaultConfig;
}
const getS3Client = (s3Config) => {

    const decryptedSecretAccessKey = decryptValue(s3Config.secretAccessKey);

    const defaultConfig = getDefaultS3Config();

    return new AWS.S3({
        ...defaultConfig,
        accessKeyId: s3Config.accessKeyId || defaultConfig.accessKeyId,
        secretAccessKey: decryptedSecretAccessKey ? decryptedSecretAccessKey : defaultConfig.secretAccessKey,
        region: s3Config.region || defaultConfig.region,
        bucket: s3Config.bucketName || defaultConfig.bucketName
    });
};

export const uploadToS3 = async (s3Config, filePath, remoteFilename) => {
    const s3 = getS3Client(s3Config);
    const fileContent = fs.readFileSync(filePath);
    const bucketPath = s3Config.pathPrefix ? `${s3Config.pathPrefix.replace(/\/$/, "")}/${remoteFilename}` : remoteFilename;

    if( !s3.accessKeyId || !s3.secretAccessKey || !s3.bucketName) {
        throw new Error('Missing S3 configuration');
    }

    const params = {
        Bucket: s3Config.bucketName,
        Key: bucketPath,
        Body: fileContent
    };

    try {
        const data = await s3.upload(params).promise();
        console.log(`File uploaded successfully to S3. ${data.Location}`);
        return data;
    } catch (err) {
        console.error("Error uploading to S3:", err);
        throw err;
    }
};

export const listS3Backups = async (s3Config) => {
    const s3 = getS3Client(s3Config);
    const bucketPathPrefix = s3Config.pathPrefix ? `${s3Config.pathPrefix.replace(/\/$/, "")}/` : '';

    const params = {
        Bucket: s3Config.bucketName,
        Prefix: bucketPathPrefix
    };

    try {
        const data = await s3.listObjectsV2(params).promise();
        return data.Contents.map(item => ({
            key: item.Key,
            lastModified: item.LastModified,
            size: item.Size,
            // Tu peux extraire le nom du fichier et le timestamp de la clé si nécessaire
            filename: path.basename(item.Key),
            timestamp: parseInt(path.basename(item.Key).split('_').pop().split('.')[0], 10) || 0
        })).sort((a, b) => b.timestamp - a.timestamp); // Trier par timestamp descendant
    } catch (err) {
        console.error("Error listing S3 backups:", err);
        throw err;
    }
};

export const downloadFromS3 = async (s3Config, s3FileKey, downloadPath) => {
    const s3 = getS3Client(s3Config);
    const params = {
        Bucket: s3Config.bucketName,
        Key: s3FileKey
    };

    try {
        const data = await s3.getObject(params).promise();
        fs.writeFileSync(downloadPath, data.Body);
        console.log(`File downloaded successfully from S3 to ${downloadPath}`);
        return downloadPath;
    } catch (err) {
        console.error("Error downloading from S3:", err);
        throw err;
    }
};

const throttle = throttleMiddleware(maxBytesPerSecondThrottleData);

let engine, logger;
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    const userMiddlewares = await engine.userProvider.getMiddlewares();
    engine.post('/api/backup/request-restore', [throttle, middlewareAuthenticator, userInitiator, ...userMiddlewares], async (req, res) => {
        const user = req.me; // Assuming you have user authentication middleware
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const result = await requestRestore(user);
            res.json(result);
        } catch (error) {
            console.error('Error requesting restore:', error);
            res.status(500).json({ error: error.message });
        }
    });
    engine.get('/api/backup/restore', [throttle, middlewareAuthenticator, userInitiator], async (req, res) => {
        const { token, username } = req.query;

        if (!token || !username) {
            return res.status(400).json({ error: 'Token and username are required.' });
        }

        const validationResult = validateRestoreRequest(username, token);

        if (validationResult.error) {
            return res.status(400).json({ error: validationResult.error });
        }

        try {
            await loadFromDump({username});
            res.json({ message: 'Backup restoration successful.' });
            delete restoreRequests[username];
        } catch (error) {
            console.error('Error restoring backup:', error);
            res.status(500).json({ error: 'Error restoring backup.' });
        }
    });

    engine.post('/api/user/s3-config', [middlewareAuthenticator, userInitiator, ...userMiddlewares], async (req, res) => {
        const user = req.me;
        const { bucketName, accessKeyId, secretAccessKey, region, pathPrefix } = req.fields;

        // Validation basique des entrées
        if (!bucketName || !accessKeyId || !region) {
            return res.status(400).json({ success: false, error: "Bucket name, Access Key ID, and Region are required." });
        }
        // Autres validations possibles (longueur, format de la région, etc.)

        try {
            const updateData = {
                's3Config.bucketName': bucketName,
                's3Config.accessKeyId': accessKeyId, // Stocké en clair (généralement acceptable)
                's3Config.region': region,
                's3Config.pathPrefix': pathPrefix || '' // S'assurer qu'il y a une valeur par défaut si vide
            };

            // Chiffrer et mettre à jour la clé secrète uniquement si elle est fournie
            if (secretAccessKey) {
                updateData['s3Config.secretAccessKey'] = encryptValue(secretAccessKey); // Chiffrer avant de stocker
            } else {
                // Si la clé secrète n'est pas fournie, on ne la modifie pas.
                // Si tu veux permettre de la supprimer, il faudrait une logique explicite.
                // Pour l'instant, on ne touche pas à s3Config.secretAccessKey si req.fields.secretAccessKey est vide.
            }

            const result = await engine.userProvider.updateUser(
                { username: user.username }, // ou user._id si c'est ce que tu utilises comme identifiant unique
                updateData
            );

            if (result) { // Succès même si rien n'a été modifié (déjà les bonnes valeurs)
                res.json({ success: true, message: "S3 configuration updated successfully." });
            } else {
                const userExists = engine.userProvider.findUserByUsername(user.username);
                if (!userExists) {
                    return res.status(404).json({ success: false, error: "User not found." });
                }
                res.json({ success: true, message: "S3 configuration already up to date." });
            }

        } catch (error) {
            logger.error(`Error updating S3 configuration for user ${user.username}:`, error);
            res.status(500).json({ success: false, error: "An internal server error occurred while updating S3 configuration." });
        }
    });
}