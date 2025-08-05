import React, {useEffect, useState, useMemo, useRef, useCallback} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import KPIWidget from "./KPIWidget.jsx";
import { FaPencilAlt, FaPlus, FaSpinner, FaTrash } from "react-icons/fa";
import KPIDialog from "./KPIDialog.jsx";
import ChartConfigModal from "./ChartConfigModal.jsx";
import DashboardChart from "./DashboardChart.jsx";
import AddWidgetTypeModal from './AddWidgetTypeModal.jsx';
import FlexBuilderModal from './FlexBuilderModal.jsx';

import "./Dashboard.scss"
import { useQuery, useQueryClient, useMutation } from "react-query";
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { DialogProvider } from "./Dialog.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import FlexDataRenderer from "./FlexDataRenderer.jsx";
import {conditionToApiSearchFilter} from "../../src/data.js";
// --- MODIFICATION : Import de la fonction cssProps ---
import { cssProps } from 'data-primals-engine/core';
import {DashboardFlexViewItem} from "./DashboardFlexViewItem.jsx";

// --- updateDashboardLayout (fonction utilitaire, peut rester ici ou être externalisée) ---
async function updateDashboardLayout(dashboard, newLayoutData, username, t) {
    if (!dashboard || !username) {
        console.error("Dashboard and username are required to update layout.");
        throw new Error(t('dashboards.error.missingId', "ID du tableau de bord ou nom d'utilisateur manquant."));
    }

    try {
        const response = await fetch(`/api/data/${dashboard._id}?_user=${username}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'dashboard',
                data: {
                    ...dashboard,
                    _id: undefined,
                    layout: newLayoutData.map(section => ({
                        ...section,
                        kpis: section.kpis, // Assure la cohérence
                        kpiIds: undefined // Supprime l'ancien champ si présent
                    }))
                }
            })
        });

        if (!response.ok) {
            let errorMsg = t('dashboards.error.updateLayoutGeneric', "Erreur lors de la mise à jour de la disposition.");
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to update dashboard layout:", error);
        throw error;
    }
}



// --- DashboardView ---
export function DashboardView({ dashboard }) {
    const { t, i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const { me } = useAuthContext();
    const queryClient = useQueryClient();
    const { models } = useModelContext();

    const [layoutState, setLayoutState] = useState([]);
    const [editingSectionIndex, setEditingSectionIndex] = useState(null);
    const [originalSectionName, setOriginalSectionName] = useState('');

    const [isAddWidgetTypeModalOpen, setIsAddWidgetTypeModalOpen] = useState(false);
    const [isAddKpiDialogOpen, setIsAddKpiDialogOpen] = useState(false);
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [isFlexBuilderModalOpen, setIsFlexBuilderModalOpen] = useState(false);
    const [addingToSectionIndex, setAddingToSectionIndex] = useState(null);
    const [editingChartConfig, setEditingChartConfig] = useState(null);
    const [editingFlexViewConfig, setEditingFlexViewConfig] = useState(null);

    const mutation = useMutation(
        (newLayout) => updateDashboardLayout(dashboard, newLayout, me.username, t),
        {
            onMutate: async (newLayout) => {
                console.log("Optimi stic update:", newLayout);
                const previousLayout = layoutState;
                setLayoutState(newLayout);
                return { previousLayout };
            },
            onSettled: () => {
                queryClient.invalidateQueries(['userDashboards', me?.username]);
            },
            onError: (err, newLayout, context) => {
                console.error("Mutation failed:", err);
                if (context?.previousLayout) {
                    console.log("Rolling back to:", context.previousLayout);
                    setLayoutState(context.previousLayout);
                }
            },
            onSuccess: (result) => {
                console.log("Mutation succeeded, server response:", result);
            }
        }
    );
    const processedDashboardId = useRef(null);

    useEffect(() => {
        if (!dashboard) return;
        if (dashboard._id === processedDashboardId.current) return;

        let parsedLayout = [];

        if (dashboard?.layout) {
            try {
                parsedLayout = dashboard.layout.map(section => ({
                    ...section,
                    kpis: section.kpis || section.kpiIds || [], // Normalisation cohérente
                    chartConfigs: section.chartConfigs || [],
                    flexViews: section.flexViews || []
                }));
            } catch (e) {
                console.error("Failed to parse layout", e);
                parsedLayout = [{
                    name: t('dashboards.defaultSectionName'),
                    kpis: [],
                    chartConfigs: [],
                    flexViews: []
                }];
            }
        } else {
            parsedLayout = [{
                name: t('dashboards.defaultSectionName'),
                kpis: [],
                chartConfigs: [],
                flexViews: []
            }];
        }

        setLayoutState(parsedLayout);
        processedDashboardId.current = dashboard._id;
    }, [dashboard, t]);

    const { data: availableKpis, isLoading: isLoadingKpiDefs, error: errorKpiDefs } = useQuery(
        ['kpiDefinitions', me?.username, lang],
        async () => {
            if (!me?.username) return [];
            const response = await fetch(
                `/api/data/search?model=kpi&lang=${lang}&_user=${me.username}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
            if (!response.ok) {
                const res = await response.json();
                throw new Error(res.error || t('dashboards.errorDefs', 'Erreur chargement définitions KPI'));
            }
            const data = await response.json();
            return data.data;
        },
        { enabled: !!me?.username, refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000, refetchInterval: dashboard?.refetchInterval || 60 * 1000 }
    );

    const allKpiIdsInLayout = useMemo(() => layoutState.flatMap(section => section.kpis), [layoutState]);

    const handleOpenAddWidgetTypeModal = (sectionIndex) => {
        setAddingToSectionIndex(sectionIndex);
        setIsAddWidgetTypeModalOpen(true);
    };

    const handleSelectWidgetType = (type) => {
        setIsAddWidgetTypeModalOpen(false);
        setEditingChartConfig(null);
        setEditingFlexViewConfig(null); // Réinitialiser aussi la config FlexView en édition

        if (type === 'KPI') {
            setIsAddKpiDialogOpen(true);
        } else if (type === 'Chart') {
            setIsChartModalOpen(true);
        } else if (type === 'FlexView') { // Gérer le type FlexView
            setIsFlexBuilderModalOpen(true);
        }
    };


    const handleAddKpi = (kpiDefinition) => {
        if (addingToSectionIndex === null || !layoutState[addingToSectionIndex]) return;
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        if (!newLayoutState[addingToSectionIndex].kpis.includes(t(kpiDefinition.name.value)) && !newLayoutState[addingToSectionIndex].kpis.includes(kpiDefinition.name.value)) {
            newLayoutState[addingToSectionIndex].kpis.push(kpiDefinition.name.value);
            mutation.mutate(newLayoutState);
            // gtag('event', 'add_kpi_to_section');
        }
        setIsAddKpiDialogOpen(false);
        setAddingToSectionIndex(null);
    };

    const handleRemoveKpi = (kpiDefinition, sectionIndex) => {
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        if (newLayoutState[sectionIndex]) {
            newLayoutState[sectionIndex].kpis = newLayoutState[sectionIndex].kpis.filter(id => id !== kpiDefinition.name.value);
            mutation.mutate(newLayoutState);
            // gtag('event', 'remove_kpi_from_section');
        }
    };

    const handleOpenEditChartModal = (chartToEdit, sectionIndex) => {
        setEditingChartConfig(chartToEdit);
        setAddingToSectionIndex(sectionIndex);
        setIsChartModalOpen(true);
    };

    const handleCloseChartModal = () => {
        setIsChartModalOpen(false);
        setAddingToSectionIndex(null);
        setEditingChartConfig(null);
    };

    const handleSaveChartConfig = (config) => {
        if (addingToSectionIndex === null) return;
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        const targetSection = newLayoutState[addingToSectionIndex];
        if (!targetSection) return;
        if (!Array.isArray(targetSection.chartConfigs)) targetSection.chartConfigs = [];

        if (config.id) { // Edition
            const chartIndex = targetSection.chartConfigs.findIndex(chart => chart.id === config.id);
            if (chartIndex !== -1) {
                targetSection.chartConfigs[chartIndex] = config;
                mutation.mutate(newLayoutState);
                // gtag('event', 'edit_chart_in_section');
            }
        } else { // Ajout
            targetSection.chartConfigs.push({
                ...config,
                id: `chart-${Date.now()}-${Math.random().toString(16).slice(2)}`
            });
            mutation.mutate(newLayoutState);
            // gtag('event', 'add_chart_to_section');
        }
        handleCloseChartModal();
    };

    const handleRemoveChart = (chartId, sectionIndex) => {
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        if (newLayoutState[sectionIndex]?.chartConfigs) {
            newLayoutState[sectionIndex].chartConfigs = newLayoutState[sectionIndex].chartConfigs.filter(chart => chart.id !== chartId);
            mutation.mutate(newLayoutState);
            // gtag('event', 'remove_chart_from_section');
        }
    };

    // --- Fonctions pour FlexView ---
    const handleOpenEditFlexViewModal = (flexViewToEdit, sectionIndex) => {
        setEditingFlexViewConfig(flexViewToEdit);
        setAddingToSectionIndex(sectionIndex);
        setIsFlexBuilderModalOpen(true);
    };

    const handleCloseFlexBuilderModal = () => {
        setIsFlexBuilderModalOpen(false);
        setAddingToSectionIndex(null);
        setEditingFlexViewConfig(null);
    };

    const handleSaveFlexViewConfig = (config) => { // config vient de FlexBuilderModal
        if (addingToSectionIndex === null) return;
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        const targetSection = newLayoutState[addingToSectionIndex];
        if (!targetSection) return;
        if (!Array.isArray(targetSection.flexViews)) targetSection.flexViews = [];

        // MODIFICATION: S'assurer que dataLimit est valide (1-8) et a une valeur par défaut
        const newFlexViewData = {
            ...config,
            dataLimit: Math.max(1, Math.min(config.dataLimit || 1, 8)), // Valeur par défaut 1, max 8
        };

        if (config.id) { // Edition
            const flexViewIndex = targetSection.flexViews.findIndex(fv => fv.id === config.id);
            if (flexViewIndex !== -1) {
                targetSection.flexViews[flexViewIndex] = { ...newFlexViewData, id: config.id }; // Conserver l'ID existant
                mutation.mutate(newLayoutState);
                // gtag('event', 'edit_flexview_in_section');
            }
        } else { // Ajout
            targetSection.flexViews.push({
                ...newFlexViewData,
                id: `flex-${Date.now()}-${Math.random().toString(16).slice(2)}`
            });
            mutation.mutate(newLayoutState);
            // gtag('event', 'add_flexview_to_section');
        }
        handleCloseFlexBuilderModal();
    };

    const handleRemoveFlexView = (flexViewId, sectionIndex) => {
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        if (newLayoutState[sectionIndex]?.flexViews) {
            newLayoutState[sectionIndex].flexViews = newLayoutState[sectionIndex].flexViews.filter(fv => fv.id !== flexViewId);
            mutation.mutate(newLayoutState);
            // gtag('event', 'remove_flexview_from_section');
        }
    };


    const handleAddSection = () => {
        const newLayoutState = [...layoutState, {
            name: t('dashboards.defaultSectionName', 'Nouvelle Section'),
            kpis: [], // Utiliser kpis au lieu de kpiIds
            chartConfigs: [],
            flexViews: []
        }];
        mutation.mutate(newLayoutState);
    };

    const handleRemoveSection = (sectionIndex) => {
        if (layoutState.length <= 1) return; // Empêcher la suppression de la dernière section
        const newLayoutState = layoutState.filter((_, index) => index !== sectionIndex);
        mutation.mutate(newLayoutState);
        // gtag('event', 'remove_dashboard_section');
    };

    const handleUpdateSectionName = (sectionIndex, newName) => {
        const trimmedName = newName.trim();
        if (!trimmedName || trimmedName === layoutState[sectionIndex].name) {
            setEditingSectionIndex(null); // Quitter le mode édition si pas de changement ou nom vide
            return;
        }
        const newLayoutState = JSON.parse(JSON.stringify(layoutState));
        newLayoutState[sectionIndex].name = trimmedName;
        mutation.mutate(newLayoutState);
        setEditingSectionIndex(null);
        // gtag('event', 'rename_dashboard_section');
    };

    const handleSectionNameBlur = (e, sectionIndex) => {
        handleUpdateSectionName(sectionIndex, e.target.innerText);
    };

    const handleSectionNameKeyDown = (e, sectionIndex) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleUpdateSectionName(sectionIndex, e.target.innerText);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.target.innerText = originalSectionName; // Restaurer le nom original
            setEditingSectionIndex(null);
        }
    };

    const startEditingSectionName = (index, currentName) => {
        setOriginalSectionName(currentName);
        setEditingSectionIndex(index);
        // Focus et sélection du contenu après un court délai pour permettre au DOM de se mettre à jour
        setTimeout(() => {
            const element = document.querySelector(`.dashboard-section:nth-child(${index + 1}) .section-title`);
            if (element) {
                element.focus();
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(element);
                range.collapse(false); // Place le curseur à la fin
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }, 0);
    };

    const sectionsWithItems = useMemo(() => {
        return layoutState.map(section => {
            return {
                name: section.name, // On garde le nom

                kpis: (section.kpis || [])
                    .map(id => availableKpis?.find(kpi => kpi.name.value === id))
                    .filter(Boolean), // On retire les KPIs qui n'auraient pas été trouvés

                chartConfigs: section.chartConfigs || [],

                flexViews: section.flexViews || [],
            };
        });
    }, [layoutState, availableKpis]);

    if (layoutState === null && !dashboard) {
        return <p><Trans i18nKey="dashboards.noDashboardSelected">Aucun tableau de bord sélectionné.</Trans></p>;
    }
    if (layoutState === null && dashboard) { // Devrait être gaSpinner className="spin" /> <Trans i18nKey="dashboards.loadingLayout">Chargement de la disposition...</Trans></p>;
    }
    if (isLoadingKpiDefs) return <p><FaSpinner className="spin" /> <Trans i18nKey="dashboards.loadingDefs">Chargement des définitions de KPI...</Trans></p>;
    if (errorKpiDefs) return <p className="error">{errorKpiDefs.message}</p>;


    return (
        <div className="dashboard-view">
            <DialogProvider> {/* Assurez-vous que DialogProvider englobe bien tous les modaux */}
                {isAddWidgetTypeModalOpen && (<AddWidgetTypeModal
                    onClose={() => setIsAddWidgetTypeModalOpen(false)}
                    onSelectType={handleSelectWidgetType}
                />)}

                {isAddKpiDialogOpen && (
                    <KPIDialog
                        availableKpis={(availableKpis||[]).filter(kpi => !allKpiIdsInLayout.includes(kpi.name.value) && !allKpiIdsInLayout.includes(kpi.name.value))}
                        onAddKpi={handleAddKpi}
                        onClose={() => {
                            setIsAddKpiDialogOpen(false);
                            setAddingToSectionIndex(null); // Réinitialiser l'index de section
                        }}
                    />
                )}
                {isChartModalOpen && (
                    <ChartConfigModal
                        isOpen={isChartModalOpen}
                        onClose={handleCloseChartModal}
                        onSave={handleSaveChartConfig}
                        initialConfig={editingChartConfig}
                        models={models} // Passer les modèles pour la configuration du graphique
                    />
                )}
            </DialogProvider>

            {isFlexBuilderModalOpen && (
                <FlexBuilderModal
                    isOpen={isFlexBuilderModalOpen}
                    onClose={handleCloseFlexBuilderModal}
                    onSave={handleSaveFlexViewConfig} // Utiliser le handler pour FlexView
                    models={models} // Passer les modèles
                    initialConfig={editingFlexViewConfig} // Passer la config en édition
                    // data prop for FlexBuilder is for its internal preview,
                    // not for the data displayed on the dashboard itself.
                />
            )}
            {dashboard && (
                <>
                    <h2>{dashboard.name.value}</h2>
                    {dashboard.description && <p className="dashboard-description">{dashboard.description}</p>}

                    <div className="dashboard-sections">

                        {sectionsWithItems.map((sectionData, sectionIndex) => (
                            <div key={`section-${sectionIndex}-${dashboard._id}`} className="dashboard-section">
                                <div className="section-header">
                                    <h4
                                        className={`section-title ${editingSectionIndex === sectionIndex ? 'editing' : ''}`}
                                        contentEditable={editingSectionIndex === sectionIndex}
                                        suppressContentEditableWarning={true}
                                        onClick={() => {
                                            if (editingSectionIndex !== sectionIndex) startEditingSectionName(sectionIndex, sectionData.name);
                                        }}
                                        onBlur={(e) => handleSectionNameBlur(e, sectionIndex)}
                                        onKeyDown={(e) => handleSectionNameKeyDown(e, sectionIndex)}
                                    >
                                        {sectionData.name}
                                    </h4>
                                    {/* Bouton d'édition de nom de section (optionnel, car le titre est cliquable) */}
                                </div>

                                <div
                                    className="items-grid flex"> {/* Assurez-vous que cette classe est bien stylée pour flex/grid */}
                                    {sectionData.kpis.map(kpiDef => (
                                        <KPIWidget
                                            key={kpiDef._id}
                                            kpiDefinition={kpiDef}
                                            onRemove={() => handleRemoveKpi(kpiDef, sectionIndex)}
                                            disabled={mutation.isLoading}
                                        />
                                    ))}
                                    {sectionData.chartConfigs.map(chartConfig => (
                                        <div key={chartConfig.id} className="dashboard-item-wrapper chart-wrapper">
                                            <DashboardChart config={chartConfig}/>
                                            <div className="item-actions">
                                                <button className="edit-item-button"
                                                        onClick={() => handleOpenEditChartModal(chartConfig, sectionIndex)}
                                                        title={t('dashboards.editChartTitle', 'Modifier ce graphique')}
                                                        disabled={mutation.isLoading}><FaPencilAlt/></button>
                                                <button className="remove-item-button"
                                                        onClick={() => handleRemoveChart(chartConfig.id, sectionIndex)}
                                                        title={t('dashboards.removeChartTitle', 'Supprimer ce graphique')}
                                                        disabled={mutation.isLoading}><FaTrash/></button>
                                            </div>
                                        </div>
                                    ))}
                                    {/* Affichage des FlexViews */}
                                    {sectionData.flexViews?.map(flexViewConfig => (

                                            <div key={flexViewConfig.id}
                                                 className="dashboard-item-wrapper flex-view-wrapper">
                                                <DashboardFlexViewItem
                                                    flexViewConfig={flexViewConfig}
                                                    allModels={models} // Passer tous les modisponibles
                                                />
                                                <div className="item-actions">
                                                    <button className="edit-item-button"
                                                            onClick={() => handleOpenEditFlexViewModal(flexViewConfig, sectionIndex)}
                                                            title={t('dashboards.editFlexViewTitle', 'Modifier cette vue Flex')}
                                                            disabled={mutation.isLoading}><FaPencilAlt/></button>
                                                    <button className="remove-item-button"
                                                            onClick={() => handleRemoveFlexView(flexViewConfig.id, sectionIndex)}
                                                            title={t('dashboards.removeFlexViewTitle', 'Supprimer cette vue Flex')}
                                                            disabled={mutation.isLoading}><FaTrash/></button>
                                                </div>
                                            </div>
                                    ))}

                                    {/* Message si la section est vide */}
                                    {sectionData.kpis.length === 0 && sectionData.chartConfigs.length === 0 && (sectionData.flexViews === undefined || sectionData.flexViews.length === 0) && (
                                        <p className="empty-section-message"><Trans
                                            i18nKey="dashboards.emptySectionClickPlus">Section vide. Cliquez sur le
                                            bouton '+' ci-dessous pour ajouter des éléments.</Trans></p>
                                    )}
                                </div>
                                <div className="add-buttons-inline">
                                    <button
                                        className="add-kpi-button add-kpi-button-inline" /* Renommer la classe si elle est générique */
                                        onClick={() => handleOpenAddWidgetTypeModal(sectionIndex)}
                                        title={t('dashboards.addWidgetToSectionTitle', 'Ajouter un élément à cette section')}
                                        disabled={mutation.isLoading}>
                                        <FaPlus/>
                                    </button>
                                    {layoutState.length > 1 && (
                                        <button
                                            className="remove-section-button"
                                            onClick={() => handleRemoveSection(sectionIndex)}
                                            title={t('dashboards.removeSectionTitle', 'Supprimer cette section')}
                                            disabled={mutation.isLoading}
                                        >
                                            <FaTrash/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {sectionsWithItems.length > 0 && (<div className="flex actions left">
                            <button onClick={handleAddSection} className="add-section-button"
                                    disabled={mutation.isLoading}>
                                <FaPlus/> <Trans i18nKey="dashboards.addSection">Ajouter une section</Trans>
                            </button>
                        </div>)}

                        {layoutState.length === 0 && !isLoadingKpiDefs && (
                            <p><Trans i18nKey="dashboards.noSections">Ce tableau de bord n'a pas encore de
                                sections.</Trans></p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}