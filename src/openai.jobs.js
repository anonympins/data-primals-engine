import OpenAI from "openai";


let engine = null;
const openai = () => {
    if( !engine)
        engine = new OpenAI();
    return engine;
}

// La fonction devient asynchrone pour utiliser await
export const openaiJobModel = async (lang, txt, history, existingModels = []) => {
    const conditionBuilderExample = JSON.stringify({ "$and": [ { "fieldNameOfTypeRelation": { "$find": { "$eq": [ "$$this.code", "fr" ] } }}, {"$eq":["$fieldOtherTypes","valueToSearch"]}, { "$ne": { "$user": null } } ] }, null, 2);

    try {
        const completion = await openai().chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            // IMPORTANT: Demander explicitement une réponse JSON
            response_format: { "type": "json_object" },
            messages: [
                {
                    role: "system",
                    content:
                        `
                      Tu dois me retourner un objet JSON valide contenant les suggestions de modèles, basés sur la demande de l'utilisateur.
                      La spécification JSON d'UN modèle de données est la suivante :
                        Par exemple, pour "un modèle pour gérer une bibliothèque et ses livres", la réponse pourrait être:
                        {
                            "models": [{
                              "name": "book",
                              "description": "*description détaillée en plusieurs phrases de l'utilité du modèle, et ses cas d'usage, ici : Modèle de référencement de livres multi-support. Peut être utilisé pour des bibliothèques personnelles, virtuelles ou municipales.*",
                              "fields": [
                                {"name": "title", "type": "string", "required": true, "asMain": true, "hint": "Titre du livre", color: '#FF89CC'},
                                {"name": "isbn", "type": "string", "unique": true, "hint": "Numéro ISBN"},
                                {"name": "author", "type": "relation", "relation": "author", "hint": "Auteur du livre", color: '#CCCCCC'},
                                {"name": "publicationDate", "type": "date", "default": "now", "hint": "Date de publication du livre"}
                                {"name": "bankCardNumber", "type": "text", "anonymized": true, "hint": "Numéro de carte bancaire anonymisé"}
                              ]
                            }
                            {
                                name: "library",
                                "description": "",
                                fields: [
                                    {
                                        "name": "name",
                                        "type": "string",
                                        asMain: true,
                                    },
                                    {
                                        "name": "address",
                                        "type": "string",
                                        asMain: true,
                                    },
                                    {
                                        "name": "city",
                                        "type": "string",
                                        asMain: true,
                                        color: '#E63345'
                                    },
                                    {
                                        "name": "postalCode",
                                        "type": "string",
                                        asMain: true,
                                    },
                                    {
                                        "name": "country",
                                        "type": "string",
                                        color: "#4F80BF",
                                    }
                                ]
                            }]
                        }
                        
                        les types de champ autorisés sont : 
                        string, string_t (translation key)
                            avec les propriétés { maxlength: number, multiline: boolean } 
                        
                        , password, url, phone, email,, richtext (html),
                            avec les propriétés { maxlength: number } 
                        boolean
                        code
                            avec les propriétés { language: 'json', conditionBuilder: boolean }, avec conditionBuilder la prop pour construire des conditions sur les données
                        number
                            avec les propriétés { step: 0.1, unit: string, min: number, max: number }
                        
                        date, datetime,
                            avec les propriétés { min: dateIso, max: dateIso }
                        enum, 
                            avec les propriétés { items: ["label 1", "..."] }
                      
                        array
                          avec les propriétés { itemsType: "string_t", ...et les autres propriétés du type itemsType }
                        relation
                            avec les propriétés { relationFilter: <condition>, multiple: boolean, relation: 'autreModeleNom'}, multiple permettant une relation 1-n pour chaque donnée du modèle.
                            Préfères l'utilisation du multiple et d'un modèle séparé plutôt qu'un type array avec itemsType=string.
                            Pour le type \`relation\`, utilise l'un des noms de modèles existants suivants : ${existingModels.join(', ')} ou le nom du modèle relationnel généré.\`
                        color 
                            avec une valeur en héxadecimal, ex: '#FF0000'
                        file
                            pour gérer les documents 
                        calculated
                            pour gérer les champs calculés (utile pour l'utilisateur)
                        model (nom du modele choisi), 
                        
                        cronSchedule 
                            avec les propriétés { default: '* * * * * *', cronMask: [false, true, true, true, true, true])
                        
                        <condition> ou la propriété 'condition' d'affichage sur les champs du modèle se définissent de cette manière : 
                        ${conditionBuilderExample} avec les opérateurs mongodb $eq,$ne,$gt,$gte,$lt,$lte,$in,$nin,$dateAdd disponibles
                        
                        Les modèles doivent être absolument nommés autrement que ceux déjà existants (donc pas ceux là : {${existingModels.join(', ')})
                        Si ils sont nommés pareil, renomme les tiens avec un suffixe '_2', ou '_3'...
                        Et assures-toi de générer les modèles que tu as introduits dans tes relations.
                        
                        'default' est la valeur par défaut que prendra le champ (string, number, boolean, or array of type supported)
                        Traduits le texte des hint et les données qui ne sont pas des variables ou des clés d'objet dans la langue iso2 ${lang}.
                        
                        Mets obligatoirement des couleurs harmonieuses sur les champs asMain, ou ceux que tu considères comme importants, car ils doivent être mis en avant (selon le thème).
                        
                        Ne renvoie bien QUE le tableau de modèles JSON, sans texte explicatif ni formatage markdown.`
                },
                {
                    role: "user",
                    content: typeof(txt) === 'string' ? txt.substring(0, 4096) : ''
                },
                ...history
            ]
        });

        const aiResponse = completion.choices[0].message.content;

        try {
            // JSON.parse fonctionnera que le contenu soit un objet ou un tableau
            return JSON.parse(aiResponse); // On retourne directement le résultat parsé
        } catch (e) {
            console.error("Erreur de parsing du JSON de l'IA:", e);
            throw new Error("Réponse invalide de l'IA.");
        }

    } catch (error) {
        console.error("Error calling OpenAI or parsing response:", error);
        // Renvoyer l'erreur pour que l'endpoint API puisse la gérer
        throw error;
    }
};