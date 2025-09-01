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
import {Config} from "../../config.js";

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
    if (!query) return { main: [], related: [] };
    const searchRegex = new RegExp(query, 'i');
    const mainModels = await modelsCollection.find({
        $or: [{ _user: user.username }, { _user: { $exists: false } }],
        $and: [{ $or: [{ name: { $regex: searchRegex } }, { description: { $regex: searchRegex } }] }]
    }, {
        projection: { name: 1, description: 1, fields: 1, _id: 0 }
    }).limit(10).toArray();

    if (mainModels.length === 0) {
        return { main: [], related: [] };
    }

    const relatedModelNames = new Set();
    mainModels.forEach(model => {
        model.fields.forEach(field => {
            if (field.type === 'relation' && field.relation) {
                relatedModelNames.add(field.relation);
            }
        });
    });

    const mainModelNames = new Set(mainModels.map(m => m.name));
    const finalRelatedModelNames = [...relatedModelNames].filter(name => !mainModelNames.has(name));

    let relatedModels = [];
    if (finalRelatedModelNames.length > 0) {
        relatedModels = await modelsCollection.find({
            name: { $in: finalRelatedModelNames },
            $or: [{ _user: user.username }, { _user: { $exists: false } }]
        }, { projection: { name: 1, description: 1, fields: 1, _id: 0 } }).toArray();
    }

    return { main: mainModels, related: relatedModels };
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

Tu as accès aux outils et actions suivants.

OUTILS DE RAISONNEMENT INTERNE: (Utilisés pour collecter de l'information avant de décider de l'action finale)
1.  **search_models**: Pour rechercher les modèles de données disponibles.
    - Utilisation: { "action": "search_models", "params": { "query": "^regexToSearchFor$" } }. Il retourne aussi la structure des modèles directement liés.
====

ACTIONS FINALES: (Actions qui terminent ta réflexion et renvoient un résultat à l'utilisateur)
1.  **search**: Pour chercher des informations et les AFFICHER à l'utilisateur sous forme de tableau.
    - Utilisation: { "action": "search", "params": { "model": "nomDuModele", "filter": {}, "limit": 10 } }

2.  **post**: Pour créer une nouvelle donnée (nécessite confirmation).
    - Utilisation: { "action": "post", "params": { "model": "nomDuModele", "data": {} } }

3.  **update**: Pour mettre à jour des données existantes (nécessite confirmation).
    - Utilisation: { "action": "update", "params": { "model": "nomDuModele", "filter": {}, "data": {} } }
    - filter est très pratique pour mettre à jour des données ciblées en une seule passe.

4.  **delete**: Pour supprimer des données (nécessite confirmation).
    - Utilisation: { "action": "delete", "params": { "model": "nomDuModele", "filter": {} } }

5.  **displayMessage**: Pour répondre avec un simple message texte. N'utilise cette action QUE lorsque tu as toutes les informations nécessaires pour formuler une réponse finale.
    - Utilisation: { "action": "displayMessage", "params": { "message": "Ta réponse textuelle." } }
    
6.  **generateChart**: Pour créer et afficher un graphique. 
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

7.  **generateHtmlView**: Pour créer une vue personnalisée en utilisant un template HTML.
    - Utilisation: { "action": "generateHtmlView", "params": { ...config } }
    - Le paramètre \`config\` doit contenir :
        - \`title\` (string): Un titre pour la vue.
        - \`model\` (string): Le nom du modèle de données à utiliser.
        - \`template\` (string): Un template au format Handlebars.js. **RÈGLE CRITIQUE : N'utilise QUE les noms de champs (\`fieldName\`) exacts fournis par l'outil \`search_models\` pour le modèle principal ET pour ses modèles liés. N'invente JAMAIS de champs.**
            Pour une liste, tu DOIS utiliser une boucle \`{{#each data}}...{{/each}}\`.
            À l'intérieur d'une boucle, accède aux champs avec \`{{this.fieldName}}\`.
            Pour les champs de type \`string_t\` ou \`richtext_t\`, accède à la traduction avec \`{{this.fieldName.value}}\`.
            Pour les champs de type \`file\` on utilise <img src="/resources/${this.fieldName.guid}" />
            Les champs de type 'relation' sont automatiquement peuplés (hydratés), tu peux donc accéder à leurs propriétés directement (ex: \`{{this.relationField.name}}\` ou \`{{this.relationField.name.value}}\` si le champ 'name' de la relation est un 'string_t').
        - \`css\` (string): (Optionnel) Du CSS riche et créatif pour styliser le template. N'hésite pas à utiliser des dégradés, des ombres, des animations et des polices de caractères pour un rendu professionnel et attrayant. **Règle absolue : tu dois préfixer TOUS tes sélecteurs avec \`#{{containerId}}\` pour isoler les styles.**
        - \`filter\` (object): (Optionnel) Un filtre pour sélectionner les documents à afficher.
        - \`limit\` (number): (Optionnel, défaut 10) Le nombre maximum de documents à récupérer.

Voici le mémo pour assigner des valeurs aux champs des modèles,avec ces types de données : 
utilise une chaine de caractère convertible en ObjectId (mongodb) lorsque le nom du champ est _id 
utilise une chaine de caracteres lorsque le type de champ est : string , password, url, phone, email, richtext
utilise un objet { key: "trKey", value: "Translation"} lorsque le champ est string_t
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

PROCESSUS DE RAISONNEMENT STRICT:
a- L'utilisateur pose une question.
b- **Étape 1 (Obligatoire):** Appelle l'outil \`search_models\` pour obtenir la structure EXACTE du modèle de données. C'est ta seule source de vérité pour les noms de champs.
c- **Étape 2 (Obligatoire):** Analyse la réponse de \`search_models\` que le système t'a fournie.
d- **Étape 3 (Commande Finale):** Construis ta commande finale (\`search\`, \`generateHtmlView\`, etc.). **Règle absolue :** Pour les filtres et les templates, tu ne dois utiliser QUE les noms de champs (\`name\`) et les types (\`type\`) que tu as lus dans la réponse de \`search_models\` à l'étape c. N'invente RIEN.
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

Question: Crée un tableau de bord des rôles et permissions avec un design sophistiqué.
Ta réponse: { "action" : "search_models", "params": { "query": "role" } }
COMMANDE FINALE :
{
  "action": "generateHtmlView",
  "params": {
    "title": "Matrice des Rôles et Permissions",
    "model": "role",
    "template": "<div class='roles-container'>{{#each data}}<div class='role-card'><div class='role-header'><span class='role-icon'>🛡️</span><h3>{{this.name.value}}</h3></div><ul class='permissions-list'>{{#each this.permissions}}<li data-tooltip-html='{{this.description}}'><span class='permission-name'>{{this.name.value}}</span></li>{{/each}}</ul></div>{{/each}}</div>",
    "css": "#{{containerId}} .roles-container{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:25px;padding:25px;font-family:'Poppins',sans-serif;background:#111827}#{{containerId}} .role-card{background:rgba(31,41,55,.5);border-radius:16px;padding:20px;position:relative;overflow:hidden;border:1px solid transparent;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .3s ease,box-shadow .3s ease}#{{containerId}} .role-card::before{content:'';position:absolute;top:0;right:0;bottom:0;left:0;z-index:-1;margin:-1px;border-radius:inherit;background:conic-gradient(from 180deg at 50% 50%,#2a8af6 0deg,#a855f7 180deg,#f59e0b 360deg);animation:rotate-gradient 5s linear infinite}@keyframes rotate-gradient{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}#{{containerId}} .role-card:hover{transform:translateY(-8px);box-shadow:0 20px 30px rgba(0,0,0,.2)}#{{containerId}} .role-header{display:flex;align-items:center;gap:12px;margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.1)}#{{containerId}} .role-header .role-icon{font-size:1.8em}#{{containerId}} .role-header h3{margin:0;font-size:1.4em;font-weight:600;color:#f9fafb}#{{containerId}} .permissions-list{list-style:none;padding:0;margin:0;max-height:200px;overflow-y:auto}#{{containerId}} .permissions-list::-webkit-scrollbar{width:6px}#{{containerId}} .permissions-list::-webkit-scrollbar-track{background:rgba(255,255,255,.05);border-radius:3px}#{{containerId}} .permissions-list::-webkit-scrollbar-thumb{background:#4f46e5;border-radius:3px}#{{containerId}} .permissions-list::-webkit-scrollbar-thumb:hover{background:#6366f1}#{{containerId}} .permissions-list li{padding:8px 12px;margin-bottom:6px;background:rgba(255,255,255,.05);border-radius:8px;color:#d1d5db;cursor:help;transition:background-color .2s ease;font-size:.95em}#{{containerId}} .permissions-list li:hover{background:rgba(79,70,229,.5);color:#fff}",
    "filter": {},
    "limit": 10
  }
}

Question: Affiche une carte de visite stylisée pour le premier contact.
Ta réponse: { "action" : "search_models", "params": { "query": "contact" } }
COMMANDE FINALE :
{
  "action": "generateHtmlView",
  "params": {
    "title": "Carte de Visite",
    "model": "contact",
    "template": "<div class='card-container'><h3>{{this.firstName}} {{this.lastName}}</h3><p>{{this.email}}</p></div>",
    "css": "#{{containerId}} .card-container { border: 1px solid #ccc; border-radius: 8px; padding: 16px; background-color: #f9f9f9; } #{{containerId}} h3 { margin-top: 0; color: #333; }",
    "filter": {},
    "limit": 1
  }
}

Question: Montre-moi un catalogue des produits.
Ta réponse: { "action" : "search_models", "params": { "query": "product" } }
COMMANDE FINALE :
{
  "action": "generateHtmlView",
  "params": {
    "title": "Catalogue Produits",
    "model": "product",
    "template": "<div class='product-grid'>{{#each data}}<div class='product-card'><div class='product-image-container'><img src='{{this.image.0.url}}' alt='{{this.name.value}}' class='product-image'><span class='product-brand'>{{this.brand.name}}</span></div><div class='product-info'><h3 class='product-name'>{{this.name.value}}</h3><p class='product-category'>{{this.category.name.value}}</p><div class='product-footer'><span class='product-price'>{{this.price}} {{this.currency.symbol}}</span><button class='add-to-cart-btn'>Ajouter au panier</button></div></div></div>{{/each}}</div>",
    "css": "#{{containerId}} .product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:2rem;padding:2rem;font-family:'Lato',sans-serif;background-color:#f8f9fa}#{{containerId}} .product-card{background-color:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,.05),0 1px 3px rgba(0,0,0,.05);overflow:hidden;transition:transform .3s ease,box-shadow .3s ease;display:flex;flex-direction:column}#{{containerId}} .product-card:hover{transform:translateY(-5px);box-shadow:0 12px 20px rgba(0,0,0,.08),0 3px 8px rgba(0,0,0,.06)}#{{containerId}} .product-image-container{position:relative;width:100%;padding-top:100%}#{{containerId}} .product-image{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}#{{containerId}} .product-brand{position:absolute;top:10px;right:10px;background-color:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:6px;font-size:.8em;font-weight:700}#{{containerId}} .product-info{padding:15px;display:flex;flex-direction:column;flex-grow:1}#{{containerId}} .product-name{font-size:1.1em;font-weight:700;color:#343a40;margin:0 0 5px 0;line-height:1.3}#{{containerId}} .product-category{font-size:.85em;color:#6c757d;margin:0 0 15px 0;flex-grow:1}#{{containerId}} .product-footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e9ecef;padding-top:10px;margin-top:auto}#{{containerId}} .product-price{font-size:1.2em;font-weight:700;color:#007bff}#{{containerId}} .add-to-cart-btn{background-color:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;transition:background-color .2s ease}#{{containerId}} .add-to-cart-btn:hover{background-color:#0056b3}",
    "filter": {},
    "limit": 12
  }
}

Question: Affiche-moi les dernières requêtes API avec un design futuriste.
Ta réponse: { "action" : "search_models", "params": { "query": "request" } }
COMMANDE FINALE :
{
  "action": "generateHtmlView",
  "params": {
    "title": "Journal des Requêtes API",
    "model": "request",
    "template": "<div class=\"requests-grid\">{{#each data}}<div class=\"request-card status-{{this.status}}\"><div class=\"card-header\"><span class=\"method-badge method-{{this.method}}\">{{this.method}}</span><span class=\"status-code\" data-tooltip-html=\"Code de statut HTTP\">{{this.status}}</span></div><div class=\"card-body\"><p class=\"url\" data-tooltip-html=\"URL de la requête\">{{this.url}}</p></div><div class=\"card-footer\"><span class=\"latency\" data-tooltip-html=\"Latence de la réponse\">⏱️ {{this.latencyMs}} ms</span><span class=\"timestamp\" data-tooltip-html=\"Date et heure\">{{this.timestamp}}</span></div><div class=\"glow-effect\"></div></div>{{/each}}</div>",
    "css": "#{{containerId}} .requests-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;font-family:'Orbitron',sans-serif;padding:10px}#{{containerId}} .request-card{background:rgba(10,25,47,.8);border:1px solid #00aaff;border-radius:12px;padding:15px;position:relative;overflow:hidden;transition:transform .3s ease,box-shadow .3s ease;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}#{{containerId}} .request-card:hover{transform:translateY(-5px);box-shadow:0 10px 20px rgba(0,170,255,.3)}#{{containerId}} .glow-effect{position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(circle at 50% 0,rgba(0,170,255,.2),transparent 70%);animation:pulse 4s infinite ease-in-out;pointer-events:none}@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}#{{containerId}} .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid rgba(0,170,255,.2);padding-bottom:8px}#{{containerId}} .method-badge{padding:4px 8px;border-radius:5px;font-weight:700;font-size:.9em;color:#fff;text-shadow:0 0 5px currentColor}#{{containerId}} .method-GET{background-color:#00aaff}#{{containerId}} .method-POST{background-color:#4caf50}#{{containerId}} .method-PUT{background-color:#ff9800}#{{containerId}} .method-DELETE{background-color:#f44336}#{{containerId}} .method-PATCH{background-color:#9c27b0}#{{containerId}} .status-code{font-size:1.2em;font-weight:700;color:#fff}#{{containerId}} .status-200 .status-code{color:#4caf50;text-shadow:0 0 8px #4caf50}#{{containerId}} .status-404 .status-code{color:#f44336;text-shadow:0 0 8px #f44336}#{{containerId}} .status-500 .status-code{color:#ff9800;text-shadow:0 0 8px #ff9800}#{{containerId}} .card-body .url{color:#e0e0e0;font-size:.95em;word-break:break-all;margin:0}#{{containerId}} .card-footer{display:flex;justify-content:space-between;align-items:center;margin-top:15px;font-size:.8em;color:#88a1b9}#{{containerId}} .latency,#{{containerId}} .timestamp{display:flex;align-items:center;gap:5px}",
    "filter": {},
    "sort": { "_id": -1 },
    "limit": 12
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
            const { main: foundModels, related: relatedModels } = await searchModels(params.query, user);

            if (foundModels.length > 0) {
                let responseText = "J'ai trouvé les modèles suivants qui pourraient correspondre : " +
                        foundModels.map(m => `\n- Modèle "${m.name}": ${m.description || 'Pas de description.'}\n- Champs: ${m.fields.map(f => JSON.stringify(f, null, 2))}`).join('');

                if (relatedModels.length > 0) {
                    responseText += "\n\nPour votre information, voici la structure des modèles liés que vous pouvez utiliser dans les templates :";
                    responseText += relatedModels.map(m => `\n- Modèle lié "${m.name}":\n- Champs: ${m.fields.map(f => JSON.stringify(f, null, 2))}`).join('');
                }
                return responseText;
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
    const m = Config.Get('maxAIReflectiveSteps', maxAIReflectiveSteps);
    for (let i = 0; i < m; i++) {
        logger.debug(`[Assistant] Tour de boucle ${i + 1}. Invocation de l'IA...`);

        const response = await llm.invoke(conversationHistory);
        const llmOutput = response.content;

        // Parsing JSON robuste
        let parsedResponse;
        try {
            // Tente d'extraire le JSON de la réponse, même s'il est entouré de texte.
            const jsonRegex = /\{[\s\S]*\}/s; // 's' flag pour que '.' matche les nouvelles lignes
            const match = llmOutput.match(jsonRegex);

            if (match && match[0]) {
                // Si un JSON est trouvé, on tente de le parser
                parsedResponse = JSON.parse(match[0]);
            } else {
                // Aucun JSON trouvé, c'est probablement une réponse textuelle simple.
                return { success: true, displayMessage: llmOutput };
            }

            if (!parsedResponse.action || !parsedResponse.params) {
                throw new Error("Réponse JSON invalide: 'action' ou 'params' manquant.");
            }
        } catch (parseError) {
            logger.error(`[Assistant] Erreur de parsing de la réponse de l'IA: ${parseError.message}. Réponse brute: "${llmOutput}"`);
            // Si le parsing échoue, on renvoie le message brut de l'IA, qui est peut-être une réponse textuelle valide.
            return { success: true, displayMessage: llmOutput };
        }

        logger.debug(`[Assistant] Action décidée par l'IA: ${parsedResponse.action}`, parsedResponse);
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

        // Action de génération de vue HTML
        if (action === 'generateHtmlView') {
            const viewData = await searchData({
                model: params.model,
                filter: params.filter,
                limit: params.limit || 10,
                depth: 2 // Pour avoir accès aux relations de premier niveau dans les templates
            }, user);

            if (viewData.data.length === 0) {
                return { success: true, displayMessage: i18n.t('assistant.htmlView.noResult', "Je n'ai trouvé aucune donnée correspondante pour cette vue.") };
            }

            // On retourne la configuration de la vue ET les données au client.
            return { success: true, htmlViewConfig: { ...params, data: viewData.data } };
        }

        // NOUVEAU: Action de recherche à afficher, gérée par le front-end
        if (action === 'search') {
            const searchResult = await searchData({
                model: params.model,
                filter: params.filter,
                limit: params.limit || 10,
                sort: params.sort
            }, user);
            if (searchResult.data?.length > 0) {
                return { success: true, dataResult: { model: params.model, data: searchResult.data } };
            } else {
                return { success: true, displayMessage: i18n.t('assistant.search.noResults', "Je n'ai trouvé aucun résultat.") };
            }
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

        // Outils pour le raisonnement interne de l'IA
        if (['search_models'].includes(action)) { // On a enlevé 'search' d'ici
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