import React from 'react';
import './HtmlViewCard.scss';
import {renderHtmlTemplate} from "./filter.js";


/**
 * Affiche une vue HTML personnalisée, généralement générée par l'assistant IA.
 * @param {object} props
 * @param {object} props.config - La configuration de la vue.
 * @param {string} props.config.title - Le titre de la carte.
 * @param {string} props.config.template - La chaîne de template HTML Handlebars.
 * @param {Array<object>} props.config.data - Le tableau d'enregistrements de données à afficher.
 */
const HtmlViewCard = ({ config }) => {
    const { title, template, data } = config;

    const renderedHtml = renderHtmlTemplate(template, data);

    return (
        <div className="html-view-card">
            {title && <h4>{title}</h4>}
            <div className="html-view-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </div>
    );
};

export default HtmlViewCard;