/**
 * Enables auto-installation at startup
 * @type {boolean}
 */
export const install = true;

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

/**
 * Cookie secret key (if COOKIES_SECRET is set, it will override this variable)
 * @type {string}
 */
export const cookiesSecret = 'hoaivuymzovyoznllmafivpzaovphlejvalwjvelfhqochakfesv';

/**
 * Available languages of the system
 * You need to translate the i18n file, or translations ones.
 * @type {string[]}
 */
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
    "sv"
];

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
    port: 2500,
    secure: false,
    user: 'user',
    pass: 'password'
}

export const useAI = true;

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

/**
 * Timeout for Javacript execution in VMs (in milliseconds)
 * @type {number}
 */
export const timeoutVM = 5000;

export const defaultMaxRequestData = 50000;
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


/**
 * Available model field attributes
 * @type {string[]}
 */
export const allowedFields = ['locked', 'hiddenable', 'anonymized', 'condition', 'color', 'index', 'type', 'required', 'hint', 'default', 'validate', 'unique', 'name', 'placeholder', 'asMain'];


