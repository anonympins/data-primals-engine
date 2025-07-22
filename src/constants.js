export const dbName = "engine";

export const cookiesSecret = 'hoaivuymzovyoznllmafivpzaovphlejvalwjvelfhqochakfesv';


export const langs = {
    fr: "Français",
    en: "English",
    ar: "عربي",
    fa: "فارسی",
    it: "Italiano",
    es: "Español",
    el: "Ελληνικά",
    de: "Deutsch",
    cs: "Čeština",
    sv: "Svenska",
    pt: "Português",
    ja: "日本語",
    zh: "简体中文",
    ru: "Русский",
};

export const availableLangs = [
    "en",
    "fa",
    "ar",
    "fr",
    "it",
    "es",
    "pt",
    "de",
    "el",
    "ru",
    "cs",
    "sv",
];

export const awsDefaultConfig = {
    bucketName : 'bucket-primals',
    region: 'eu-north-1',
}

export const emailDefaultConfig = {
    from: "Support - data@primals.net <data@primals.net>"
}

// 10000 tiny users
// 1000 modern users
// 100 mega utilisateurs potentiality
// 250 000 entrées par utilisateur
export const maxModelsPerUser = 1000;
export const maxTotalDataPerUser = 500000;
export const maxDataPerModelPerUser = 10000;
export const maxStringLength = 4096;
export const maxPasswordLength = 100000;
export const maxRichTextLength = 100000;
export const maxExportCount = 50000;
export const maxMagnetsDataPerModel = 100;
export const maxMagnetsModels = 20;
export const defaultMaxRequestData = 500;
export const maxRequestData = 2500;
export const maxPostData = 500;
export const maxRelationsPerData = 1500;
export const install = true;
export const maxFilterDepth = 8;
export const elementsPerPage = 30;


export const maxAlertsPerUser = 15;
export const storageSafetyMargin = 0.95;
export const kilobytes = 1024;
export const megabytes = 1024*1024;

export const maxBytesPerSecondThrottleFile = 800*kilobytes;  // 800ko/s
export const maxBytesPerSecondThrottleData = 200*kilobytes; // 200Ko/s

export const searchRequestTimeout = 15000;

export const maxModelsInCache = 100000;
export const maxModelNameLength = 150;

export const maxDataSize = '20mb';
export const maxFileSize = 20 * 1024 * 1024; // 20 Mo

export const mainFieldsTypes = ['string_t', 'string', 'url', 'enum', 'email', 'phone', 'date', 'datetime'];

export const maxExecutionsByStep = 5;
export const maxWorkflowSteps = 15;

export const maxPrivateFileSize = 20 * megabytes; // Taille max par fichier privé (20 Mo)
export const maxTotalPrivateFilesSizeFree = 125 * megabytes; // Stockage total pour les comptes gratuits (250 Mo)
export const maxTotalPrivateFilesSizeStandard = 250 * megabytes; // Stockage total pour les comptes standard (250 Mo)
export const maxTotalPrivateFilesSizePremium = 20000 * kilobytes * kilobytes; //

export const plans = {
    free:{
        maxModelsPerUser,
        maxTotalDataPerUser,
        maxDataPerModelPerUser,
        requestLimitPerHour: 7200,
    },
    premium: {
        requestLimitPerHour: 250000,
    }
}
//
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


export const metaModels = {};

metaModels['common'] = { load: ['contact', 'location', 'request'] };
metaModels['personal'] = { load: ['budget', 'imageGallery'] };
metaModels['users'] = { load: ['permission', 'role', 'user', 'token'], 'require': ['i18n', 'common'] };
metaModels['i18n'] = { load: ['translation','lang']};
metaModels['website'] = { load: ['webpage', 'content', 'taxonomy', 'contact', 'resource'], 'require': ['i18n'] };
metaModels['messaging'] = { load: ['alert','ticket', 'message', 'channel'], 'require': ['i18n'] };
metaModels['eshopping'] = { load: [
        'order', 'currency', 'product', 'productVariant', 'discount', 'cart', 'cartItem',
        'brand', 'return', 'review', 'stock', 'returnItem', 'userSubscription',
        'warehouse', 'shipment', 'campaign', 'stockAlert', 'invoice'],
    'require': ['i18n', 'users', 'messaging'] };
metaModels['workflow'] = { load: ['env', 'workflow', 'workflowRun', 'workflowAction', 'workflowStep', 'workflowTrigger']};
metaModels['erp'] = { load: [ 'accountingExercise', 'accountingLineItem', 'accountingEntry', 'employee', 'dashboard', 'kpi'] };

export const profiles = {
    'personal': ['contact', 'location', 'imageGallery', 'budget', 'currency', 'taxonomy'], // budget,
    'developer': ['alert','request','webpage', 'content', 'taxonomy', 'resource', 'translation', 'contact', 'location', 'channel', 'lang', 'token', 'message', 'ticket', 'user', 'permission', 'role'],
    'company': ['alert','request','location', 'campaign', 'order', 'currency', 'product', 'cart', 'cartItem', 'invoice', 'messaging', 'user', 'role', 'permission', 'token','translation', 'lang', 'webpage', 'content', 'taxonomy', 'contact', 'resource', 'accountingExercise', 'accountingLineItem', 'accountingEntry', 'employee', 'kpi', 'dashboard'],
    'engineer': ['alert','request','dashboard', 'kpi', 'user', 'role', 'token', 'permission', 'workflow', 'workflowRun', 'workflowStep', "channel", "message", 'workflowAction', 'workflowTrigger']
}

// Dans ConditionBuilder.jsx ou un fichier de constantes partagé
export const mongoOperators = [
    { value: '$eq', label: '==', inputType: 'text' }, // Égal (pour string, number, boolean...)
    { value: '$ne', label: '!=', inputType: 'text' }, // Différent
    { value: '$gt', label: '>', inputType: 'number' }, // Supérieur (nombre, date)
    { value: '$gte', label: '>=', inputType: 'number' }, // Supérieur ou égal à
    { value: '$lt', label: '<', inputType: 'number' }, // Inférieur à
    { value: '$lte', label: '<=', inputType: 'number' }, // Inférieur ou égal à
    { value: '$regex', label: 'contient (regex)', inputType: 'text' }, // Correspondance Regex (pour string)
    { value: '$in', label: 'est dans (liste)', inputType: 'csv' }, // Dans un tableau (valeurs séparées par des virgules)
    { value: '$nin', label: "n'est pas dans (liste)", inputType: 'csv' }, // Pas dans un tableau
    { value: '$exists', label: 'existe', inputType: 'boolean' }, // Le champ existe (true/false)
    // { value: '$not', label: 'NON (condition)', inputType: 'condition' }, // Pourrait encapsuler une autre condition
    // Ajoutez d'autres opérateurs MongoDB pertinents si besoin ($size, $type, $elemMatch...)
];

export const allowedFields = ['locked', 'hiddenable', 'anonymized', 'condition', 'color', 'index', 'type', 'required', 'hint', 'default', 'validate', 'unique', 'name', 'placeholder', 'asMain'];



export const MONGO_OPERATORS = {
    ADD: { mongo: '$add', label: '+', type: 'numeric', multi: true },
    SUBTRACT: { mongo: '$subtract', label: '-', type: 'numeric', multi: false },
    MULTIPLY: { mongo: '$multiply', label: '*', type: 'numeric', multi: true },
    DIVIDE: { mongo: '$divide', label: '/', type: 'numeric', multi: false },
    MODULO: { mongo: '$mod', label: '%', type: 'numeric', multi: false },
    POW: { mongo: '$pow', label: 'pow', type: 'numeric', multi: false },
    SQRT: { mongo: '$sqrt', label: '√', type: 'numeric', multi: false, unary: true },
    ABS: { mongo: '$abs', label: 'abs', type: 'numeric', multi: false, unary: true },
    CEIL: { mongo: '$ceil', label: 'ceil', type: 'numeric', multi: false, unary: true },
    FLOOR: { mongo: '$floor', label: 'floor', type: 'numeric', multi: false, unary: true },
    COS: { mongo: '$cos', label: 'cos', type: 'numeric', multi: false, unary: true },
    ACOS: { mongo: '$acos', label: 'acos', type: 'numeric', multi: false, unary: true },
    SIN: { mongo: '$sin', label: 'sin', type: 'numeric', multi: false, unary: true },
    ASIN: { mongo: '$asin', label: 'asin', type: 'numeric', multi: false, unary: true },
    TAN: { mongo: '$tan', label: 'tan', type: 'numeric', multi: false, unary: true },
    ATAN: { mongo: '$atan', label: 'atan', type: 'numeric', multi: false, unary: true },
    LN: { mongo: '$ln', label: 'ln', type: 'numeric', multi: false, unary: true },
    LOG: { mongo: '$log10', label: 'log', type: 'numeric', multi: false, unary: true },

    CONCAT: { mongo: '$concat', label: 'concat', type: 'string', multi: true },

    YEAR: { mongo: '$year', label: 'year', type: 'date', unary: true },
    MONTH: { mongo: '$month', label: 'month', type: 'date', unary: true },
    WEEK: { mongo: '$week', label: 'week', type: 'date', unary: true },
    DAY_OF_MONTH: { mongo: '$dayOfMonth', label: 'day', type: 'date', unary: true },
    HOUR: { mongo: '$hour', label: 'hour', type: 'date', unary: true },
    MINUTE: { mongo: '$minute', label: 'min', type: 'date', unary: true },
    SECOND: { mongo: '$second', label: 'sec', type: 'date', unary: true },
};

export const OPERAND_TYPES = {
    FIELD: 'field',
    CONSTANT: 'constant',
    PREVIOUS_STEP: 'previousStep',
};

