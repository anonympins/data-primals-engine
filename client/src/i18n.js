import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { websiteTranslations } from "./translations.js";
import { deepMerge } from "../../src/core.js"; // Assurez-vous que cette fonction existe

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
        "subdomain"
    ],

    // keys or params to lookup language from
    lookupQuerystring: "lang"
};

let initialized = false;

export const initI18n = (clientTranslations = {}) => {
    if (initialized) {
        console.warn("i18next is already initialized. Skipping redundant init call.");
        // Si vous avez besoin d'ajouter des traductions après l'initialisation
        Object.keys(clientTranslations).forEach(lang => {
            i18n.addResourceBundle(lang, 'translation', clientTranslations[lang].translation, true, false);
        });
        return;
    }

    // Fusionner les traductions de la bibliothèque avec celles du client
    const resources = deepMerge(websiteTranslations, clientTranslations);

    i18n
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
            debug: false,
            detection: options,
            fallbackLng: "fr",
            keySeparator: ".",
            interpolation: {
                escapeValue: false // not needed for react as it escapes by default
            },
            resources: resources, // Utiliser les ressources fusionnées
            react: {
                bindI18n: 'loaded languageChanged',
                bindI18nStore: 'added',
                useSuspense: true
            }
        });
    initialized = true;
};

export default i18n;
