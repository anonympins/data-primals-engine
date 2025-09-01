// Composant pour afficher les données (DataTable basique)
import {useModelContext} from "./contexts/ModelContext.jsx";
import {Trans, useTranslation} from "react-i18next";
import {useMutation, useQuery, useQueryClient} from "react-query";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {getUserId} from "../../src/data.js";
import cronstrue from 'cronstrue/i18n';
import {Event} from "../../src/events.js";

import {
    FaBook,
    FaCopy,
    FaDatabase, FaEraser, FaEye,
    FaFileExport,
    FaFileImport,
    FaFilter, FaHistory,
    FaInfo,
    FaPlus,
    FaTrash, FaWrench
} from "react-icons/fa";
import {useNotificationContext} from "./NotificationProvider.jsx";
import {
    elementsPerPage,
    kilobytes,
    maxBytesPerSecondThrottleData,
    maxFileSize,
    maxRequestData
} from "../../src/constants.js";
import Button from "./Button.jsx";
import {Dialog, DialogProvider} from "./Dialog.jsx";
import {
    CheckboxField,
    CodeField,
    ColorField,
    FileField,
    FilterField,
    ModelField,
    PhoneField,
    TextField
} from "./Field.jsx";
import RelationValue from "./RelationValue.jsx";
import {FaGear, FaPencil, FaTriangleExclamation} from "react-icons/fa6";
import RestoreConfirmationModal from "./RestoreConfirmationModal.jsx";
import {event_trigger, isLightColor} from "../../src/core.js";
import {Tooltip} from "react-tooltip";
import ExportDialog from "./ExportDialog.jsx";
import Captions from "yet-another-react-lightbox/plugins/captions";
import {Zoom} from "yet-another-react-lightbox/plugins";
import Lightbox from "yet-another-react-lightbox";

import "./DataTable.scss"
import TutorialsMenu from "../src/TutorialsMenu.jsx";
import {useTutorials} from "./hooks/useTutorials.jsx";
import {HiddenableCell} from "./HiddenableCell.jsx";
import ConditionBuilder from "./ConditionBuilder.jsx";
import {pagedFilterToMongoConds} from "./filter.js";
import {isConditionMet} from "../../src/filter";
import {DataImporter} from "./DataImporter.jsx";
import {HistoryDialog} from "./HistoryDialog.jsx";
import {Config} from "../../src/config.js";

const Header = ({
                    reversed = false,
                    handleFilter,
    model,
                    setCheckedItems,
                    checkedItems,
                    data,
                    filterActive,
                    onChangeFilterValue,
                    setFilterValues,
                    filterValues,
                    advanced=true,
                    selectionMode=false
                }) => {

    const {t} = useTranslation()
    const { me } = useAuthContext()
    const {
        models,
        countByModel,
        selectedModel,
        setPagedFilters,
        pagedFilters,
        page
    } = useModelContext();
    let totalCol = 0;

    const [advancedFilterVisible, setAdvancedFilterVisible] = useState(false);

    const handleAdvancedFilter = () => {
        setAdvancedFilterVisible(true);
    }

    const [iconFilterActive, setIconFilterActive] = useState(true);
    useEffect(() => {
        if (pagedFilters && selectedModel?.name) {
            const modelFilters = pagedFilters[selectedModel.name] || {};
            const isActive = Object.keys(modelFilters)
                .some(fieldKey => {
                    const fieldFilter = modelFilters[fieldKey];
                    return fieldFilter && Object.keys(fieldFilter).length > 0;
                });
            setIconFilterActive(isActive);
        }
    }, [pagedFilters, selectedModel?.name]);

    return <><tr className={reversed ? ' reversed' : ''}>
        {advanced && (<th className={"mini"}>
            <div className="flex flex-row">

                <Button type={"button"} onClick={handleFilter} className={iconFilterActive ? ' active' : ''}><FaFilter/></Button>
                {filterActive && <Button type={"button"} onClick={() => handleAdvancedFilter()}><FaWrench /></Button>}
                <CheckboxField checkbox={true} checked={checkedItems?.length === data.length} onChange={e => {
                    if (checkedItems?.length === data.length) {
                        setCheckedItems([]);
                    } else {
                        setCheckedItems(data);
                    }
                }}/>

                <DialogProvider>
                    {advancedFilterVisible && (
                        <Dialog title={t("datatable.advancedFilter.title")} isClosable={true} onClose={() => setAdvancedFilterVisible(false)}>
                            <h3>Edit filter</h3>
                            <div className="msg">
                                <Trans i18nKey={"datatable.advancedFilter.desc"}>{t("datatable.advancedFilter.desc")}</Trans>
                            </div>
                            <ConditionBuilder onChange={(c) => {
                                setPagedFilters(pagedFilters => ({
                                    ...pagedFilters,
                                    [model.name]: c || pagedFilters[model.name] || {} }));
                            }} initialValue={{ $and: pagedFilterToMongoConds(pagedFilters, model)}} models={models} model={model} checkedItems={checkedItems} setCheckedItems={setCheckedItems} data={data} filterActive={filterActive} onChangeFilterValue={onChangeFilterValue} setFilterValues={setFilterValues}/>
                            <Button onClick={() =>{
                                setPagedFilters(pagedFilters => ({
                                    ...pagedFilters,
                                    [model.name]: {}}));
                            }}><Trans i18nKey={"btns.reset"}>Reset</Trans></Button>
                        </Dialog>
                    )}
                </DialogProvider>
            </div>
        </th>)}
        {(model?.fields || []).map(field => {
            if (field.type === 'password')
                return <></>;
            if( field.type === 'relation' && !models.find(f => f.name === field.relation && f._user === me?.username ))
                return <th className={"empty"} key={"datatable-th-"+model.name+":"+field.name}>
                    <div className="flex flex-mini-gap flex-centered">
                        <FaTriangleExclamation color={"#df8107"} data-tooltip-id={`tooltip-desc`} data-tooltip-content={"\""+field.relation + "\" model not found"} />
                        {field.name}
                        <Tooltip id={"tooltip-desc"} render={({content}) => {
                            gtag('render hint '+field.relation);
                            return content;
                        }} />
                    </div>
            </th>;

            totalCol++;
            return <FilterField key={"datatable-th-"+model.name+":"+field.name} advanced={advanced} reversed={reversed} filterValues={filterValues} setFilterValues={setFilterValues}
                                model={model} field={field} active={filterActive}
                                onChangeFilterValue={onChangeFilterValue}/>;
        })}
        {advanced && !selectionMode && (<th><Trans i18nKey="actions">Actions</Trans>
            {Object.keys(pagedFilters[model.name] || {})
                .filter(f=> Object.keys(pagedFilters[model.name]?.[f] || {}).length > 0).length > 0  && <div>
                <button onClick={() => {
                    setFilterValues({});
                    setPagedFilters(pagedFilters => ({...pagedFilters, [model.name]: {}}));
                }}><FaEraser />
                </button>
            </div>}</th>)}
    </tr>
        {reversed && (
            <tr>
                {countByModel?.[selectedModel?.name] === 0 &&
                    <td colSpan={totalCol + 2}><Trans i18nKey="no_data">Aucune donnée enregistrée</Trans></td>}
            </tr>)}
    </>
    ;
}

const formatDuration = (totalSeconds, t) => {
    if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds === '') {
        return '';
    }
    const total = parseInt(totalSeconds, 10);
    if (total === 0) return '0s';

    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);

    const parts = [];
    if (d > 0) parts.push(t('duration.day', { count: d }));
    if (h > 0) parts.push(t('duration.hour', { count: h }));
    if (m > 0) parts.push(t('duration.minute', { count: m }));
    if (s > 0) parts.push(t('duration.second', { count: s }));

    if (parts.length === 0) return '0s';

    return parts.slice(0, 2).join(', ');
};


const RichText = ({ value, initialLang }) => {
    const availableLangs = useMemo(() => (value ? Object.keys(value).filter(k => value[k]) : []), [value]);

    const [selectedLang, setSelectedLang] = useState(() => {
        if (availableLangs.includes(initialLang)) {
            return initialLang;
        }
        return availableLangs[0] || null;
    });

    useEffect(() => {
        setSelectedLang(initialLang);
    }, [initialLang]);

    if (!value || availableLangs.length === 0) {
        return null;
    }

    if (availableLangs.length === 1) {
        return <div className="rte-value" dangerouslySetInnerHTML={{ __html: value[availableLangs[0]] || '' }} />;
    }

    return (
        <div className="richtext-t-cell">
            <div className="lang-switcher">
                {availableLangs.map(langCode => (
                    <button
                        key={langCode}
                        className={`lang-btn ${selectedLang === langCode ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLang(langCode);
                        }}
                        title={langCode.toUpperCase()}
                    >
                        {langCode.toUpperCase()}
                    </button>
                ))}
            </div>
            <div className="rte-value" dangerouslySetInnerHTML={{ __html: value[selectedLang] || '' }} />
        </div>
    );
};

export function DataTable({
                              model,
                              checkedItems,
                              setCheckedItems = () => {},
                              onEdit,
                              onAddData,
                              onDuplicateData,
                              onDelete,
                              onShowAPI,
                              filterValues,
                              setFilterValues = () => {},
                              data: propData,
                              advanced= true,
                              selectionMode= false
                          }) {
    const {
        models,
        elementsPerPage,
        paginatedDataByModel,
        countByModel,
        pagedSort,
        selectedModel,
        pagedFilters,
        setPagedFilters,
        page
    } = useModelContext();
    const {t, i18n} = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const queryClient = useQueryClient();
    const {me} = useAuthContext();

    // Si des données sont passées en props, on les utilise, sinon on prend celles du contexte.
    const data = propData || paginatedDataByModel[model?.name] || [];

    const isDataLoaded = true;
    const [importVisible, setImportVisible] = useState(false);
    const [filterActive, setFilterActive] = useState(false)
    const [showExportDialog, setExportDialogVisible] = useState(false);

    const [selectedRow, setSelectedRow] = useState(null);
    const handleDelete = async (item) => {
        if (model && item && item._id) { // Assurez-vous d'avoir un identifiant unique pour chaque élément
            try {
                const response = await fetch(`/api/data/${item._id}?_user=${encodeURIComponent(getUserId(me))}`, { // Assurez-vous que l'URL est correcte
                    method: 'DELETE',
                });

                if (response.ok) {
                    const res = await response.json();

                    if (res.success) {
                        onDelete?.(item);
                        const notificationData = {
                            id: 'datatable.deleteData.success',
                            title: t('datatable.deleteData.success', 'Données supprimées avec succès'),
                            icon: <FaInfo/>,
                            status: 'completed'
                        };
                        addNotification(notificationData);
                    } else {
                        const notificationData = {
                            title: res.message,
                            status: 'error'
                        };
                        addNotification(notificationData);
                        console.log('Données non trouvées');
                    }

                    await Event.Trigger('API_DELETE_DATA', "custom", "data",{ model: item._model, id: item._id });
                    queryClient.invalidateQueries(['api/data', item._model, 'page', page, elementsPerPage, pagedFilters[item._model], pagedSort[item._model]]);

                } else {
                    console.error('Erreur lors de la suppression des données');
                    // Gérer les erreurs (afficher un message à l'utilisateur, etc.)
                }
            } catch (error) {
                const notificationData = {
                    title: error.message,
                    status: 'error'
                };
                addNotification(notificationData);
                console.error('Erreur lors de la suppression des données:', error);
            }
        } else {
            console.warn("Impossible de supprimer, l'élément ne possède pas d'ID");
        }
    };

    const handleEdit = (item) => {
        onEdit(item); // Call onEdit with the item to edit
    }

    const onChangeFilterValue = (field, value, tr) => {
        setPagedFilters(pagedFilters => ({
            ...pagedFilters, [model.name]: {...pagedFilters[model.name] || {}, [field.name]: value || pagedFilters[model.name]?.[field.name] || undefined}
        }));
        queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
    }

    const {addNotification} = useNotificationContext();

    const {mutate: exportMutation, isLoading} = useMutation(async (data) => {

        console.log('Exportation des données');
        const params = new URLSearchParams();
        params.append('model', model.name);
        params.append("_user", getUserId(me));

        // Cas de la table de données : requête paginée

        const m = Config.Get('maxRequestData', maxRequestData);
        params.append('limit', m + '');
        params.append('attachment', '1');
        params.append("depth", data.depth+"");
        if( data.withModels )
            params.append("withModels", "1");

        const ids = data.exportSelection ? checkedItems.map(item => item._id) : [];
        const body = JSON.stringify({filter: pagedFilters[model.name], models: data.models || [], ids});

        params.append('ids', ids);
        console.log('Fetch des données');
        return fetch(`/api/data/export?lang=${lang}&${params.toString()}`, {
            method: 'POST',
            body,
            headers: {"Content-Type": "application/json"}
        })
            .then(async resp => {
                if( resp.status === 200 )
                    return resp.blob();
                else {
                    const res = await resp.json();
                    throw new Error(res.error || 'something went wrong')
                }
            })
            .then((blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                // the filename you  want
                a.download = model.name + '.dump.json';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .then(e => {
                const notificationData = {
                    title: e.success ? t('dataimporter.success', 'Exportation de ' + model.name + ' réussie'): e.error,
                    icon: e.success ? <FaInfo/> : null,
                    status: e.success ? 'completed' : 'error'
                };
                addNotification(notificationData);
                return e;
            }).catch(e => {
                const notificationData = {
                    title: e.message,
                    status: 'error'
                };
                addNotification(notificationData);
            });
    });

    const handleExport = () => {
        setExportDialogVisible(true)
    }
    const handleImport = () => {
        setImportVisible(true);
    }
    const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

    const handleBackup = () => {
        setIsBackupModalOpen(true);
    }


    const handleConfirmRestore = async () => {
        try {
            // Make the API call to request the restore link
            const response = await fetch('/api/backup/request-restore', {
                method: 'POST',
                // ... other options ...
            });

            const result = await response.json();
            if (response.ok && result.message) {
                addNotification({ status: 'completed', title: result.message });
            } else {
                addNotification({ status: 'error', title: result.error || t('backup.restore.requestError', 'Erreur lors de la demande de restauration.') });
            }
        } catch (error) {
            addNotification({ status: 'error', title: t('backup.restore.requestError', 'Erreur lors de la demande de restauration.') });
            console.error('Error requesting restore link:', error);
        } finally {
            setIsBackupModalOpen(false); // Close the modal
        }
    };

    const handleFilter = () => {
        setFilterActive(!filterActive);
    }

    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [lightboxOpened, setLightboxOpened] = useState(false);
    const [lightboxSlides, setLightboxSlides] = useState([]);

    const [newPackName, setNewPackName] = useState(''); //  pack


    if (!model)
        return <></>;

    // NOUVEAU : La fonction qui gère la duplication
    const handleDuplicate = (originalData) => {
        // 1. Créer une copie superficielle des données de la ligne
        const dataToDuplicate = { ...originalData };

        // 2. TRÈS IMPORTANT : Supprimer les champs qui ne doivent pas être copiés.
        //    - L'_id doit être supprimé pour que le système sache qu'il s'agit d'une NOUVELLE entrée.
        //    - Le _hash sera recalculé par le backend.
        //    - Les dates de création/mise à jour seront gérées par le backend.
        delete dataToDuplicate._id;
        delete dataToDuplicate._hash;
        delete dataToDuplicate.createdAt; // si ce champ existe
        delete dataToDuplicate.updatedAt; // si ce champ existe

        onDuplicateData(dataToDuplicate);
    };

    const desc = t(`model_description_${selectedModel.name}`, selectedModel.description);
    return (
        <div className={`datatable${filterActive ? ' filter-active' : ''}`}>
            {advanced && !selectionMode && <div className="flex actions">
                {t(`model_${selectedModel?.name}`, selectedModel?.name) !== selectedModel?.name && (
                    <span className="badge"><strong>model</strong> : {selectedModel?.name}</span>)}
                {selectedModel.name === 'dashboard' && <Button className={"btn"} onClick={() => {
                    nav('/user/'+getUserHash(me)+'/dashboards');
                }}><FaEye /> Tableaux de bord</Button> }
                {desc && <p className="model-desc hint">{desc}</p>}
                <Button onClick={handleImport} title={t("btns.import")}><FaFileImport/><Trans
                    i18nKey="btns.import">Importer</Trans></Button>
                <Button disabled={isLoading} onClick={handleExport} title={t("btns.export")}><FaFileExport/><Trans i18nKey="btns.export">Exporter</Trans></Button>
                {!/^demo[0-9]{1,2}$/.test(me.username) && (<Button onClick={handleBackup} title={t("btns.backup")}><FaDatabase/><Trans
                    i18nKey="btns.backup">Backup</Trans></Button>)}

            </div>}
            <div className={"table-wrapper"}>
                <Tooltip id={"tooltipFile"} clickable={true} />
                <Tooltip id={"tooltipActions"} />
                <Lightbox
                    inline={{
                        style: { width: "100%", maxWidth: "900px", aspectRatio: "3 / 2" },
                    }} plugins={[Captions,Zoom]} index={lightboxIndex} open={lightboxOpened} close={()=> setLightboxOpened(false)}
                    slides={lightboxSlides}
                    on={{
                        click: ()=>{

                        }
                    }}
                />
                {isDataLoaded && (
                    <table>
                        <thead>
                        <Header advanced={advanced} model={model} setCheckedItems={setCheckedItems} filterValues={filterValues} data={data} setFilterValues={setFilterValues} onChangeFilterValue={onChangeFilterValue} checkedItems={checkedItems} filterActive={filterActive} handleFilter={handleFilter} selectionMode={selectionMode}/>
                        </thead>
                        <tbody>
                        {(data || []).map((item) => (
                            <><DialogProvider>
                                <tr key={item._id} onDoubleClick={() => onEdit(item)} onClick={(e) => {
                                    // Empêche le déclenchement du clic sur la ligne si on clique sur un bouton ou un lien
                                    if (e.target.closest('button, a')) {
                                        return;
                                    }
                                    const isCurrentlyChecked = checkedItems?.some(i => i?._id === item._id);
                                    if (!isCurrentlyChecked) {
                                        setCheckedItems([...(checkedItems || []), item]);
                                    } else {
                                        setCheckedItems((checkedItems || []).filter(i => i._id !== item._id));
                                    }
                                }}>
                                    {advanced && (<td className={"mini"}>
                                        <CheckboxField checkbox={true} className={"input-ref"}
                                                       checked={checkedItems?.some(i => i?._id === item._id)}
                                                       onChange={() => {
                                                           // La logique est gérée par le onClick de la <tr>
                                                           // pour permettre de cliquer n'importe où sur la ligne.
                                                       }}/></td>)}
                                    {(model?.fields ||[]).map(field => {

                                        if( !isConditionMet(model, field.condition, item, models, me, false)){
                                            return <td className={"notmet"} key={item._id + field.name}></td>; // Do not render the header cell if the condition isn't met
                                        }

                                        const hiddenable = (content) => {
                                            if(field.hiddenable)
                                                return <HiddenableCell value={content} />;
                                            return content;
                                        }
                                        if( field.type === 'relation' && !models.find(f => f.name === field.relation && f._user === me?.username ))
                                            return <td className={"empty"} key={item._id + field.name}></td>
                                        if (field.type === "relation" && typeof field.relation === "string") {
                                            return <td key={item._id + field.name} style={{backgroundColor: field.color}}>{hiddenable(<RelationValue field={field}
                                                                                                  data={item}/>)}</td>;
                                        }
                                        if( field.type === "cronSchedule" ){
                                            let val = '';
                                            try {
                                                val = cronstrue.toString(item[field.name], { locale: lang, throwExceptionOnParseError: true });
                                            } catch (e) {

                                            }
                                            return <td
                                                className={isLightColor(field.color)?"lighted":"unlighted"} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}
                                                key={field.name}>{hiddenable(val)}</td>;
                                        }
                                        if (field.type === "date" && item[field.name]) {
                                            return <td
                                                className={isLightColor(field.color)?"lighted":"unlighted"} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}
                                                key={field.name}>{hiddenable(new Date(item[field.name]).toLocaleDateString(i18n.resolvedLanguage || i18n.language, {
                                                day: "numeric",
                                                month: "numeric",
                                                year: "numeric"
                                            }))}</td>;
                                        }
                                        if (field.type === "datetime" && item[field.name]) {
                                            return <td
                                                className={isLightColor(field.color)?"lighted":"unlighted"} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}
                                                key={field.name}>{hiddenable(new Date(item[field.name]).toLocaleDateString(i18n.resolvedLanguage || i18n.language, {
                                                day: "numeric",
                                                month: "numeric",
                                                year: "numeric",
                                                hour: "numeric",
                                                minute: "numeric"
                                            }))}</td>;
                                        }
                                        if (field.type === "enum") {
                                            return <td
                                                key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(field.items.includes(item[field.name]) ? `${t(item[field.name], item[field.name])}` : `${item[field.name] || ''}`)}</td>;
                                        }
                                        if (field.type === "code") {
                                            const v = typeof(item[field.name]) === "string" ? item[field.name] : (item[field.name] ? JSON.stringify(item[field.name], null, 2) : '');
                                            return <td
                                                key={field.name}>{v && hiddenable(<CodeField language={field.language} name={field.name} value={v} disabled={true} />)}</td>;
                                        }
                                        if (field.type === "object") {
                                            return <td key={field.name}>{hiddenable(<CodeField language={'json'} name={field.name} value={item[field.name] ? JSON.stringify(item[field.name], null, 2) : ''} disabled={true} />)}</td>;
                                        }
                                        if (field.type === 'email') {
                                            return <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}} className={isLightColor(field.color)?"lighted":""}><a href={"mailto:"+item[field.name]} style={{color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(item[field.name])}</a></td>;
                                        }
                                        if (field.type === 'phone') {
                                            return <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}} className={isLightColor(field.color)?"lighted":""}>{hiddenable(item[field.name] && <PhoneField name={"phone"} value={item[field.name]} disabled={true} onChange={() => {}}></PhoneField>)}</td>;
                                        }
                                        if (field.type === 'model') {
                                            return <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}} className={isLightColor(field.color)?"lighted":""}>{hiddenable(item[field.name] ? `${t('model_'+item[field.name], item[field.name])} (${item[field.name]})`:'')}</td>;
                                        }
                                        if (field.type === 'geolocation') {
                                            const geoData = item[field.name];
                                            if (geoData && geoData.coordinates && geoData.coordinates.length === 2) {
                                                const [lng, lat] = geoData.coordinates;
                                                const coordinatesText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                                                const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
                                                return (
                                                    <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}} className={isLightColor(field.color)?"lighted":""}>
                                                        {hiddenable(
                                                            <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{color: 'inherit'}}>
                                                                {coordinatesText}
                                                            </a>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            return <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}} className={isLightColor(field.color)?"lighted":""}>{hiddenable('')}</td>;
                                        }
                                        if (field.type === 'password') {
                                            return <></>;
                                        }
                                        if (field.type === 'array') {
                                            let t = <></>
                                            if (field.itemsType === 'file') {
                                                const click = (e,i) => {
                                                    setLightboxIndex(i);
                                                    setLightboxOpened(true);
                                                    setLightboxSlides(item[field.name].map(s => ({
                                                        src: `/resources/${s.guid}`,
                                                        title: s.name
                                                    })));
                                                    e.preventDefault();
                                                };

                                                if( !Array.isArray(item[field.name]))
                                                    return <td key={field.name}>
                                                    </td>
                                                t = (item[field.name] ||[]).map((it,i) => {

                                                        const r = `
                                                        <strong>filename</strong> : ${it.filename}<br />
                                                        <strong>guid</strong> : ${it.guid}<br />
                                                        <strong>type</strong> : ${it.mimeType}<br />
                                                        <strong>size</strong> : ${it.size} bytes<br />
                                                        <strong>timestamp</strong> : ${it.createdAt ? new Date(it.createdAts).toLocaleString(lang) : ''}
                                                    `;
                                                    return <a key={it.guid} href={`/resources/${it.guid}`} target="_blank"
                                                              data-tooltip-id={"tooltipFile"} data-tooltip-html={r}
                                                              rel="noopener noreferrer" onClick={(e) => click(e,i)}><img
                                                        className="image" src={`/resources/${it.guid}`}
                                                        alt={`${it.name} (${it.guid})`}/></a>
                                                });
                                                return <td key={field.name}>
                                                    {hiddenable(<div className="gallery">{t}</div>)}
                                                </td>;
                                            }
                                            return <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(item[field.name]?.join(', ') || '')}</td>;
                                        }
                                        if (field.type === 'url') {
                                            return <td key={field.name}>
                                                {hiddenable(item[field.name] && (<><a href={item[field.name]}
                                                                           title={item[field.name]} style={{color: field.color}}
                                                                           className={"link-value"}
                                                                           target="_blank">{item[field.name]}</a>
                                                    <button title={"Copy URL"} onClick={(e) => {
                                                        navigator.clipboard.writeText(item[field.name]).then(function () {
                                                            console.log('Async: Copying to clipboard was successful!');
                                                        }, function (err) {
                                                            console.error('Async: Could not copy text: ', err);
                                                        });
                                                    }}><FaCopy/></button>
                                                </>))}</td>;
                                        }
                                        if (field.type === "file" && item[field.name]) {
                                            const r = `
                                                <strong>filename</strong> : ${item[field.name].filename}<br />
                                                <strong>guid</strong> : ${item[field.name].guid}<br />
                                                <strong>type</strong> : ${item[field.name].mimeType}<br />
                                                <strong>size</strong> : ${item[field.name].size} bytes<br />
                                                <strong>timestamp</strong> : ${new Date(item[field.name].createdAt)?.toLocaleString(lang)}
                                            `;
                                            if (['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/bmp', 'image/tiff', 'image/x-icon', 'image/x-windows-bmp'].includes(item[field.name].mimeType))
                                                return <td key={field.name}>{hiddenable(<a
                                                    data-tooltip-id={"tooltipFile"} data-tooltip-html={r}
                                                    href={`/resources/${item[field.name].guid}`} target="_blank"
                                                    rel="noopener noreferrer"><img className="image"
                                                    src={`/resources/${item[field.name].guid}`}
                                                    alt={`${item[field.name].filename}`}/></a>
                                                )}</td>;
                                            return <td key={field.name} className={isLightColor(field.color)?"lighted":""}><a  style={{color: field.color}}
                                                                            href={`/resources/${item[field.name].guid}`}
                                                                           target="_blank"
                                                                           rel="noopener noreferrer" data-tooltip-id={"tooltipFile"} data-tooltip-html={r}>{hiddenable(item[field.name].filename)}</a>
                                            </td>;
                                        }
                                        if (field.type === 'number') {
                                            if (field.delay) {
                                                return <td key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(formatDuration(item[field.name], t))}</td>;
                                            }
                                            if (field.gauge) {
                                                const value = item[field.name];
                                                if (value == null) {
                                                    return <td key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color}}></td>;
                                                }
                                                const min = field.min || 0;
                                                const max = field.max || 100;
                                                const percentage = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;

                                                const displayValue = field.percent ? `${Math.round(percentage)}%` : value;
                                                const title = field.percent ? `${value} (${Math.round(percentage)}%)` : `${value} / ${max}`;

                                                return (
                                                    <td key={field.name} className={isLightColor(field.color) ? "lighted" : "unlighted"} style={{backgroundColor: field.color}}>
                                                        {hiddenable(
                                                            <div className="gauge-container" data-tooltip-id={"tooltipFile"} data-tooltip-content={title}>
                                                                <div className="gauge-bar" style={{ width: `${percentage}%` }}></div>
                                                                <span className="gauge-label">{displayValue}</span>
                                                            </div>
                                                        )}
                                                    </td>);
                                            }
                                            let val = item[field.name];
                                            if (val && field.unit) {
                                                let formatter = new Intl.NumberFormat(lang);
                                                val = formatter.format(item[field.name]);
                                            }
                                            return <td key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(val ? `${val} ${field.unit || ''}` : '')}</td>;
                                        }
                                        if (field.type === "boolean") {
                                            return <td key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(item[field.name] ? t('yes') : t('no'))}</td>;
                                        }
                                        if (field.type === 'string_t') {
                                            return <td key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>{hiddenable(item[field.name] ? (item[field.name].value || item[field.name].key) : '')}</td>;
                                        }
                                        if (field.type === 'richtext') {
                                            return <td key={field.name}  className={isLightColor(field.color)?"lighted":""}>
                                                {hiddenable(<div className="rte-value"
                                                     dangerouslySetInnerHTML={{__html: item[field.name]}}></div>)}
                                            </td>;
                                        }
                                        if (field.type === 'richtext_t') {
                                            return <td key={field.name}  className={isLightColor(field.color)?"lighted":""}>
                                                {hiddenable(<RichText value={item[field.name]} initialLang={lang} />)}
                                            </td>;
                                        }
                                        if (field.type === 'color') {
                                            return <td key={field.name} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>
                                                {hiddenable(<ColorField name={field.name} disabled={true}
                                                    value={item[field.name]}/>)}</td>;
                                        }
                                        return <td key={field.name} className={isLightColor(field.color)?"lighted":""} style={{backgroundColor: field.color, color: isLightColor(field.color) ? 'black': '#E3E3E3'}}>
                                            {hiddenable(item[field.name])}</td>;
                                    })}
                                    {advanced && !selectionMode && (<td>
                                        <button data-tooltip-id="tooltipActions"
                                                data-tooltip-content={t('btns.edit', 'Modifier')}
                                                onClick={() => handleEdit(item)}><FaPencil/></button>
                                        <button
                                            onClick={() => handleDuplicate(item)}
                                            data-tooltip-id="tooltipActions"
                                            data-tooltip-content={t('btns.duplicate', 'Dupliquer')}
                                        >
                                            <FaCopy/>
                                        </button>
                                        {selectedModel?.history?.enabled && (<button
                                            onClick={() => setSelectedRow(item._id)}
                                            data-tooltip-id="tooltipActions"
                                            data-tooltip-content={t('btns.showHistory', 'Voir l\'historique')}
                                        >
                                            <FaHistory />
                                        </button>)}

                                        <button data-tooltip-id="tooltipActions"
                                                data-tooltip-content={t('btns.delete', 'Supprimer')}
                                                onClick={() => handleDelete(item)}><FaTrash/></button>
                                    </td>)}
                                </tr>
                            </DialogProvider></>
                        ))}

                        </tbody>

                        <tfoot>
                        {data.length > 10 && (<Header advanced={advanced} reversed={true} model={model} setCheckedItems={setCheckedItems}
                                                      filterValues={filterValues} data={data}
                                                      setFilterValues={setFilterValues} selectionMode={selectionMode}
                                                      onChangeFilterValue={onChangeFilterValue}
                                                      checkedItems={checkedItems} filterActive={filterActive} handleFilter={handleFilter}/>)}
                        </tfoot>

                    </table>)}
                {!isDataLoaded && <div className="spinner-loader"></div>}
                <DialogProvider>
                    {importVisible && (<DataImporter onClose={() => {
                        setImportVisible(false);
                    }}/>)}

                    {selectedRow && (
                        <HistoryDialog onClose={() => setSelectedRow(null)} modelName={selectedModel?.name} recordId={selectedRow} />
                    )}
                    <RestoreConfirmationModal
                        isOpen={isBackupModalOpen}
                        onClose={() => setIsBackupModalOpen(false)}
                        onConfirm={handleConfirmRestore}
                    />
                    <ExportDialog isOpen={showExportDialog} onClose={() => {
                        setExportDialogVisible(false);
                    }} availableModels={models} currentModel={selectedModel?.name} hasSelection={true} onExport={(data)=>{
                        exportMutation(data);
                    }} />
                </DialogProvider>
            </div>
        </div>
    );
}
