import React, {useEffect, useMemo} from 'react';
import './HtmlViewCard.scss';
import {renderHtmlTemplate} from "./DashboardHtmlViewItem.jsx";

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