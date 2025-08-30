import {uuidv4} from "../src/core.js";


export function setScenarioVariables(context, events, done) {
    // context.vars is where we store variables for the virtual user's session
    context.vars.vuId = uuidv4().replace(/-/g, '');
    context.vars.demoUser = `perf${Math.floor(Math.random() * 9000000) + 1000000}`;
    return done();
}
// Hook to name requests to aggregate metrics by endpoint
export function metricsByEndpoint_beforeRequest(requestParams, context, ee, next) {
    // Remove query parameters for the metric name
    const urlPath = requestParams.url.split('?')[0];

    // Replace unique IDs (ObjectId or UUID) in the URL with a placeholder for aggregation
    // Example: /api/data/60d0fe4f5311236168a109ca -> /api/data/:id
    const name = urlPath.replace(/([a-fA-F0-9]{24}|[a-fA-F0-9-]{36})/g, ':id');

    // Emit an internal Artillery event to name the request
    ee.emit('request:set_name', name);

    return next();
}

// Hook pour logger les erreurs de manière détaillée
export function metricsByEndpoint_afterResponse(requestParams, response, context, ee, next) {
    // On vérifie si le statut est un code d'erreur (4xx ou 5xx)
    if (response.statusCode >= 400) {
        console.error(`\n[ERREUR] Requête ${requestParams.method} ${requestParams.url} a échoué avec le statut ${response.statusCode}`);
        // On log le corps de la réponse, qui contient souvent le message d'erreur du serveur
        if (response.body) {
            console.error(` -> Réponse: ${response.body}\n`);
        }
    }
    // On passe à la suite du scénario
    return next();
}
