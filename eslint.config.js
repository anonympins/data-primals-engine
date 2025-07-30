// eslint.config.js
import globals from "globals";
import js from "@eslint/js";
// eslint.config.js
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        // Fichiers sur lesquels appliquer cette configuration
        files: ["**/*.js"],

        // Ignore les répertoires qui ne doivent pas être analysés
        ignores: [
            "node_modules/",
            "dist/",
            "coverage/",
            "test-backups/"
        ],

        // Options liées au langage JavaScript
        languageOptions: {
            ecmaVersion: "latest", // Utilise la dernière version de JavaScript
            sourceType: "module", // Votre projet utilise des modules ES
            globals: {
                ...globals.node,    // Globaux pour l'environnement Node.js
                ...globals.es2021,  // Globaux pour ES2021
                ...globals.vitest  // Globaux pour Vitest (describe, it, expect, etc.)
            }
        },

        // Utilise les règles recommandées par ESLint
        ...js.configs.recommended,

        // Vos règles personnalisées (à ajuster selon vos préférences)
        rules: {
            // Erreurs potentielles
            "no-console": "off", // Avertit sur l'utilisation de console.log, mais ne bloque pas
            "no-unused-vars": ["warn", { "args": "none" }], // Avertit sur les variables non utilisées

            // Meilleures pratiques
            "eqeqeq": ["error", "always"], // Impose l'utilisation de === et !==

            // Style du code
            "indent": ["error", 4], // Impose une indentation de 4 espaces
            "quotes": ["off"], // Impose l'utilisation de guillemets simples
            "semi": ["off"], // Impose l'utilisation de points-virgules à la fin des instructions
            "comma-dangle": ["error"] // Impose une virgule finale sur les objets et tableaux multilignes
        }
    }
]);