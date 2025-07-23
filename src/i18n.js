import i18n from "i18next";
import {initReactI18next, Trans} from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

export const translations = {
    fr: {
        translation: {

            "assistant.type": "Entrez votre message...",
            "assistant.welcome": "Bonjour ! Comment puis-je vous aider avec vos données ?",
            "assistant.named": "Assistant {{named}}",

            "api.data.duplicateValue": "La valeur '{{value}}' existe déjà pour le champ unique '{{field}}'.",
            "api.model.invalidStructure": "Le modèle est invalide. Des champs sont incorrects.",
            "api.validate.fieldArray": "Le champ '{{0}}' doit être un tableau.",
            "api.validate.invalidMimeType": "Type de fichier invalide '{{type}}'. Les types autorisés sont : {{authorized}}.",
            "api.field.missingRequired": "Champ obligatoire manquant : {{field}}.",
            "api.field.requiredCannotBeEmpty": "Le champ requis '{{field}}' ne peut pas être vide.",
            "api.field.validationFailed": "La validation a échoué pour le champ '{{field}}' avec la valeur : {{value}}.",
            "api.data.notUniqueData": "Un enregistrement identique existe déjà.",
            "api.file.invalidGuid": "Le GUID du fichier n'est pas valide.",
            "api.file.notFound": "Fichier non trouvé (GUID: {{guid}}).",
            "api.file.unauthorizedDelete": "Vous n'êtes pas autorisé à supprimer ce fichier.",
            "api.file.notFoundOnServer": "Fichier non trouvé sur le serveur.",
            "api.file.unauthorizedUpload": "Vous n'êtes pas autorisé à uploader ce fichier.",
            "api.file.unauthorizedDownload": "Vous n'êtes pas autorisé à télécharger ce fichier.",
            "api.data.storageLimitExceeded": "La limite de stockage de {{limit}}Mo serait dépassée avec cet ajout.",
            "api.data.serverStorageFull": "Le serveur a atteint sa capacité de stockage maximale. Veuillez réessayer plus tard.",
            "api.validate.unknowField": "Propriété(s) non reconnue(s): '{{0}}' pour le champ '{{1}}'",
            "api.validate.invalidField": "Champ(s) non valide(s): '{{0}}'",
            "api.validate.requiredFieldString": "Le champ '{{0}}' est requis et doit être une chaîne de caractères.",
            "api.validate.fieldBoolean": "L'attribut '{{0}}' doit être un booléen.",
            "api.validate.fieldObject": "L'attribut '{{0}}' doit être un objet.",
            "api.validate.fieldStringArray": "L'attribut '{{0}}' doit être un tableau de chaines de caractères.",
            "api.validate.fieldString": "Le champ '{{0}}' doit être une chaîne de caractères.",
            "api.validate.fieldNumber": "L'attribut '{{0}}' doit être un nombre.",
            "api.validate.inferiorTo": "L'attribut '{{0}}' doit être inférieur à l'attribut '{{1}}'.",
            "api.validate.fileSize": "L'attribut 'maxSize' ne doit pas dépasser {{0}} octets.",
            "api.validate.unknowType": "Le type '{{0}}' n'est pas reconnu.",
            "api.validate.sameType": "L'attribut '{{0}}' doit être du même type que l'attribut '{{1}}' ({{2}}).",
            "api.validate.fieldFunction": "L'attribut '{{0}}' doit être une fonction.",
            "api.model.deleteFailed": "Le modèle de donnée n'a pas pu être supprimé.",
            "api.model.updateFailed": "Le modèle de donnée n'a pas pu être mis à jour.",
            "api.permission.installPack": "Vous n'avez pas la permission d'installer un pack.",
            "api.data.tooDeep": "Profondeur maximale pour obtenir les données atteinte (profondeur de {{depth}})",
            "api.field.validationError": "Le champ {{field}} n'est pas valide selon le type {{type}}.",
            "api.field.undefined": "Le type {{type}} n'est pas défini.",
            "api.field.required": "Le champ {{field}} est obligatoire dans le modèle {{model}}",
            "api.data.notFound": "Ressource introuvable.",
            "api.data.notModified": "Ressource non modifiée.",
            "api.data.error": "Une erreur s'est produite lors du traitement de la requête.",
            "api.data.noData": "Aucune donnée valide à insérer.",
            "api.data.tooManyData": "Nombre maximal de données atteint pour ce modèle.",
            "api.model.alreadyExists": "Le modèle existe déjà.",
            "api.model.delete": "Modèle supprimé.",
            "api.model.notFound": "Modèle {{model}} introuvable.",
            "api.model.maxModels": "Nombre maximal de modèles atteint.",
            "api.data.hashesNotValid": "Les hachages de données de relation ne sont pas valides.",
            "api.permission.addData": "Impossible d'ajouter des données à l'API.",
            "api.permission.editData": "Impossible d'insérer des données dans l'API.",
            "api.permission.searchData": "Impossible de rechercher des données à partir de API",
            "api.permission.deleteData": "Impossible de supprimer des données de l'API",
            "api.permission.import": "Impossible d'importer des modèles depuis l'API",
            "api.permission.addModel": "Impossible d'ajouter un modèle à l'API",
            "api.permission.editModel": "Impossible de modifier les modèles depuis l'API",
            "api.permission.importModel": "Impossible d'importer des modèles depuis l'API",
            "api.permission.deleteModel": "Impossible de supprimer des modèles depuis l'API",
            "api.permission.getModels": "Impossible d'obtenir des modèles depuis l'API",
            "api.permission.getModel": "Impossible d'obtenir un modèle depuis l'API",
        },
    },
    en: {
        translation: {
                "assistant.type": "Type your message...",
                "assistant.welcome": "Hello! How can I help you with your data?",
                "assistant.named": "Assistant {{named}}",
                "api.data.duplicateValue": "The value '{{value}}' already exists for the unique field '{{field}}'.",
                "api.model.invalidStructure": "The model is invalid. Some fields are incorrect.",
                "api.validate.fieldArray": "The field '{{0}}' must be an array.",
                "api.validate.invalidMimeType": "Invalid file type '{{type}}'. Allowed types are: {{authorized}}.",
                "api.field.missingRequired": "Missing required field: {{field}}.",
                "api.field.requiredCannotBeEmpty": "The required field '{{field}}' cannot be empty.",
                "api.field.validationFailed": "Validation failed for field '{{field}}' with value: {{value}}.",
                "api.data.notUniqueData": "An identical record already exists.",
                "api.file.invalidGuid": "The file GUID is not valid.",
                "api.file.notFound": "File not found (GUID: {{guid}}).",
                "api.file.unauthorizedDelete": "You are not authorized to delete this file.",
                "api.file.notFoundOnServer": "File not found on server.",
                "api.file.unauthorizedUpload": "You are not authorized to upload this file.",
                "api.file.unauthorizedDownload": "You are not authorized to download this file.",
                "api.data.storageLimitExceeded": "The storage limit of {{limit}}MB would be exceeded with this addition.",
                "api.data.serverStorageFull": "The server has reached its maximum storage capacity. Please try again later.",
                "api.validate.unknowField": "Unrecognized property(s): '{{0}}' for field '{{1}}'",
                "api.validate.invalidField": "Invalid field(s): '{{0}}'",
                "api.validate.requiredFieldString": "The field '{{0}}' is required and must be a string.",
                "api.validate.fieldBoolean": "The attribute '{{0}}' must be a boolean.",
                "api.validate.fieldObject": "The attribute '{{0}}' must be an object.",
                "api.validate.fieldStringArray": "The attribute '{{0}}' must be an array of strings.",
                "api.validate.fieldString": "The field '{{0}}' must be a string.",
                "api.validate.fieldNumber": "The attribute '{{0}}' must be a number.",
                "api.validate.inferiorTo": "The attribute '{{0}}' must be less than the attribute '{{1}}'.",
                "api.validate.fileSize": "The 'maxSize' attribute must not exceed {{0}} bytes.",
                "api.validate.unknowType": "The type '{{0}}' is not recognized.",
                "api.validate.sameType": "The attribute '{{0}}' must be of the same type as attribute '{{1}}' ({{2}}).",
                "api.validate.fieldFunction": "The attribute '{{0}}' must be a function.",
                "api.model.deleteFailed": "The data model could not be deleted.",
                "api.model.updateFailed": "The data model could not be updated.",
                "api.permission.installPack": "You don't have permission to install a pack.",
                "api.data.tooDeep": "Maximum depth for data retrieval reached (depth of {{depth}})",
                "api.field.validationError": "The field {{field}} is not valid according to type {{type}}.",
                "api.field.undefined": "The type {{type}} is not defined.",
                "api.field.required": "The field {{field}} is required in the model {{model}}",
                "api.data.notFound": "Resource not found.",
                "api.data.notModified": "Resource not modified.",
                "api.data.error": "An error occurred while processing the request.",
                "api.data.noData": "No valid data to insert.",
                "api.data.tooManyData": "Maximum number of data reached for this model.",
                "api.model.alreadyExists": "The model already exists.",
                "api.model.delete": "Model deleted.",
                "api.model.notFound": "Model {{model}} not found.",
                "api.model.maxModels": "Maximum number of models reached.",
                "api.data.hashesNotValid": "Relation data hashes are not valid.",
                "api.permission.addData": "Cannot add data to the API.",
                "api.permission.editData": "Cannot insert data into the API.",
                "api.permission.searchData": "Cannot search data from the API",
                "api.permission.deleteData": "Cannot delete data from the API",
                "api.permission.import": "Cannot import models from the API",
                "api.permission.addModel": "Cannot add a model to the API",
                "api.permission.editModel": "Cannot modify models from the API",
                "api.permission.importModel": "Cannot import models from the API",
                "api.permission.deleteModel": "Cannot delete models from the API",
                "api.permission.getModels": "Cannot get models from the API",
                "api.permission.getModel": "Cannot get a model from the API",
            },
    },
    es: {
        translation: {},
    },
    pt: {
        translation: {},
    },
    de: {
        translation: {}
    },
    it: {
        translation: {},
    },
    cs: {
        translation: {},
    },
    ru: {
        translation: {},
    },
    ar: {
        translation: {}
    },
    sv: {
        translation: {}
    },
    el: {
        translation: {}
    },
    fa: {
        "translation": {}
    }
};
const options = {
  // order and from where user language should be detected
  order: [
    "querystring",
    "cookie",
    "localStorage",
    "sessionStorage",
    "navigator",
    "htmlTag",
    "path",
    "subdomain",
  ],

  // keys or params to lookup language from
  lookupQuerystring: "lang",
};

i18n
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init({
    debug: false,
    detection: options,
    fallbackLng: "fr",
    keySeparator: false,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    resources: translations,
      react: {
          bindI18n: 'loaded languageChanged',
          bindI18nStore: 'added',
          useSuspense: true,
      }
  });

export default i18n;
