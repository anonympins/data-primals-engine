import React, { useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { FaSpinner } from 'react-icons/fa';
import './HtmlViewCard.scss';
import { useModelContext } from "./contexts/ModelContext.jsx";
import { getDataAsString } from "../../src/data.js";

/**
 * Improved version that handles nested each blocks more reliably
 */
function findMatchingEndEachImproved(template, startIndex) {
    const openTag = '{{#each';
    const closeTag = '{{/each}}';
    let level = 1;
    let position = startIndex + openTag.length;

    while (level > 0 && position < template.length) {
        // Find next occurrence of either opening or closing tag
        const nextOpen = template.indexOf(openTag, position);
        const nextClose = template.indexOf(closeTag, position);

        // If no closing tag found, return -1
        if (nextClose === -1) return -1;

        // If there's an opening tag before the closing tag, it's nested
        if (nextOpen !== -1 && nextOpen < nextClose) {
            level++;
            position = nextOpen + openTag.length;
        } else {
            level--;
            position = nextClose + closeTag.length;
            if (level === 0) {
                return nextClose;
            }
        }
    }

    return -1;
}

/**
 * Renders a simple HTML template by substituting placeholders.
 * This is a simplified, self-contained version inspired by `substituteVariables`.
 * It supports `{{#each data}}...{{/each}}` for loops and `{{path.to.value}}` for variables.
 *
 * @param {string} templateString The template with placeholders.
 * @param {Array<object>} data The array of data objects to inject.
 * @returns {string} The rendered HTML string.
 */
export const renderHtmlTemplate = (templateString, data, options = {}) => {
    const { model: rootModel, allModels, tr } = options;
    if (!templateString) return '';

    const getNestedValue = (obj, path, model) => {
        if (!path || typeof path !== 'string' || !obj) return '';

        if (path === 'this') {
            if (typeof obj === 'object' && obj !== null) {
                // Use getDataAsString for a smart representation of the object
                if (model && tr && allModels) {
                    return getDataAsString(model, obj, tr, allModels);
                }
                return JSON.stringify(obj); // Fallback
            }
            return obj;
        }

        const realPath = path.startsWith('this.') ? path.substring(5) : path;
        if (realPath === '') return obj;
        
        const value = realPath.split('.').reduce((p, c) => (p && p[c] !== undefined && p[c] !== null) ? p[c] : '', obj);

        // Handle AI hallucination of ".value" on translated objects (string_t)
        if (value === '' && realPath.endsWith('.value')) {
            const parentPath = realPath.substring(0, realPath.lastIndexOf('.'));
            const parentObj = parentPath.split('.').reduce((p, c) => (p && p[c] !== undefined && p[c] !== null) ? p[c] : '', obj);
            if (typeof parentObj === 'object' && parentObj !== null) {
                const langKey = Object.keys(parentObj).find(k => k.length === 2) || Object.keys(parentObj)[0];
                if (langKey) return parentObj[langKey];
            }
        }

        // If the path points to an object (likely a populated relation), try to render it nicely.
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const fieldName = realPath.split('.')[0];
            const fieldDef = model?.fields.find(f => f.name === fieldName);
            if (fieldDef?.type === 'relation') {
                const relatedModel = allModels?.find(m => m.name === fieldDef.relation);
                if (relatedModel && tr) {
                    return getDataAsString(relatedModel, value, tr, allModels);
                }
            }
        }

        // Handle array of relations
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            const fieldName = realPath.split('.')[0];
            const fieldDef = model?.fields.find(f => f.name === fieldName);
            if (fieldDef?.type === 'relation' && fieldDef.multiple) {
                const relatedModel = allModels?.find(m => m.name === fieldDef.relation);
                if (relatedModel && tr) {
                    return value.map(item => getDataAsString(relatedModel, item, tr, allModels)).join(', ');
                }
            }
        }

        return value;
    };

    const render = (template, context, model) => {
        const openEachIndex = template.indexOf('{{#each');

        // Base case: No more loops, just replace variables.
        if (openEachIndex === -1) {
            const varRegex = /\{\{([\s\S]+?)\}\}/g;
            return template.replace(varRegex, (match, varPath) => {
                return getNestedValue(context, varPath.trim(), model) ?? '';
            });
        }

        // Recursive step: Process the first found loop.
        const endEachIndex = findMatchingEndEachImproved(template, openEachIndex);
        if (endEachIndex === -1) {
            console.error('Template parsing error: Unmatched {{#each}} tag.');
            return template; // Return template as-is if malformed
        }

        // Deconstruct the template around the loop
        const prefix = template.substring(0, openEachIndex);
        const openTagEnd = template.indexOf('}}', openEachIndex) + 2;
        const arrayPath = template.substring(openEachIndex + '{{#each '.length, openTagEnd - 2).trim();
        const loopContent = template.substring(openTagEnd, endEachIndex);
        const suffix = template.substring(endEachIndex + '{{/each}}'.length);

        // Render the parts recursively
        const renderedPrefix = render(prefix, context);
        const renderedSuffix = render(suffix, context);

        const array = getNestedValue(context, arrayPath, model);
        let renderedLoop = '';
        if (Array.isArray(array)) {
            let itemModel = model;
            if (arrayPath === 'data') {
                itemModel = rootModel; // Case of the root loop `{{#each data}}`
            } else if (model && allModels) {
                const fieldPath = arrayPath.startsWith('this.') ? arrayPath.substring(5) : arrayPath;
                const fieldDef = model.fields.find(f => f.name === fieldPath);
                if (fieldDef?.type === 'relation') {
                    itemModel = allModels.find(m => m.name === fieldDef.relation);
                }
            }
            renderedLoop = array.map(item => render(loopContent, item, itemModel)).join('');
        }

        return renderedPrefix + renderedLoop + renderedSuffix;
    };

    // Start rendering with the initial data wrapped in a 'data' property.
    return render(templateString, { data }, null);
};

/**
 * Récupère les données et affiche une vue HTML personnalisée sur le tableau de bord.
 * @param {object} props
 * @param {object} props.config - La configuration de la vue depuis la disposition du tableau de bord.
 */
const DashboardHtmlViewItem = ({ config }) => {
    const { t, i18n } = useTranslation();
    const { models } = useModelContext();
    const { title, model: modelName, filter, limit, template, css } = config;

    // Génère un ID unique et stable pour ce composant
    const containerId = useMemo(() => `html-view-dashboard-${Math.random().toString(36).substring(2, 9)}`, []);
    const model = useMemo(() => models.find(m => m.name === modelName), [models, modelName]);

    const { data: queryResult, isLoading, error } = useQuery(
        ['dashboardHtmlView', modelName, filter, limit],
        async () => {
            const response = await fetch(`/api/data/search?model=${modelName}&depth=2&limit=${limit || 10}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: filter || {}}),
            });
            if (!response.ok) throw new Error('Échec de la récupération des données pour la vue HTML');
            return response.json();
        },
        {
            enabled: !!modelName && !!template,
            refetchOnWindowFocus: false,
        }
    );

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

    const renderContent = () => {
        if (isLoading) return <div className="loading-state"><FaSpinner className="spin-icon" /> {t('loading', 'Chargement...')}</div>;
        if (error) return <div className="error-state">{t('error.generic', 'Erreur: {{message}}', { message: error.message })}</div>;
        if (!queryResult || !queryResult.data) return <div className="empty-state">{t('dashboards.noDataForView', 'Aucune donnée à afficher.')}</div>;

        const renderedHtml = renderHtmlTemplate(template, queryResult.data, {
            model: model,
            allModels: models,
            tr: { t, i18n }
        });
        return <div className="html-view-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
    };

    return (
        <div id={containerId} className="html-view-card dashboard-widget">
            {title && <h4>{title}</h4>}
            {renderContent()}
        </div>
    );
};

export default DashboardHtmlViewItem;