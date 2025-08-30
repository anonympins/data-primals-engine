import {useModelContext} from "./contexts/ModelContext.jsx";
import {Trans, useTranslation} from "react-i18next";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {useMutation, useQueryClient} from "react-query";
import React, {useEffect, useMemo, useState} from "react";
import {FaBook, FaEdit, FaFileImport, FaPlus} from "react-icons/fa";
import Button from "./Button.jsx";
import useLocalStorage from "./hooks/useLocalStorage.js";
import {Tooltip} from "react-tooltip";
import {useUI} from "./contexts/UIContext.jsx";
import {profiles} from "./constants.js";
import * as FaIcons from "react-icons/fa";
import * as Fa6Icons from "react-icons/fa6";


// Fonction pour obtenir le composant icône par son nom
const getIconComponent = (iconName) => {
    if (!iconName) return null;
    const IconComponent = FaIcons[iconName] || Fa6Icons[iconName];
    return IconComponent ? <IconComponent /> : null; // Retourne l'élément React ou null
};


export function ModelList({ onModelSelect, onCreateModel, onImportModel, onEditModel, onAPIInfo, onNewData }) {
    const {allTourSteps, setIsTourOpen,setCurrentTourSteps, setTourStepIndex, currentTour, setCurrentTour} = useUI();

    const {models, setSelectedModel, selectedModel, countByModel, generatedModels} = useModelContext();
    const {t} =  useTranslation();
    const {me} =  useAuthContext();
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('');

    const [currentProfile, setCurrentProfile] = useLocalStorage('profile', null);
    useEffect(() =>{
        if (me) {
            queryClient.invalidateQueries('api/models');
        }
    }, [me])

    const filteredModels = useMemo(() => {
        if (!models) return [];
        if (!searchTerm.trim()) return models; // Si la recherche est vide, retourne tous les modèles

        const lowerSearchTerm = searchTerm.toLowerCase();
        return models.filter(model => {
            return (model.name && t('model_' + model.name, model.name).toLowerCase().includes(lowerSearchTerm)) ||
                (model.fields.some(f =>
                        (model.icon && model.icon.toLowerCase().includes(lowerSearchTerm)) ||
                        f.name?.toLowerCase().includes(lowerSearchTerm) ||
                        f.hint?.toLowerCase().includes(lowerSearchTerm)) ||
                (model.description && model.description.toLowerCase().includes(lowerSearchTerm)))
            });
    }, [models, searchTerm]);

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

    const [mods, setMods] = useState([]);
    useEffect(() => {
        if( countByModel && selectedModel)
        {
            setMods((m) => {
                const counts = [...m];
                const mod = counts.find(f => f.mod === selectedModel.name);
                if( mod ){
                    mod.count = countByModel[selectedModel.name];
                    return counts.map((c => {
                        if( c.mod === mod.mod) {
                            return {...mod};
                        }
                        return c;
                    }));
                }else{
                    return [...m, { mod: selectedModel.name, count: countByModel[selectedModel.name]}];
                }
            })
        }
    }, [countByModel, selectedModel]);

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
            <h2><Trans i18nKey="models">Modèles</Trans></h2>
            <div className="model-list-container">
                <div className="model-list-search-bar-container">
                    <input
                        type="search"
                        placeholder={t('models.searchPlaceholder', 'Rechercher un modèle...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="model-list-search-input"
                    />
                </div>
                {filteredModels.length > 0 ? (
                    <div className="model-list">
                        <Tooltip id="tooltipML" />
                        <ul>
                            {filteredModels.sort((a, b) => t('model_' + a.name, a.name).localeCompare(t('model_' + b.name, b.name))).map((model) => {
                                if (model._user !== me.username)
                                    return <></>


                                const IconComponent = getIconComponent(model.icon);

                                return (
                                    <li data-testid={'model_'+model.name} className={`${model.name === selectedModel?.name ? 'active' : ''}`}
                                        key={'modelist' + model.name} onClick={() => generatedModels.some(g => g.name === model.name) ? onEditModel(model) : onModelSelect(model)}>
                                        <div className="flex flex-center flex-fw">
                                            <div
                                                className="flex flex-1 flex-no-wrap break-word gap-2">
                                                <div className={"icon"}>{IconComponent ? IconComponent : <></>}</div>
                                                <div>{t(`model_${model.name}`, model.name)} {generatedModels.some(f => f.name === model.name) ? '(tmp)' : (mods.some(f => f.mod === model.name) ? `(${mods.find(f => f.mod === model.name).count})` : '')}</div></div>
                                            <div className="btns">
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
                    <p className="no-models-found">
                        {searchTerm ? t('models.noMatch', 'Aucun modèle ne correspond à votre recherche.') : t('models.noModels', 'Aucun modèle disponible.')}
                    </p>
                )}
                <div className="flex actions">
                    <Button onClick={onCreateModel} className="btn tourStep-create-model"><FaPlus/><Trans
                        i18nKey="btns.createModel">Créer un modèle</Trans></Button>
                    <Button onClick={onImportModel}
                            className="btn tourStep-import-model btn-primary"><FaFileImport/><Trans
                        i18nKey="btns.importModels">Importer un modèle</Trans></Button>
                </div>
            </div>
        </div>
    </>
}

