// C:/Dev/hackersonline-engine/client/src/Dashboard.jsx
import React, {useState, useMemo, useEffect} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {FaPlus, FaSpinner} from "react-icons/fa"; // Ajout FaTrash

import "./Dashboard.scss"
import {useMutation, useQuery, useQueryClient} from "react-query";
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { SelectField } from "./Field.jsx";
import {DashboardView} from "./DashboardView.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useParams, useSearchParams} from "react-router-dom";
import {getObjectHash} from "data-primals-engine/core";
import {getUserHash, getUserId} from "data-primals-engine/data";

// --- DashboardsPage (Reste inchangé) ---
export function DashboardsPage() {
    const { setSelectedModel }  = useModelContext()
    const { t } = useTranslation();
    const { me } = useAuthContext();
    const [selectedDashboardId, setSelectedDashboardId] = useState(null);

    const [ searchParams, setSearchParams ] = useSearchParams();
    const { hash } = useParams(); // 2. Récupérer le hash de l'URL

// ... après les autres hooks useState, useQuery, etc.
    const queryClient = useQueryClient();
    const [newDashboardName, setNewDashboardName] = useState('');
    const [isCreating, setIsCreating] = useState(false); // <-- AJOUTEZ CETTE LIGNE

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

    const handleCreateDashboard = (e) => {
        e.preventDefault();
        if (newDashboardName.trim()) {
            createDashboardMutation.mutate(newDashboardName.trim());
        }
    };
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
    const [isLoading, setIsLoading] = useState(true);

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
    const selectedDashboard = useMemo(() => {
        if (!selectedDashboardId || !dashboardsData?.data) return null;
        return dashboardsData.data.find(db => db._id === selectedDashboardId);
    }, [selectedDashboardId, dashboardsData]);

    const dashboardOptions = useMemo(() => {
        return (dashboardsData?.data || []).map(db => ({
            label: db.name + (db.isDefault ? ` (${t('dashboards.default', 'Défaut')})` : ''),
            value: db._id
        }));
    }, [dashboardsData, t]);

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
                <button type="button" className="btn" onClick={() => setIsCreating(false)}>
                    <Trans i18nKey="btns.cancel">Annuler</Trans>
                </button>
            )}
        </form>
    );

    return (
        <div className="dashboards-page">
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
                                <button onClick={() => setIsCreating(true)} className="btn" title={t('dashboards.add', 'Ajouter un tableau de bord')}>
                                    <FaPlus />
                                </button>
                            </div>
                            {isCreating && creationForm}
                        </div>
                    ) : (
                        <>
                            <p><Trans i18nKey="dashboards.noDashboards">Aucun tableau de bord trouvé. Vous pouvez en créer un.</Trans></p>
                            {creationForm}
                        </>
                    )}

                    {/* Affiche la vue du dashboard sélectionné */}
                    {/* Passe l'objet dashboard complet */}
                    <DashboardView dashboard={selectedDashboard} />
                </>
            )}
        </div>
    );
}