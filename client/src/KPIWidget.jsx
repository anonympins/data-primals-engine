import React from 'react';
import { useQuery } from 'react-query';
import * as FaIcons from 'react-icons/fa'; // Importer toutes les icônes Fa
import * as Fa6Icons from 'react-icons/fa6'; // Importer Fa6
import { FaInfo, FaTimes } from 'react-icons/fa';
import { isLightColor } from "data-primals-engine/core"; // Pour le bouton supprimer
import { Tooltip } from 'react-tooltip';

// Fonction pour récupérer la valeur calculée d'un KPI (MODIFIÉE)
const fetchKpiValue = async (kpiId) => {
    if (!kpiId) return null;
    const response = await fetch(`/api/kpis/calculate/${kpiId}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Network response was not ok (${response.status})`);
    }
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Failed to calculate KPI value');
    }
    // Retourner l'objet complet { value, totalCount }
    return { value: data.value, totalCount: data.totalCount };
};

// Fonction pour obtenir le composant icône par son nom
const getIconComponent = (iconName) => {
    if (!iconName) return null;
    const IconComponent = FaIcons[iconName] || Fa6Icons[iconName];
    return IconComponent ? <IconComponent /> : null; // Retourne l'élément React ou null
};


const KPIWidget = ({ kpiDefinition, onRemove }) => {
    // Destructurer les nouvelles propriétés de kpiDefinition
    const {
        _id,
        name,
        unit,
        description,
        icon: iconName,
        color,
        showTotal,        // Nouveau
        showPercentTotal  // Nouveau
    } = kpiDefinition;

    // Utiliser useQuery pour récupérer l'objet { value, totalCount }
    const { data: kpiData, isLoading, error } = useQuery(
        ['kpiValue', _id], // Clé de requête unique par ID de KPI
        () => fetchKpiValue(_id),
        {
            staleTime: 5 * 60 * 1000, // Garder la valeur fraîche pendant 5 minutes
            refetchInterval: 5 * 60 * 1000, // Rafraîchir toutes les 5 minutes
            enabled: !!_id, // N'exécuter que si _id est défini
            refetchOnWindowFocus: false
        }
    );

    let displayValue = '...';
    if (isLoading) {
        displayValue = <span className="kpi-loading">Chargement...</span>;
    } else if (error) {
        displayValue = <span className="kpi-error" title={error.message}>Erreur</span>; // Ajout title pour debug
        console.error(`KPI Error (${name || _id}):`, error);
    } else if (kpiData !== undefined && kpiData !== null) {
        const value = kpiData.value;
        const totalCount = kpiData.totalCount;
        const valueExists = value !== undefined && value !== null;
        const totalExists = totalCount !== undefined && totalCount !== null;

        // Formatage de la valeur principale (si elle existe)
        const formattedValue = valueExists
            ? (typeof value === 'number' ? value.toLocaleString() : value)
            : '-';

        // 1. Priorité au pourcentage si demandé et possible
        if (showTotal && valueExists && totalExists) {
            const formattedTotal = typeof totalCount === 'number' ? totalCount.toLocaleString() : totalCount;
            displayValue = (
                <span className="kpi-value-with-total">
                    <span className="kpi-main-value">{formattedValue}</span>
                    <span className="kpi-separator"> / </span>
                    <span className="kpi-total-value">{formattedTotal}</span>
                    {/* On peut ajouter l'unitci si pertinent */}
                    {unit ? <span className="kpi-unit-suffix"> {unit}</span> : ''}
                    {showPercentTotal && totalCount !== 0 && (<span className="kpi-percentage">&nbsp;
                        ({((value / totalCount) * 100).toFixed(1)}%)
                    </span>)}
                </span>
            );
        } else if (valueExists) {
            displayValue = (
                <span className="kpi-value-simple">
                    <span className="kpi-value-number">{formattedValue}</span>
                    {unit ? <span className="kpi-unit-suffix"> {unit}</span> : ''}
                    {showPercentTotal && totalCount !== 0 && (<span className="kpi-percentage">&nbsp;
                        ({((value / totalCount) * 100).toFixed(1)}%)
                    </span>)}
                </span>
            );
            // 4. Cas où la valeur n'existe pas (mais pas d'erreur/chargement)
        } else {
            displayValue = <span className="kpi-value-nodata">-</span>;
        }

    } else {
        displayValue = <span className="kpi-value-nodata">-</span>; // Cas où kpiData est null/undefined
    }


    const IconComponent = getIconComponent(iconName);

    // Style pour la couleur de fond
    const widgetStyle = color ? { backgroundColor: color, color: isLightColor(color) ? 'black' : 'white' } : {};

    return (
        <div className={`kpi-widget ${isLoading ? 'loading' : ''} ${error ? 'error' : ''}`} style={widgetStyle}>
            <button className="kpi-remove-button" onClick={onRemove} title="Retirer ce KPI">
                <FaTimes />
            </button>

            {IconComponent && <div className="kpi-icon">{IconComponent}</div>}
            <div className="kpi-content">
                <div className="kpi-title">
                    <div className={"kpi-name"}>{name.value || 'KPI Title'}</div>
                    {description && ( // Condition pour afficher l'icône info seulement si description existe
                        <div className="kpi-info" data-tooltip-id={`tooltip-desc-${_id}`} data-tooltip-content={description.value}>
                            <FaInfo />
                        </div>
                    )}
                </div>
                <div className="kpi-value">{displayValue}</div>
            </div>
            {/* Le Tooltip doit être unique par widget si plusieurs descriptions existent */}
            {description && <Tooltip id={`tooltip-desc-${_id}`} />}
        </div>
    );
};

export default KPIWidget;