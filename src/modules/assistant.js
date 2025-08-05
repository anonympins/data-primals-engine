// server/src/modules/assistant.js

import { getCollectionForUser, modelsCollection } from "./mongodb.js";
import { Logger } from "../gameObject.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {searchData,  patchData, deleteData, insertData} from "./data.js";
import { getDataAsString } from "../data.js";
import i18n from "../../src/i18n.js";
import {generateLimiter} from "./user.js";
import rateLimit from "express-rate-limit";

let logger = null;

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

const createSystemPrompt = (modelDefs) => {
    const cond1 = JSON.stringify({ "model": "event", "sort": "startDate:ASC", "limit": 0, "filter": { "$and": [{ "$nin": ["$tags", "festival"] }, { "$lt": ["$endDate", "$$NOW"] }] }}, null, 2);
    const cond2 = JSON.stringify({ "model": "contact", "sort": "legalName:ASC", "limit": 5,"filter": {"$ne": [{ "$type": "$legalName"}, "missing"] }}, null, 2);
    const cond3 = JSON.stringify({ "model": "order", "sort": "_id:DESC", "limit": 10,"filter": {"lang": { "$find": [{ "$eq": ["$$this.code", "fr"] }] } }}, null, 2);
    const cond4 = JSON.stringify({ "model": "order", "sort": "updatedAt:DESC", "limit": 0,"filter": {"user": { "$find": { "roles": { "$find": [{ "$in": ["$$this.name", ["admin", "moderator"]] }] } }}}}, null, 2);

    return `
Tu es "Prior", un assistant expert en analyse de données pour le moteur data-primals-engine..
Ta mission est d'aider l'utilisateur en répondant à ses questions sur ses données.

STRICTEMENT INTERDIT :
- DE FAIRE DES COMMENTAIRES TEXTUELS 
- D'EXPLIQUER CE QUE TU VAS FAIRE
- D'UTILISER DU TEXTE LIBRE SOUS AUCUNE FORME

FORMAT DE RÉPONSE OBLIGATOIRE :
Un SEUL objet JSON valide contenant exactement 2 champs :
1. "action" (string) 
2. "params" (object)

Tu as accès aux outils suivants. Tu ne dois utiliser QUE ces outils.

1.  **search**: Pour chercher des informations dans les données de l'utilisateur.
    - Utilisation: \`{ "action": "search", "params": { "model": "nomDuModele", "filter": $FILTER, "limit": 10 } }\`

2.  **post**: Pour créer une nouvelle donnée.
    - Utilisation: \`{ "action": "post", "params": { "model": "nomDuModele", "data": $DATA } }\`

3.  **update**: Pour mettre à jour des données existantes.
    - Utilisation: \`{ "action": "update", "params": { "model": "nomDuModele", "filter": $FILTER, "data": $DATA } }\` filter est très pratique pour mettre à jour des données ciblées en une seule passe.

4.  **delete**: Pour supprimer des données.
    - Utilisation: \`{ "action": "delete", "params": { "model": "nomDuModele", "filter": $FILTER } }\`

5.  **displayMessage**: Pour répondre directement à l'utilisateur. N'utilise cette action QUE lorsque tu as toutes les informations nécessaires pour formuler une réponse finale.
    - Utilisation: \`{ "action": "displayMessage", "params": { "message": "Ta réponse textuelle." } }\`

La spécification, pour t'aider à construire les filtres, est la suivante :
utilise une chaine de caractère convertible en ObjectId (mongodb) lorsque le nom du champ est _id 
utilise une chaine de caracteres lorsque le type de champ est : string, string_t , password, url, phone, email, richtext
utilise un $FILTER en retour si le type de champ est code et language='json' et conditionBuilder=true
utilise une chaine si c'est un type de champ code par défaut. 
utilise une structure { "iso2langcode":"content..." } pour le champ multi-traductions richtext_t
utilise un booléen pour : boolean
utilise un nombre pour number
utilise une date au format ISO String pour les types de champ : date, datetime,
utilise les valeurs de l'attribut items pour les champs de type : enum 
utilise un tableau de données brutes pour les champs de type : array
utilise un _id nécessairement pour remplir les champs relation multiple=false
utilise un tableau d'_ids pour remplir les champs relation multiple=true
utilise la valeur en héxadecimal, ex: '#FF0000' pour les champs de type : color 
utilise les valeurs de cron standard '* * * * * *' pour : cronSchedule 

PROCESSUS DE RAISONNEMENT:
1. L'utilisateur pose une question.
2. Tu analyses la question et choisis l'outil approprié.
3. Tu réponds IMMÉDIATEMENT avec l'objet JSON correspondant SANS COMMENTAIRE.

Chacune de tes réponses doit être une étape en soi, ou au plus près d'une étape.

CONTEXTE ACTUEL:
- L'utilisateur a accès aux modèles de données suivants et ne peut utiliser les filtres que sur les champs associés:
${modelDefs.map(m => `  - Modèle "${m.name}":\n    Champs: ${JSON.stringify(m.fields.map(f => ({ name: f.name, type: f.type, hint: f.hint })), null, 2)}`).join('\n')}
- Le format de $DATA est { modelFieldName: "value", otherModelFieldName: { subObj : true } }
- Exemples de filtres $FILTER utilisables (ils sont compatibles MongoDB) : 
Filtre utilisable : { $eq: ["$status", 500 ] }
Filtre incorrect : { "status": 500 }
==

Exemples de "params" : 
Je voudrais les événements non terminés, qui ne sont pas des festivals ou des salons :
\`${cond1}\`
Donne moi les 5 nouvelles entreprises
\`${cond2}\`
Je veux les 10 dernières traductions ajoutées dans la langue française.
\`${cond3}\`
Je veux les commandes qui ont été faites par un admin ou un modérateur
\`${cond4}\`

Règles ABSOLUES:
- UNE SEULE COMMANDE JSON PAR RÉPONSE
- AUCUN TEXTE HORS DU JSON
- SI TU N'APPLIQUES PAS CES RÈGLES, LE SYSTÈME TE DÉSACTIVERA

Exemple de réponse CORRECTE :
\`\`\`
json
{
    "action" : "search",
    "params" : {
        "model": "request", "limit" : 10, "sort" : "_id:DESC"
    }
}
\`\`\`

Exemple de réponse INCORRECTE (INTERDIT) :
"Je vais d'abord rechercher ces requêtes. Voici la commande que je vais exécuter..."
`;
}


/**
 * Gère la requête de chat, soit en exécutant une action confirmée,
 * soit en lançant la boucle de raisonnement de l'IA.
 */
/**
 * Gère la requête de chat, soit en exécutant une action confirmée,
 * soit en lanant la boucle de raisonnement de l'IA.
 */
async function handleChatRequest(message, history, provider, context, user, confirmedAction) {

    // --- GESTION D'UNE ACTION CONFIRMÉE ---
    if (confirmedAction && confirmedAction.action) {
        try {
            const result = await executeConfirmedAction(confirmedAction.action, confirmedAction.params, user);
            let successMessage = i18n.t('assistant.actionSuccess', "Action exécutée avec succès.");
            if (result.insertedIds) successMessage = i18n.t('assistant.itemCreated', `Élément créé avec l'ID: {{id}}.`, { id: result.insertedIds.join(', ') });
            if (result.modifiedCount) successMessage = i18n.t('assistant.itemsUpdated', `{{count}} élément(s) mis à jour.`, { count: result.modifiedCount });
            if (result.deletedCount) successMessage = i18n.t('assistant.itemsDeleted', `{{count}} élément(s) supprimés.`, { count: result.deletedCount });

            return { success: true, displayMessage: successMessage };
        } catch (error) {
            logger.error(`[Assistant] Erreur lors de l'exécution de l'action confirmée: ${error.message}`, error.stack);
            return { success: false, displayMessage: i18n.t('error', `Erreur : {{message}}`, { message: error.message }) };
        }
    }
    // --- FIN DE LA GESTION DE CONFIRMATION ---

    const { modelName } = context;

    // --- Étape 1: Initialisation de l'IA ---
    let apiKey;
    let p = provider || 'openai';
    const providers = { "openai": "OPENAI_API_KEY", "google": "GOOGLE_API_KEY" };
    const envKeyName = providers[p];
    if (!envKeyName) return { success: false, message: `Fournisseur IA non supporté : ${p}` };

    const envCollection = await getCollectionForUser(user);
    const userEnvVar = await envCollection.findOne({ _model: 'env', name: envKeyName, _user: user.username });
    apiKey = userEnvVar?.value || process.env[envKeyName];

    if (!apiKey) return { success: false, message: `Clé API pour ${provider} (${envKeyName}) non trouvée.` };

    let llm;
    try {
        llm = p === 'openai'
            ? new ChatOpenAI({ apiKey, modelName: "gpt-4o-mini", temperature: 0.2, response_format: { "type": "json_object" } })
            : new ChatGoogleGenerativeAI({ apiKey, modelName: "gemini-1.5-pro-latest", temperature: 0.2, response_format: { "type": "json_object" } });
    } catch (initError) {
        return { success: false, message: `Initialisation du client IA pour ${p}: ${initError.message}` };
    }

    // --- Étape 2: Préparation du contexte pour l'IA ---
    const allModels = await modelsCollection.find({ $or: [{ _user: { $exists: false } }, { _user: user.username }] }).toArray();
    const relevantModelNames = new Set([modelName, 'alert', 'kpi', "dashboard", "request", "translation"]);
    const modelDefs = allModels.filter(m => relevantModelNames.has(m.name));

    const systemPrompt = createSystemPrompt(modelDefs);

    const conversationHistory = history
        .filter(msg => !(msg.from === 'bot' && msg.text.startsWith(i18n.t('assistant.welcome'))))
        .map(msg => new (msg.from === 'user' ? HumanMessage : SystemMessage)(msg.text));

    conversationHistory.unshift(new SystemMessage(systemPrompt));
    conversationHistory.push(new HumanMessage(message));

    const maxTurns = 5;

    // --- Étape 3: La boucle de raisonnement ---
    for (let i = 0; i < maxTurns; i++) {
        logger.debug(`[Assistant] Tour de boucle ${i + 1}. Invocation de l'IA...`);

        const response = await llm.invoke(conversationHistory);
        const llmOutput = response.content;

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(llmOutput);
            if (!parsedResponse.action || !parsedResponse.params) {
                throw new Error("Format de réponse invalide.");
            }
        } catch (parseError) {
            // Si ce n'est pas du JSON valide, on nettoie et affiche
            const cleanedOutput = llmOutput.replace(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g, '').trim();
            return {
                success: true,
                displayMessage: cleanedOutput || i18n.t('assistant.invalidResponse', "Réponse non valide.")
            };
        }

        // Exécution IMMÉDIATE des actions sans confirmation (sauf pour post/update/delete)
        switch (parsedResponse.action) {
        case 'search': {
            const searchResult = await searchData({
                model: parsedResponse.params.model,
                filter: parsedResponse.params.filter,
                limit: parsedResponse.params.limit || 10
            }, user);
                
            const resultString = searchResult.data.length > 0
                ? i18n.t('assistant.searchResults', "Voici les résultats :") +
                    searchResult.data.map(item =>
                        `\n- ${getDataAsString(allModels.find(m => m.name === parsedResponse.params.model), item, i18n.t, allModels, true)}`
                    ).join('')
                : i18n.t('assistant.noResults', "Aucun résultat trouvé.");

            return { success: true, displayMessage: resultString };
        }
        case 'displayMessage':
            return { success: true, displayMessage: parsedResponse.params.message };
        case 'code':
            return { success: true, displayMessage: "Voici le code : " + parsedResponse.params.code };
        case 'post':
        case 'update':
        case 'delete': {
            const { model, filter, data } = parsedResponse.params;

            // Un message générique. Les détails seront affichés par le front-end.
            const confirmationMessage = i18n.t('assistant.confirmActionPrompt', "Veuillez confirmer l'action suivante :");

            return {
                success: true,
                model,
                filter,
                data,
                displayMessage: confirmationMessage, // Message détaillé pour l'utilisateur
                confirmationRequest: parsedResponse // Action complète pour l'exécution
            };
        }

        default:
            return {
                success: true,
                displayMessage: i18n.t('assistant.unknownAction', "Commande non reconnue.")
            };
        }
    }

    logger.warn("[Assistant] La boucle a atteint le nombre maximum de tours sans réponse.");
    return { success: true, displayMessage: i18n.t('assistant.loopTimeout', "Désolé, je n'ai pas réussi à terminer ma pensée. Pouvez-vous reformuler votre demande ?"), actions: [] };
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

    const {middlewareAuthenticator, userInitiator} = await import('./user.js');

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