import React from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { FaSpinner } from 'react-icons/fa';
import './HtmlViewCard.scss';
import {renderHtmlTemplate} from "./filter.js"; // Réutilise les mêmes styles

/**
 * Récupère les données et affiche une vue HTML personnalisée sur le tableau de bord.
 * @param {object} props
 * @param {object} props.config - La configuration de la vue depuis la disposition du tableau de bord.
 */
const DashboardHtmlViewItem = ({ config }) => {
    const { t } = useTranslation();
    const { title, model, filter, limit, template } = config;

    const { data: queryResult, isLoading, error } = useQuery(
        ['dashboardHtmlView', model, filter, limit],
        async () => {
            const response = await fetch(`/api/data/search?model=${model}&limit=${limit || 10}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: filter || {} }),
            });
            if (!response.ok) throw new Error('Échec de la récupération des données pour la vue HTML');
            return response.json();
        },
        {
            enabled: !!model && !!template,
            refetchOnWindowFocus: false,
        }
    );

    const renderContent = () => {
        if (isLoading) return <div className="loading-state"><FaSpinner className="spin-icon" /> {t('loading', 'Chargement...')}</div>;
        if (error) return <div className="error-state">{t('error.generic', 'Erreur: {{message}}', { message: error.message })}</div>;
        if (!queryResult || !queryResult.data) return <div className="empty-state">{t('dashboards.noDataForView', 'Aucune donnée à afficher.')}</div>;

        const renderedHtml = renderHtmlTemplate(template, queryResult.data);
        return <div className="html-view-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
    };

    return (
        <div className="html-view-card dashboard-widget">
            {title && <h4>{title}</h4>}
            {renderContent()}
        </div>
    );
};

export default DashboardHtmlViewItem;