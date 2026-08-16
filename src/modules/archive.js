import { getCollection, MongoClient } from './mongodb.js';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCopyCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { Readable } from 'stream';
import { getUserS3Config } from './bucket.js'; // On réutilise la logique existante si possible

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const ARCHIVE_INDEX_COLLECTION = 'archive_index'; // Collection pour indexer les archives

/**
 * Crée un client S3 configuré pour un utilisateur spécifique.
 * Récupère les credentials depuis la configuration de l'utilisateur ou les variables d'environnement globales.
 * @param {object} user - L'objet utilisateur.
 * @returns {Promise<{s3Client: S3Client, bucketName: string}>}
 */
async function getS3ClientForUser(user) {
    // On tente de récupérer la configuration S3 spécifique à l'utilisateur.
    const userS3Config = await getUserS3Config(user);

    // Le bucket d'archivage peut être différent du bucket de backup.
    // On cherche S3_ARCHIVE_BUCKET_NAME, sinon on se rabat sur S3_BUCKET_NAME.
    const bucketName = userS3Config.S3_ARCHIVE_BUCKET_NAME || userS3Config.S3_BUCKET_NAME;

    if (!bucketName) {
        throw new Error("Archive bucket name (S3_ARCHIVE_BUCKET_NAME or S3_BUCKET_NAME) is not configured for this user.");
    }

    const s3Client = new S3Client({
        region: userS3Config.S3_REGION,
        credentials: {
            accessKeyId: userS3Config.S3_ACCESS_KEY_ID,
            secretAccessKey: userS3Config.S3_SECRET_ACCESS_KEY,
        },
        // endpoint: userS3Config.S3_ENDPOINT, // Décommenter pour MinIO etc.
    });

    return { s3Client, bucketName };
}

/**
 * Itère sur tous les utilisateurs et modèles configurés pour l'archivage
 * et lance le processus d'archivage pour chacun.
 * @param {Date} archiveOlderThan - La date seuil.
 */
export async function archiveOldDataForAllUsers(archiveOlderThan) {
    // TODO: Idéalement, cette liste de modèles viendrait d'une configuration.
    const modelsToArchive = ['orders', 'logs', 'events']; // Exemple de modèles à archiver

    const primalsDb = MongoClient.db("primals");
    const usersCollection = primalsDb.collection("users");
    const usersCursor = usersCollection.find({}, { projection: { username: 1 } });

    for await (const user of usersCursor) {
        console.log(`[Archive Job] Vérification de l'archivage pour l'utilisateur: ${user.username}`);
        for (const modelName of modelsToArchive) {
            try {
                await archiveOldData(modelName, user, archiveOlderThan);
            } catch (error) {
                console.error(`[Archive Job] Erreur lors de l'archivage du modèle '${modelName}' pour l'utilisateur '${user.username}':`, error);
            }
        }
    }
}

/**
 * Archives old data for a given model and user.
 * Documents are grouped by day and appended to a daily archive file in S3.
 * @param {string} modelName - The name of the model to archive.
 * @param {object} user - The user object.
 * @param {Date} archiveOlderThan - A date threshold.
 */
export async function archiveOldData(modelName, user, archiveOlderThan) {
    let s3Client, bucketName;
    try {
        ({ s3Client, bucketName } = await getS3ClientForUser(user));
    } catch (configError) {
        console.warn(`[Archive] Skipping for user ${user.username}: ${configError.message}`);
        return;
    }

    const dataCollection = getCollection(modelName);
    const archiveCollection = getCollection(ARCHIVE_INDEX_COLLECTION);

    // 1. Trouver les documents à archiver
    const oldDocs = await dataCollection.find({
        _user: user.username,
        _updatedAt: { $lt: archiveOlderThan }
    }).toArray();

    if (oldDocs.length === 0) {
        return;
    }

    console.log(`[Archive] ${oldDocs.length} documents trouvés pour archivage pour le modèle ${modelName} et l'utilisateur ${user.username}.`);

    // 2. Grouper les documents par jour (basé sur _updatedAt)
    const docsByDay = oldDocs.reduce((acc, doc) => {
        const day = doc._updatedAt.toISOString().split('T')[0];
        if (!acc[day]) {
            acc[day] = [];
        }
        acc[day].push(doc);
        return acc;
    }, {});

    // 3. Traiter chaque groupe journalier
    for (const day in docsByDay) {
        const docsForDay = docsByDay[day];
        const [year, month, dayOfMonth] = day.split('-');
        const s3Key = `archives/${modelName}/${year}/${month}/${dayOfMonth}/${user.username}.jsonl.gz`;

        try {
            // Convertir les documents en format JSONL (une ligne par doc)
            const jsonlData = docsForDay.map(doc => JSON.stringify(doc)).join('\n') + '\n';
            const compressedData = await gzipAsync(Buffer.from(jsonlData));

            // Vérifier si le fichier existe déjà pour décider de la stratégie d'upload
            let existingObject;
            try {
                existingObject = await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: s3Key }));
            } catch (error) {
                if (error.name !== 'NoSuchKey') throw error;
                // Le fichier n'existe pas, on le créera simplement.
            }

            if (!existingObject) {
                // --- Cas simple : le fichier n'existe pas, on le crée ---
                const putCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: compressedData,
                    ContentType: 'application/x-json-stream',
                    ContentEncoding: 'gzip',
                });
                await s3Client.send(putCommand);
            } else {
                // --- Cas complexe : le fichier existe, on utilise Multipart Upload pour "append" ---
                const tempS3Key = `${s3Key}.temp-chunk.${Date.now()}`;
                let uploadId;

                try {
                    // 1. Uploader les nouvelles données dans un objet temporaire
                    await s3Client.send(new PutObjectCommand({
                        Bucket: bucketName, Key: tempS3Key, Body: compressedData
                    }));
                    const newChunkInfo = await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: tempS3Key }));

                    // 2. Démarrer un multipart upload
                    const multipartUpload = await s3Client.send(new CreateMultipartUploadCommand({
                        Bucket: bucketName, Key: s3Key, ContentType: 'application/x-json-stream', ContentEncoding: 'gzip'
                    }));
                    uploadId = multipartUpload.UploadId;

                    // 3. Copier le fichier existant comme première partie
                    const copySource = `${bucketName}/${s3Key}`;
                    const part1 = await s3Client.send(new UploadPartCopyCommand({
                        Bucket: bucketName, Key: s3Key, UploadId: uploadId, PartNumber: 1, CopySource: copySource
                    }));

                    // 4. Copier le chunk temporaire comme deuxième partie
                    const copySourceChunk = `${bucketName}/${tempS3Key}`;
                    const part2 = await s3Client.send(new UploadPartCopyCommand({
                        Bucket: bucketName, Key: s3Key, UploadId: uploadId, PartNumber: 2, CopySource: copySourceChunk
                    }));

                    // 5. Finaliser le multipart upload
                    await s3Client.send(new CompleteMultipartUploadCommand({
                        Bucket: bucketName, Key: s3Key, UploadId: uploadId, MultipartUpload: { Parts: [{ ETag: part1.CopyPartResult.ETag, PartNumber: 1 }, { ETag: part2.CopyPartResult.ETag, PartNumber: 2 }] }
                    }));

                } finally {
                    // 6. Nettoyer l'objet temporaire et annuler le multipart upload en cas d'erreur
                    if (uploadId) { // Si l'upload a été initié
                        await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: tempS3Key }));
                    }
                }
            }

            // 4. Insérer les documents dans la collection d'archive MongoDB
            const archiveDocs = docsForDay.map(doc => ({
                ...doc,
                _isArchived: true,
                _archive: { s3_key: s3Key, archivedAt: new Date() }
            }));
            await archiveCollection.insertMany(archiveDocs, { ordered: false });

            // 5. Supprimer les documents originaux de la collection de production
            const docIds = docsForDay.map(doc => doc._id);
            await dataCollection.deleteMany({ _id: { $in: docIds } });

            console.log(`[Archive] ${docsForDay.length} documents pour le ${day} archivés dans ${s3Key}`);

        } catch (error) {
            console.error(`[Archive] Échec de l'archivage du lot pour le modèle ${modelName} le ${day}:`, error);
            // En cas d'erreur, on ne supprime rien et on n'insère rien dans l'index.
        }
    }
}

/**
 * Restores a single document from the archive to its original collection.
 * @param {string} docId - The _id of the document to restore from the archive_index.
 * @param {object} user - The user performing the action.
 * @returns {Promise<object>} - Result of the operation.
 */
export async function restoreFromArchive(docId, user) {
    if (!docId) {
        throw new Error("Document ID is required for restoration.");
    }

    const archiveCollection = getCollection(ARCHIVE_INDEX_COLLECTION);
    const docToRestore = await archiveCollection.findOne({ _id: docId, _user: user.username });

    if (!docToRestore) {
        throw new Error(`Archived document with ID ${docId} not found for user ${user.username}.`);
    }

    const modelName = docToRestore.__model; // Assuming the model name is stored in '__model'
    if (!modelName) {
        throw new Error("Cannot restore document: original model name is missing.");
    }

    const dataCollection = getCollection(modelName);

    // Clean up archive-specific fields before re-insertion
    delete docToRestore._isArchived;
    delete docToRestore._archive;

    await dataCollection.insertOne(docToRestore);
    await archiveCollection.deleteOne({ _id: docId });

    return { success: true, message: `Document ${docId} restored to collection '${modelName}'.` };
}

/**
 * Searches the archive collection in MongoDB.
 * @param {string} modelName - The name of the model.
 * @param {object} filter - The MongoDB-style filter to apply.
 * @param {object} user - The user performing the search (used for scoping).
 * @returns {Promise<Array<object>>} - An array of documents from the archive index.
 */
export async function searchArchive(modelName, filter, user) {
    if (!BUCKET_NAME) {
        throw new Error("S3 archive bucket is not configured.");
    }
    const archiveCollection = getCollection(ARCHIVE_INDEX_COLLECTION);

    // La recherche se fait directement et efficacement sur la collection d'index MongoDB.
    const searchFilter = {
        ...filter,
        '__model': modelName, // Assumant que le modèle est stocké dans un champ comme `__model`
        _user: user.username,
    };
    return await archiveCollection.find(searchFilter).toArray();
}

/**
 * API route handler for searching the archive.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export async function handleArchiveSearch(req, res) {
    const { model, filter } = req.body;
    const user = req.me;

    if (!model) {
        return res.status(400).json({ success: false, error: "Model name is required." });
    }

    try {
        const results = await searchArchive(model, filter || {}, user);
        res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error(`[API /archive/search] Error:`, error);
        res.status(500).json({ success: false, error: error.message || "An internal error occurred while searching the archive." });
    }
}

/**
 * API route handler for restoring a document from the archive.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export async function handleArchiveRestore(req, res) {
    const { docId } = req.body;
    const user = req.me;

    try {
        if (!docId) {
            return res.status(400).json({ success: false, error: "docId is required." });
        }
        const result = await restoreFromArchive(docId, user);
        res.status(200).json(result);
    } catch (error) {
        console.error(`[API /archive/restore] Error:`, error);
        res.status(500).json({ success: false, error: error.message || "An internal error occurred during restoration." });
    }
}

// Helper pour convertir un stream en buffer
const streamToBuffer = (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
});