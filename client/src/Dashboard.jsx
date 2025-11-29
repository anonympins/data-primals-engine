import React, {useState, useMemo, useEffect} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {FaPlus, FaSpinner, FaCog, FaEye} from "react-icons/fa"; // Ajout FaTrash

import "./Dashboard.scss"
import {useMutation, useQuery, useQueryClient} from "react-query";
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { SelectField, DurationField, TextField } from "./Field.jsx";
import {DashboardView} from "./DashboardView.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {getObjectHash} from "../../src/core.js";
import {getUserHash, getUserId} from "../../src/data.js";
import Button from "./Button.jsx";
import {FaNoteSticky} from "react-icons/fa6";
import ChartConfigModal from "./ChartConfigModal.jsx";
import {useUI} from "./contexts/UIContext.jsx";
import {DialogProvider} from "./Dialog.jsx";

// --- DashboardsPage (Reste inchangé) ---
export function DashboardsPage() {
    const { setSelectedModel, selectedModel }  = useModelContext()
    const { t } = useTranslation();
    const { me } = useAuthContext();
    const [selectedDashboardId, setSelectedDashboardId] = useState(null); // This seems to be the main state

    const { chartToAdd, setChartToAdd, flexViewToAdd, setFlexViewToAdd, htmlViewToAdd, setHtmlViewToAdd } = useUI();
    const [searchParams, setSearchParams] = useSearchParams();
    const { hash } = useParams(); // 2. Récupérer le hash de l'URL

// ... après les autres hooks useState, useQuery, etc.
    const queryClient = useQueryClient();
    const [newDashboardName, setNewDashboardName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [dashboardToEdit, setDashboardToEdit] = useState(null);

    // États pour le modal de configuration des graphiques
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [chartToConfigure, setChartToConfigure] = useState(null);

    const { data: dashboardsData, isLoading: isLoadingDashboards, error: errorDashboards } = useQuery(
        ['userDashboards', me?.username],
        async () => {
            if (!me?.username) return null;
            const response = await fetch(
                `/api/data/search?model=dashboard&_user=${me.username}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // body: JSON.stringify({ sort: { name: 1 } }) // Optionnel: trier
                });
            if (!response.ok) {
                const res = await response.json();
                throw new Error(res.error || t('dashboards.errorList', 'Erreur chargement des tableaux de bord'));
            }
            return await response.json();
        },
        {
            enabled: !!me?.username
        }
    );
    const selectedDashboard = useMemo(() => {
        if (!selectedDashboardId || !dashboardsData?.data) return null;
        return dashboardsData.data.find(db => db._id === selectedDashboardId);
    }, [selectedDashboardId, dashboardsData]);

    const createDashboardMutation = useMutation(
        async (dashboardName) => {
            const isFirstDashboard = !dashboardsData?.data || dashboardsData.data.length === 0;
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'dashboard',
                    data: { name: dashboardName, isDefault: isFirstDashboard } // Le premier est défini par défaut
                })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || t('dashboards.errorCreate', 'Impossible de créer le tableau de bord'));
            }
            return response.json();
        },
        {
            onSuccess: () => {
                // Rafraîchit la liste des dashboards après la création
                queryClient.invalidateQueries(['userDashboards', me?.username]);
                setNewDashboardName('');
                setIsCreating(false);
            },
            onError: (error) => {
                // Idéalement, afficher une notification à l'utilisateur
                console.error("Erreur lors de la création du dashboard:", error);
            }
        }
    );

    const updateDashboardMutation = useMutation(
        async (dashboardData) => {
            const { _id, _hash, _user, _createdAt, _updatedAt, ...data } = dashboardData;
            const response = await fetch(`/api/data`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'dashboard',
                    _id: _id,
                    data: data
                })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || t('dashboards.errorUpdate', 'Impossible de mettre à jour le tableau de bord'));
            }
            return response.json();
        },
        {
            onSuccess: () => {
                queryClient.invalidateQueries(['userDashboards', me?.username]);
                setIsEditing(false);
            },
            onError: (error) => {
                console.error("Erreur lors de la mise à jour du dashboard:", error);
            }
        }
    );

    const handleCreateDashboard = (e) => {
        e.preventDefault();
        if (newDashboardName.trim()) {
            createDashboardMutation.mutate(newDashboardName.trim());
        }
    };

    const handleUpdateDashboard = (e) => {
        e.preventDefault();
        if (dashboardToEdit.name.trim()) {
            updateDashboardMutation.mutate(dashboardToEdit);
        }
    };

    const handleEditFieldChange = (e) => {
        // e can be a standard event or an object { name, value } from custom fields
        const name = e.target ? e.target.name : e.name;
        const value = e.target ? e.target.value : e.value;
        setDashboardToEdit(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveChart = (chartConfig) => {
        if (!selectedDashboard) return;

        const newLayout = [...(selectedDashboard.layout || [])];

        if (chartConfig.id) { // Mode édition
            const index = newLayout.findIndex(c => c.id === chartConfig.id);
            if (index > -1) {
                newLayout[index] = chartConfig;
            }
        } else { // Mode ajout
            newLayout.push({ ...chartConfig, id: new Date().getTime().toString() });
        }

        updateDashboardMutation.mutate({
            ...selectedDashboard,
            layout: newLayout
        });

        setIsChartModalOpen(false);
        setChartToConfigure(null);
    };

    const handleSaveFlexView = (flexViewConfig) => {
        if (!selectedDashboard) return;

        // Safely get the layout as a mutable array, creating a default section if needed.
        const newLayout = JSON.parse(JSON.stringify(Array.isArray(selectedDashboard.layout) ? selectedDashboard.layout : []));

        if (newLayout.length === 0) {
            newLayout.push({
                name: t('dashboards.defaultSectionName', 'Nouvelle Section'),
                kpis: [],
                chartConfigs: [],
                flexViews: [],
                htmlViews: []
            });
        }

        // Add the widget to the first section
        const targetSection = newLayout[0];
        if (!targetSection.flexViews) {
            targetSection.flexViews = [];
        }

        targetSection.flexViews.push({
            ...flexViewConfig,
            type: 'flexView', // Add a type to distinguish from charts
            id: new Date().getTime().toString()
        });

        updateDashboardMutation.mutate({ ...selectedDashboard, layout: newLayout });
    };

    const handleSaveHtmlView = (htmlViewConfig) => {
        if (!selectedDashboard) return;

        // Safely get the layout as a mutable array, creating a default section if needed.
        const newLayout = JSON.parse(JSON.stringify(Array.isArray(selectedDashboard.layout) ? selectedDashboard.layout : []));

        if (newLayout.length === 0) {
            newLayout.push({
                name: t('dashboards.defaultSectionName', 'Nouvelle Section'),
                kpis: [],
                chartConfigs: [],
                flexViews: [],
                htmlViews: []
            });
        }

        // Add the widget to the first section
        const targetSection = newLayout[0];
        if (!targetSection.htmlViews) {
            targetSection.htmlViews = [];
        }

        // We only need to save the template and data-fetching info, not the data itself.
        const { data, ...configToSave } = htmlViewConfig;

        targetSection.htmlViews.push({
            ...configToSave,
            type: 'htmlView', // Add a type to distinguish
            id: `html-${Date.now()}`
        });

        updateDashboardMutation.mutate({ ...selectedDashboard, layout: newLayout });
    };

    const [isLoading, setIsLoading] = useState(true);

    const refreshPresets = useMemo(() => [
        { label: t('dashboards.refreshPresets.none', 'Désactivé'), value: null },
        { label: t('dashboards.refreshPresets.10s', '10 secondes'), value: 10 },
        { label: t('dashboards.refreshPresets.30s', '30 secondes'), value: 30 },
        { label: t('dashboards.refreshPresets.1m', '1 minute'), value: 60 },
        { label: t('dashboards.refreshPresets.5m', '5 minutes'), value: 300 },
        { label: t('dashboards.refreshPresets.15m', '15 minutes'), value: 900 },
    ], [t]);

    useEffect(() => {
        if( chartToAdd ){
            // Ouvre le modal de configuration avec les données du graphique de l'IA
            setChartToConfigure(chartToAdd);
            setIsChartModalOpen(true);
            setChartToAdd(null); // Réinitialise le contexte pour éviter de rouvrir le modal
        }
    }, [chartToAdd, setChartToAdd, selectedDashboard]);

    // NOUVEAU: Gérer l'ajout d'une vue flexible depuis le contexte UI
    useEffect(() => {
        if (flexViewToAdd && selectedDashboard) {
            handleSaveFlexView(flexViewToAdd);
            setFlexViewToAdd(null); // Réinitialiser le contexte
        }
    }, [flexViewToAdd, setFlexViewToAdd, selectedDashboard]);

    // Gérer l'ajout d'une vue HTML depuis le contexte UI
    useEffect(() => {
        if (htmlViewToAdd && selectedDashboard) {
            handleSaveHtmlView(htmlViewToAdd);
            setHtmlViewToAdd(null); // Réinitialiser le contexte
        }
    }, [htmlViewToAdd, setHtmlViewToAdd, selectedDashboard]);

    useEffect(() => {
        // When a new dashboard is selected, close the editing form
        setIsEditing(false);
    }, [selectedDashboardId]);

    useEffect(() => {
        // When the edit form is opened, initialize it with the selected dashboard's data
        if (isEditing && selectedDashboard) {
            setDashboardToEdit({ ...selectedDashboard });
        }
    }, [isEditing]);

    // 3. Ce useEffect trouve le bon dashboard quand le hash ou la liste change
    useEffect(() => {
        if (dashboardsData?.data.length > 0) {
            if( hash ) {
                const foundDashboard = dashboardsData?.data.find(d => d._hash+'' === hash);
                setSelectedDashboardId(foundDashboard?._id || null); // Met à jour avec le dashboard trouvé ou null
            }else{
                const defaultDashboard = dashboardsData?.data.find(db => db.isDefault === true);
                if( !defaultDashboard) {
                    setSelectedDashboardId(dashboardsData.data[0]._id);
                }else
                    setSelectedDashboardId(defaultDashboard._id || null);
            }
        }
        setIsLoading(false);
    }, [hash,dashboardsData]);

    const dashboardOptions = useMemo(() => {
        return (dashboardsData?.data || []).map(db => ({
            label: db.name + (db.isDefault ? ` (${t('dashboards.default', 'Défaut')})` : ''),
            value: db._id
        }));
    }, [dashboardsData, t]);

    const nav = useNavigate();

    useEffect(() => {
        setSelectedModel(null)
    }, []);


    if (isLoading) {
        return <div>{t('loading', 'Chargement...')}</div>;
    }

    if (!selectedDashboardId && hash) {
        return (
            <div className="dashboard-not-found">
                <h2>{t('dashboards.notFound', 'Dashboard non trouvé')}</h2>
                <p>{t('dashboards.notFoundHelp', 'Le dashboard avec l\'identifiant "{{0}}" n\'existe pas ou vous n\'y avez pas accès.',[hash] )}</p>
            </div>
        );
    }

    const creationForm = (
        <form onSubmit={handleCreateDashboard} className="create-dashboard-form flex flex-start mg-v-1">
            <input
                type="text"
                className="input-fit"
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                placeholder={t('dashboards.newName', 'Nom du nouveau tableau de bord')}
                disabled={createDashboardMutation.isLoading}
                autoFocus
            />
            <button type="submit" className="btn" disabled={createDashboardMutation.isLoading || !newDashboardName.trim()}>
                {createDashboardMutation.isLoading
                    ? <><FaSpinner className="spin" /> <Trans i18nKey="creating">Création...</Trans></>
                    : <Trans i18nKey="btns.create">Créer</Trans>
                }
            </button>
            {/* Bouton pour annuler quand on a cliqué sur le "+" */}
            {isCreating && (
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>
                    <Trans i18nKey="btns.cancel">Annuler</Trans>
                </button>
            )}
        </form>
    );

    return (
        <div className="dashboards-page">
            <div className={"flex right actions"}>
                <Button onClick={() => {
                    nav('/user/'+getUserHash(me)+'/dashboards');
                }}><FaEye /> <Trans i18nKey={"dashboards.title"}>Tableaux de bord</Trans></Button>

                <Button onClick={() => {
                    nav("/user/"+getUserHash(me)+"/?model="+(selectedModel?.name||'dashboard'));
                }}><FaNoteSticky /> <Trans i18nKey={"models"}>Modèles</Trans></Button>
            </div>
            <h1>{t('dashboards.title', 'Mes Tableaux de Bord')}</h1>

            {isLoadingDashboards && (
                <p><FaSpinner className="spin" /> <Trans i18nKey="dashboards.loadingList">Chargement des tableaux de bord...</Trans></p>
            )}

            {errorDashboards && (
                <p className="error">{errorDashboards.message}</p>
            )}

            {!isLoadingDashboards && !errorDashboards && (
                <>
                    {dashboardsData?.data && dashboardsData.data.length > 0 ? (
                        <div className="dashboard-selector-container">
                            <div className="dashboard-selector flex" style={{ alignItems: 'flex-end', gap: '8px' }}>
                                <SelectField
                                    name="dashboardSelection"
                                    label={t('dashboards.select', 'Choisir un tableau de bord :')}
                                    value={selectedDashboardId}
                                    onChange={(selectedOption) => {
                                        setSelectedDashboardId(selectedOption.value);
                                        const d = dashboardsData.data.find(f => f._id === selectedOption.value);
                                        history.pushState({}, null, '/user/'+getUserHash(me)+'/dashboards/'+d._hash);
                                    }}
                                    items={dashboardOptions}
                                />
                                <button onClick={() => { setIsCreating(true); setIsEditing(false); }} className="btn" title={t('dashboards.add', 'Ajouter un tableau de bord')}>
                                    <FaPlus />
                                </button>
                                {selectedDashboard && (
                                    <button onClick={() => { setIsEditing(true); setIsCreating(false); }} className="btn" title={t('dashboards.configure', 'Configurer le tableau de bord')}>
                                        <FaCog />
                                    </button>
                                )}
                            </div>
                            {isCreating && creationForm}
                            {isEditing && dashboardToEdit && (
                                <form onSubmit={handleUpdateDashboard} className="edit-dashboard-form flex flex-col flex-start mg-v-1 pd-1" style={{ border: '1px solid #ccc', borderRadius: '4px' }}>
                                    <h3 className="mg-b-1">{t('dashboards.configure', 'Configurer le tableau de bord')}</h3>
                                    <TextField
                                        name="name"
                                        label={t('dashboards.dashboardName', 'Nom du tableau de bord')}
                                        value={dashboardToEdit.name}
                                        onChange={handleEditFieldChange}
                                        required
                                        autoFocus
                                    />

                                    <div className="flex" style={{ gap: '1rem', alignItems: 'flex-end', width: '100%' }}>
                                        <div style={{ flexGrow: 1 }}>
                                            <DurationField
                                                name="refreshInterval"
                                                label={t('dashboards.refreshInterval', 'Intervalle de rafraîchissement')}
                                                value={dashboardToEdit.refreshInterval}
                                                onChange={handleEditFieldChange}
                                                help={t('dashboards.refreshIntervalHelp', 'Laisser vide pour désactiver le rafraîchissement automatique. La valeur est en secondes.')}
                                            />
                                        </div>
                                        <SelectField
                                            name="refreshIntervalPreset"
                                            label={t('dashboards.refreshPresets.label', 'Préréglages')}
                                            value={dashboardToEdit.refreshInterval}
                                            onChange={(option) => {
                                                console.log({option});
                                                if (option?.value)
                                                    handleEditFieldChange({ name: 'refreshInterval', value: option?.value })
                                            }}
                                            items={refreshPresets}
                                            style={{ minWidth: '150px' }}
                                        />
                                    </div>
                                    <div className="flex mg-t-1" style={{ gap: '8px' }}>
                                        <button type="submit" className="btn" disabled={updateDashboardMutation.isLoading}>
                                            {updateDashboardMutation.isLoading ? <><FaSpinner className="spin" /> <Trans i18nKey="btns.saving">Enregistrement...</Trans></> : <Trans i18nKey="btns.save">Enregistrer</Trans>}
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                                            <Trans i18nKey="btns.cancel">Annuler</Trans>
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    ) : (
                        <>
                            <p><Trans i18nKey="dashboards.noDashboards">Aucun tableau de bord trouvé. Vous pouvez en créer un.</Trans></p>
                            {creationForm}
                        </>
                    )}

                    {/* Affiche la vue du dashboard sélectionné */}
                    {/* Passe l'objet dashboard complet */}
                    {/*
                        TODO in DashboardView.jsx:
                        Utiliser la nouvelle propriété `dashboard.refreshInterval` (en secondes).
                        Si `refreshInterval` est défini et supérieur à 0, les données du dashboard (KPIs, graphiques)
                        doivent être rafraîchies automatiquement à cet intervalle.
                        Exemple avec react-query: `useQuery(queryKey, queryFn, { refetchInterval: dashboard.refreshInterval * 1000 })`
                        ou avec useEffect/setInterval:
                        useEffect(() => {
                            if (dashboard?.refreshInterval > 0) {
                                const intervalId = setInterval(() => {
                                    // logique de rafraîchissement, ex: queryClient.invalidateQueries(...)
                                }, dashboard.refreshInterval * 1000);
                                return () => clearInterval(intervalId);
                            }
                        }, [dashboard?.refreshInterval, queryClient]);
                    */}
                    <DashboardView dashboard={selectedDashboard} />

                    {/* Modal pour ajouter/éditer un graphique */}
                    <DialogProvider><ChartConfigModal
                        isOpen={isChartModalOpen}
                        onClose={() => setIsChartModalOpen(false)}
                        onSave={handleSaveChart}
                        initialConfig={chartToConfigure}
                    /></DialogProvider>
                </>
            )}
        </div>
    );
}