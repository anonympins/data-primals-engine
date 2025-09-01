/**
 * Enables auto-installation at startup
 * @type {boolean}
 */
export const install = true;

/**
 * Maximum reflective steps to be used by the AI (looping over own research)
 * @type {number}
 */
export const maxAIReflectiveSteps = 4;

/**
 * Database name
 * @type {string}
 */
export const dbName = "engine";

/**
 * Web server host (for cookie domain)
 * @type {string}
 */
export const host = 'localhost'; // or myhost.tld

export const port = 7633;

/**
 * Cookie secret key (if COOKIES_SECRET is set, it will override this variable)
 * @type {string}
 */
export const cookiesSecret = 'hoaivuymzovyoznllmafivpzaovphlejvalwjvelfhqochakfesv';

/**
 * AWS default configuration (overrided by AWS_* environment variables)
 * @type {{bucketName: string, region: string}}
 */
export const awsDefaultConfig = {
    bucketName : 'bucket-primals',
    region: 'eu-north-1'
}

/**
 * Email default configuration (overrided by SMTP_* environment variables)
 * @type {{from: string}}
 */
export const emailDefaultConfig = {
    from: "Support - data@primals.net <data@primals.net>",
    host: 'smtp.mydomain.tld',
    port: 587,
    secure: false,
    user: 'user',
    pass: 'password'
}

/**
 * Maximum number of models per user
 * @type {number}
 */
export const maxModelsPerUser = 1000;

/**
 * Maximum number of data per user
 * @type {number}
 */
export const maxTotalDataPerUser = 500000;

/**
 * Maximum length of a string
 * @type {number}
 */
export const maxStringLength = 4096;

/**
 * Maximum length of a password
 * @type {number}
 */
export const maxPasswordLength = 100000;

/**
 * Maximum length of a rich text
 * @type {number}
 */
export const maxRichTextLength = 100000;

/**
 * Maximum number of exportable data per user per request
 * @type {number}
 */
export const maxExportCount = 50000;

export const maxMagnetsDataPerModel = 100;
export const maxMagnetsModels = 20;

/**
 * Maximum number of data per request
 * @type {number}
 */
export const maxRequestData = 2500;

/**
 * Maximum number of data per post
 * @type {number}
 */
export const maxPostData = 500;


/**
 * Maximum number of relations per data
 * @type {number}
 */
export const maxRelationsPerData = 1500;

/**
 * Maximum number of filters per request
 * @type {number}
 */
export const maxFilterDepth = 8;
export const elementsPerPage = 30;

/**
 * Maximum number of alerts per user
 * @type {number}
 */
export const maxAlertsPerUser = 15;

/**
 * Storage safety margin (between 0 and 1)
 * @type {number}
 */
export const storageSafetyMargin = 0.95;

/**
 * Number of bytes in Kilobytes constant
 * @type {number}
 */
export const kilobytes = 1024;

/**
 * Number of bytes in Megabytes constant
 * @type {number}
 */
export const megabytes = 1024*1024;

/**
 * Maximum bytes per second for data throttling
 * @type {number}
 */
export const maxBytesPerSecondThrottleData = 200*kilobytes; // 200Ko/s

/**
 * Search request timeout (in milliseconds)
 * @type {number}
 */
export const searchRequestTimeout = 15000;

/**
 * Maximum model name length
 * @type {number}
 */
export const maxModelNameLength = 150;

/**
 * Maximum file size (in bytes)
 * @type {number}
 */
export const maxFileSize = 20 * 1024 * 1024; // 20 Mo

/**
 * Main fields types
 * @type {string[]}
 */
export const mainFieldsTypes = ['string_t', 'string', 'url', 'enum', 'email', 'phone', 'date', 'datetime'];

/**
 * Maximum number of executions per step in workflows
 * @type {number}
 */
export const maxExecutionsByStep = 5;
/**
 * Maximum number of steps per workflow
 * @type {number}
 */
export const maxWorkflowSteps = 15;

/**
 * Maximum number of private files per user
 * @type {number}
 */
export const maxPrivateFileSize = 20 * megabytes; // Taille max par fichier privé (20 Mo)

/**
 * Maximum total size of private files (in bytes)
 * @type {number}
 */
export const maxTotalPrivateFilesSize = 250 * megabytes;

export const maxPackData = 5000;
export const maxPackPreviewData = maxPackData / 10;

/**
 * Default maximum number of data per request
 * @type {number}
 */
export const defaultMaxRequestData = 500;

/**
 * Database connections pool size for MongoDB access
 * @type {number}
 */
export const databasePoolSize = 30;

/**
 * TLS options for MongoDB access
 * @type {boolean}
 */
export const tlsAllowInvalidCertificates = false;
export const tlsAllowInvalidHostnames = false;

/**
 * Options for the HTML sanitizer
 * @type {{allowedSchemesByTag: {}, selfClosing: string[], allowedSchemes: string[], enforceHtmlBoundary: boolean, disallowedTagsMode: string, allowProtocolRelative: boolean, allowedAttributes: {a: string[], img: string[], code: string[]}, allowedTags: string[], allowedSchemesAppliedToAttributes: string[]}}
 */
export const optionsSanitizer = {
    allowedTags: [
        "img",
        "address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4",
        "h5", "h6", "hgroup", "main", "nav", "section", "blockquote", "dd", "div",
        "dl", "dt", "figcaption", "figure", "hr", "li", "main", "ol", "p", "pre",
        "ul", "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn",
        "em", "i", "kbd", "mark", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp",
        "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "caption",
        "col", "colgroup", "table", "tbody", "td", "tfoot", "th", "thead", "tr"
    ],
    disallowedTagsMode: 'discard',
    allowedAttributes: {
        a: [ 'href', 'name', 'target' ],
        code: ['class'],
        img: [ 'src', "alt","width","height","style" ]
    },
    // Lots of these won't come up by default because we don't allow them
    selfClosing: [ 'img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta' ],
    // URL schemes we permit
    allowedSchemes: [ 'http', 'https', 'ftp', 'mailto', 'tel' ],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: [ 'href', 'src', 'cite' ],
    allowProtocolRelative: true,
    enforceHtmlBoundary: false
}


/**
 * Meta models are arranging models in groups
 * May evolve in the future with the use of packs
 * @type {{}}
 */
export const metaModels = {};
metaModels['common'] = { load: ['contact', 'location', 'request'] };
metaModels['personal'] = { load: ['budget', 'imageGallery'] };
metaModels['users'] = { load: ['permission', 'role', 'user', 'userPermission', 'token'], 'require': ['i18n', 'common'] };
metaModels['i18n'] = { load: ['translation','lang']};
metaModels['website'] = { load: ['webpage', 'content', 'taxonomy', 'contact', 'event', 'resource'], 'require': ['i18n'] };
metaModels['messaging'] = { load: ['alert','ticket', 'message', 'channel'], 'require': ['i18n'] };
metaModels['eshopping'] = { load: [
    'order', 'currency', 'product', 'productVariant', 'discount', 'cart', 'cartItem',
    'brand', 'return', 'review', 'stock', 'returnItem', 'userSubscription',
    'warehouse', 'shipment', 'stockAlert', 'invoice'],
'require': ['i18n', 'users', 'messaging'] };
metaModels['workflow'] = { load: ['env', 'workflow', 'workflowRun', 'workflowAction', 'workflowStep', 'workflowTrigger']};
metaModels['erp'] = { load: [ 'accountingExercise', 'accountingLineItem', 'accountingEntry', 'employee', 'dashboard', 'kpi'] };


/**
 * Available model field attributes
 * @type {string[]}
 */
export const allowedFields = ['locked', 'hiddenable', 'anonymized', 'condition', 'color', 'index', 'indexType', 'type', 'required', 'hint', 'default', 'validate', 'unique', 'name', 'placeholder', 'asMain'];



export const getHost = () => {
    return process.env.HOST || host || 'localhost';
}

/**
 * Configuration of MongoDB filters
 */
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
    $and: {
        label: 'Et (and)',
        description: 'Renvoie vrai si toutes les conditions sont vérifiées',
        args: 1,
        multi: true
    },
    $or: {
        label: 'Ou (or)',
        description: 'Renvoie vrai si au moins une des conditions est vérifiée.',
        args: 1,
        multi: true
    },
    $not: {label: 'Non (not)', description: 'Inverse la condition (ex: non égal à).', args: 1, multi: true},
    $nor: {
        label: 'Ou Non (nor)',
        description: 'Renvoie vrai si aucune des conditions n\'est vérifiée',
        args: 1,
        multi: true
    },
    $eq: {label: '=', multi: false, args: 2},
    $ne: {label: '!=', multi: false, args: 2},
    $gt: {label: '>', multi: false, args: 2},
    $gte: {label: '>=', multi: false, args: 2},
    $lt: {label: '<', multi: false, args: 2},
    $lte: {label: '<=', multi: false, args: 2},
    $in: {label: 'in', multi: true, args: 2},
    $nin: {label: 'nin', multi: true, args: 2},
    $all: {label: 'afll', multi: true},
    $size: {
        label: 'size',
        multi: false,
        description: 'Renvoie le nombre d\'éléments dans un tableau',
        disableAdvancedValue: true
    },
    $elemMatch: {label: 'elemMatch', multi: true},
    $type: {
        label: 'type',
        description: 'Renvoie le type BSON de l\'élément',
        multi: false,
        disableAdvancedValue: true
    },
    $add: {label: '+', multi: true},
    $subtract: {label: '-', multi: false, args: 2},
    $multiply: {label: '*', multi: true},
    $divide: {label: '/', multi: false, args: 2},
    $mod: {label: '%', multi: false, args: 2},
    $pow: {label: 'pow', multi: false},
    $sqrt: {label: 'sqrt', multi: false},
    $exp: {label: 'exp', multi: false},
    $abs: {label: 'abs', multi: false},
    $ceil: {label: 'ceil', multi: false},
    $floor: {label: 'floor', multi: false},
    $ln: {label: 'ln', multi: false},
    $log10: {label: 'log', multi: false},
    $concat: {label: 'concat', multi: true},

    // Date-specific
    $year: {label: 'year', multi: false, isDate: true},
    $month: {label: 'month', multi: false, isDate: true},
    $dayOfMonth: {label: 'dayOfMonth', multi: false, isDate: true},
    $hour: {label: 'hour', multi: false, isDate: true},
    $minute: {label: 'minute', multi: false, isDate: true},
    $second: {label: 'second', multi: false, isDate: true},
    $millisecond: {label: 'ms', multi: false, isDate: true},
    // Date operators
    $dateAdd: {
        label: 'Add to date',
        description: 'Adds a duration to a date',
        isDate: true,
        specialStructure: true,
        args: [
            {name: 'startDate', label: 'Start Date', type: 'date'},
            {
                name: 'unit',
                label: 'Unit',
                type: 'select',
                options: ['year', 'month', 'day', 'hour', 'minute', 'second']
            },
            {name: 'amount', label: 'Amount', type: 'number'},
            {name: 'timezone', label: 'Timezone', type: 'text', optional: true}
        ]
    },
    $dateSubtract: {
        label: 'Subtract from date',
        description: 'Subtracts a duration from a date',
        isDate: true,
        specialStructure: true,
        args: [
            {name: 'startDate', label: 'Start Date', type: 'date'},
            {
                name: 'unit',
                label: 'Unit',
                type: 'select',
                options: ['year', 'month', 'day', 'hour', 'minute', 'second']
            },
            {name: 'amount', label: 'Amount', type: 'number'},
            {name: 'timezone', label: 'Timezone', type: 'text', optional: true}
        ]
    },
    $dateDiff: {
        label: 'Date Difference',
        description: 'Calculates the difference between two dates in specified units',
        isDate: true,
        specialStructure: true,
        args: [
            {
                name: 'startDate',
                label: 'Start Date',
                type: 'date',
                description: 'The starting date (inclusive)'
            },
            {
                name: 'endDate',
                label: 'End Date',
                type: 'date',
                description: 'The ending date (exclusive)'
            },
            {
                name: 'unit',
                label: 'Unit',
                type: 'select',
                options: ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'],
                description: 'The unit for the result'
            },
            {
                name: 'timezone',
                label: 'Timezone',
                type: 'text',
                optional: true,
                description: 'The timezone (e.g. "Europe/Paris")'
            }
        ]
    },
    $dateToString: {
        label: 'Format date as string',
        description: 'Formats a date as a string',
        isDate: true,
        specialStructure: true,
        args: [
            {
                name: 'date',
                label: 'Date',
                type: 'date'
            },
            {
                name: 'format',
                label: 'Format',
                optional: true,
                type: 'text'
            },
            {
                name: 'timezone',
                label: 'Timezone',
                type: 'text',
                optional: true,
                description: 'The timezone (e.g. "Europe/Paris")'
            }
        ]
    },

    // Converters
    $toBool: {label: 'toBool', multi: false, converter: true},
    $toString: {label: 'toString', multi: false, converter: true},
    $toInt: {label: 'toInt', multi: false, converter: true},
    $toDouble: {label: 'toDouble', multi: false, converter: true},

    // --- Special Query Operators (not for $expr) ---
    // These operators are handled by a standard $match stage, not inside $expr.
    // The UI should use them to construct parts of the main filter object.
    $regex: {
        label: 'Regex',
        description: 'Matches strings using a regular expression. Applied to a specific field.',
        isQueryOperator: true,
        specialStructure: true,
        args: [
            { name: 'pattern', label: 'Pattern', type: 'text', description: 'The regex pattern.' },
            { name: 'options', label: 'Options', type: 'text', optional: true, description: 'Regex options (e.g., "i" for case-insensitivity).' }
        ]
    },

    $text: {
        label: 'Text Search',
        description: 'Performs a full-text search on the collection. Must be a top-level filter condition.',
        isQueryOperator: true,
        isTopLevel: true, // Indicates it's a key in the root of the filter, not under a field name.
        specialStructure: true,
        args: [
            { name: '$search', label: 'Search Terms', type: 'text' },
            { name: '$language', label: 'Language', type: 'text', optional: true },
            { name: '$caseSensitive', label: 'Case Sensitive', type: 'boolean', optional: true },
            { name: '$diacriticSensitive', label: 'Diacritic Sensitive', type: 'boolean', optional: true }
        ]
    },

    $nearSphere: {
        label: 'Near Sphere',
        description: 'Finds documents near a GeoJSON point on a sphere. Applied to a 2dsphere-indexed field.',
        isQueryOperator: true,
        specialStructure: true,
        args: [
            { name: 'geometry', label: 'Center Point (GeoJSON)', type: 'code', language: 'json', description: 'e.g., { "type": "Point", "coordinates": [ -73.93, 40.82 ] }' },
            { name: 'maxDistance', label: 'Max Distance (meters)', type: 'number', optional: true },
            { name: 'minDistance', label: 'Min Distance (meters)', type: 'number', optional: true }
        ]
    },

    $geoWithin: {
        label: 'Geo Within',
        description: 'Selects documents with geospatial data that exists entirely within a specified shape.',
        isQueryOperator: true,
        specialStructure: true,
        args: [
            { name: '$geometry', label: 'Shape (GeoJSON)', type: 'code', language: 'json', description: 'A GeoJSON Polygon or MultiPolygon.' }
        ]
    },

    $geoIntersects: {
        label: 'Geo Intersects',
        description: 'Selects documents whose geospatial data intersects with a specified GeoJSON object.',
        isQueryOperator: true,
        specialStructure: true,
        args: [
            { name: '$geometry', label: 'Geometry (GeoJSON)', type: 'code', language: 'json', description: 'A GeoJSON object to test for intersection.' }
        ]
    },

    // This represents the $geoNear aggregation stage, which has special placement rules.
    $geoNear: {
        label: 'Geo Near (Stage)',
        description: 'Finds and sorts documents by distance. Must be the first operation in a search.',
        isQueryOperator: true,
        isTopLevel: true, // Indicates it's a key in the root of the filter.
        specialStructure: true,
        args: [
            { name: 'near', label: 'Near Point (GeoJSON)', type: 'code', language: 'json', description: 'The point to search near.' },
            { name: 'distanceField', label: 'Distance Field Name', type: 'text', description: 'The output field to store the distance.' },
            { name: 'spherical', label: 'Spherical', type: 'boolean', optional: true, default: true },
            { name: 'query', label: 'Additional Query', type: 'code', language: 'json', optional: true, description: 'Filters documents before distance calculation.' },
            { name: 'maxDistance', label: 'Max Distance (meters)', type: 'number', optional: true }
        ]
    }
};