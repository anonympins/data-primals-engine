
export const MONGO_CALC_OPERATORS = {
    $find: {
        label: 'Find in relation',
        description: 'Recherche dans une relation/tableau',
        supportsNesting: true,
        multi: false,
        isFindOperator: true // Nouvelle propriété pour identifier les opérateurs $find
    },
    '$regexMatch': {
        label: 'Find by regex',
        description: 'Find a string matching a regular expression (Ecmascript)',
        args: 2, // input et regex
        specialStructure: true // Indique une structure spéciale
    },
    $and: { label: 'Et (and)', description: 'Renvoie vrai si toutes les conditions sont vérifiées', args: 1, multi: true },
    $or: { label: 'Ou (or)', description: 'Renvoie vrai si au moins une des conditions est vérifiée.', args: 1, multi: true },
    $not: { label: 'Non (not)', description: 'Inverse la condition (ex: non égal à).', args: 1, multi: true },
    $nor: { label: 'Ou Non (nor)', description: 'Renvoie vrai si aucune des conditions n\'est vérifiée', args: 1, multi: true },
    $eq: { label: '=', multi: false, args: 2 },
    $ne: { label: '!=', multi: false, args: 2 },
    $gt: { label: '>', multi: false, args: 2 },
    $gte: { label: '>=', multi: false, args: 2 },
    $lt: { label: '<', multi: false, args: 2 },
    $lte: { label: '<=', multi: false, args: 2 },
    $in: { label: 'in', multi: true, args: 2 },
    $nin: { label: 'nin', multi: true, args: 2 },
    $all: { label: 'afll', multi: true },
    $size: {
        label: 'size',
        multi: false,
        description: 'Renvoie le nombre d\'éléments dans un tableau',
        disableAdvancedValue: true
    },
    $elemMatch: { label: 'elemMatch', multi: true },
    $type: {
        label: 'type',
        description: 'Renvoie le type BSON de l\'élément',
        multi: false,
        disableAdvancedValue: true
    },
    $add: { label: '+', multi: true },
    $subtract: { label: '-', multi: false, args: 2 },
    $multiply: { label: '*', multi: true },
    $divide: { label: '/', multi: false, args: 2 },
    $mod: { label: '%', multi: false, args: 2 },
    $pow: { label: 'pow', multi: false },
    $sqrt: { label: 'sqrt', multi: false },
    $exp: { label: 'exp', multi: false },
    $abs: { label: 'abs', multi: false },
    $ceil: { label: 'ceil', multi: false },
    $floor: { label: 'floor', multi: false },
    $ln: { label: 'ln', multi: false },
    $log10: { label: 'log', multi: false },
    $concat: { label: 'concat', multi: true },

    // Date-specific
    $year: { label: 'year', multi: false, isDate: true },
    $month: { label: 'month', multi: false, isDate: true },
    $dayOfMonth: { label: 'dayOfMonth', multi: false, isDate: true },
    $hour: { label: 'hour', multi: false, isDate: true },
    $minute: { label: 'minute', multi: false, isDate: true },
    $second: { label: 'second', multi: false, isDate: true },
    $millisecond: { label: 'ms', multi: false, isDate: true },
    $toBool: { label: 'toBool', multi: false, converter: true },
    $toString: { label: 'toString', multi: false, converter: true },
    $toInt: { label: 'toInt', multi: false, converter: true },
    $toDouble: { label: 'toDouble', multi: false, converter: true }
};

export const convertInputValue = (value) => {
    if (typeof value !== 'string') return value;

    if (value.startsWith('$')) {
        // C'est une référence de champ
        return value;
    }

    // Si la valeur est une chaîne entourée de guillemets, on la conserve telle quelle
    if (/^['"].*['"]$/.test(value)) {
        return value.slice(1, -1); // Retire les guillemets
    }

    // Conversion en nombre si possible
    if (!isNaN(value) && value.trim() !== '') {
        return Number(value);
    }

    if (value.toLowerCase() === 'null') return null;

    // Conversion en booléen pour 'true' et 'false'
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Par défaut, retourne la chaîne telle quelle
    return value;
};

const parseNode = (node, pathPrefix = '$') => {
    if (node && node.path && Array.isArray(node.path)) {
        return node;
    }

    if (!node || typeof node !== 'object' || Array.isArray(node)) {
        return null;
    }

    const keys = Object.keys(node);
    if (keys.length === 0) return null;

    // Gestion des $find
    if (keys.length === 1 && keys[0] === '$find') {
        const findCondition = node.$find;
        const parsedCondition = parseNode(findCondition, pathPrefix === '$' ? '$$this.' : pathPrefix);

        if (parsedCondition) {
            return {
                ...parsedCondition,
                path: parsedCondition.path || [],
                op: '$find',
                value: parsedCondition
            };
        }
    }

    // Gestion des opérateurs logiques
    if (keys.length === 1 && (keys[0] === '$and' || keys[0] === '$or')) {
        const children = node[keys[0]]
            .map(childNode => parseNode(childNode, pathPrefix))
            .filter(Boolean);
        return { [keys[0]]: children };
    }

    // Gestion des opérateurs de comparaison
    if (keys[0].startsWith('$')) {
        const op = keys[0];
        const args = node[op];

        // Cas spécial pour regexMatch
        if (op === '$regexMatch' && typeof args === 'object') {
            const transformExpr = reverseTransformExpr(args.input, pathPrefix === '$$this.');
            return {
                path: transformExpr.path || [args.input.substring(pathPrefix.length).split('.')],
                op: '$regex',
                value: args.regex,
                transform: transformExpr.transform
            };
        }

        // Cas spécial pour exists
        if ((op === '$ne' || op === '$eq') && Array.isArray(args) && args.length === 2 &&
            typeof args[0] === 'object' && args[0].$type && args[1] === 'missing') {
            const transformExpr = reverseTransformExpr(args[0].$type, pathPrefix === '$$this.');
            return {
                path: transformExpr.path || [args[0].$type.substring(pathPrefix.length).split('.')],
                op: '$exists',
                value: op === '$ne',
                transform: transformExpr.transform
            };
        }

        // Cas normal avec transformation
        if (Array.isArray(args) && args.length === 2) {
            const transformExpr = reverseTransformExpr(args[0], pathPrefix === '$$this.');
            return {
                path: transformExpr.path || [args[0].substring(pathPrefix.length).split('.')],
                op,
                value: args[1],
                transform: transformExpr.transform
            };
        }

        // Cas des transformations pures
        const transformExpr = reverseTransformExpr(node, pathPrefix === '$$this.');
        if (transformExpr && transformExpr.transform) {
            return {
                path: transformExpr.path || [keys[0].substring(1)],
                transform: transformExpr.transform
            };
        }
    }

    // Gestion des champs simples
    const path = keys[0];
    if (typeof path === 'string' && !path.startsWith('$')) {
        const condition = node[path];
        if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
            if (condition.$find) {
                const parsedInnerNode = parseNode(condition.$find, '$$this.');
                if (parsedInnerNode) {
                    return {
                        ...parsedInnerNode,
                        path: [path, ...(parsedInnerNode.path || [])]
                    };
                }
            } else {
                const parsedCondition = parseNode(condition, pathPrefix);
                if (parsedCondition) {
                    return {
                        ...parsedCondition,
                        path: [path, ...(parsedCondition.path || [])]
                    };
                }
            }
        } else {
            return {
                path: [path],
                op: '$eq',
                value: condition
            };
        }
    }

    return null;
};


export const buildRootFromExpr = (query) => {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
        return { $and: [] };
    }

    const exprToParse = query.$expr || query;
    const parsedRoot = parseNode(exprToParse);

    if (!parsedRoot) return { $and: [] };
    if (parsedRoot.$and || parsedRoot.$or) return parsedRoot;

    return { $and: [parsedRoot] };
};

export const pagedFilterToMongoConds = (pagedFilters, model) => {
    const modelFilter = pagedFilters?.[model.name] || {};
    const filterKeys = Object.keys(modelFilter);

    // Si le filtre est vide, on retourne un tableau vide.
    if (filterKeys.length === 0) {
        return [];
    }

    // Détecte si c'est un filtre avancé (contient des opérateurs logiques de haut niveau comme $and, $or, etc.)
    const isAdvancedFilter = filterKeys.some(key => key.startsWith('$'));

    if (isAdvancedFilter) {
        // C'est un filtre avancé du ConditionBuilder.
        // Il est déjà une condition MongoDB complète. On le met dans un tableau pour l'insérer dans le $and global.
        // Si le filtre avancé est vide (ex: { $and: [] }), on le retourne quand même pour que le ConditionBuilder puisse s'initialiser correctement.
        return [modelFilter];
    } else {
        // C'est un filtre simple (par colonne).
        // On transforme { champ1: cond1, champ2: cond2 } en [{ champ1: cond1 }, { champ2: cond2 }]
        const c = [];
        filterKeys.forEach(fieldName => {
            if (model.fields.some(f => f.name === fieldName)) {
                const condition = modelFilter[fieldName];
                if (condition && typeof condition === 'object' && Object.keys(condition).length > 0) {
                    c.push(condition);
                }
            }
        });
        return c;
    }
};

/**
 * Remplace les placeholders dans un objet filtre.
 * Gère {{userId}}.
 */
export const processFilterPlaceholders = (filter, user) => {
    const processedFilter = JSON.parse(JSON.stringify(filter));
    for (const key in processedFilter) {
        if (processedFilter[key] === '{{userId}}') {
            // Dans le système Primals, le champ utilisateur est souvent `_user`
            // et contient le nom d'utilisateur, pas l'ID. Adaptez si besoin.
            processedFilter[key] = user.username;
        } else if (typeof processedFilter[key] === 'object' && processedFilter[key] !== null) {
            processedFilter[key] = processFilterPlaceholders(processedFilter[key], user);
        }
    }
    return processedFilter;
};