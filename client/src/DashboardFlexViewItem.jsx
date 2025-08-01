
// --- Component to fetch data and render a single FlexView ---
import {useTranslation} from "react-i18next";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import React, {useEffect, useMemo, useRef} from "react";
import {useQuery} from "react-query";
import {conditionToApiSearchFilter} from "../../src/data.js";
import {FaSpinner} from "react-icons/fa";
import {DisplayFlexNodeRenderer} from "./DisplayFlexNodeRenderer.jsx";

const DashboardFlexViewItem = ({ flexViewConfig, allModels }) => {
    const { t, i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const { me } = useAuthContext();

    // MODIFICATION: Extraire dataLimit et s'assurer qu'il est entre 1 et 8
    const { selectedModelName, dataFilter, flexStructure } = flexViewConfig;
    const effectiveDataLimit = Math.max(1, Math.min(flexViewConfig.dataLimit || 1, 8));

    const queryKey = useMemo(() => ['flexViewData', selectedModelName, dataFilter, effectiveDataLimit, me?.username, lang],
        [selectedModelName, dataFilter, effectiveDataLimit, me?.username, lang]);

    const { data: queryResult, isLoading, error, isFetching } = useQuery(
        queryKey,
        async () => {
            if (!selectedModelName || !me?.username) return { data: [] };

            const payload = {
                model: selectedModelName,
                filter: dataFilter || {},
                limit: effectiveDataLimit, // Utiliser la limite effective
                lang: lang,
            };

            // MODIFICATION: Construire l'URL dynamiquement avec effectiveDataLimit
            const apiUrl = `/api/data/search?model=${selectedModelName}&depth=1&limit=${effectiveDataLimit}&_user=${me.username}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const resError = await response.json();
                throw new Error(resError.error || t('dashboards.error.fetchFlexData', 'Erreur de chargement des données pour la vue Flex'));
            }
            const result = await response.json();
            return result; // Expects { data: [...] }
        },
        {
            enabled: !!selectedModelName && !!me?.username,
            keepPreviousData: true,
            refetchOnWindowFocus: false, // Désactive le rafraîchissement au focus de la fenêtre
            refetchOnMount: true,       // Ou false si 'enabled' gère déjà le premier chargement et que vous ne voulez pas de refetch au remontage
            staleTime: 5 * 60 * 1000,   // Considérer les données fraîches pendant 5 minutes (exemple)
            refetchInterval: flexViewConfig.refreshInterval || 60 * 1000, // Utiliser l'intervalle configur
        }
    );

    const dataToRender = useMemo(() => queryResult?.data || [], [queryResult]);
    const dataIndexRef = useRef(0);

    const currentModel = useMemo(() => {
        if (!selectedModelName || !allModels) return null;
        return allModels.find(m => m.name === selectedModelName);
    }, [selectedModelName, allModels]);

    const currentModelFields = useMemo(() => currentModel?.fields || [], [currentModel]);

    useEffect(() => {
        dataIndexRef.current = 0;
    }, [dataToRender]);

    if (isLoading && !queryResult) {
        return <div className="flex-view-placeholder"><FaSpinner className="spin" /> {t('loading', 'Chargement...')}</div>;
    }
    if (isFetching && !queryResult) {
        return <div className="flex-view-placeholder"><FaSpinner className="spin" /> {t('loading', 'Chargement...')}</div>;
    }

    if (error) {
        return <div className="flex-view-placeholder error" title={error.message}>{t('dashboards.error.displayFlexData', 'Erreur d\'affichage')}</div>;
    }

    if (!flexStructure) {
        return <div className="flex-view-placeholder">{t('dashboards.flexViewNotConfigured', 'Vue Flex non configurée ou modèle manquant.')}</div>;
    }

    if (dataToRender.length === 0 && !isLoading && !isFetching) {
        // Afficher la structure avec des données vides pour montrer les placeholders
        const dummyDataIndexRef = { current: 0 }; // Référence séparée pour l'affichage des placeholders
        return (
            <div className="flex-view-content-wrapper is-empty">
                <DisplayFlexNodeRenderer
                    key={currentModel?.name}
                    model={currentModel}
                    node={flexStructure}
                    allModels={allModels}
                    baseModelFields={currentModelFields}
                    data={[{}]} // Passer un objet factice pour que les placeholders s'affichent
                    dataIndexRef={dummyDataIndexRef}
                />
                <p className="empty-data-message">{t('dashboards.flexViewNoData', 'Aucune donnée à afficher pour la configuration actuelle.')}</p>
            </div>
        );
    }

    return (
        <div className="flex-view-content-wrapper">
            {isFetching && <div className="loading-overlay-flexview"><FaSpinner className="spin"/></div>}
            {dataToRender.map((item, index) => {
                const singleItemDataIndexRef = { current: 0 }; // Chaque item commence son propre cycle d'index
                return <DisplayFlexNodeRenderer
                    key={item._id || `flex-item-${index}`} // AMÉLIORATION : Clé plus stable
                    node={flexStructure}
                    model={selectedModelName}
                    data={[item]} // Passer un seul item à la fois
                    allModels={allModels}
                    dataIndexRef={singleItemDataIndexRef}
                    baseModelFields={currentModelFields}
                />
            })}
        </div>
    );
};

export { DashboardFlexViewItem };