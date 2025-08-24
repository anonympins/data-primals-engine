import React, { useState } from 'react';
import {useMutation, useQuery, useQueryClient} from 'react-query';
import { Trans, useTranslation } from 'react-i18next';
import {FaBoxOpen, FaChevronLeft, FaDownload, FaPlus, FaStar, FaTag, FaUser, FaUserCircle, FaTimes} from 'react-icons/fa';
import Button from './Button.jsx';
import { useNotificationContext } from './NotificationProvider.jsx';
import { useModelContext } from './contexts/ModelContext.jsx';
import { useAuthContext } from './contexts/AuthContext.jsx';

import './PackGallery.scss';
import {elementsPerPage} from "../../src/constants.js";
import Markdown from "react-markdown";
import {Dialog, DialogProvider} from "./Dialog.jsx";
import {TextField, CheckboxField} from "./Field.jsx";

// --- API Fetching Functions ---
const fetchPacks = async (sortBy, lang, filterByUser = false, user) => {
    const url = `/api/packs?lang=${lang}&sortBy=${sortBy.field}&order=${sortBy.order}${filterByUser ? '&user='+user.username : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
};

const fetchPackDetails = async (packId, lang) => {
    if (!packId) return null;
    const response = await fetch(`/api/packs/${packId}?lang=${lang}`);
    if (!response.ok) {
        throw new Error('Failed to fetch pack details');
    }
    return response.json();
};

// --- Sub-components ---

// Carte pour afficher un pack dans la galerie
const PackCard = ({ pack, onSelect }) => {
    const { t } = useTranslation();
    const { me: user } = useAuthContext();

    return (
        <div className="pack-card" onClick={() => onSelect(pack._id)}>
            <div className="pack-card-header">
                <h3><FaBoxOpen /> {pack.name}</h3>
                <div className="pack-header-right">
                    <span className="pack-stars"><FaStar /> {pack.stars || 0}</span>
                    {user && pack._user === user.username && (
                        <span className="my-pack-badge" title={t('packs.myPack', 'Mon pack')}>
                            <FaUserCircle />
                        </span>
                    )}
                </div>
            </div>
            <p className="pack-description">{pack.description?.substring(0, 120) || t('packs.noDescription', 'Aucune description.')}... </p>
            <div className="pack-card-footer">
                <span className="pack-author"><FaUser /> {pack._user}</span>
                <div className="pack-tags">
                    {(pack.tags || []).map(tag => <span key={tag} className="tag"><FaTag /> {tag}</span>)}
                </div>
            </div>
        </div>
    );
};

// Vue détaillée d'un pack
const PackDetail = ({ packId, onBack }) => {
    const { t,i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const { addNotification } = useNotificationContext();
    const queryClient = useQueryClient();
    const { selectedModel, page, pagedFilters, pagedSort } = useModelContext();
    const { me: user } = useAuthContext();
    const { data: pack, isLoading, isError } = useQuery(['packDetails', packId], () => fetchPackDetails(packId, lang));

    const { mutate: updatePack, isLoading: isUpdating } = useMutation(
        updatePackMutationFn,
        {
            onSuccess: () => {
                addNotification({ status: 'completed', title: t('packs.update.success', 'Pack mis à jour avec succès !') });
                queryClient.invalidateQueries(['packDetails', packId]);
                queryClient.invalidateQueries('packs');
            },
            onError: (error) => {
                addNotification({ status: 'error', title: t('packs.update.error', 'Échec de la mise à jour du pack'), message: error.message });
            }
        }
    );

    const { mutate: installPack, isLoading: isInstalling } = useMutation(
        installPackMutationFn,
        {
            onSuccess: (data) => {
                addNotification({
                    status: 'completed',
                    title: t('datatable.pack.install.success', `Pack '${pack.name}' installé avec succès !`)
                });
                gtag('event', 'pack install '+pack.name);
                queryClient.invalidateQueries('api/models');
                queryClient.invalidateQueries(['api/data', selectedModel?.name, 'page', page, elementsPerPage, pagedFilters[selectedModel?.name], pagedSort[selectedModel?.name]]);

                onBack();
            },
            onError: (error) => {
                addNotification({
                    status: 'error',
                    title: t('datatable.pack.install.error', `Échec de l'installation du pack`),
                    message: error.message
                });
            }
        }
    );

    const handleInstall = async () => {
        addNotification({ status: 'info', title: t('packs.install.started', `Installation du pack '${pack.name}'...`) });
        installPack({ packId: pack._id, lang });
    };

    const handlePublicToggle = (e) => {
        const pr = !e;
        updatePack({ packId: pack._id, updateData: { private: pr } });
    };

    if (isLoading) return <div className="spinner-loader"></div>;
    if (isError) return <p className="error-text">{t('packs.error.details', 'Erreur lors du chargement des détails du pack.')}</p>;
    if (!pack) return null;

    const renderModelsList = (models) => {
        if (!models || models.length === 0) return t('packs.noModelsIncluded', 'Aucun modèle spécifié.');

        return models.map(model => {
            const modelName = typeof model === 'object' && model !== null ? model.name : model;
            return modelName;
        }).join(', ');
    };

    return (
        <div className="pack-detail">
            <Button onClick={onBack} className="back-button"><FaChevronLeft /> <Trans i18nKey="btns.back">Retour</Trans></Button>
            <div className="pack-detail-header">
                <h1>{pack.name}</h1>
                <div className="pack-detail-actions">
                    {user && pack._user === user.username && (
                        <div className="owner-actions">
                            <span className="my-pack-indicator">
                                <FaUserCircle /> <Trans i18nKey="packs.myPack">Mon pack</Trans>
                            </span>
                            <CheckboxField
                                label={t('packs.public', 'Public')}
                                checked={!pack.private}
                                onChange={handlePublicToggle}
                                disabled={isUpdating}
                                title={t('packs.public.tooltip', 'Rendre ce pack visible par les autres utilisateurs dans la galerie.')}
                            />
                        </div>
                    )}
                    <Button onClick={handleInstall} disabled={isInstalling}>
                        <FaDownload /> {isInstalling ? t('packs.installing', 'Installation...') : t('Installer')}
                    </Button>
                </div>
            </div>
            <div className="pack-meta">
                <span><FaUser /> {pack._user}</span>
                <span><FaStar /> {pack.stars || 0}</span>
                <span><FaTag /> {(pack.tags || []).join(', ')}</span>
            </div>
            <div className="pack-content">
                <h2><Trans i18nKey="packs.description">Description</Trans></h2>
                <div className="description-content"><Markdown>{pack.description}</Markdown></div>

                <h2><Trans i18nKey="packs.modelsIncluded">Modèles inclus</Trans></h2>
                <p>{renderModelsList(pack.models)}</p>

                <h2><Trans i18nKey="packs.dataPreview">Aperçu des données à installer</Trans></h2>
                <div className="data-preview">
                    <pre>{JSON.stringify(pack.data, null, 2)}</pre>
                </div>
            </div>
        </div>
    );
};

const installPackMutationFn = async ({packId, lang}) => {
    const response = await fetch(`/api/packs/${packId}/install?lang=${lang}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to install pack');
    }
    return response.json();
};

const updatePackMutationFn = async ({ packId, updateData }) => {
    const response = await fetch(`/api/packs/${packId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update pack');
    }
    return response.json();
};

// --- Main Gallery Component ---
const PackGallery = () => {
    const { t, i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const { addNotification } = useNotificationContext();
    const { me: user } = useAuthContext();

    const [showManualInstallDialog, setShowManualInstallDialog] = useState(false);
    const [manualPackJson, setManualPackJson] = useState('');
    const [view, setView] = useState('list');
    const [selectedPackId, setSelectedPackId] = useState(null);
    const [sortBy, setSortBy] = useState({ field: '_updatedAt', order: -1 });
    const [showOnlyMyPacks, setShowOnlyMyPacks] = useState(false);

    const queryClient = useQueryClient()
    const { data: packs, isLoading, isError } = useQuery(
        ['packs', sortBy, showOnlyMyPacks],
        () => fetchPacks(sortBy, lang, showOnlyMyPacks, user)
    );

    const handleSelectPack = (packId) => {
        setSelectedPackId(packId);
        setView('detail');
    };

    const handleManualInstall = async () => {
        try {
            const packData = JSON.parse(manualPackJson.trim());
            addNotification({ status: 'info', title: t('packs.install.started', `Installation du pack personnalisé...`) });

            const response = await fetch('/api/packs/install', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ packData, lang }),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            addNotification({
                status: 'completed',
                title: t('datatable.pack.install.success', 'Pack installé avec succès !')
            });
            setShowManualInstallDialog(false);
            setManualPackJson('');
            queryClient.invalidateQueries(['packs', sortBy, showOnlyMyPacks]);

        } catch (error) {
            addNotification({
                status: 'error',
                title: t('datatable.pack.install.error', `Échec de l'installation`),
                message: error.message
            });
        }
    };

    const handleBackToList = () => {
        setSelectedPackId(null);
        setView('list');
    };

    const toggleMyPacksFilter = () => {
        setShowOnlyMyPacks(!showOnlyMyPacks);
    };

    const clearMyPacksFilter = () => {
        setShowOnlyMyPacks(false);
    };

    const renderContent = () => {
        if (view === 'detail') {
            return <PackDetail packId={selectedPackId} onBack={handleBackToList} />;
        }

        if (isLoading) return <div className="spinner-loader"></div>;
        if (isError) return <p className="error-text">{t('packs.error.loading', 'Erreur lors du chargement des packs.')}</p>;

        return (
            <>
                <div className="gallery-header">
                    <h1>
                        {showOnlyMyPacks
                            ? <Trans i18nKey="packs.myPacksTitle">Mes Packs</Trans>
                            : <Trans i18nKey="packs.galleryTitle">Galerie de Packs</Trans>
                        }
                    </h1>
                    <div className="header-actions">
                        <div className="sort-options">
                            <span><Trans i18nKey="packs.sortBy">Trier par :</Trans></span>
                            <Button onClick={() => setSortBy({ field: '_updatedAt', order: -1 })} className={sortBy.field === '_updatedAt' ? 'active' : ''}>
                                <Trans i18nKey="packs.sort.lastUpdated">Derniers ajouts</Trans>
                            </Button>
                            <Button onClick={() => setSortBy({ field: 'stars', order: -1 })} className={sortBy.field === 'stars' ? 'active' : ''}>
                                <Trans i18nKey="packs.sort.mostStarred">Plus populaires</Trans>
                            </Button>
                        </div>
                        <div className="filter-actions">
                            {showOnlyMyPacks && (
                                <Button onClick={clearMyPacksFilter} className="clear-filter-btn">
                                    <FaTimes /> <Trans i18nKey="packs.clearFilter">Voir tous les packs</Trans>
                                </Button>
                            )}
                            {user && !showOnlyMyPacks && (
                                <Button
                                    onClick={toggleMyPacksFilter}
                                    className="my-packs-btn"
                                >
                                    <FaUserCircle /> <Trans i18nKey="packs.myPacks">Mes packs</Trans>
                                </Button>
                            )}
                            <Button
                                onClick={() => setShowManualInstallDialog(true)}
                                className="add-pack-button"
                            >
                                <FaPlus /> <Trans i18nKey="packs.manualInstall">Importer</Trans>
                            </Button>
                        </div>
                    </div>
                </div>

                {showOnlyMyPacks && (
                    <div className="filter-indicator">
                        <FaUserCircle />
                        <Trans i18nKey="packs.filteringMyPacks">Affichage de vos packs uniquement</Trans>
                    </div>
                )}

                {showManualInstallDialog && (
                    <DialogProvider>
                        <Dialog
                            isModal={true}
                            onClose={() => setShowManualInstallDialog(false)}
                            title={t('packs.manualInstall.title', 'Installation manuelle de pack')}
                        >
                            <div className="manual-install-dialog">
                                <p>
                                    <Trans i18nKey="packs.manualInstall.instructions">
                                        Collez ici le JSON de configuration du pack que vous souhaitez installer.
                                    </Trans>
                                </p>
                                <TextField
                                    multiline={true}
                                    value={manualPackJson}
                                    onChange={(e) => setManualPackJson(e.target.value)}
                                    placeholder={t('packs.manualInstall.placeholder', '{"name": "Mon Pack", "description": "...", "models": [...], "data": [...]}')}
                                    rows={15}
                                />
                                <div className="flex actions right">
                                    <Button onClick={() => setShowManualInstallDialog(false)}><Trans i18nKey={"btns.cancel"}>Annuler</Trans></Button>
                                    <Button disabled={!manualPackJson.trim()} className="btn-primary" onClick={() => handleManualInstall()}><Trans i18nKey={"packs.install"}>Installer</Trans></Button>
                                </div>
                            </div>
                        </Dialog>
                    </DialogProvider>
                )}

                {(!packs || packs.length === 0) ? (
                    showOnlyMyPacks
                        ? <p className="no-packs-message">{t('packs.noMyPacks', 'Vous n\'avez créé aucun pack.')}</p>
                        : <p className="no-packs-message">{t('packs.noPacks', 'Aucun pack n\'est disponible pour le moment.')}</p>
                ) : (
                    <div className="pack-list">
                        {packs.map(pack => (
                            <PackCard key={pack._id} pack={pack} onSelect={handleSelectPack} />
                        ))}
                    </div>
                )}
            </>
        );
    };
    return (
        <div className="pack-gallery-container">
            {renderContent()}
        </div>
    );
};

export default PackGallery;