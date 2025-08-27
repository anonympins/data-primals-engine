import React, {useEffect, useMemo, useState} from 'react';
import { fr } from 'date-fns/locale'
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend, TimeScale, Filler,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import i18n from 'i18next';

import 'chartjs-adapter-date-fns';
import {useModelContext} from "./contexts/ModelContext.jsx";
import {isDate} from "../../src/core.js";
import useWindowSize from "./hooks/useWindowSize.js";
import useDebounce from "./hooks/useDebounce.js";

ChartJS.register(
    Filler,
    TimeScale, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend
);

const fetchChartData = async (chartConfig) => {
    console.log(`[fetchChartData] Fetching aggregated data with config:`, chartConfig); // chartConfig inclura maintenant potentiellement chartConfig.filter
    try {
        const response = await fetch(`/api/charts/aggregate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chartConfig) // Le filtre sera envoyil est dans chartConfig
        });
        const responseClone = response.clone();
        if (!response.ok) {
            let errorText = `API Error ${response.status}`;
            try {
                const errorData = await response.json();
                errorText = errorData.error || JSON.stringify(errorData);
            } catch (e) {
                try { errorText = await responseClone.text(); } catch (e2) { /* ignore */ }
            }
            console.error(`[fetchChartData] API Error: ${errorText}`);
            throw new Error(errorText);
        }
        const data = await response.json();
        console.log(`[fetchChartData] Aggregated data received:`, data);
        return data;
    } catch (error) {
        console.error(`[fetchChartData] Error during fetch:`, error);
        throw error;
    }
};

// formatDateLabel, parsePotentiallyFormattedDate, processDataForChart restent inchangées
const formatDateLabel = (label, locale = 'fr-FR') => {
    if (typeof label === 'string' && (label.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || label.match(/^\d{4}-\d{2}-\d{2}$/))) {
        const date = new Date(label);
        if (!isNaN(date.getTime())) {
            if (label.includes('T') && (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0)) {
                return date.toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            } else {
                return date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
            }
        }
    }
    if (typeof label === 'boolean') {
        return label ? i18n.t('boolean.true', 'Vrai') : i18n.t('boolean.false', 'Faux');
    }
    if (label === null || label === undefined) {
        return i18n.t('charts.labelNull', '(Non défini)');
    }
    return String(label);
};

const parsePotentiallyFormattedDate = (str) => {
    if (typeof str !== 'string') return null;
    let match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);
    if (match) {
        const [, day, month, year, hour, minute] = match;
        const isoStr = `${year}-${month}-${day}${hour ? `T${hour}:${minute || '00'}:00` : 'T00:00:00'}`;
        const dt = new Date(isoStr);
        return !isNaN(dt) && dt.getFullYear() === parseInt(year) && dt.getMonth() === parseInt(month) - 1 && dt.getDate() === parseInt(day) ? dt : null;
    }
    const dt = new Date(str);
    return !isNaN(dt) ? dt : null;
};

const processDataForChart = (inputData, config, t, timed, lang) => {
    const { type, title, model, groupBy, xAxis, yAxis, aggregationType = 'count' } = config;
    const currentLocale = i18n.language || 'fr-FR';

    if (!inputData || !Array.isArray(inputData) || inputData.length === 0 || !('label' in inputData[0]) || !('value' in inputData[0])) {
        return { labels: [], datasets: [] };
    }
    let processedItems = [...inputData];
    processedItems.sort((itemA, itemB) => {
        const labelA = itemA.label;
        const labelB = itemB.label;
        const dateA = parsePotentiallyFormattedDate(labelA);
        const dateB = parsePotentiallyFormattedDate(labelB);
        if (dateA && dateB) {
            return dateA.getTime() - dateB.getTime();
        }
        const numA = parseFloat(labelA);
        const numB = parseFloat(labelB);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return String(labelA).localeCompare(String(labelB), currentLocale, { sensitivity: 'base' });
    });

    const labels = processedItems.filter(item => {
        if( !timed )
            return true;
        const d = new Date(item.label);
        return isDate(d);
    }).map(item => {
        if( !timed)
            return item.label;
        return new Date(item.label);
    });
    const dataValues = processedItems.map(item => parseFloat(item.value) || 0);

    let datasetLabel = title || 'Data';
    const isGroupingChart = ['pie', 'doughnut'].includes(type);
    const aggregationLabel = t('aggregation.' + aggregationType, aggregationType);
    if (isGroupingChart) {
        datasetLabel = title || t(`field_${model}_${groupBy}`, groupBy);
        if (yAxis && aggregationType !== 'count') {
            datasetLabel += ` (${aggregationLabel} ${t(`field_${model}_${yAxis}`, yAxis)})`;
        } else if (aggregationType === 'count') {
            datasetLabel += ` (${aggregationLabel})`;
        }
    } else {
        if (yAxis && aggregationType !== 'count') {
            datasetLabel = `${title || t(`field_${model}_${yAxis}`, yAxis)} (${aggregationLabel} ${t(`field_${model}_${yAxis}`, yAxis)})`;
        } else {
            datasetLabel = `${title || t(`field_${model}_${xAxis}`, xAxis)} (${aggregationLabel})`;
        }
    }

    const chartJsData = {
        labels: labels,
        datasets: [
            {
                label: datasetLabel,
                data: dataValues,
                barThickness: config.type === 'bar' ? (timed ? 5 : 3500/(20+(datasetLabel.length))) : undefined,
                barPercentage: timed && config.type === 'bar' ? 0.9 : undefined,
                categoryPercentage: timed && config.type === 'bar' ? 0.8 : undefined,
                backgroundColor: (type === 'pie' || type === 'doughnut')
                    ? ['rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)', 'rgba(199, 199, 199, 0.7)', 'rgba(83, 102, 89, 0.7)']
                    : config.chartBackgroundColor,
                borderColor: (type === 'pie' || type === 'doughnut')
                    ? '#fff'
                    : '#666',
                borderWidth: 1,
                fill: type === 'line' ? true : undefined,
                tension: type === 'line' ? 0.1 : undefined,
            },
        ],
    };
    return chartJsData;
};


const DashboardChart = ({ config }) => { // config peut maintenant contenir config.filter
    const { i18n, t } = useTranslation();
    const { models } = useModelContext();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];


    // --- NOUVEAU: Logique de gestion du redimensionnement ---
    const windowSize = useWindowSize();
    // On "debounce" la taille de la fenêtre. La requête API et le rendu final n'auront lieu qu'après 300ms sans mouvement.
    const debouncedSize = useDebounce(windowSize, 300);
    // On utilise un état pour savoir si l'utilisateur est EN TRAIN de redimensionner.
    const [isResizing, setIsResizing] = useState(false);
    useEffect(() => {
        // 1. Au début de chaque redimensionnement, on active le flag.
        setIsResizing(true);

        // 2. On utilise un timer pour désactiver le flag 300ms après le DERNIER événement de redimensionnement.
        // C'est une forme de "debouncing" directement appliquée à notre état.
        const resizeTimer = setTimeout(() => {
            setIsResizing(false);
        }, 100); // Un délai raisonnable

        // 3. On nettoie le timer à chaque nouvel événement pour qu'il ne se déclenche qu'à la fin.
        return () => clearTimeout(resizeTimer);
    }, [windowSize]); // Cet effet se déclenche à chaque micro-mouvement.

    const modelDefinition = models?.find(f => f.name === config.model);
    const fieldDefinition = modelDefinition?.fields.find(f => f.name === config.xAxis);
    const timed = fieldDefinition && ['datetime', 'date'].includes(fieldDefinition.type);

    // État local pour gérer l'échelle de temps de manière interactive
    const [localTimeUnit, setLocalTimeUnit] = useState(config.timeUnit || 'day');

    // S'assurer que l'état local est synchronisé si la config du graphique change
    useEffect(() => {
        setLocalTimeUnit(config.timeUnit || 'day');
    }, [config.timeUnit]);

    const isGroupingChart = config && ['pie', 'doughnut'].includes(config.type);
    const requiresYAxisForValidation = config && config.aggregationType && config.aggregationType !== 'count';
    const isValidConfig = config && config.model && config.type && config.title && config.aggregationType &&
        (isGroupingChart
                ? (config.groupBy && (requiresYAxisForValidation ? !!config.yAxis : true))
                : (config.xAxis && (requiresYAxisForValidation ? !!config.yAxis : true))
        );



    const queryKey = useMemo(() => {
        const filterKey = JSON.stringify(config.filter || {});
        return [
            'chartData',
            config.model,
            config.type,
            config.aggregationType,
            isGroupingChart ? config.groupBy : config.xAxis,
            requiresYAxisForValidation ? config.yAxis : null,
            isGroupingChart && config.groupByLabelField ? config.groupByLabelField : null,
            filterKey
        ];
    }, [config, isGroupingChart, requiresYAxisForValidation, debouncedSize.width]);


    const queryFn = () => fetchChartData(config); // config est passé en entier, incluant config.filter
    const isQueryEnabled = isValidConfig;

    const { data: queryData, isLoading, isError, error } = useQuery(
        queryKey,
        queryFn,
        {
            enabled: isQueryEnabled,
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false
        }
    );

    const chartData = useMemo(() => {
        if (!queryData) {
            return { labels: [], datasets: [] };
        }
        return processDataForChart(queryData, config, t, timed, lang);
    }, [queryData, config, t, timed, lang]);

    const renderChart = useMemo(() => {

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            locale: 'fr-FR',
            adapters: {
                date: {
                    locale: fr
                }
            },
            plugins: {
                legend: {
                    position: (config.type === 'pie' || config.type === 'doughnut') ? 'right' : 'top',
                },
                title: {
                    display: !!config.title,
                    text: config.title || '',
                }
            },
        };

        const timeUnit = localTimeUnit; // On utilise l'état local interactif

        const getTooltipFormat = (unit) => {
            switch(unit) {
                case 'year': return 'yyyy';
                case 'month': return 'MMM yyyy';
                case 'hour': return "dd MMM, HH'h'";
                case 'minute': return 'dd MMM, HH:mm';
                case 'day':
                case 'week':
                default: return 'dd MMM yyyy';
            }
        };

        const axisOptions = {
            ...baseOptions,
            scales: {
                x: {
                    type: timed ? 'time' : 'category',
                    time: timed ? {
                        tooltipFormat: getTooltipFormat(timeUnit),
                        unit: timeUnit,
                    } : {},
                    ticks: timed ? {
                        autoSkip: true,
                        maxTicksLimit: 20,
                        callback: function (value) {
                            const d = new Date(value);
                            let options;
                            switch(timeUnit) {
                                case 'year': options = { year: 'numeric' }; break;
                                case 'month': options = { month: 'short', year: 'numeric' }; break;
                                case 'day':
                                case 'week': options = { day: 'numeric', month: 'short' }; break;
                                case 'hour':
                                case 'minute':
                                default: options = { hour: '2-digit', minute: '2-digit' }; break;
                            }
                            return new Intl.DateTimeFormat(lang, options).format(d);
                        }
                    } : {}
                },
                y: {
                    beginAtZero: true
                }
            },
        };

        const noAxisOptions = {
            ...baseOptions,
            scales: undefined,
            plugins: {
                ...baseOptions.plugins, // Conserve la légende et le titre de base
                tooltip: {
                    callbacks: {
                        // Le titre de l'infobulle doit être le libellé de la section survolée (ex: "Catégorie A")
                        title: (tooltipItems) => tooltipItems[0]?.label || '',

                        // Le corps de l'infobulle doit afficher la valeur et son contexte (ex: "Count: 123")
                        // et non le titre général du graphique.
                        label: (tooltipItem) => {
                            const aggregationLabel = t('aggregation.' + config.aggregationType, config.aggregationType);
                            const value = tooltipItem.formattedValue || tooltipItem.raw;
                            if (config.yAxis && config.aggregationType !== 'count') {
                                const yAxisLabel = t(`field_${config.model}_${config.yAxis}`, config.yAxis);
                                return `${aggregationLabel} (${yAxisLabel}): ${value}`;
                            }
                            return `${aggregationLabel}: ${value}`;
                        }
                    }
                }
            }
        };

        const data = !isResizing ? chartData : { labels: [], datasets: [] };
        try {
            switch (config.type) {
                case 'line':
                    return <Line options={axisOptions} data={data} />;
                case 'pie':
                    return <Pie options={noAxisOptions} data={data} />;
                case 'doughnut':
                    return <Doughnut options={noAxisOptions} data={data} />;
                case 'bar':
                default:
                    return <Bar options={axisOptions} data={data} />;
            }
        } catch (renderError) {
            return (
                <div className="chart-error" style={{ color: 'red', padding: '10px' }}>
                    {t('charts.renderError', 'Erreur interne lors du rendu du graphique.')}
                </div>
            );
        }
    }, [config, t, chartData, isResizing, lang, localTimeUnit]);

    if (!isValidConfig) {
        return (
            <div className="chart-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'red', padding: '10px', textAlign: 'center' }}>
                <FaExclamationTriangle />&nbsp; {t('charts.invalidConfig', 'Configuration invalide ou incomplète')}
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="chart-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <FaSpinner className="spin" />&nbsp;{t('loading', 'Chargement...')}
            </div>
        );
    }
    if (isError) {
        return (
            <div className="chart-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'red', padding: '10px', textAlign: 'center' }}>
                <FaExclamationTriangle size="2em" />
                <p>{t('errorLoadingData', 'Erreur de chargement des données.')}</p>
                {error && <p style={{ fontSize: '0.8em', marginTop: '5px' }}>{error.message}</p>}
            </div>
        );
    }
    if (!chartData || !chartData.datasets || chartData.datasets.length === 0 || (chartData.datasets[0].data && chartData.datasets[0].data.length === 0)) {
        return (
            <div className="chart-no-data" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.7 }}>
                {t('charts.noData', 'Aucune donnée à afficher.')}
            </div>
        );
    }

    const containerStyle = {
        position: 'relative',
        height: '300px',
        width: '100%'
    };

    return (
        <div className="dashboard-chart-container" style={containerStyle}>
            {/* Ajout du sélecteur d'échelle de temps directement sur le graphique */}
            {timed && (
                <div style={{ position: 'absolute', top: '5px', right: '5px', zIndex: 10 }}>
                    <select
                        value={localTimeUnit}
                        onChange={(e) => setLocalTimeUnit(e.target.value)}
                        style={{
                            padding: '2px 4px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            backgroundColor: 'white',
                            fontSize: '0.8em'
                        }}
                        title={t('charts.timeUnit', 'Échelle de temps')}
                    >
                        <option value="minute">{t('time.minute', 'Minute')}</option>
                        <option value="hour">{t('time.hour', 'Heure')}</option>
                        <option value="day">{t('time.day', 'Jour')}</option>
                        <option value="week">{t('time.week', 'Semaine')}</option>
                        <option value="month">{t('time.month', 'Mois')}</option>
                        <option value="year">{t('time.year', 'Année')}</option>
                    </select>
                </div>
            )}
            {renderChart}
        </div>
    );
};

export default DashboardChart;