export const dbName = "engine";

export const cookiesSecret = 'hoaivuymzovyoznllmafivpzaovphlejvalwjvelfhqochakfesv';

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
export const maxTotalPrivateFilesSize = 250 * megabytes;

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
metaModels['website'] = { load: ['webpage', 'content', 'taxonomy', 'contact', 'event', 'resource'], 'require': ['i18n'] };
metaModels['messaging'] = { load: ['alert','ticket', 'message', 'channel'], 'require': ['i18n'] };
metaModels['eshopping'] = { load: [
        'order', 'currency', 'product', 'productVariant', 'discount', 'cart', 'cartItem',
        'brand', 'return', 'review', 'stock', 'returnItem', 'userSubscription',
        'warehouse', 'shipment', 'campaign', 'stockAlert', 'invoice'],
    'require': ['i18n', 'users', 'messaging'] };
metaModels['workflow'] = { load: ['env', 'workflow', 'workflowRun', 'workflowAction', 'workflowStep', 'workflowTrigger']};
metaModels['erp'] = { load: [ 'accountingExercise', 'accountingLineItem', 'accountingEntry', 'employee', 'dashboard', 'kpi'] };


export const allowedFields = ['locked', 'hiddenable', 'anonymized', 'condition', 'color', 'index', 'type', 'required', 'hint', 'default', 'validate', 'unique', 'name', 'placeholder', 'asMain'];


