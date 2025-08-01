import React, {forwardRef, useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react';

import "./App.scss";
import {useMutation, useQuery, useQueryClient} from "react-query";
import {CheckboxField, FileField, NumberField, SelectField, TextField} from "./Field.jsx";
import ModelCreator from "./ModelCreator.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {FaMagnifyingGlass, FaPencil} from "react-icons/fa6";
import {Dialog, DialogProvider} from "./Dialog.jsx";
import {Pagination} from "./Pagination.jsx";
import {
    elementsPerPage, kilobytes,
    mainFieldsTypes,
    maxBytesPerSecondThrottleData,
    maxFileSize,
    maxRequestData, metaModels
} from "../../src/constants.js";
import {
    FaArrowDown,
    FaArrowUp, FaBell,
    FaBook, FaCopy,
    FaEdit,
    FaFileExport, FaFileImport,
    FaFilter, FaInfo,
    FaLanguage,
    FaLock,
    FaPlus,
    FaTrash
} from "react-icons/fa";
import {getDefaultForType, getUserId} from "../../src/data.js";
import {Trans, useTranslation} from "react-i18next";

import {debounce, escapeRegExp, event_trigger, getObjectHash, isGUID} from "../../src/core.js";
import Button from "./Button.jsx";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import APIInfo from "./APIInfo.jsx";
import {useNotificationContext} from "./NotificationProvider.jsx";
import {ModelImporter} from "./ModelImporter.jsx";
import {DataTable} from "./DataTable.jsx";
import {ModelList} from "./ModelList.jsx";
import {DataEditor} from "./DataEditor.jsx";
import TourSpotlight from "./TourSpotlight.jsx";
import useLocalStorage from "./hooks/useLocalStorage.js";
import {useUI} from "./contexts/UIContext.jsx";
import {useTutorials} from "./hooks/useTutorials.jsx";
import ViewSwitcher from "./ViewSwitcher.jsx";
import KanbanConfigModal from "./KanbanConfigModal.jsx";
import CalendarConfigModal from "./CalendarConfigModal.jsx";
import KanbanView from "./KanbanView.jsx";


// --- AJOUT : Composants Placeholders pour la démonstration ---
const CalendarView = ({ settings, model }) => (
    <div className="p-4 border rounded-md mt-4 bg-gray-50">
        <h3 className="font-bold">Vue Calendrier</h3>
        <p>Affichage des données pour le modèle <strong>{model?.name}</strong> en utilisant le champ de date : <strong>{settings.dateField}</strong>.</p>
        {/* L'implémentation réelle du calendrier irait ici */}
    </div>
);

const NotConfiguredPlaceholder = ({ type, onConfigure }) => (
    <div className="p-4 border border-dashed rounded-md mt-4 text-center bg-gray-50">
        <h4><Trans i18nKey="dataview.notConfiguredTitle" values={{ type }}>Vue {{type}} non configurée</Trans></h4>
        <p className="text-sm text-gray-600"><Trans i18nKey="dataview.notConfiguredText">Veuillez configurer cette vue pour l'utiliser.</Trans></p>
        <Button onClick={onConfigure} className="mt-2">
            <Trans i18nKey="dataview.configureButton" values={{ type }}>Configurer {{type}}</Trans>
        </Button>
    </div>
);

function DataLayout() {
    const [currentView, setCurrentView] = useState('table');

    // Nouvelle version (persistante)
    const [viewSettings, setViewSettings] = useLocalStorage('viewSettings', {});

    const [isCalendarModalOpen, setCalendarModalOpen] = useState(false);
    const [isKanbanModalOpen, setKanbanModalOpen] = useState(false);

    const { triggerTutorialCheck } = useTutorials();
    const { t, i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const [filterValues, setFilterValues] = useState({});
    const { dataByModel,paginatedDataByModel,
        setRelationFilters, setSelectedModel, selectedModel,
        setFilteredDatasToLoad,
        setRelationIds,
        setOnSuccessCallbacks,
        datasToLoad,
        setDatasToLoad,page, setPage, countByModel, relationIds,
        pagedFilters, pagedSort,
        elementsPerPage,
        setRelations,
        generatedModels
    } = useModelContext(); // Utilisez le contexte
    const queryClient = useQueryClient();

    const isDataLoaded = true;
    const [checkedItems, setCheckedItems] = useState([])

    const [refreshTime, setRefreshTime] = useState(0);
    const [formData, setFormData] = useState({});
    const [recordToEdit, setRecordToEdit] = useState(null); // New state for record to edit

    const mainPartRef = useRef();
    const modelCreatorRef = useRef();

    const [importModalVisible, setImportModalVisible] = useState(false);
    const [editionMode, setEditionMode] = useState(false);
    const [showDataEditor, setDataEditorVisible] = useState(false);
    const [showAPIInfo, setAPIInfoVisible] = useState(false);


    // --- MODIFICATION : Logique de changement de vue mise à jour ---
    const handleSwitchView = (viewName) => {
        console.log({viewName})
        if (viewName === 'table') {
            setCurrentView('table');
            return;
        }

        if (!selectedModel) {
            addNotification({ title: t('datalayout.selectModelFirst', 'Veuillez d\'abord sélectionner un modèle.'), status: 'warning' });
            return;
        }

        const modelSettings = viewSettings[selectedModel.name] || {};

        if (viewName === 'calendar') {
            if (modelSettings.calendar?.dateField) {
                setCurrentView('calendar');
            } else {
                setCalendarModalOpen(true);
            }
        } else if (viewName === 'kanban') {
            if (modelSettings.kanban?.groupByField) {
                setCurrentView('kanban');
            } else {
                setKanbanModalOpen(true);
            }
        }
    };

    // --- MODIFICATION : Sauvegarde dans localStorage ---
    const handleSaveCalendarConfig = (config) => {
        if (!selectedModel) return;
        setViewSettings(prev => ({
            ...prev,
            [selectedModel.name]: {
                ...(prev[selectedModel.name] || {}),
                calendar: config,
            },
        }));
        setCalendarModalOpen(false);
        setCurrentView('calendar');
    };

    const handleSaveKanbanConfig = (config) => {
        if (!selectedModel) return;
        setViewSettings(prev => ({
            ...prev,
            [selectedModel.name]: {
                ...(prev[selectedModel.name] || {}),
                kanban: config,
            },
        }));
        setKanbanModalOpen(false);
        setCurrentView('kanban');
    };

    // --- MODIFICATION : Dérive les settings du modèle courant depuis l'at global ---
    const currentModelViewSettings = useMemo(() => {
        if (!selectedModel) return {};
        return viewSettings[selectedModel.name] || {};
    }, [viewSettings, selectedModel]);

    // --- MODIFICATION : Vérifie si les vues sont configurées pour le modèle courant ---
    const configuredViews = useMemo(() => {
        if (!selectedModel) return { calendar: false, kanban: false };
        const modelSettings = viewSettings[selectedModel.name] || {};
        return {
            calendar: !!modelSettings.calendar?.dateField,
            kanban: !!modelSettings.kanban?.groupByField,
        };
    }, [viewSettings, selectedModel]);

    // --- AJOUT : Logique de rendu de la vue courante ---
    const renderCurrentView = () => {
        if (!selectedModel) return null;

        switch (currentView) {
            case 'calendar':
                return configuredViews.calendar
                    ? <CalendarView settings={currentModelViewSettings.calendar} model={selectedModel} />
                    : <NotConfiguredPlaceholder type="calendar" onConfigure={() => setCalendarModalOpen(true)} />;
            case 'kanban':
                return configuredViews.kanban
                    ? <KanbanView settings={currentModelViewSettings.kanban} model={selectedModel} />
                    : <NotConfiguredPlaceholder type="kanban" onConfigure={() => setKanbanModalOpen(true)} />;
            case 'table':
            default:
                // Le DataTable existant est retourné par défaut
                return <DataTable
                    checkedItems={checkedItems}
                    setCheckedItems={setCheckedItems}
                    filterValues={filterValues}
                    setFilterValues={setFilterValues}
                    model={selectedModel}
                    onAddData={(model) => {
                        mainPartRef.current.scrollIntoView({behavior: "smooth"});
                        handleAddData(model);
                    }}
                    onDuplicateData={(data) => {
                        mainPartRef.current.scrollIntoView({behavior: "smooth"});
                        handleAddData(selectedModel, data);
                    }}
                    onShowAPI={() => {
                        setAPIInfoVisible(true);
                        setDataEditorVisible(false);
                        setEditionMode(false);
                    }}
                    onEdit={(item) => {
                        mainPartRef.current.scrollIntoView({behavior: "smooth"});
                        setRecordToEdit(item);
                        setFormData(item);
                        setDataEditorVisible(true);
                    }}
                    onDelete={(item) => {
                        queryClient.invalidateQueries(['api/data', selectedModel.name, 'page', page, elementsPerPage, pagedFilters[selectedModel.name], pagedSort[selectedModel.name]]);
                    }}
                />;
        }
    };

    const handleModelSelect = (model) => {
        setRelationFilters({});
        setCurrentView('table');
        setCheckedItems([])
        setFilterValues({});
        if (!model) {
            return;
        }

        const dt = [];
        const t = [...model.fields].reduce((acc, field, index) => {
            if (field.type === "relation") {
                dt.push(field.relation);
                acc[field.name] = dataByModel[field.relation]?.length > 0 ? dataByModel[field.relation][0]._id : null;
            } else {
                acc[field.name] = getDefaultForType(field);
            }
            return acc;
        }, {});
        setPage(1);
        setFormData(t);
        setFilteredDatasToLoad([model.name]);

        setRecordToEdit(null); // Clear record to edit when model changes

        let tl = [];
        model.fields.forEach(field => {
            if (field.type === 'relation') {
                if (!tl.includes(field.relation))
                    tl.push(field.relation);
            }
        });
        setDatasToLoad(tl);

        const cb = ({data}) => {

            updateRelationIds(model, data);

            if( datasToLoad.length === 0 ) {
                model.fields.forEach(field => {
                    if (field.type === 'relation') {
                        if (!tl.includes(field.relation))
                            tl.push(field.relation);
                    }
                });
                setDatasToLoad(tl);
            }
        };
        // add new data
        setOnSuccessCallbacks(cbs => {
            const c = {...cbs};
            if( !c['api/data/' + model.name + '/paged'])
                c['api/data/' + model.name + '/paged'] = {};
            c['api/data/' + model.name + '/paged'][model.name] = cb;
            return c;
        })
        setSelectedModel(model);

        gtag("event", "select_content", {
            content_type: "model",
            content_id: model.name
        });
        //queryClient.invalidateQueries(['api/data', model.name, 'page', page]);
    }

    const { me } = useAuthContext();

    const { addNotification } = useNotificationContext();

    const { mutate: insertOrUpdateMutation, isLoading} = useMutation(({formData,record}) => {
        const method = record ? 'PUT' : 'POST'; // Determine method based on record
        const url = record ? `/api/data/${record._id}` : `/api/data`; // Determine URL

        try {
            const fd = new FormData();

            let obj = {};
            for (const key in formData) {
                if (formData[key] !== undefined)
                    obj[key] = formData[key];
            }
            fd.append("_data", JSON.stringify({...obj, _hash: undefined, _id: undefined}));

            Array.from(document.querySelectorAll('.field-file input[data-field]')).forEach(input =>{
                const fieldName = input.dataset['field'];
                if (input.files.length > 0) {
                    Array.from(input.files).forEach((file, index) => {
                        if( file)
                            fd.append(`${fieldName}[${index}]`, file);
                    });
                }
            });
            fd.append('model', selectedModel.name);

            ///fd.append("files", fd2);
            return fetch(`${url}?lang=${lang}&_user=${encodeURIComponent(getUserId(me))}`, {
                method,
                body: fd
            }).then(e => e.json());

        } catch (error) {
            console.error('Erreur lors de l\'enregistrement des données:', error);
            // Handle error, e.g., display error message to the user
        }
    }, {
        onError: (err)=>{
            const notificationData = {
                title: 'Erreur lors de l\'enregistrement des données',
                status: 'error'
            };
            addNotification(notificationData);
        },
        onSuccess: (data) => {

            console.log('Données enregistrées:', data, selectedModel);

            event_trigger(recordToEdit ? 'API_ADD_DATA' : 'API_ADD_DATA', {
                model: selectedModel.name,
            });

            gtag("event", "select_content", {
                content_type: "edit_data",
                content_id: selectedModel.name
            });

            const notificationData = {
                title: data.success ? t('dataimporter.success', 'Données enregistrées') : t(data.error, data.error),
                icon: data.success ? <FaInfo /> : undefined,
                status: data.success ? 'completed': 'error'
            };
            addNotification(notificationData);

            updateRelationIds(selectedModel, formData);
            setDatasToLoad([...datasToLoad, selectedModel.name]);
            queryClient.invalidateQueries(['api/data', selectedModel.name, 'page', page, elementsPerPage, pagedFilters[selectedModel.name], pagedSort[selectedModel.name]]);

            if(data.inserted) {
                const t = [...selectedModel.fields].reduce((acc, field, index) => {
                    if (field.type === "relation") {
                        acc[field.name] = field.multiple ? [] : null;
                    } else {
                        acc[field.name] = getDefaultForType(field);
                    }
                    return acc;
                }, {});
                setFormData(t)
            }

            setRelations({});

        }})
    const handleFormSubmit = async (formData, record) => { // Add record parameter
        insertOrUpdateMutation({formData, record})
    };

    const updateRelationIds = (model, data) => {
        const r = {...relationIds};
        let datas = !Array.isArray(data) ? [data] : data;
        model.fields.forEach(field => {
            if( field.type !== "relation")
                return;
            datas.forEach(d => {
                const value = d[field.name];
                if (field.multiple && Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        if (!r[field.relation]){
                            r[field.relation] = [];
                        }
                        if (!r[field.relation].includes(value[i])) {
                            r[field.relation].push(value[i]);
                        }
                    }
                } else if (!field.multiple && value) {
                    if (!r[field.relation]){
                        r[field.relation] = [];
                    }
                    if (!r[field.relation].includes(value)) {
                        r[field.relation].push(value);
                    }
                }
            });
        });
        setRelationIds(r);
        queryClient.invalidateQueries(['api/data', model.name, r]);
    }

    useEffect(() => {
            setSelectedModel(null)
            setDataEditorVisible(false);
            setAPIInfoVisible(false);
            setEditionMode(true);
    }, []);

    const deleteMutation = useMutation((selectedModels) => {
        return fetch('/api/data/'+checkedItems.map(m => m._id).join(',')+'?lang='+lang+'&_user='+encodeURIComponent(getUserId(me)), {
            method: 'DELETE', headers: {
                'Content-Type': 'application/json'
            }
        }).then(e => e.json());
    }, { onSuccess: (data) => {
        if( data.success ){
            queryClient.invalidateQueries(['api/data', selectedModel?.name, 'page', page, elementsPerPage, pagedFilters[selectedModel?.name], pagedSort[selectedModel?.name]]);
        }

        const notificationData = {
            id: 'dataimporter.success',
            title: t('dataimporter.success', 'Données supprimées'),
            icon: <FaInfo />,
            status: 'completed'
        };
        addNotification(notificationData);
        }, onError:(err)=>{
            const notificationData = {
                id: 'dataimporter.error',
                title: err.message,
                status: 'error'
            };
            addNotification(notificationData);
        }});
    const handleDeletion = () => {
        deleteMutation.mutate();
        setCheckedItems([]);
    }
    const importModelsMutation = useMutation((selectedModels) => {
       return fetch('/api/models/import', { method: 'POST', headers: {
           'Content-Type': 'application/json'
           },
        body: JSON.stringify({ models: selectedModels.map(m => m.name) })
       })
    });

    const handleConfigureCurrentView = () => {
        if (!selectedModel) return;

        switch (currentView) {
            case 'kanban':
                setKanbanModalOpen(true);
                break;
            case 'calendar':
                setCalendarModalOpen(true);
                break;
            default:
                // Pas de configuration pour la vue 'table'
                break;
        }
    };

    const handleAddData = (model, data)=>{

        handleModelSelect(model);

        if( data ){
            setFormData(data);
        }else {
            const t = model ? [...model.fields].reduce((acc, field) => {
                if (field.type === "relation") {
                    acc[field.name] = field.multiple ? [] : null;
                } else {
                    acc[field.name] = getDefaultForType(field);
                }
                return acc;
            }, {}) : [];
            setFormData(t)
        }
        setEditionMode(false);
        setDataEditorVisible(true);
        setAPIInfoVisible(false);
        gtag("event", "select_content", {
            content_type: "select_model",
            content_id: model.name
        });
    }

    const onImportModels = (models) => {
        importModelsMutation.mutateAsync(models).then(e => {
            queryClient.invalidateQueries('api/models');
        });
        setImportModalVisible(false);
    }

    useEffect(() => {
        if( showDataEditor && mainPartRef.current ){

        }
    }, [showDataEditor,mainPartRef.current]);


    const [currentProfile, setCurrentProfile] = useLocalStorage('profile', null);
    const {isTourOpen, setIsTourOpen, currentTourSteps, allTourSteps, setTourStepIndex, setCurrentTourSteps, currentTour,setCurrentTour} = useUI();

    const startTour = () => {
        setIsTourOpen(true);
    };

    const closeTour = (completedTourName) => {
        // On génère le nom du tour de démo pour le comparer
        const demoTourName = `tour_${getObjectHash({steps: allTourSteps.demo || []})}`;

        // Si le tour qui vient de se terminer est le tour de démo
        if (completedTourName === demoTourName) {

            setIsTourOpen(false);
        }
    };

    useEffect(() => {
        if( !currentProfile ){
            setIsTourOpen(true);
        }
    }, [currentProfile])

    useEffect(() => {
        // Si un modèle est sélectionné...
        if (selectedModel) {
            // Récupérer les étapes du tour "datapacks"
            const datapacksSteps = allTourSteps.guides;
            // S'assurer que ce tour existe et a des étapes
            if (datapacksSteps && datapacksSteps.length > 0) {
                // 1. Définir les étapes du tour qui doit être affiché
                setCurrentTourSteps(datapacksSteps);
                // 2. Calculer le nom unique du tour et le définir comme tour courant
                // C'est l'clé qui manquait.
                const tourName = `tour_${getObjectHash({ steps: datapacksSteps })}`;
                setCurrentTour(tourName);
                // 3. Activer l'affichage du composant de tour
                setIsTourOpen(true);
            }
        }
    }, [selectedModel, allTourSteps]); // Ajout de allTourSteps aux dépendances pour la bonne pratique

    return (
        <>
            <>{/^demo[0-9]{1,2}$/.test(me.username) && (
                <TourSpotlight
                name={"tour_"+getObjectHash({steps:currentTourSteps})}
                steps={currentTourSteps}
                isOpen={isTourOpen}
                onClose={closeTour}
            />)}</>
            <div className="datalayout flex flex-start">
                <ModelList tourSteps={currentTourSteps}
                           onAPIInfo={(model) => {
                               setAPIInfoVisible(true);
                               setDataEditorVisible(false);
                               setEditionMode(false);
                               setSelectedModel(model);
                               gtag("event", "select_content", {
                                   content_type: "api",
                                   content_id: model.name
                               });
                           }} onImportModel={() => {
                    setImportModalVisible(true);
                }} onCreateModel={() => {
                    setSelectedModel(null);
                    setAPIInfoVisible(false);
                    setDataEditorVisible(false);
                    setEditionMode(true);
                    mainPartRef.current.scrollIntoView({behavior: 'smooth'});
                    gtag("event", "select_content", {
                        content_type: "create_model",
                    });
                }} onEditModel={(model) => {
                    handleModelSelect(model);
                    setDataEditorVisible(false);
                    setAPIInfoVisible(false);
                    setEditionMode(true);
                    mainPartRef.current.scrollIntoView({behavior: 'smooth'});
                    gtag("event", "select_content", {
                        content_type: "edit_model",
                        content_id: model.name
                    });
                }} onModelSelect={(model) => {
                    handleModelSelect(model);
                    setDataEditorVisible(false);
                    setEditionMode(false);
                    setAPIInfoVisible(false);
                    mainPartRef.current.scrollIntoView({behavior: 'smooth'});
                    gtag("event", "select_content", {
                        content_type: "select_model",
                        content_id: model.name
                    });
                }} onNewData={(model) => {
                    mainPartRef.current.scrollIntoView({behavior: 'smooth'});
                    handleAddData(model);
                }}/>
                {(editionMode) && (
                    <ModelCreator ref={modelCreatorRef} onModelGenerated={() =>{
                        modelCreatorRef.current.scrollIntoView({behavior: 'smooth'});
                    }} initialModel={selectedModel} onModelSaved={(model) => {
                        setRefreshTime(new Date().getTime());
                        handleModelSelect(model);
                    }}/>)}

            <div className="hidden-anchor" ref={mainPartRef}></div>

                {showDataEditor && (<DataEditor
                    key={selectedModel?.name}
                    isLoading={isLoading}
                    model={selectedModel}
                    formData={formData}
                    setFormData={setFormData}
                    refreshTime={refreshTime}
                    onSubmit={handleFormSubmit}
                    setRecord={setRecordToEdit}
                    record={recordToEdit} // Pass record to edit to DataEditor
                />)}


                {selectedModel && showAPIInfo && <APIInfo/>}
                {selectedModel && !showAPIInfo && !generatedModels.some(g => g.name === selectedModel?.name) && (<div className="datas">

                    {<ViewSwitcher
                        currentView={currentView}
                        onViewChange={handleSwitchView}
                        configuredViews={configuredViews}
                        onConfigureView={handleConfigureCurrentView}
                    />}
                    <h2>{t(`model_${selectedModel?.name}`, selectedModel?.name)} <>({countByModel?.[selectedModel?.name]})</></h2>
                    {t(`model_${selectedModel?.name}`, selectedModel?.name) !== selectedModel?.name && (
                        <span className="badge"><strong>model</strong> : {selectedModel?.name}</span>)}
                    <p className="model-desc hint">{t(`model_description_${selectedModel.name}`, selectedModel.description)}</p>

                    {renderCurrentView()}

                    {isDataLoaded && currentView === 'table'  && (<>
                        {selectedModel && (<Pagination showElementsPerPage={true} onChange={page => {
                            setPage(page);
                            setCheckedItems([]);
                            gtag("event", "select_content", {
                                content_type: "change_page",
                                content_id: page
                            });
                            queryClient.invalidateQueries(['api/data', selectedModel.name, 'page', page, pagedFilters[selectedModel.name], pagedSort[selectedModel.name]]);
                        }} page={page} setPage={setPage} totalCount={countByModel[selectedModel.name]}
                                                       hasPreviousNext={true} visibleItemsCount={5}
                                                       elementsPerPage={elementsPerPage}/>)}
                        <div className="actions flex">
                            <Button onClick={() => {
                                setCheckedItems(paginatedDataByModel[selectedModel.name]);
                            }}><Trans i18nKey={"datatable.selectAll"}>Tout sélectionner</Trans></Button>
                            <Button onClick={handleDeletion} disabled={!checkedItems?.length}><Trans
                                i18nKey={"datatable.deleteSelection"}>Supprimer la sélection</Trans></Button>
                        </div>
                    </>)}
                </div>)}
            </div>

            <DialogProvider>
                {importModalVisible && (<Dialog onClose={() => {
                    setImportModalVisible(false)
                }} isModal={true} isClosable={true}>
                    <ModelImporter onImport={onImportModels}/>
                </Dialog>)}

                <CalendarConfigModal
                    isOpen={isCalendarModalOpen}
                    onClose={() => setCalendarModalOpen(false)}
                    onSave={handleSaveCalendarConfig}
                    modelFields={selectedModel?.fields ||[]}
                    initialSettings={currentModelViewSettings.calendar}
                />

                <KanbanConfigModal
                    isOpen={isKanbanModalOpen}
                    onClose={() => setKanbanModalOpen(false)}
                    onSave={handleSaveKanbanConfig}
                    model={selectedModel}
                    modelFields={selectedModel?.fields||[]}
                    initialSettings={currentModelViewSettings.kanban}
                />
            </DialogProvider>
        </>
    );
}


export default DataLayout;