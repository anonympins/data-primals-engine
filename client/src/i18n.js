import i18n from "i18next";
import {initReactI18next, Trans} from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import {websiteTranslations} from "./translations.js";

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
            escapeValue: false // not needed for react as it escapes by default
        },
        resources: websiteTranslations,
        react: {
            bindI18n: 'loaded languageChanged',
            bindI18nStore: 'added',
            useSuspense: true
        }
    });

export default i18n;
