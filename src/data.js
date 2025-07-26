import {getObjectHash} from "./core.js";
import process from "node:process";
import crypto from "node:crypto";
import {mainFieldsTypes} from "./constants.js";

const IV_LENGTH = 16;
export function encryptValue(text) {
    if (!process.env.S3_CONFIG_ENCRYPTION_KEY) throw new Error("S3_CONFIG_ENCRYPTION_KEY is not set");
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(process.env.S3_CONFIG_ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptValue(text) {
    if (!process.env.S3_CONFIG_ENCRYPTION_KEY) throw new Error("S3_CONFIG_ENCRYPTION_KEY is not set");
    if (!text || typeof text !== 'string' || !text.includes(':')) return text; // ou throw error
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(process.env.S3_CONFIG_ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export const isLocalUser = (user) => {
    return user && user._model === 'user' && typeof(user._user) === 'string' && user._user.trim() !== '';
};

export const isDemoUser = (user) => {
    return /^demo[0-9]{1,2}$/.test(user?.username);
}

export function getUserHash(user) {
    if( isDemoUser(user) ){
        return user.username;
    }
    return user ? (
        isLocalUser(user) ? getObjectHash({id: 'LOCAL_USER'+user._user+user.username}) : getObjectHash({id: user.hash})
    ) : 0;
}
export function getUserId(user) {
    return user ? (
        isLocalUser(user) ? ('LOCAL_USER'+user.username)?.hashCode() : user.username
    ) : 0;
}

export const getUserName = (user) => {
    return isLocalUser(user) ? user._id + '_'+user._user : user.username;
}
// C:/Dev/hackersonline-engine/src/data.js

/**
 * Crée une fonction de génération de nombres pseudo-aléatoires basée sur une graine (seed).
 * Utilise un simple générateur congruentiel linéaire (LCG).
 * @param {number} seed - La graine initiale.
 * @returns {function(): number} Une fonction qui retourne un nombre entre 0 et 1.
 */
function createSeededRandom(seed) {
    let state = seed;
    return function() {
        // Algorithme LCG simple. Pas pour la cryptographie, mais suffisant pour du "hasard" déterministe.
        state = (state * 9301 + 49297) % 233280;
        return state / 233280.0;
    };
}

/**
 * Anonymise une chaîne de caractères en remplaçant chaque caractère
 * par un caractère aléatoire d'un jeu défini.
 * Cette méthode est déterministe si une graine (seed) est fournie.
 *
 * @param {string} text Le texte à anonymiser.
 * @param {boolean} [preserveSpaces=false] Si true, les espaces ne seront pas remplacés.
 * @param {string|number|null} [seed=null] Une graine pour rendre l'anonymisation déterministe. Peut être le _hash de la donnée.
 * @returns {string} Le texte anonymisé, ou une chaîne vide si l'entrée est invalide.
 */
export function anonymizeText(text, preserveSpaces = false, seed = null) {
    if (typeof text !== 'string' || text.length === 0) {
        return "";
    }

    text = encryptValue(text);

    // Jeu de caractères pour le remplacement (vous pouvez l'adapter)
    const charSet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789*#@!?";
    let anonymizedResult = "";

    let random;
    if (seed !== null) {
        // Convertir la graine (qui peut être une chaîne comme _hash) en un nombre simple.
        let numericSeed = 0;
        if (typeof seed === 'string') {
            for (let i = 0; i < seed.length; i++) {
                // Simple hash to number. Using a bitwise operation to keep it a 32-bit integer.
                numericSeed = (((numericSeed << 5) - numericSeed) + seed.charCodeAt(i)) | 0;
            }
        } else if (typeof seed === 'number') {
            numericSeed = seed;
        } else {
            // Fallback pour d'autres types, bien que non attendu
            numericSeed = new Date().getTime();
        }
        random = createSeededRandom(numericSeed);
    } else {
        // Si aucune graine n'est fournie, utiliser le générateur aléatoire standard.
        random = Math.random;
    }

    for (let i = 0; i < text.length; i++) {
        const originalChar = text[i];

        // Conserver les espaces si demandé
        if (preserveSpaces && (originalChar === ' ' || originalChar === '\t' || originalChar === '\n' || originalChar === '\r')) {
            anonymizedResult += originalChar;
        } else {
            // Remplacer par un caractère aléatoire du jeu en utilisant le générateur choisi
            const randomIndex = Math.floor(random() * charSet.length);
            anonymizedResult += charSet[randomIndex];
        }
    }

    return anonymizedResult;
}


/**
 * Get the value from an object based on a dot-separated path.
 * @param {object} obj - The object to traverse.
 * @param {string} path - The dot-separated path (e.g., "user.profile.name").
 * @returns {*} The value at the given path, or undefined if not found.
 */
export const getFieldPathValue = (obj, path) => {
    if (!obj || !path) return undefined;
    const properties = path.split('.');
    return properties.reduce((prev, curr) => (prev && prev[curr] !== undefined) ? prev[curr] : undefined, obj);
};

/**
 * Apply a filter condition to an array of data objects.
 * Filter format is a simple object mapping field paths to values or filter operators.
 * Supported operators: $eq, $ne, $in (array), $exists (boolean).
 * @param {array} data - The array of data objects.
 * @param {object|null} filter - The filter object.
 * @returns {array} The filtered array.
 */
export const applyFilter = (data, filter) => {
    if (!filter || Object.keys(filter).length === 0 || !Array.isArray(data)) return data;
    return data.filter(item => {
        for (const key in filter) {
            // Ensure the key exists in the filter and is not from prototype chain
            if (Object.prototype.hasOwnProperty.call(filter, key)) {
                const filterValue = filter[key];
                const itemValue = getFieldPathValue(item, key);

                if (typeof filterValue === 'object' && filterValue !== null) {
                    if (filterValue.$in && Array.isArray(filterValue.$in)) {
                        if (!filterValue.$in.includes(itemValue)) return false;
                    } else if (filterValue.$eq !== undefined) {
                        if (itemValue !== filterValue.$eq) return false;
                    } else if (filterValue.$ne !== undefined) {
                        if (itemValue === filterValue.$ne) return false;
                    } else if (filterValue.$exists !== undefined) {
                        const hasValue = itemValue !== undefined && itemValue !== null;
                        if (filterValue.$exists && !hasValue) return false;
                        if (!filterValue.$exists && hasValue) return false;
                    }
                    // Add support for other operators if needed
                    // else if (filterValue.$gt !== undefined) { ... }
                } else {
                    // Default equality check for non-object filter values
                    if (itemValue !== filterValue) return false;
                }
            }
        }
        return true;
    });
};

export function getDefaultForType(field) {
    if(field.default)
        return typeof(field.default) === 'function' ? field.default() : field.default;
    switch (field.type) {
        case 'string':
        case 'string_t':
        case 'richtext':
        case 'password':
        case 'email':
        case 'phone':
        case 'url':
            return '';
        case 'model':
            return '';
        case 'modelField':
            return { model: '', field: '' };
        case 'color':
            return null;
        case 'number':
            return 0;
        case 'date':
        case 'datetime':
            return null;
        case 'boolean':
            return false;
        case 'file':
            return null;
        case 'array':
            return [];
        case 'enum':
            return field.required && field.items && field.items.length > 0 ? field.items[0] : null;
        case 'object':
            return {};
        case 'relation':
            return field.multiple ? [] : null;
        default:
            return undefined;
    }
}


/**
 * Maps ConditionBuilder operators to MongoDB aggregation expression operators
 * or indicates special handling.
 */
const operatorToExprOperatorMap = {
    '$eq': '$eq',
    '$ne': '$ne',
    '$gt': '$gt',
    '$gte': '$gte',
    '$lt': '$lt',
    '$lte': '$lte',
    '$in': '$in',
    '$nin': '$nin', // Special handling with $not/$in
    '$regex': '$regexMatch', // Use aggregation regex operator
    '$exists': '$exists' // Special handling with $type or similar
};

// Helper to build the nested $find structure
function buildNestedFindStructure(pathSegments, finalPayload) {
    // Base case: If no segments left, return the final condition payload
    if (!pathSegments || pathSegments.length === 0) {
        return finalPayload;
    }

    const currentSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    // Recursively build the structure
    return {
        [currentSegment]: {
            '$find': buildNestedFindStructure(remainingSegments, finalPayload)
        }
    };
}
// C:/Dev/hackersonline-engine/src/data.js
// ... (imports and other functions) ...

/**
 * Builds the core condition payload (operators and values, or logical groups)
 * from a ConditionBuilder condition object or sub-object.
 * It handles the transformation of simple conditions and logical groups into
 * the format expected by the API filter, using $expr for comparisons and $find for nesting.
 *
 * @param {object} conditionNode - A node from the ConditionBuilder structure.
 * @returns {object | null} The condition payload object or null if invalid.
 */
function buildApiConditionPayloadRecursive(conditionNode) {
    if (!conditionNode || typeof conditionNode !== 'object') {
        console.warn("Invalid node in buildApiConditionPayloadRecursive:", conditionNode);
        return null;
    }

    // --- Handle Logical Operators ($and, $or) ---
    if (conditionNode.$and && Array.isArray(conditionNode.$and)) {
        const subPayloads = conditionNode.$and.map(buildApiConditionPayloadRecursive).filter(p => p !== null);
        if (subPayloads.length === 0) return null;
        if (subPayloads.length === 1) return subPayloads[0];
        return { '$and': subPayloads };
    }
    if (conditionNode.$or && Array.isArray(conditionNode.$or)) {
        const subPayloads = conditionNode.$or.map(buildApiConditionPayloadRecursive).filter(p => p !== null);
        if (subPayloads.length === 0) return null;
        if (subPayloads.length === 1) return subPayloads[0];
        return { '$or': subPayloads };
    }

    // --- Handle Simple Condition { model?, path, op, value } ---
    if (conditionNode.path && Array.isArray(conditionNode.path) && conditionNode.op) {
        const path = conditionNode.path;

        if (path.length === 0) {
            console.warn("Simple condition node has empty path:", conditionNode);
            return null;
        }

        // --- Build the core $expr payload ---
        const finalFieldName = path[path.length - 1];
        const segmentsForNesting = path.slice(0, -1); // Path segments before the last one

        // ***** CORRECTED LOGIC *****
        // Determine the field path for the $expr based on nesting level
        const fieldPathForExpr = segmentsForNesting.length === 0
            ? `$${finalFieldName}`          // Top-level field: $fieldName
            : `$$this.${finalFieldName}`;   // Nested field (inside $find): $$this.fieldName
        // ***** END CORRECTION *****

        const operator = conditionNode.op;
        const value = conditionNode.value;
        const exprOperator = operatorToExprOperatorMap[operator];

        let exprPayload; // This will hold the { $operator: [ field, value ] } part

        if (!exprOperator) {
            console.warn(`Unsupported operator for $expr conversion: ${operator}`);
            return null;
        }

        // --- Build the specific $expr based on the operator ---
        switch (exprOperator) {
            case '$nin':
                const ninValueArray = Array.isArray(value) ? value : String(value).split(',').map(s => s.trim()).filter(Boolean);
                // Note: $nin at the top level is often better handled *outside* $expr
                // but for consistency with $find, we keep it inside $expr here.
                // If segmentsForNesting.length === 0, a standard query { field: { $nin: [...] } } might be more efficient.
                exprPayload = { '$not': { '$in': [fieldPathForExpr, ninValueArray] } };
                break;
            case '$in':
                const inValueArray = Array.isArray(value) ? value : String(value).split(',').map(s => s.trim()).filter(Boolean);
                // Similar note as $nin regarding top-level efficiency.
                exprPayload = { '$in': [fieldPathForExpr, inValueArray] };
                break;
            case '$regexMatch':
                exprPayload = {
                    '$regexMatch': {
                        input: fieldPathForExpr,
                        regex: String(value),
                        options: 'i'
                    }
                };
                break;
            case '$exists':
                const shouldExist = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
                // Using $ne/$eq with $type is a common way to check existence in $expr
                exprPayload = {
                    [shouldExist ? '$ne' : '$eq']: [ { $type: fieldPathForExpr }, "undefined" ]
                };
                // Note: For top-level, { field: { $exists: true/false } } is standard.
                break;
            default:
                // Standard binary operators ($eq, $ne, $gt, $gte, $lt, $lte)
                let processedValue = value;
                // Basic type guessing for common string values
                if (operator === '$eq' || operator === '$ne') {
                    if (value === 'true') processedValue = true;
                    else if (value === 'false') processedValue = false;
                    else if (value === 'null') processedValue = null;
                    // Avoid automatic number conversion for eq/ne unless explicitly needed
                } else if (['$gt', '$gte', '$lt', '$lte'].includes(operator)) {
                    // Attempt number conversion for comparison operators
                    const num = Number(value);
                    if (!isNaN(num) && String(value).trim() !== '') {
                        processedValue = num;
                    }
                    // TODO: Consider adding date conversion if field type is known
                }
                exprPayload = { [exprOperator]: [fieldPathForExpr, processedValue] };
                break;
        }

        // The final payload for the innermost level is the $expr object
        const corePayload = exprPayload;

        // --- Structure the filter using nested $find based on the path segments before the last one ---
        return buildNestedFindStructure(segmentsForNesting, corePayload);
    }

    // Log warning for unknown structures
    console.warn("Unknown structure encountered in buildApiConditionPayloadRecursive:", conditionNode);
    return null;
}


/**
 * Transforms a ConditionBuilder condition object into the specific filter format
 * for the /api/data/search endpoint.
 * The final format is { filter: { ... } }.
 *
 * @param {object | null | undefined} condition - The condition object from ConditionBuilder.
 * @returns {object} The filter object in the format { filter: { ... } }.
 *                   Returns { filter: {} } if the condition is invalid/empty.
 */
export function conditionToApiSearchFilter(condition) {
    // Handle null or invalid input condition
    if (!condition || typeof condition !== 'object') {
        return { filter: {} }; // Return empty filter for invalid input
    }

    // Build the main filter content using the recursive payload builder
    const filterContent = buildApiConditionPayloadRecursive(condition);

    // Return the final structure, ensuring filterContent is not null
    return { filter: filterContent || {} };
}


export const getFieldValueHash = (model, data) => {
    const uniqueFields = model.fields.filter(f => f.unique).map(m => m.name);
    const fs = model.fields.map(m => m.name);
    const fields = ['_model', '_user', ...(uniqueFields.length ? uniqueFields : fs)];
    return getObjectHash(data, fields);
}


/**
 * Obtient une représentation textuelle lisible d'un enregistrement de données.
 * Gère les relations de manière récursive pour afficher des informations pertinentes.
 *
 * @param {object} model - La définition du modèle pour la `data` actuelle.
 * @param {object} data - L'enregistrement de données à convertir en chaîne de caractères.
 * @param {function} t - La fonction de traduction i18next.
 * @param {array} allModels - Un tableau contenant les définitions de TOUS les modèles du système.
 * @returns {string} - La chaîne de caractères représentant la donnée.
 */
export const getDataAsString = (model, data, tr, allModels, extended=false) => {
    const { t, i18n} = tr;
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    // Cas de base : si le modèle ou les données sont manquants, on ne peut rien faire.
    if (!model || !data) {
        return '';
    }

    // 1. Déterminer les champs à afficher
    // On privilégie les champs marqués comme "asMain"
    let parts;
    if( extended )
        parts = model.fields.map(m => m.name);
    else
        parts = model.fields.filter(f => f.asMain).map(m => m.name);

    // 2. Si aucun champ "asMain", on cherche des champs standards (nom, titre, etc.)
    if (!parts.length) {
        for (const main of mainFieldsTypes) {
            const f = model.fields?.find((f) => f.type === main)?.name;
            if (f) {
                parts.push(f);
                break; // On ne prend que le premier trouvé
            }
        }
    }

    // 3. Si toujours rien, on se rabat sur l'_id
    if (!parts.length) {
        parts.push('_id');
    }

    // 4. Construire la chaîne de caractères finale
    const resultString = parts.map(fieldName => {
        const fieldDef = model.fields.find(f => f.name === fieldName);
        const value = data[fieldName];

        if (!fieldDef || value === null || value === undefined) {
            return null; // Ignore les champs ou valeurs non définis
        }

        // --- NOUVELLE LOGIQUE POUR LES RELATIONS ---
        if (fieldDef.type === 'relation' && value) {
            const relatedModel = allModels?.find(m => m.name === fieldDef.relation);
            if (!relatedModel) return `[${fieldDef.relation}]`; // Modnon trouvé

            // Si la relation est multiple (un tableau d'objets)
            if (Array.isArray(value)) {
                return value
                    .map(item => getDataAsString(relatedModel, item, t, allModels)) // Appel récursif pour chaque item
                    .filter(Boolean)
                    .join(', ');
            }
            // Si la relation est simple (un seul objet)
            else if (typeof value === 'object') {
                return getDataAsString(relatedModel, value, t, allModels); // Appel récursif
            }
        }

        if(fieldDef.type === 'datetime'){
            return new Date(value).toLocaleDateString(lang, {year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'});
        }
        if(fieldDef.type === 'date'){
            return new Date(value).toLocaleDateString(lang, {year: 'numeric', month: 'numeric', day: 'numeric'});
        }
        // --- FIN DE LA NOUVELLE LOGIQUE ---

        // Logique existante pour les autres types de champs
        if (value.value !== undefined) {
            return value.value; // Champs traduits
        }

        if( typeof(value) === 'string' ) {
            const translatedValue = t(value, {defaultValue: value});
            return translatedValue || value.toString();
        }
        if( typeof(value) === 'object' ) {
            return JSON.stringify(value, null, 2);
        }
        return value;

    }).filter(Boolean).join(', ');

    // Si après tout ça la chaîne est vide (ex: l'ID est le seul champ mais on ne veut pas l'afficher seul)
    // On retourne l'ID pour avoir au moins un identifiant.
    return resultString || data._id;
}