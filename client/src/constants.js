import {host} from "data-primals-engine/constants";

export const seoTitle = 'Self Data Hosting';


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
    { value: '$exists', label: 'existe', inputType: 'boolean' } // Le champ existe (true/false)
    // { value: '$not', label: 'NON (condition)', inputType: 'condition' }, // Pourrait encapsuler une autre condition
    // Ajoutez d'autres opérateurs MongoDB pertinents si besoin ($size, $type, $elemMatch...)
];

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
    SECOND: { mongo: '$second', label: 'sec', type: 'date', unary: true }
};

export const profiles = {
    'personal': ['contact', 'location', 'imageGallery', 'budget', 'currency', 'taxonomy'], // budget,
    'developer': ['alert','endpoint','request','webpage', 'content', 'taxonomy', 'resource', 'translation', 'contact', 'location', 'channel', 'lang', 'token', 'message', 'ticket', 'user', 'permission', 'role'],
    'company': ['alert','request','location', 'campaign', 'order', 'currency', 'product', 'cart', 'cartItem', 'invoice', 'messaging', 'user', 'role', 'permission', 'token','translation', 'lang', 'webpage', 'content', 'taxonomy', 'contact', 'resource', 'accountingExercise', 'accountingLineItem', 'accountingEntry', 'employee', 'kpi', 'dashboard'],
    'engineer': ['alert','endpoint','request','dashboard', 'kpi', 'user', 'role', 'token', 'permission', 'workflow', 'workflowRun', 'workflowStep', "channel", "message", 'workflowAction', 'workflowTrigger']
}

export const OPERAND_TYPES = {
    FIELD: 'field',
    CONSTANT: 'constant',
    PREVIOUS_STEP: 'previousStep'
};


export const getHost = () => {
    return process.env.HOST || host || 'localhost';
}