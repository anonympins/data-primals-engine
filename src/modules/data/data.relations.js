import {getDefaultForType, getFieldValueHash} from "../../data.js";
import {Event} from "../../events.js";
import {getCollectionForUser, isObjectId} from "../mongodb.js";
import {ObjectId} from "mongodb";
import {isPlainObject, parseSafeJSON} from "../../core.js";
import {dataTypes, getModel, searchData} from "./data.operations.js";
import {validateModelData} from "./data.validation.js";
import i18n from "../../i18n.js";
import {addFile, removeFile} from "../file.js";
import {Logger} from "../../gameObject.js";
import NodeCache from "node-cache";

let depthFilter = 0;

// Création du cache avec des options configurables
export const relationCache = new NodeCache({
    stdTTL: 3600, // TTL par défaut de 1 heure (en secondes)
    checkperiod: 600, // Vérification des éléments expirés toutes les 10 minutes
    useClones: false // Pour des performances optimales avec des ObjectId
});

let engine, logger;
export function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
}

export function convertDataTypes(dataArray, modelFields, sourceType = 'csv') {
    return dataArray.map(record => {
        const convertedRecord = {...record};
        for (const field of modelFields) {
            if (convertedRecord.hasOwnProperty(field.name)) {
                let value = convertedRecord[field.name];

                // Gérer les chaînes vides pour les champs non requis
                if (typeof value === 'string' && value === '' && !field.required) {
                    convertedRecord[field.name] = getDefaultForType(field);
                    continue;
                }
                // Si la valeur est null ou undefined, on la laisse telle quelle, la validation s'en chargera
                if (value === null || value === undefined) {
                    continue;
                }

                switch (field.type) {
                case 'number':
                    if (typeof value !== 'number') { // Convertir si ce n'est pas déjà un nombre
                        const num = parseFloat(value);
                        if (!isNaN(num)) {
                            convertedRecord[field.name] = num;
                        } else {
                            logger.warn(`Import: Impossible de parser le nombre pour le champ ${field.name}, valeur: ${value}. Utilisation de la valeur par défaut/null.`);
                            convertedRecord[field.name] = getDefaultForType(field);
                        }
                    }
                    break;
                case 'boolean':
                    if (typeof value !== 'boolean') {
                        convertedRecord[field.name] = ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
                    }
                    break;
                case 'date':
                case 'datetime':
                    if (String(value).toLowerCase() === 'now') {
                        convertedRecord[field.name] = 'now';
                    } else {
                        const parsedDate = new Date(value);
                        if (!isNaN(parsedDate.getTime())) {
                            convertedRecord[field.name] = field.type === 'date' ? parsedDate.toISOString().split("T")[0] : parsedDate.toISOString();
                        } else if (value) { // Ne pas logger si la valeur était initialement vide/null
                            logger.warn(`Import: Impossible de parser la date pour le champ ${field.name}, valeur: ${value}. La validation ulture s'en chargera.`);
                        }
                    }
                    break;
                case 'array':
                    if (['csv', 'excel'].includes(sourceType) && typeof value === 'string') {
                        const arrayValues = value.split(/[,;]/).map(item => item.trim()).filter(item => item !== '');
                        if (field.itemsType === 'number') {
                            convertedRecord[field.name] = arrayValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
                        } else {
                            convertedRecord[field.name] = arrayValues;
                        }
                    } else if (sourceType === 'json' && typeof value === 'string') {
                        try {
                            const parsedArray = JSON.parse(value);
                            if (Array.isArray(parsedArray)) {
                                convertedRecord[field.name] = parsedArray;
                                // TODO: Potentiellement convertir les éléments de parsedArray ici si nécessaire
                            } else {
                                logger.warn(`Import: La chaîne JSON pour le champ tableau ${field.name} n'a pas été parsée en tableau. Valeur: ${value}.`);
                            }
                        } catch (e) {
                            logger.warn(`Import: Impossible de parser la chaîne JSON pour le champ tableau ${field.name}. Valeur: ${value}.`);
                        }
                    }
                    // Si c'est déjà un tableau (cas JSON typique), on suppose que les types des éléments sont corrects
                    // ou seront validés par pushDataUnsecure.
                    else if (!Array.isArray(convertedRecord[field.name])) {
                        convertedRecord[field.name] = getDefaultForType(field);
                    }
                    break;
                case 'object':
                    if (['csv', 'excel'].includes(sourceType)) {
                        try {
                            convertedRecord[field.name] = JSON.parse(value);
                        } catch (e) {
                            logger.warn(`Import: Impossible de parser la chaîne JSON pour le champ objet ${field.name}. Valeur: ${value}.`);
                        }
                    }
                    break;
                case 'code':
                    if (['csv', 'excel'].includes(sourceType) && typeof value === 'string') {
                        try {
                            convertedRecord[field.name] = JSON.parse(value);
                        } catch (e) {
                            logger.warn(`Import: Impossible de parser la chaîne JSON pour le champ code (json) ${field.name}. Valeur: ${value}.`);
                        }
                    }
                    break;
                }
            }
        }
        return convertedRecord;
    });
}

export const removeValue = (obj, containsKey, removeParent = false) => {
    // Base case: If the object is not an object or array, return it as is.
    if (!isPlainObject(obj) && !Array.isArray(obj)) {
        return obj;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (removeParent) {
                const value = obj[key]?.[containsKey];
                if (value !== undefined) {
                    delete obj[key];
                } else {
                    removeValue(obj[key], containsKey);
                }
            } else if (containsKey === key) {
                delete obj[key];
            } else {
                removeValue(obj[key], containsKey);
            }
        }
    }
    return obj;
};
export const changeValue = (obj, keyToChange, changeFunction, excludeKeys = [], depth = 0, parentKey = '') => {
    if (!depth) {
        depthFilter = 0;
    }
    if (!isPlainObject(obj) && !Array.isArray(obj)) {
        return obj;
    }

    const newObj = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const topLevel = depthFilter === 0;
            if (key === keyToChange) {
                depthFilter++;
            }
            const value = obj[key];
            if (value instanceof RegExp) {
                newObj[key] = value;
                continue;
            }
            if (isPlainObject(value) && !excludeKeys.includes(key)) {
                newObj[key] = changeValue(value, keyToChange, changeFunction, excludeKeys, depth + 1, key);
            } else if (Array.isArray(value) && !excludeKeys.includes(key)) {
                newObj[key] = value.map(item => {
                    if (isPlainObject(item)) {
                        return changeValue(item, keyToChange, changeFunction, excludeKeys, depth + 1, key);
                    }
                    return item;
                });
            } else {
                newObj[key] = value;
            }
            if (key === keyToChange) {
                if (typeof changeFunction === 'function') {
                    const newValue = changeFunction(parentKey, newObj[key], topLevel);
                    if (newValue !== undefined) {
                        if (isPlainObject(newValue)) {
                            return newValue;
                        } else {
                            newObj[key] = newValue;
                        }
                    } else {
                        //delete newObj[key];

                    }
                }
            }
        }
    }
    return newObj;
};

export async function processDocuments(datas, model, collection, me) {
    const idMap = new Map();
    const allInsertedIds = [];

    const realData = await Event.Trigger("OnDataInsert", "event", "system", datas) || datas;
    for (const doc of realData) {
        try {
            const newDocId = await insertAndResolveRelations(doc, model, collection, me, idMap);
            if (newDocId) {
                allInsertedIds.push(newDocId.toString());
            }
        } catch (error) {
            // Modification clé ici : on ne catch plus les erreurs de validation
            throw error;
        }
    }

    return {allInsertedIds, idMap};
}

/**
 * Traite toutes les relations du document
 */
export async function processRelations(docToProcess, model, collection, me, idMap) {
    const batchFinds = [];

    // Phase 1: Préparation des requêtes
    for (const field of model.fields) {
        if (field.type !== 'relation') continue;

        const value = docToProcess[field.name];
        if (value?.$find) {
            batchFinds.push({
                field: field.name,
                promise: searchData({
                    filter: value.$find,
                    limit: field.multiple ? 0 : 1,
                    model: field.relation
                }, me),
                multiple: field.multiple
            });
        }
    }

    // Phase 2: Exécution parallèle
    const findResults = await Promise.all(batchFinds.map(f => f.promise));

    // Phase 3: Traitement des résultats
    findResults.forEach((result, index) => {
        const {field, multiple} = batchFinds[index];
        if (result.data?.length > 0) {
            // Cas où des documents sont trouvés
            docToProcess[field] = multiple
                ? result.data.map(r => r._id.toString())
                : result.data[0]._id.toString();
        } else {
            // Cas où AUCUN document n'est trouvé : il faut nettoyer le champ !
            docToProcess[field] = multiple ? [] : null;
        }
    });


    for (const field of model.fields) {
        if (field.type !== 'relation') continue;

        const fieldName = field.name;
        const relationValue = docToProcess[fieldName];
        if (!relationValue || typeof relationValue !== 'object') continue;

        const relatedModel = await getModel(field.relation, me);

        if (!Array.isArray(relationValue) && relationValue['$find']) {

        } else if (Array.isArray(relationValue)) {
            // Relation multiple (tableau)
            docToProcess[fieldName] = await processMultipleRelations(
                relationValue,
                relatedModel,
                collection,
                me,
                idMap
            );
        } else if (isPlainObject(relationValue)) {
            // Relation simple (objet)
            docToProcess[fieldName] = await processSingleRelation(
                relationValue,
                relatedModel,
                collection,
                me,
                idMap
            );
        }
    }
}

/**
 * Traite une relation multiple (tableau)
 */
async function processMultipleRelations(items, relatedModel, collection, me, idMap) {
    const newRelationIds = await Promise.all(
        items.map(item => processRelationItem(item, relatedModel, collection, me, idMap))
    );
    return newRelationIds.filter(id => id).map(id => id.toString());
}

/**
 * Traite une relation simple (objet)
 */
async function processSingleRelation(item, relatedModel, collection, me, idMap) {
    const newId = await processRelationItem(item, relatedModel, collection, me, idMap);
    return newId ? newId.toString() : null;
}

async function processRelationItem(item, relatedModel, collection, me, idMap) {
    // Cas 1: ID existant (string ou ObjectId)
    if (isObjectId(item) || typeof item === 'string') {
        const originalId = typeof item === 'string' ? item : item.toString();

        // Vérifier si cet ID a déjà été mappé (cas d'une référence circulaire)
        if (idMap.has(originalId)) {
            return idMap.get(originalId);
        }

        // Sinon, vérifier si l'ID existe en base
        const existing = await collection.findOne({
            _id: new ObjectId(originalId),
            _model: relatedModel.name,
            $or: [{_user: me._user || me.username}, {_user: {$exists: false}}]
        });

        if (existing) {
            return existing._id; // Conserver l'ID original
        }
    }

    // Cas 2: Objet complet à importer
    if (isPlainObject(item)) {
        const relationDoc = prepareDocument(item, relatedModel, me);
        applyDefaultValues(relationDoc, relatedModel);

        // Si l'objet a un _id, essayer de le conserver
        if (item._id) {
            const originalId = item._id.toString();

            // Vérifier si l'ID existe déjà en base
            const existing = await collection.findOne({
                _id: new ObjectId(originalId),
                _model: relatedModel.name,
                $or: [{_user: me._user || me.username}, {_user: {$exists: false}}]
            });

            if (existing) {
                return existing._id; // Utiliser l'ID existant
            }

            // Si l'ID n'existe pas encore, l'utiliser pour le nouvel insert
            relationDoc._id = new ObjectId(originalId);
        }

        const relationHash = relationDoc._hash;
        const cacheKey = `${relatedModel.name}:${relationHash}`;

        // Vérification dans le cache
        const cachedId = relationCache.get(cacheKey);
        if (cachedId !== undefined) {
            return cachedId;
        }

        // Vérification en base de données par hash
        const existingByHash = await collection.findOne({
            _hash: relationHash,
            _model: relatedModel.name,
            _user: relationDoc._user
        }, {projection: {_id: 1}});

        if (existingByHash) {
            relationCache.set(cacheKey, existingByHash._id);
            return existingByHash._id;
        }

        const newId = await insertAndResolveRelations(item, relatedModel, collection, me, idMap);
        relationCache.set(cacheKey, newId);
        return newId;
    }

    return null;
}

// Fonction pour vider le cache si besoin
function clearRelationCache() {
    relationCache.flushAll();
}

/**
 * Applique les filtres de champ définis dans le modèle
 */
async function applyFieldFilters(docToProcess, model) {
    for (const field of model.fields) {
        docToProcess[field.name] = typeof (docToProcess[field.name]) === 'undefined' || docToProcess[field.name] === null ? field.default : docToProcess[field.name];
        if (dataTypes[field.type]?.filter) {
            const filter = await dataTypes[field.type].filter(
                docToProcess[field.name],
                field
            );
            const realFilter = await Event.Trigger('OnDataFilter', "event", "system", filter, field, docToProcess);
            docToProcess[field.name] = realFilter || filter;
        }
    }
}

/**
 * Applique les valeurs par défaut aux champs manquants
 */
function applyDefaultValues(doc, model) {
    for (const field of model.fields) {
        // Si le champ n'est pas défini et a une valeur par défaut
        if (!(field.name in doc) && 'default' in field) {
            doc[field.name] = typeof field.default === 'function'
                ? field.default()
                : field.default;
        }
    }
}

async function insertAndResolveRelations(doc, model, collection, me, idMap) {
    const originalId = doc._id?.toString();

    // Si cet ID a déjà été traité, retourner le nouvel ID mappé
    if (originalId && idMap.has(originalId)) {
        return idMap.get(originalId);
    }

    const docToProcess = prepareDocument(doc, model, me);
    applyDefaultValues(docToProcess, model);

    // Si le document a un _id original et qu'il n'existe pas encore, le conserver
    if (originalId && !await collection.findOne({_id: new ObjectId(originalId)})) {
        docToProcess._id = new ObjectId(originalId);
    }

    await validateModelData(docToProcess, model);
    await processRelations(docToProcess, model, collection, me, idMap);
    await validateModelData(docToProcess, model);
    await applyFieldFilters(docToProcess, model);
    await checkUniqueFields(docToProcess, model, collection);

    const existingDoc = await findExistingDocument(docToProcess, collection);
    if (existingDoc) {
        cacheDocumentId(originalId, existingDoc._id, idMap);
        return existingDoc._id;
    }

    for (const field of model.fields) {
        if (field.type === 'relation' && field.relationFilter && docToProcess[field.name]) {

            const relatedIds = Array.isArray(docToProcess[field.name])
                ? docToProcess[field.name]
                : [docToProcess[field.name]];

            // Préparer un filtre global : match si _id dans relatedIds ET respecte relationFilter
            const validationQuery = {
                $and: [
                    {$in: ['$_id', relatedIds.map(id => ({$toObjectId: id}))]},
                    field.relationFilter
                ]
            };

            const relatedDocs = await searchData({
                filter: validationQuery,
                model: field.relation,
                limit: relatedIds.length
            }, me);

            if ((relatedDocs?.count || 0) !== relatedIds.length) {
                const invalidIds = relatedIds.filter(id =>
                    !relatedDocs.data.some(doc => doc._id.toString() === id.toString())
                );
                throw new Error(
                    i18n.t(
                        'api.data.relationFilterFailed',
                        'Les valeurs {{values}} pour le champ {{field}} ne respectent pas le filtre de relation défini.',
                        {field: field.name, values: invalidIds.join(', ')}
                    )
                );
            }
        }
    }


    // Insertion en conservant éventuellement l'ID original
    const result = docToProcess._id
        ? await collection.insertOne(docToProcess)
        : await collection.insertOne(docToProcess);

    const insertedId = result.insertedId;
    cacheDocumentId(originalId, insertedId, idMap);

    return insertedId;
}

// Nouvelle fonction pour vérifier les champs uniques
async function checkUniqueFields(doc, model, collection) {
    const uniqueFields = model.fields.filter(f => f.unique);

    for (const field of uniqueFields) {
        const value = doc[field.name];
        if (value === undefined || value === null) continue;

        const existing = await collection.findOne({
            [field.name]: value,
            _model: model.name,
            _user: doc._user
        });

        if (existing) {
            // Utilisation de i18n pour un message d'erreur standardisé
            throw new Error(i18n.t('api.data.duplicateValue', {field: field.name, value: value}));
        }
    }
}

function prepareDocument(doc, model, me) {
    const docToProcess = {...doc};
    delete docToProcess._id;

    // AJOUT: Nettoyage des champs non définis dans le modèle
    for (const key of Object.keys(docToProcess)) {
        if (!model.fields.some(f => f.name === key) && !key.startsWith('_')) {
            delete docToProcess[key];
        }
    }

    docToProcess._model = model.name;
    docToProcess._user = me.username || me._user;
    docToProcess._hash = getFieldValueHash(model, docToProcess);

    return docToProcess;
}

/**
 * Cherche un document existant par son hash
 */
async function findExistingDocument(docToProcess, collection) {
    return await collection.findOne({
        _hash: docToProcess._hash,
        _model: docToProcess._model,
        _user: docToProcess._user
    });
}

/**
 * Insère le document dans la collection
 */
async function insertDocument(docToProcess, collection) {
    const result = await collection.insertOne(docToProcess);
    return result.insertedId;
}

/**
 * Met en cache la correspondance d'ID
 */
function cacheDocumentId(originalId, newId, idMap) {
    if (originalId && newId) {
        idMap.set(originalId, newId);
    }
}

/**
 * Gestion des fichiers (à implémenter selon besoins)
 */
export async function handleFilesIfNeeded(insertedIds, files, model, collection) {
    // Implémentation spécifique à votre application
    // Ex: association des fichiers uploadés aux documents insérés
}

export const checkHash = async (me, model, hash, excludeId = null) => {
    const collection = await getCollectionForUser(me);
    const query = {
        _model: model.name,
        _hash: hash,
        ...(excludeId && {_id: {$ne: new ObjectId(excludeId)}})
    };

    console.log("Query being executed:", JSON.stringify(query, null, 2));

    const count = await collection.countDocuments(query);
    return count > 0;
};

// Fonctions helper
export async function processFileArray(files, currentFiles, user) {
    const newFiles = await Promise.allSettled(
        Object.keys(files).map(f => files[f]).map(async (file, i) => {
            const oldFile = currentFiles.find(f => f.name === file.name);
            if (oldFile && !file.newFile) return oldFile;
            if (file.guid) return file;
            if (!file.newFile) return Promise.reject();
            return await addFile(files[i], user);
        })
    ).then(results => results.map(r => r.value).filter(Boolean));

    // Suppression des anciens fichiers non réutilisés
    await Promise.allSettled(
        currentFiles
            .filter(f => !newFiles.some(nf => nf._id === f._id))
            .map(f => removeFile(f, user))
    );

    return newFiles;
}

function handleCalculationExpression(calcExpression, fi, modelElement, calculationName) {
    // Check if the calculation expression involves an operator
    if (typeof calcExpression === 'object' && calcExpression !== null && Object.keys(calcExpression).length === 1) {
        const operator = Object.keys(calcExpression)[0];
        const operands = calcExpression[operator];

        // Validation of isValidAggregationOperator
        if (!isValidAggregationOperator(operator)) {
            logger.warn(`Invalid aggregation operator '${operator}' in calculation. Skipping.`);
            return null;
        }

        // Check Operand Count and Apply $ifNull handling
        if (Array.isArray(operands)) {
            const handledOperands = operands.map(operand => handleOperand(operand, fi, modelElement, calculationName));
            if (handledOperands.some(op => op === null)) { // Skip if any operand is invalid
                return null;
            }
            return {[operator]: handledOperands};
        } else {
            logger.warn(`Invalid operands for operator '${operator}'. Expected an array. Skipping.`);
            return null;
        }
    } else if (typeof calcExpression === 'string' && calcExpression.startsWith('$')) {
        // This is a field reference
        return handleOperand(calcExpression, fi, modelElement, calculationName);
    } else {
        // This is a constant value, return as is.
        return calcExpression;
    }
}

function handleOperand(operand, fi, modelElement, calculationName) {
    if (typeof operand === 'object' && operand !== null && Object.keys(operand).length === 1) {
        // Nested Calculation: recursively handle
        return handleCalculationExpression(operand, fi, modelElement, calculationName);
    } else if (typeof operand === 'string' && operand.startsWith('$')) {
        // Field Reference: check field existence
        const fieldName = operand.slice(1);
        if (!isValidFieldReference(fieldName, modelElement)) {
            logger.warn(`Invalid field reference '${fieldName}' in calculation. Skipping.`);
            return null;
        }
        return operand;
    } else {
        // Constant Value
        return operand;
    }
}

function isValidFieldReference(fieldName, modelElement) {
    // Check if the field exists in the model
    return modelElement.fields.some(field => field.name === fieldName);
}

function isValidAggregationOperator(operator) {
    const arithmeticOperators = [
        '$add', '$subtract', '$multiply', '$divide', '$mod', '$pow',
        '$abs', '$ceil', '$floor', '$round', '$trunc', '$exp', '$log', '$log10'
    ];
    const comparisonOperators = [
        '$eq', '$gt', '$gte', '$lt', '$lte', '$ne'
        // ... (others like $cmp, $strcasecmp, etc.)
    ];
    const stringOperators = [
        '$concat', '$strLenCP', '$substrCP', '$toLower', '$toUpper'
        // ... (others)
    ];
    const conditionalOperators = ['$cond', '$ifNull'];
    // Add more categories and operators as needed

    return [...arithmeticOperators, ...comparisonOperators, ...stringOperators, ...conditionalOperators].includes(operator);
}