import { parentPort } from 'worker_threads';

let callIdCounter = 0;
const pendingCalls = new Map();

/**
 * Appelle une fonction sur le thread principal et attend la réponse.
 * @param {string} service - Le nom du service (ex: 'db').
 * @param {string} method - Le nom de la méthode (ex: 'find').
 * @param  {...any} args - Les arguments de la méthode.
 * @returns {Promise<any>}
 */
function callHost(service, method, ...args) {
    return new Promise((resolve, reject) => {
        const callId = callIdCounter++;
        pendingCalls.set(callId, { resolve, reject });
        parentPort.postMessage({ type: 'call', callId, service, method, args });
    });
}

// API exposée au script de l'utilisateur
const db = {
    create: (model, data) => callHost('db', 'create', model, data),
    find: (model, filter, options) => callHost('db', 'find', model, filter, options),
    findOne: (model, filter) => callHost('db', 'findOne', model, filter),
    update: (model, filter, update) => callHost('db', 'update', model, filter, update),
    delete: (model, filter) => callHost('db', 'delete', model, filter),
};

const workflow = {
    run: (name, context) => callHost('workflow', 'run', name, context),
};

const logger = {
    info: (...args) => callHost('log', 'info', ...args),
    warn: (...args) => callHost('log', 'warn', ...args),
    error: (...args) => callHost('log', 'error', ...args),
};

const env = {
    get: (name) => callHost('env', 'get', name),
    getAll: () => callHost('env', 'getAll'),
};

const http = {
    request: (method, url, options) => callHost('http', 'request', method, url, options),
};

/**
 * Exécute le code utilisateur dans un scope sécurisé.
 * @param {string} code - Le code à exécuter.
 * @param {object} context - Le contexte du workflow.
 */
async function runUserCode(code, context) {
    // Crée une fonction asynchrone avec le code utilisateur.
    // Les variables `db`, `logger`, `context`, etc., sont disponibles dans son scope.
    const userFunction = new Function('db', 'workflow', 'logger', 'env', 'http', 'context', `return (async () => { ${code} })();`);

    // Appelle la fonction avec l'API sandboxed.
    return userFunction(db, workflow, logger, env, http, context);
}

// Gestionnaire de messages unique pour le worker
parentPort.on('message', (msg) => {
    // Message initial pour démarrer l'exécution
    if (msg.code) {
        // Le worker ne doit pas se terminer tant que le code n'est pas fini.
        parentPort.ref();
        runUserCode(msg.code, msg.context)
            .then(result => {
                parentPort.postMessage({ type: 'done', result });
            })
            .catch(e => {
                parentPort.postMessage({ type: 'error', error: e.message });
            })
            .finally(() => {
                // Une fois terminé, le worker peut se fermer.
                parentPort.unref();
            });
    }
    // Message de réponse à un appel `callHost`
    else if (msg.type === 'response') {
        const { callId, result, error } = msg;
        if (pendingCalls.has(callId)) {
            const { resolve, reject } = pendingCalls.get(callId);
            if (error) {
                reject(new Error(error));
            } else {
                resolve(result);
            }
            pendingCalls.delete(callId);
        }
    } else if (msg.type === 'call') {
        // Ce cas ne devrait pas arriver (le worker envoie 'call', il ne le reçoit pas),
        // mais on le laisse pour la robustesse.
    }
});