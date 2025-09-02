import {useModelContext} from "./contexts/ModelContext.jsx";
import {Trans, useTranslation} from "react-i18next";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {useMutation, useQueryClient} from "react-query";
import React, {useEffect, useMemo, useState} from "react";
import {FaBook, FaBoxOpen, FaEdit, FaFileImport, FaPlus} from "react-icons/fa";
import Button from "./Button.jsx";
import useLocalStorage from "./hooks/useLocalStorage.js";
import {Tooltip} from "react-tooltip";
import {useUI} from "./contexts/UIContext.jsx";
import {profiles} from "./constants.js";
import * as FaIcons from "react-icons/fa";
import * as Fa6Icons from "react-icons/fa6";

// --- SUGGESTION: Extraire cette logique dans un composant dédié si elle devient plus complexe ---
// Fonction pour obtenir le composant icône par son nom
const getIconComponent = (iconName) => {
    if (!iconName) return null;
    const IconComponent = FaIcons[iconName] || Fa6Icons[iconName];
    return IconComponent ? <IconComponent /> : null; // Retourne l'élément React ou null
};

// --- SUGGESTION: Créer un petit composant pour la lisibilité de l'affichage du nom du modèle ---
const ModelListItemLabel = ({ model, count, isGenerated, t }) => {
    const modelName = t(`model_${model.name}`, model.name);

    let suffix = '';
    if (isGenerated) {
        suffix = ` (${t('models.status.tmp', 'brouillon')})`; // Utiliser i18n pour 'tmp'
    } else if (count > 0) {
        suffix = ` (${count})`;
    }

    return <>{modelName}{suffix}</>;
};


export function ModelList({ editionMode, onModelSelect, onCreateModel, onImportModel, onEditModel, onAPIInfo, onNewData, onImportPack }) {
    const {allTourSteps, setIsTourOpen,setCurrentTourSteps, setTourStepIndex, currentTour, setCurrentTour} = useUI();

    const {models, setSelectedModel, selectedModel, countByModel, generatedModels} = useModelContext();
    const {t} =  useTranslation();
    const {me} =  useAuthContext();
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useLocalStorage('modelList-selectedTag', 'all');

    const [currentProfile, setCurrentProfile] = useLocalStorage('profile', null);
    useEffect(() =>{
        if (me) {
            queryClient.invalidateQueries('api/models');
        }
    }, [me])

    const allTags = useMemo(() => {
        if (!models) return [];
        const tagsSet = new Set();
        models
            .filter(model => model._user === me?.username) // On ne prend que les tags des modèles de l'utilisateur
            .forEach(model => {
                if (model.tags && Array.isArray(model.tags)) {
                    model.tags.forEach(tag => tagsSet.add(tag));
                }
            });
        return Array.from(tagsSet).sort();
    }, [models, me?.username]);

    console.log(allTags,"t");
    const filteredModels = useMemo(() => {
        if (!models) return [];
        let results = models.filter(model => model._user === me?.username);

        // Filtrage par tag
        if (selectedTag && selectedTag !== 'all') {
            results = results.filter(model => model.tags?.includes(selectedTag));
        }

        // Filtrage par terme de recherche
        if (searchTerm.trim()) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            results = results.filter(model =>
                (t('model_' + model.name, model.name).toLowerCase().includes(lowerSearchTerm)) ||
                (model.description && model.description.toLowerCase().includes(lowerSearchTerm)));
        }
        return results;
    }, [models, searchTerm, selectedTag, me?.username, t]);

    const handleSelectModel = (model) => {
        setSelectedModel(model);
        if (onModelSelect) {
            onModelSelect(model); // Si vous avez une prop callback supplémentaire
        }
    };

    const demoInitMutation = useMutation((profile) => {
        return fetch('/api/demo/initialize', {
            method: 'POST',
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({profile: profile, packs: profiles[profile].packs}),
        });
    });

    const handleProfile = (profile) => {
        // --- CHANGEMENT ICI : On appelle la nouvelle mutation sans argument ---
        demoInitMutation.mutateAsync(profile).then(response => {
            // On vérifie que la réponse est OK avant de continuer
            if (!response.ok) {
                // Gérer l'erreur si l'initialisation échoue
                console.error("L'initialisation de la démo a échoué.");
                // Vous pourriez afficher une notification à l'utilisateur ici.
                return;
            }

            // Le reste de la logique est parfait et ne change pas
            setCurrentProfile(profile);
            gtag('event', 'profile ' + profile);
            queryClient.invalidateQueries('api/models');

            const profileSteps = allTourSteps[profile];
            if (profileSteps) {
                setCurrentTourSteps(profileSteps);
                setTourStepIndex(0);
                setIsTourOpen(true); // Start the tour
            } else {
                console.warn(`No tour steps defined for profile: ${profile}`);
            }
        }).catch(error => {
            console.error("Erreur critique lors de l'appel d'initialisation de la démo:", error);
        });
    };

    //  --- NEW: Effect to update tour steps when a profile is already selected on mount ---
    useEffect(() => {
        if (currentProfile && currentTour && /^demo[0-9]{1,2}$/.test(me?.username)) { // Only run on demo user for simplicity
            const profileSteps = allTourSteps[currentProfile];
            if (profileSteps) {
                setCurrentTourSteps(profileSteps);
                setTourStepIndex(0)
                setIsTourOpen(true);
            } else {
                console.warn(`No tour steps defined for profile: ${currentProfile}`);
            }
        }
    }, [currentProfile, me?.username]);

    if (!models) {
        return <div className="loading-models">{t('models.loading', 'Chargement des modèles...')}</div>;
    }

    return <>
    {!currentProfile && /^demo[0-9]{1,2}$/.test(me.username) && <div className="tourStep-profile profiles flex-stretch flex">
            <div className=" flex flex-centered flex-big-gap">
                <a href="#" data-tooltip-id="tooltipProfile" data-tooltip-content={t('profiles.personal.desc')} className="profile-link" onClick={() => handleProfile('personal')}>
                    <img src="/profilPersonal.jpg" alt={"Personal profile"} width={256} height={256}/>
                </a>
                <a href="#" data-tooltip-id="tooltipProfile" data-tooltip-content={t('profiles.developer.desc')} className="profile-link" onClick={() => handleProfile('developer')}>
                    <img src="/profilDeveloper.jpg" alt={"Developer profile"} width={256} height={256}/>
                </a>
                <a href="#" data-tooltip-id="tooltipProfile" data-tooltip-content={t('profiles.company.desc')} className="profile-link" onClick={() => handleProfile('company')}>
                    <img src="/profilCompany.jpg" alt={"Company profile"} width={256} height={256}/>
                </a>
                <a href="#" data-tooltip-id="tooltipProfile" data-tooltip-content={t('profiles.engineer.desc')} className="profile-link" onClick={() => handleProfile('engineer')}>
                    <img src="/profilEngineer.jpg" alt={"Engineer profile"} width={256} height={256}/>
                </a>
                <Tooltip id="tooltipProfile" render={({content, activeAnchor}) => {
                    const pr = activeAnchor?.querySelector('img').getAttribute('alt');
                    if (pr)
                        gtag('event', 'info '+ pr);
                    else
                        gtag('event', 'info');
                    return <span dangerouslySetInnerHTML={{__html:content}} />
                }} afterShow={() => {

                }} />
            </div></div>}
        <div className="models">
            <h2 className={"field-bg p-2"}><Trans i18nKey="models">Modèles</Trans></h2>
            <div className="model-list-container">
                <div className="flex flex-no-wrap model-list-search-bar-container">
                    <input
                        type="search"
                        placeholder={t('models.searchPlaceholder', 'Rechercher un modèle...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="model-list-search-input"
                    />
                    {allTags.length > 0 && (
                        <div className="model-list-tag-filter">
                            <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                                <option value="all">{t('models.tags.all', 'Tous les tags')}</option>
                                {allTags.map(tag => (
                                    <option key={tag} value={tag}>
                                        {t(`tags.${tag}`, tag.charAt(0).toUpperCase() + tag.slice(1))}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
                {filteredModels.length > 0 ? (
                    <div className="model-list">
                        <Tooltip id="tooltipML" />
                        <ul>
                            {filteredModels.sort((a, b) => t('model_' + a.name, a.name).localeCompare(t('model_' + b.name, b.name))).map((model) => {
                                if (model._user !== me.username)
                                    return <></>


                                const IconComponent = getIconComponent(model.icon);

                                // --- SUGGESTION: Rendre le comportement du clic prévisible ---
                                // Le clic principal sélectionne toujours le modèle. L'édition est une action secondaire via son bouton.
                                const handleItemClick = () => {
                                    onModelSelect(model);
                                };

                                return (
                                    <li data-testid={'model_'+model.name} className={`${model.name === selectedModel?.name ? 'active' : ''}`}
                                        key={'modellist' + model.name} onClick={handleItemClick}>
                                        <div className="flex flex-center flex-fw">
                                            <div
                                                className="flex flex-1 flex-no-wrap break-word gap-2">
                                                <div className={"icon"}>{IconComponent ? IconComponent : <></>}</div>
                                                {/* --- SUGGESTION: Utiliser le composant pour la clarté --- */}
                                                <div><ModelListItemLabel model={model} count={countByModel?.[model.name]} isGenerated={generatedModels.some(f => f.name === model.name)} t={t} /></div></div>
                                            <div className="btns">
                                                {/* Le bouton "Ajouter" est conditionnel, ce qui est bien */}
                                                {!generatedModels.some(g => g.name === model.name) && (<button data-tooltip-id="tooltipML" data-tooltip-content={t('btns.addData')} onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    onNewData?.(model);
                                                }}><FaPlus/></button>)}
                                                {!model.locked && (<button data-tooltip-id="tooltipML" data-tooltip-content={t('btns.editModel')} onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    onEditModel(model);
                                                }}><FaEdit/>
                                                </button>)}
                                                {(<button data-tooltip-id="tooltipML" data-tooltip-content={t('doc.api.title')} onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    onAPIInfo?.(model);
                                                }}><FaBook/>
                                                </button>)}
                                            </div>
                                        </div>
                                    </li>)
                            })}
                        </ul>
                    </div>) : (
                    <div className="empty-state-container p-2">
                        <div className="empty-state-content">
                            <div className="empty-state-icon">
                                {/* Une icône SVG simple pour représenter des "blocs de construction" ou des "données" */}
                                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M14 10L14 4L20 4L20 10L14 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M4 20L4 14L10 14L10 20L4 20Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M4 10L4 4L10 4L10 10L4 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M14 20L14 14L20 14L20 20L14 20Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <h3>{t('models.empty.title', 'Commencez à structurer vos données')}</h3>
                            <p>
                                {searchTerm ?
                                    t('models.noMatch', 'Aucun modèle ne correspond à votre recherche.') :
                                    t('models.empty.description', 'Créez votre premier modèle de A à Z ou importez une structure existante pour démarrer rapidement.')
                                }
                            </p>
                        </div>
                    </div>
                )}
            </div>
            {!editionMode && (<div className="flex actions">
                <Button onClick={onCreateModel} className="btn-primary btn-large">
                    <FaPlus /> {t('btns.addModel', 'Créer un modèle')}
                </Button>
            </div>)}
        </div>
    </>
}
