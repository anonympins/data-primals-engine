import { getCollectionForUser, modelsCollection } from "../mongodb.js";
import { Logger } from "../../gameObject.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {searchData,  patchData, deleteData, insertData} from "../data/index.js";
import { getDataAsString } from "../../data.js";
import i18n from "../../i18n.js";
import {generateLimiter} from "../user.js";
import rateLimit from "express-rate-limit";
import {maxAIReflectiveSteps} from "../../constants.js";
import {providers} from "./constants.js";
import {ChatDeepSeek} from "@langchain/deepseek";
import {ChatAnthropic} from "@langchain/anthropic";

let logger = null;

export const getAIProvider= (aiProvider, aiModel, apiKey)=>{
    let llm;
    try {
        switch (aiProvider) {
        case 'OpenAI':
            llm = new ChatOpenAI({apiKey, model: aiModel, temperature: 0.7});
            break;
        case 'Google':
            llm = new ChatGoogleGenerativeAI({apiKey, model: aiModel, temperature: 0.7});
            break;
        case 'DeepSeek':
            llm = new ChatDeepSeek({apiKey, model: aiModel, temperature: 0.7});
            break;
        case 'Anthropic':
            llm = new ChatAnthropic({apiKey, model: aiModel, temperature: 0.7});
            break;
        default:
            throw new Error(`Unsupported AI provider: ${aiProvider}`);
        }
        return llm;
    }
    catch (e) {
        return null;
    }
}
export const assistantGlobalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Fenêtre de 15 minutes
    max: 100, // Limite à 100 requêtes globales pour l'assistant pendant la fenêtre (vous pouvez ajuster cette valeur)
    standardHeaders: true, // Active les en-têtes standard `RateLimit-*`
    legacyHeaders: false, // Désactive les anciens en-têtes `X-RateLimit-*`
    message: { success: false, message: "Trop de requêtes globales envoyées à l'assistant. Veuillez réessayer plus tard." },
    skip: (req) => {
        return !!req.fields?.confirmedAction;
    }
});

async function searchModels(query, user) {
    if (!query) return [];
    const searchRegex = new RegExp(query, 'i');
    return await modelsCollection.find({
        $or: [{ _user: user.username }, { _user: { $exists: false } }],
        $and: [{ $or: [{ name: { $regex: searchRegex } }, { description: { $regex: searchRegex } }] }]
    }, {
        projection: { name: 1, description: 1, fields: 1, _id: 0 }
    }).limit(10).toArray();
}

const createSystemPrompt = (modelDefs, lang) => {
    const cond1 = JSON.stringify({ "model": "event", "sort": "startDate:ASC", "limit": 0, "filter": { "$and": [{ "$nin": ["$tags", "festival"] }, { "$lt": ["$endDate", "$$NOW"] }] }}, null, 2);
    const cond2 = JSON.stringify({ "model": "contact", "sort": "legalName:ASC", "limit": 5,"filter": {"$ne": [{ "$type": "$legalName"}, "missing"] }}, null, 2);
    const cond3 = JSON.stringify({ "model": "order", "sort": "_id:DESC", "limit": 10,"filter": {"lang": { "$find": [{ "$eq": ["$$this.code", "fr"] }] } }}, null, 2);
    const cond4 = JSON.stringify({ "model": "order", "sort": "updatedAt:DESC", "limit": 0,"filter": {"user": { "$find": { "roles": { "$find": [{ "$in": ["$$this.name", ["admin", "moderator"]] }] } }}}}, null, 2);

    const date = new Date();
    const dt = date.toISOString();
    return `
Tu es "Prior", un assistant expert en analyse de données pour le moteur data-primals-engine..
Ta mission est d'aider l'utilisateur en répondant à ses questions sur ses données.

REGLE FONDATRICE : suis les règles et ne dévie pas du chemin.
STYLE UTILISE : apporte l'information au plus rapide, sans détours, ni sollicitation à l'utilisateur, ou à des tiers.

FORMAT DE RÉPONSE OBLIGATOIRE :
Un SEUL objet JSON valide contenant exactement 2 champs :
1. "action" (string) 
2. "params" (object)

Tu as accès aux outils suivants. 

OUTILS PRIORITAIRE: (à utiliser avant toute opération sur les données)
1.  **search_models**: Pour rechercher les modèles de données disponibles.
    - Utilisation: { "action": "search_models", "params": { "query": "^regexToSearchFor$" } }
====

2.  **search**: Pour chercher des informations dans les données de l'utilisateur.
    - Utilisation: { "action": "search", "params": { "model": "nomDuModele", "filter": {}, "limit": 10 } }

3.  **post**: Pour créer une nouvelle donnée.
    - Utilisation: { "action": "post", "params": { "model": "nomDuModele", "data": {} } }

4.  **update**: Pour mettre à jour des données existantes.
    - Utilisation: { "action": "update", "params": { "model": "nomDuModele", "filter": {}, "data": {} } }
    - filter est très pratique pour mettre à jour des données ciblées en une seule passe.

5.  **delete**: Pour supprimer des données.
    - Utilisation: { "action": "delete", "params": { "model": "nomDuModele", "filter": {} } }

6.  **displayMessage**: Pour répondre directement à l'utilisateur. N'utilise cette action QUE lorsque tu as toutes les informations nécessaires pour formuler une réponse finale.
    - Utilisation: { "action": "displayMessage", "params": { "message": "Ta réponse textuelle." } }
    
7.  **generateChart**: Pour créer et afficher un graphique à partir des données. 
    - Utilisation: { "action": "generateChart", "params": { ...config } }
    - Le paramètre \`config\` doit contenir :
        - \`title\` (string): Un titre clair pour le graphique.
        - \`model\` (string): Le nom du modèle de données à utiliser.
        - \`type\` (string): Le type de graphique. Peut être 'bar', 'line', 'pie', 'doughnut'.
        - \`aggregationType\` (string): Comment agréger les données. 'count' (par défaut), 'sum', 'avg', 'min', 'max'.
        - \`xAxis\` (string): (Pour bar/line) Le champ pour l'axe des X. Un champ de type date, enum ou string du modèle.
        - \`groupBy\` (string): (Pour pie/doughnut) Le champ sur lequel grouper les données (un champ enum ou relation du modèle).
        - \`yAxis\` (string): (Optionnel, sauf pour sum/avg/min/max) Le champ numérique à agréger du modèle.
        - \`filter\` (object): (Optionnel, filtre de la recherche, même écriture stricte que pour les filtres de recherche (voir plus bas pour les exemples) 

Voici le mémo pour assigner des valeurs aux champs des modèles,avec ces types de données : 
utilise une chaine de caractère convertible en ObjectId (mongodb) lorsque le nom du champ est _id 
utilise une chaine de caracteres lorsque le type de champ est : string, string_t , password, url, phone, email, richtext
utilise un filtre en retour si le type de champ est code et language='json' et conditionBuilder=true
utilise une chaine si c'est un type de champ code par défaut. 
utilise une structure { "iso2langcode":"content..." } pour le champ multi-traductions richtext_t
utilise un booléen pour : boolean
utilise un nombre pour number
utilise une date au format ISO String pour les types de champ : date, datetime
utilise les valeurs de l'attribut items pour les champs de type : enum 
utilise un tableau de données brutes pour les champs de type : array
utilise un _id nécessairement pour remplir les champs relation multiple=false
utilise un tableau d'_ids pour remplir les champs relation multiple=true
utilise la valeur en héxadecimal, ex: '#FF0000' pour les champs de type : color 
utilise les valeurs de cron standard '* * * * * *' pour : cronSchedule 

PROCESSUS DE RAISONNEMENT:
a- L'utilisateur pose une question, ou demande une action de ta part.
b- Utilise l'outil **search_models** pour trouver le(s) modèle(s) qui correspondent à la question.
 Si tu as déjà fait la recherche dans la conversation, garde la définition initiale et n'effectue pas de recherche, va directement à l'étape c
c- Une fois la réponse retournée et intégrée, tu pourras utiliser les autres outils (search, post, etc.) dans la conversation pour satisfaire la question initiale, en utilisant les informations des modèles précédents (COMMANDE FINALE)
Si tu ne sais pas quelle commande utiliser, réponds à l'utilisateur avec "displayMessage".

CONTEXTE ACTUEL:
- Date du jour de la conversation : ${dt}
- La langue ISO à utiliser dans la conversation : ${lang}
- L'utilisateur a accès aux modèles de données suivants et ne peut utiliser les filtres que sur les champs associés:
Si tu as besoin de savoir lesquels, utilise l'outil "search_models".

- Le format de $DATA est { modelFieldName: "value", otherModelFieldName: { subObj : true } }
- Le format des filtres est compréhensible par ses cas d'usage (Il doit être {} par défaut.) :

Par exemple :  
Question : Je voudrais les événements non terminés, qui ne sont pas des festivals ou des salons :
Ta réponse: { "action" : "search_models", "params": { "query": "event|événement" } }
COMMANDE FINALE : { "action" : "search", "params" : ${cond1} }

Question : Donne moi les 5 nouvelles entreprises
Ta réponse: { "action" : "search_models", "params": { "query": "company|entreprise" } }
COMMANDE FINALE : { "action" : "search", "params" : ${cond2} }

Question : Je veux les 10 dernières traductions ajoutées dans la langue française.
Ta réponse: { "action" : "search_models", "params": { "query": "translation|traduction" } }
COMMANDE FINALE : { "action" : "search", "params" : ${cond3} }

Question : Je veux les commandes qui ont été faites par un admin ou un modérateur
Ta réponse: { "action" : "search_models", "params": { "query": "order|commande" } }
COMMANDE FINALE : { "action" : "search", "params" : ${cond4} }

Question : Fais-moi un camembert des produits par catégorie.
Ta réponse: { "action" : "search_models", "params": { "query": "product|produit" } }
COMMANDE FINALE :
{
  "action": "generateChart",
  "params": {
    "title": "Répartition des produits par catégorie",
    "model": "product",
    "type": "pie",
    "groupBy": "category",
    "aggregationType": "count",
    "filter": { "$and": [{"$gt": ["$publishedAt", "2023-10-05T20:12:00Z"]}, {"$lte": ["$publishedAt", "2024-10-05T20:12:00Z"]} ]}
  }
}

Absolute rules:
====
NEVER use the non-aggregated syntax of the MongoDB operators :
Use { "$gt": ["$publishedAt", "2023-10-05T20:12:00Z" ] } and NOT { "publishedAt": { "$gt": "2023-10-05T20:12:00Z" } }
=====
If several filters must be combined or juxtaposed, the operators $and, $or, $nor, $not MUST be used to make the logic.
You need at least one of these operators.
Example : 
Use filters like this: { "$and": [{"$gt": ["$publishedAt", "2023-10-05T20:12:00Z"]}, {"$lte": ["$publishedAt", "2024-10-05T20:12:00Z"]} ]}
You MUST NOT write filters like this : {"$gt": ["$publishedAt", "2023-10-05T20:12:00Z"], "$lte": ["$publishedAt", "2024-10-05T20:12:00Z"]}  without the $and operator
=====
Et si tu dois utiliser une date :
"2025-08-05T20:12:00Z" au lieu de { "$date": "2025-08-05T20:12:00Z" }
=====
- UNE SEULE COMMANDE JSON PAR RÉPONSE
- AUCUN TEXTE HORS DU JSON
- PAS de MARKDOWN pour formatter le JSON, juste le JSON {...} brut.
=====

Exemple d'échange correct :

Ma question: Bonjour, je voudrais les requêtes effectuées aujourd'hui sur le modèle "content".
Ta réponse: { "action" : "search_models", "params": { "query": "request" } }
COMMANDE FINALE : 
{ "action" : "search", "params" : { "model": "request", "filter": { "$and": [{"$gte": "${dt}"}, {"$regexMatch": { "input": "$url", "regex": "content"}}] }, "limit" : 10, "sort" : "_id:DESC" }}`;
}

/**
 * Corrige un filtre généré par l'IA qui pourrait avoir plusieurs opérateurs
 * au premier niveau sans les encapsuler dans un "$and".
 * @param {object} filter - Le filtre potentiellement incorrect.
 * @returns {object} Le filtre corrigé.
 */
function correctAIFilter(filter) {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        return filter; // Pas un objet à corriger
    }

    const keys = Object.keys(filter);
    if (keys.length <= 1) {
        return filter; // Rien à corriger
    }

    // Vérifie si toutes les clés sont des opérateurs (commencent par '$')
    const allKeysAreOperators = keys.every(key => key.startsWith('$'));

    if (allKeysAreOperators) {
        logger.warn(`[Assistant] Correction d'un filtre malformé généré par l'IA. Original: ${JSON.stringify(filter)}`);
        const andConditions = keys.map(key => ({ [key]: filter[key] }));
        return { '$and': andConditions };
    }

    return filter; // Aucune correction nécessaire
}

/**
 * Exécute un outil (tool) non-modifiant et retourne le résultat sous forme de chaîne.
 * @param {string} action - L'action à exécuter ('search', 'search_models').
 * @param {object} params - Les paramètres de l'action.
 * @param {object} user - L'objet utilisateur.
 * @param {Array} allModels - La liste de tous les modèles disponibles.
 * @returns {Promise<string>} - Une chaîne de caractères décrivant le résultat de l'outil.
 */
async function executeTool(action, params, user, allModels) {
    logger.debug(`[Assistant] Exécution de l'outil: ${action} avec les paramètres:`, params);
    try {
        switch (action) {
        case 'search': {
            const modelDef = allModels.find(m => m.name === params.model);
            if (!modelDef) {
                return `Erreur: Le modèle '${params.model}' n'a pas été trouvé. Impossible de lancer la recherche.`;
            }

            const searchResult = await searchData({
                model: params.model,
                filter: params.filter,
                limit: params.limit || 10,
                sort: params.sort
            }, user);

            if (searchResult.data.length === 0) {
                return i18n.t('assistant.noResults', "Aucun résultat trouvé.");
            }

            const resultString = i18n.t('assistant.searchResults', "Voici les résultats :") +
                    searchResult.data.map(item =>
                        `\n- ${getDataAsString(modelDef, item, { i18n, t: i18n.t }, allModels, true)}`
                    ).join('');

            return resultString;
        }
        case 'search_models': {
            const foundModels = await searchModels(params.query, user);

            if (foundModels.length > 0) {
                return "J'ai trouvé les modèles suivants qui pourraient correspondre : " +
                        foundModels.map(m => `\n- Modèle "${m.name}": ${m.description || 'Pas de description.'}\n- Champs: ${m.fields.map(f => JSON.stringify(f, null, 2))}`).join('');
            } else {
                return "Je n'ai trouvé aucun modèle correspondant à votre recherche.";
            }
        }
        default:
            logger.warn(`[Assistant] Tentative d'exécution d'un outil non supporté ou nécessitant confirmation: ${action}`);
            return `Erreur: L'action '${action}' n'est pas un outil exécutable directement.`;
        }
    } catch (error) {
        logger.error(`[Assistant] Erreur lors de l'exécution de l'outil '${action}': ${error.message}`, error.stack);
        return `Erreur lors de l'exécution de l'outil: ${error.message}`;
    }
}
/**
 * Gère la requête de chat, soit en exécutant une action confirmée,
 * soit en lançant la boucle de raisonnement de l'IA.
 * @param {string} message - Le message de l'utilisateur.
 * @param {Array} history - L'historique de la conversation.
 * @param {string} provider - Le fournisseur d'IA ('OpenAI' ou 'google').
 * @param {object} context - Contexte additionnel.
 * @param {object} user - L'objet utilisateur.
 * @param {object} confirmedAction - Une action pré-approuvée par l'utilisateur.
 * @returns {Promise<object>} La réponse de l'assistant.
 */
async function handleChatRequest(message, history, provider, context, user, confirmedAction) {

    const allModels = await modelsCollection.find({$or: [{_user: {$exists: false}}, {_user: user.username}]}).toArray();

    // --- GESTION D'UNE ACTION CONFIRMÉE ---
    if (confirmedAction && confirmedAction.action) {
        try {
            const result = await executeConfirmedAction(confirmedAction.action, confirmedAction.params, user);
            let successMessage = i18n.t('assistant.actionSuccess', "Action exécutée avec succès.");
            if (result.insertedIds) successMessage = i18n.t('assistant.itemCreated', `Élément créé avec l'ID: {{id}}.`, {id: result.insertedIds.join(', ')});
            if (result.modifiedCount) successMessage = i18n.t('assistant.itemsUpdated', `{{count}} élément(s) mis à jour.`, {count: result.modifiedCount});
            if (result.deletedCount) successMessage = i18n.t('assistant.itemsDeleted', `{{count}} élément(s) supprimé(s).`, {count: result.deletedCount});

            return {success: true, displayMessage: successMessage};
        } catch (error) {
            logger.error(`[Assistant] Erreur lors de l'exécution de l'action confirmée: ${error.message}`, error.stack);
            return {
                success: false,
                displayMessage: i18n.t('error.generic', `Erreur : {{message}}`, {message: error.message})
            };
        }
    }

    // --- INITIALISATION DE L'IA ---
    let llm;
    try {
        const p = provider || 'OpenAI';
        const envKeyName = providers[p].key;
        if (!envKeyName) return {success: false, message: `Fournisseur IA non supporté : ${p}`};

        const envCollection = await getCollectionForUser(user);
        const userEnvVar = await envCollection.findOne({_model: 'env', name: envKeyName, _user: user.username});
        const apiKey = userEnvVar?.value || process.env[envKeyName];

        if (!apiKey) return {success: false, message: `Clé API pour ${p} (${envKeyName}) non trouvée.`};

        llm = getAIProvider(p, providers[p]?.defaultModel, apiKey);
    } catch (initError) {
        logger.error(`[Assistant] Erreur d'initialisation du client IA: ${initError.message}`);
        return {success: false, message: `Erreur d'initialisation du client IA: ${initError.message}`};
    }

    // --- PRÉPARATION DE L'HISTORIQUE DE CONVERSATION ---
    const systemPrompt = createSystemPrompt([], user.lang || 'en');
    const conversationHistory = history
        .filter(msg => msg.text && !(msg.from === 'bot' && msg.text.startsWith(i18n.t('assistant.welcome'))))
        .map(msg => new (msg.from === 'user' ? HumanMessage : SystemMessage)(msg.text));

    conversationHistory.unshift(new SystemMessage(systemPrompt));
    conversationHistory.push(new HumanMessage(message));


    // --- BOUCLE DE RAISONNEMENT ET D'EXÉCUTION D'OUTILS ---
    for (let i = 0; i < maxAIReflectiveSteps; i++) {
        logger.debug(`[Assistant] Tour de boucle ${i + 1}. Invocation de l'IA...`);

        const response = await llm.invoke(conversationHistory);
        const llmOutput = response.content;

        // Parsing JSON robuste
        let parsedResponse;
        try {

            parsedResponse = JSON.parse(llmOutput);

            if (!parsedResponse.action || !parsedResponse.params) {
                throw new Error("Réponse JSON invalide: 'action' ou 'params' manquant.");
            }
        } catch (parseError) {
            logger.error(`[Assistant] Erreur de parsing de la réponse de l'IA: ${parseError.message}. Réponse brute: "${llmOutput}"`);
            return {
                success: true,
                displayMessage: llmOutput || i18n.t('assistant.invalidResponse', "Désolé, je n'ai pas pu formuler une réponse correcte. Veuillez réessayer.")
            };
        }

        logger.debug(`[Assistant] Action décidée par l'IA: ${parsedResponse.action}`);
        conversationHistory.push(new SystemMessage(JSON.stringify(parsedResponse)));

        const { action, params } = parsedResponse;

        // Correction automatique du filtre généré par l'IA, qui hallucine parfois
        if (params && params.filter) {
            logger.debug(`[Assistant] Filtre original de l'IA: ${JSON.stringify(params.filter)}`);
            params.filter = correctAIFilter(params.filter);
        }

        // Action de génération de graphique, gérée par le front-end
        if (action === 'generateChart') {
            // On retourne directement la configuration du graphique au client.
            return { success: true, chartConfig: params };
        }

        // Actions nécessitant une confirmation de l'utilisateur
        if (['post', 'update', 'delete'].includes(action)) {
            const confirmationMessage = i18n.t('assistant.confirmActionPrompt', "Veuillez confirmer l'action suivante :");
            return {
                success: true,
                displayMessage: confirmationMessage,
                confirmationRequest: parsedResponse
            };
        }

        // Action finale pour afficher un message
        if (action === 'displayMessage') {
            return { success: true, displayMessage: params.message };
        }

        // Actions à exécuter immédiatement (outils)
        if (['search', 'search_models'].includes(action)) {
            const toolResult = await executeTool(action, params, user, allModels);
            conversationHistory.push(new SystemMessage(`Résultat de l'outil '${action}':\n${toolResult}`));
            continue; // On continue la boucle pour que l'IA puisse raisonner avec ce nouveau résultat
        }

        // Si l'action n'est reconnue par aucune des logiques ci-dessus
        logger.warn(`[Assistant] Action non reconnue reçue de l'IA: ${action}`);
        return {
            success: true,
            displayMessage: i18n.t('assistant.unknownAction', "Désolé, je ne comprends pas la commande '{{action}}'.", { action })
        };
    }

    // Si la boucle se termine sans une action finale
    logger.warn("[Assistant] La boucle a atteint le nombre maximum de tours sans réponse finale.");
    return {
        success: true,
        displayMessage: i18n.t('assistant.loopTimeout', "Désolé, je n'ai pas réussi à terminer ma pensée. Pouvez-vous reformuler votre demande ?")
    };
}
/**
 * Exécute une action de modification (post, update, delete) après confirmation de l'utilisateur.
 * @param {string} action - L'action à exécuter ('post', 'update', 'delete').
 * @param {object} params - Les paramètres de l'action.
 * @param {object} user - L'objet utilisateur.
 * @returns {Promise<object>} - Le résultat de l'opération de base de données.
 */
async function executeConfirmedAction(action, params, user) {
    logger.info(`[Assistant] Exécution de l'action confirmée par l'utilisateur: ${action}`);
    switch (action) {
    case 'post':
        // Note : on passe false pour ne pas redéclencher de workflow ici
        return await insertData(params.model, params.data, {}, user, false, false);
    case 'update':
        return await patchData(params.model, params.filter, params.data, {}, user);
    case 'delete':
        // Le modèle est dans les params, pas besoin de le passer en argument sparé
        return await deleteData(params.model, params.filter, user);
    default:
        throw new Error(`Action confirmée non supportée: ${action}`);
    }
}


export async function onInit(engine) {
    logger = engine.getComponent(Logger);

    const {middlewareAuthenticator, userInitiator} = await import('../user.js');

    engine.post('/api/assistant/chat', [middlewareAuthenticator, userInitiator, assistantGlobalLimiter, generateLimiter], async (req, res) => {
        // On récupère TOUTES les propriétés du body, y compris l'action confirmée
        const {message, history, provider, context, confirmedAction} = req.fields;

        // La validation ne s'applique que s'il n'y a pas d'action confirmée
        if (!confirmedAction) {
            if (typeof (message) !== 'string' || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    message: i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["message"])
                });
            }
            if (message.length > 4096) {
                return res.status(400).json({
                    success: false,
                    message: 'Le message ne doit pas dépasser 4096 caractères.'
                });
            }
        }

        try {
            const result = await handleChatRequest(message, history, provider, context, req.me, confirmedAction);
            res.json(result);
        } catch (error) {
            logger.error(`[Endpoint /api/assistant/chat] Erreur inattendue: ${error.message}`, error.stack);
            res.status(500).json({success: false, message: "Une erreur interne est survenue."});
        }
    });
    logger.info("Module 'assistant' loaded and endpoint '/api/assistant/chat' registered.");
}