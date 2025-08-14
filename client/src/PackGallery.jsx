import React, { useState } from 'react';
import {useMutation, useQuery, useQueryClient} from 'react-query';
import { Trans, useTranslation } from 'react-i18next';
import { FaBoxOpen, FaChevronLeft, FaDownload, FaStar, FaTag, FaUser } from 'react-icons/fa';
import Button from './Button.jsx';
import { useNotificationContext } from './NotificationProvider.jsx';
import { useModelContext } from './contexts/ModelContext.jsx';

import './PackGallery.scss';
import {elementsPerPage} from "../../src/constants.js";
import Markdown from "react-markdown";

// --- API Fetching Functions ---
const fetchPacks = async (sortBy, lang) => {
    const response = await fetch(`/api/packs?lang=${lang}&sortBy=${sortBy.field}&order=${sortBy.order}`);
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
    return (
        <div className="pack-card" onClick={() => onSelect(pack._id)}>
            <div className="pack-card-header">
                <h3><FaBoxOpen /> {pack.name}</h3>
                <span className="pack-stars"><FaStar /> {pack.stars || 0}</span>
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
    const { data: pack, isLoading, isError } = useQuery(['packDetails', packId], () => fetchPackDetails(packId, lang));

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

                onBack(); // Retourner à la galerie
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

    if (isLoading) return <div className="spinner-loader"></div>;
    if (isError) return <p className="error-text">{t('packs.error.details', 'Erreur lors du chargement des détails du pack.')}</p>;
    if (!pack) return null;

    const renderModelsList = (models) => {
        if (!models || models.length === 0) return t('packs.noModelsIncluded', 'Aucun modèle spécifié.');

        return models.map(model => {
            // Si l'élément est un objet, on prend sa propriété 'name', sinon on prend la chaîne de caractères
            const modelName = typeof model === 'object' && model !== null ? model.name : model;
            return modelName;
        }).join(', ');
    };

    return (
        <div className="pack-detail">
            <Button onClick={onBack} className="back-button"><FaChevronLeft /> <Trans i18nKey="btns.back">Retour</Trans></Button>
            <div className="pack-detail-header">
                <h1>{pack.name}</h1>
                <Button onClick={handleInstall} disabled={isInstalling}>
                    <FaDownload /> {isInstalling ? t('packs.installing', 'Installation...') : t('packs.install', 'Installer')}
                </Button>
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


// --- NOUVELLE FONCTION POUR LA MUTATION D'INSTALLATION ---
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

// --- Main Gallery Component ---
const PackGallery = () => {
    const { t, i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const [view, setView] = useState('list'); // 'list' ou 'detail'
    const [selectedPackId, setSelectedPackId] = useState(null);
    const [sortBy, setSortBy] = useState({ field: '_updatedAt', order: -1 });

    const { data: packs, isLoading, isError } = useQuery(['packs', sortBy], () => fetchPacks(sortBy, lang));

    const handleSelectPack = (packId) => {
        setSelectedPackId(packId);
        setView('detail');
    };

    const handleBackToList = () => {
        setSelectedPackId(null);
        setView('list');
    };

    const renderContent = () => {
        if (view === 'detail') {
            return <PackDetail packId={selectedPackId} onBack={handleBackToList} />;
        }

        // Vue 'list'
        if (isLoading) return <div className="spinner-loader"></div>;
        if (isError) return <p className="error-text">{t('packs.error.loading', 'Erreur lors du chargement des packs.')}</p>;
        if (!packs || packs.length === 0) return <p>{t('packs.noPacks', 'Aucun pack n\'est disponible pour le moment.')}</p>;

        return (
            <>
                <div className="gallery-header">
                    <h1><Trans i18nKey="packs.galleryTitle">Galerie de Packs</Trans></h1>
                    <div className="sort-options">
                        <span><Trans i18nKey="packs.sortBy">Trier par :</Trans></span>
                        <Button onClick={() => setSortBy({ field: '_updatedAt', order: -1 })} className={sortBy.field === '_updatedAt' ? 'active' : ''}>
                            <Trans i18nKey="packs.sort.lastUpdated">Derniers ajouts</Trans>
                        </Button>
                        <Button onClick={() => setSortBy({ field: 'stars', order: -1 })} className={sortBy.field === 'stars' ? 'active' : ''}>
                            <Trans i18nKey="packs.sort.mostStarred">Plus populaires</Trans>
                        </Button>
                    </div>
                </div>
                <div className="pack-list">
                    {packs.map(pack => (
                        <PackCard key={pack._id} pack={pack} onSelect={handleSelectPack} />
                    ))}
                </div>
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