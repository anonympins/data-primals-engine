import React, {useEffect, useMemo} from 'react';
import './HtmlViewCard.scss';

/**
 * Renders a simple HTML template by substituting placeholders.
 * This is a simplified, self-contained version inspired by `substituteVariables`.
 * It supports `{{#each data}}...{{/each}}` for loops and `{{this.fieldName}}` for variables.
 *
 * @param {string} templateString The template with placeholders.
 * @param {Array<object>} data The array of data objects to inject.
 * @returns {string} The rendered HTML string.
 */
const renderHtmlTemplate = (templateString, data) => {
    if (!templateString || !data) return '';

    // Helper to get a value from a specific item (used inside a loop)
    const getNestedValueFromItem = (item, path) => {
        if (!path || typeof path !== 'string' || !item) return '';
        if (path === 'this') return typeof item === 'object' ? JSON.stringify(item) : item;
        const realPath = path.startsWith('this.') ? path.substring(5) : path;
        return realPath.split('.').reduce((p, c) => (p && p[c] !== undefined && p[c] !== null) ? p[c] : '', item);
    };

    // Helper to get a value from the root context (e.g., `data.0.field`)
    const getNestedValueFromContext = (context, path) => {
        if (!path || typeof path !== 'string' || !context) return '';
        return path.split('.').reduce((p, c) => (p && p[c] !== undefined && p[c] !== null) ? p[c] : '', context);
    };

    const loopRegex = /\{\{#each data\}\}([\s\S]*?)\{\{\/each\}\}/g;
    const match = loopRegex.exec(templateString);

    if (match) {
        // Case 1: Explicit {{#each data}} loop found.
        const loopContent = match[1];
        if (!Array.isArray(data)) return '';
        const renderedItems = data.map(item => {
            return loopContent.replace(/\{\{([\s\S]*?)\}\}/g, (placeholderMatch, placeholderKey) => {
                return getNestedValueFromItem(item, placeholderKey.trim());
            });
        }).join('');
        return templateString.replace(loopRegex, renderedItems);
    }

    // Case 2: No explicit loop.
    if (templateString.includes('{{this.')) {
        if (!Array.isArray(data)) return '';
        return data.map(item => {
            return templateString.replace(/\{\{([\s\S]*?)\}\}/g, (placeholderMatch, placeholderKey) => {
                return getNestedValueFromItem(item, placeholderKey.trim());
            });
        }).join('');
    }

    // Otherwise, treat as a template for the whole data context (for `data.0.field`).
    const context = { data };
    return templateString.replace(/\{\{([\s\S]*?)\}\}/g, (placeholderMatch, placeholderKey) => {
        return getNestedValueFromContext(context, placeholderKey.trim());
    });
};

/**
 * Affiche une vue HTML personnalisée, généralement générée par l'assistant IA.
 * @param {object} props
 * @param {object} props.config - La configuration de la vue.
 * @param {string} props.config.title - Le titre de la carte.
 * @param {string} props.config.template - La chaîne de template HTML Handlebars.
 * @param {Array<object>} props.config.data - Le tableau d'enregistrements de données à afficher.
 */
const HtmlViewCard = ({ config }) => {
    const { title, template, data, css } = config;

    // Génère un ID unique et stable pour ce composant
    const containerId = useMemo(() => `html-view-${Math.random().toString(36).substring(2, 9)}`, []);

    // Effet pour injecter et nettoyer le CSS
    useEffect(() => {
        if (!css) return;

        const styleElement = document.createElement('style');
        // Remplace le placeholder par notre ID unique pour scoper le CSS
        styleElement.innerHTML = css.replace(/\{\{containerId\}\}/g, containerId);
        document.head.appendChild(styleElement);

        // Fonction de nettoyage : retire le style quand le composant est démonté
        return () => {
            document.head.removeChild(styleElement);
        };
    }, [css, containerId]);

    const renderedHtml = renderHtmlTemplate(template, data);

    return (
        <div id={containerId} className="html-view-card">
            {title && <h4>{title}</h4>}
            <div className="html-view-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </div>
    );
};

export default HtmlViewCard;