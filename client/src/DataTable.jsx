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
    FaDatabase, FaEraser,
    FaFileExport,
    FaFileImport,
    FaFilter,
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
import useLocalStorage from "./hooks/useLocalStorage.js";
import TutorialsMenu from "../src/TutorialsMenu.jsx";
import {useTutorials} from "./hooks/useTutorials.jsx";
import PackGallery from "./PackGallery.jsx";
import {HiddenableCell} from "./HiddenableCell.jsx";
import ConditionBuilder from "./ConditionBuilder.jsx";
import {pagedFilterToMongoConds} from "./filter.js";
import {isConditionMet} from "data-primals-engine/filter";

// Ajoutez cette constante pour la clé de sessionStorage
const SESSION_STORAGE_IMPORT_JOBS_KEY = 'activeImportJobs';

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
                    filterValues
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
    return <><tr className={reversed ? ' reversed' : ''}>
        <th className={"mini"}>
            <div className="flex flex-row">

                <Button onClick={handleFilter} className={filterActive ? ' active' : ''}><FaFilter/></Button>
                {filterActive && <Button onClick={() => handleAdvancedFilter()}><FaWrench /></Button>}
                <CheckboxField checked={checkedItems.length === data.length} onChange={e => {
                    if (checkedItems.length === data.length) {
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
                            }} initialValue={{ $and: pagedFilterToMongoConds(pagedFilters, model)}} models={models} model={model.name} checkedItems={checkedItems} setCheckedItems={setCheckedItems} data={data} filterActive={filterActive} onChangeFilterValue={onChangeFilterValue} setFilterValues={setFilterValues}/>
                            <Button onClick={() =>{
                                setPagedFilters(pagedFilters => ({
                                    ...pagedFilters,
                                    [model.name]: {}}));
                            }}><Trans i18nKey={"btns.reset"}>Reset</Trans></Button>
                        </Dialog>
                    )}
                </DialogProvider>
            </div>
        </th>
        {model.fields.map(field => {
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
            return <FilterField reversed={reversed} filterValues={filterValues} setFilterValues={setFilterValues}
                                model={model} field={field} active={filterActive}
                                onChangeFilterValue={onChangeFilterValue}/>;
        })}
        <th><Trans i18nKey="actions">Actions</Trans>
            {Object.keys(pagedFilters[model.name] || {})
                .filter(f=> Object.keys(pagedFilters[model.name]?.[f] || {}).length > 0).length > 0  && <div>
                <button onClick={() => {
                    setFilterValues({});
                    setPagedFilters(pagedFilters => ({...pagedFilters, [model.name]: {}}));
                }}><FaEraser />
                </button>
            </div>}</th>
    </tr>
        {reversed && (
            <tr>
                {countByModel?.[selectedModel?.name] === 0 &&
                    <td colSpan={totalCol + 2}><Trans i18nKey="no_data">Aucune donnée enregistrée</Trans></td>}
            </tr>)}
    </>
    ;
}

export function DataTable({
                              model,
                              checkedItems,
                              setCheckedItems,
                              onEdit,
                              onAddData,
                              onDuplicateData,
                              onDelete,
                              onShowAPI,
                              filterValues,
                              setFilterValues
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
    const {me} = useAuthContext()

    const isDataLoaded = true;
    const [importVisible, setImportVisible] = useState(false);
    const [filterActive, setFilterActive] = useState(false)

    const data = paginatedDataByModel[model?.name] || [];

    const [showPackGallery, setShowPackGallery] = useState(false);
    const [showExportDialog, setExportDialogVisible] = useState(false);


    const [showAddPack, setAddPackVisible] = useState(false);
    const handleAddPack = () => {
        setAddPackVisible(!showAddPack);
    }
    const handleShowPacks = () => {
        setShowPackGallery(true);
    };
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

                    Event.Trigger('API_DELETE_DATA', "custom", "data",{ model: item._model, id: item._id });
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
        params.append('limit', maxRequestData + '');
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
            .then(resp => resp.status === 200 ? resp.blob() : Promise.reject('something went wrong'))
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
                    title: t('dataimporter.success', 'Exportation de ' + model.name + ' réussie'),
                    icon: <FaInfo/>,
                    status: 'completed'
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
    const [tutorialDialogVisible, setTutorialDialogVisible] = useState(false);

    const [newPackName, setNewPackName] = useState(''); //  pack

    const handleShowTutorialMenu = () => {
        setTutorialDialogVisible(!tutorialDialogVisible);
    }

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
    return (
        <div className={`datatable${filterActive ? ' filter-active' : ''}`}>
            {<div className="flex actions flex-left">
                <Button onClick={() => onAddData(model)}><FaPlus/><Trans i18nKey="btns.addData">Ajouter une
                    donnée</Trans></Button>
                <Button onClick={handleImport} title={t("btns.import")}><FaFileImport/><Trans
                    i18nKey="btns.import">Importer</Trans></Button>
                <Button disabled={isLoading} onClick={handleExport} title={t("btns.export")}><FaFileExport/><Trans
                    i18nKey="btns.export">Exporter</Trans></Button>
                <Button className="tourStep-import-datapack" onClick={handleShowPacks} title={t("btns.addPack")}><FaPlus/><Trans
                    i18nKey="btns.addPack">Packs...</Trans></Button>

                <Button className={"tourStep-tutorials " + (/^demo[0-9]{1,2}$/.test(me.username) ? "btn-primary" : "btn")} onClick={handleShowTutorialMenu} title={t("btns.showTutos")}><FaPlus/><Trans
                    i18nKey="btns.showTutos">Tutoriels</Trans></Button>
                {!/^demo[0-9]{1,2}$/.test(me.username) && (<Button onClick={handleBackup} title={t("btns.backup")}><FaDatabase/><Trans
                    i18nKey="btns.backup">Backup</Trans></Button>)}
                <DialogProvider>
                    {tutorialDialogVisible && (
                        <Dialog isClosable={true} isModal={true} onClose={() => setTutorialDialogVisible(false)}>
                            <TutorialsMenu />
                        </Dialog>
                    )}
                </DialogProvider>
                <Button className="btn btn-primary" onClick={() => {
                    onShowAPI(selectedModel);
                }}><FaBook/> {t('btns.api', 'API')}</Button>
            </div>}
            <div className="table-wrapper">
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
                        <Header model={model} setCheckedItems={setCheckedItems} filterValues={filterValues} data={data} setFilterValues={setFilterValues} onChangeFilterValue={onChangeFilterValue} checkedItems={checkedItems} filterActive={filterActive} handleFilter={handleFilter}/>
                        </thead>
                        <tbody>
                        {(data || []).map((item) => (
                            <><DialogProvider>
                                <tr key={item._id} onDoubleClick={() => onEdit(item)} onClick={(e) => {
                                    const checked = (!e.target.closest('tr').querySelector('td:first-child input')?.checked);
                                    if (checked) {
                                        setCheckedItems(items => {
                                            return [...items, item];
                                        });
                                    } else {
                                        setCheckedItems(items => items.filter(i => i._id !== item._id));
                                    }
                                }}>
                                    <td className={"mini"}>
                                        <CheckboxField className={"input-ref"}
                                                       checked={checkedItems.some(i => i._id === item._id)}
                                                       onChange={(e) => {
                                                           if (e.target.checked) {
                                                               setCheckedItems(items => {
                                                                   return [...items, item];
                                                               });
                                                           } else {
                                                               setCheckedItems(items => items.filter(i => i._id !== item._id));
                                                           }
                                                       }}/></td>
                                    {model.fields.map(field => {

                                        if( !isConditionMet(model, field.condition, item, models, me)){
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
                                                t = (item[field.name] || []).map((it,i) => {

                                                        const r = `
                                                        <strong>filename</strong> : ${it.filename}<br />
                                                        <strong>guid</strong> : ${it.guid}<br />
                                                        <strong>type</strong> : ${it.mimeType}<br />
                                                        <strong>size</strong> : ${it.size} bytes<br />
                                                        <strong>timestamp</strong> : ${it.timestamp ? new Date(it.timestamp).toLocaleString(lang) : ''}
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
                                                <strong>timestamp</strong> : ${item[field.name].timestamp.toLocaleString(lang)}
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
                                                {hiddenable(<div className="rte-value"
                                                     dangerouslySetInnerHTML={{__html: item[field.name]?.[lang] || ''}}></div>)}
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
                                    <td>
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
                                        <button data-tooltip-id="tooltipActions"
                                                data-tooltip-content={t('btns.delete', 'Supprimer')}
                                                onClick={() => handleDelete(item)}><FaTrash/></button>
                                    </td>
                                </tr>
                            </DialogProvider></>
                        ))}
                        </tbody>

                        <tfoot>
                        {data.length > 10 && (<Header reversed={true} model={model} setCheckedItems={setCheckedItems}
                                                      filterValues={filterValues} data={data}
                                                      setFilterValues={setFilterValues}
                                                      onChangeFilterValue={onChangeFilterValue}
                                                      checkedItems={checkedItems} filterActive={filterActive} handleFilter={handleFilter}/>)}
                        </tfoot>

                    </table>)}
                {!isDataLoaded && <div className="spinner-loader"></div>}
                <DialogProvider>
                    {importVisible && (<DataImporter onClose={() => {
                        setImportVisible(false);
                    }}/>)}
                    <RestoreConfirmationModal
                        isOpen={isBackupModalOpen}
                        onClose={() => setIsBackupModalOpen(false)}
                        onConfirm={handleConfirmRestore}
                    />
                    <ExportDialog isOpen={showExportDialog} onClose={() => {
                        setExportDialogVisible(false);
                        console.log("close")
                    }} availableModels={models} currentModel={selectedModel.name} hasSelection={true} onExport={(data)=>{
                        exportMutation(data);
                        console.log(data);
                    }} />
                    {showPackGallery && (
                        <Dialog isClosable={true} isModal={true} onClose={() => setShowPackGallery(false)}>
                            <PackGallery />
                        </Dialog>
                    )}
                </DialogProvider>
            </div>
        </div>
    );
}


function DataImporter({onClose}) {

    const [file, setFile] = useState(null);
    const {selectedModel, page} = useModelContext();

    const {me} = useAuthContext();
    const {t, i18n} = useTranslation();

    const queryClient = useQueryClient();
    const {addNotification} = useNotificationContext();

    const [hasHeaders, setHasHeaders] = useState(true);
    const [csvHeaders, setCSVHeaders] = useState(selectedModel.fields.map(field => field.name));

    // --- MODIFIÉ : État pour gérer plusieurs tâches d'importation ---
    // Cet objet stockera les données de progression de chaque tâche, indexées par leur jobId
    const [importJobs, setImportJobs] = useState({});
    // Cette liste stockera les IDs des tâches qui sont actuellement suivies via SSE
    const [activeJobIds, setActiveJobIds] = useState([]);

    // Référence pour stocker les instances EventSource, indexées par jobId
    const eventSourceRefs = useRef({});

    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const [storedJobIds, setStoredJobIds] = useLocalStorage(SESSION_STORAGE_IMPORT_JOBS_KEY, []);
    // --- NOUVEAU : Charger/Sauvegarder les IDs des tâches actives depuis sessionStorage ---
    useEffect(() => {
        // Charger les IDs des tâches actives depuis sessionStorage au montage
        setActiveJobIds(storedJobIds);

        // Pour chaque jobId stockpour obtenir le dernier statut
        storedJobIds.forEach(jobId => {
            startProgressTracking(jobId);
        });

        // Fonction de nettoyage : fermer toutes les connexions EventSource lors du démontage du composant
        return () => {
            Object.values(eventSourceRefs.current).forEach(es => es.close());
            eventSourceRefs.current = {}; // Effacer les références
        };
    }, []); // S'exécute une seule fois au montage

    // --- NOUVEAU : Effet pour mettre à jour sessionStorage lorsque activeJobIds change ---
    useEffect(() => {
        setStoredJobIds(activeJobIds);
    }, [activeJobIds]);


    // Mutation pour initier l'importation (envoi du fichier au serveur)
    const {isLoading, mutate: importMutation} = useMutation(async () => {
        console.log('Initiating data import...');
        const params = new FormData();
        params.append('model', selectedModel?.name);
        params.append("_user", getUserId(me));
        params.append("hasHeaders", !!hasHeaders);
        params.append("csvHeaders", csvHeaders.join(','));
        if (file) {
            params.append("file", file);
        } else {
            addNotification({ title: t('dataimporter.noFileSelected', 'Veuillez sélectionner un fichier à importer.'), status: 'warning' });
            return Promise.reject(new Error("No file selected"));
        }

        try {
            const response = await fetch(`/api/data/import?lang=${lang}`, {
                method: 'POST',
                body: params
            });

            if (response.status === 202) {
                const { job } = await response.json();
                const { jobId} = job;
                
                // --- MODIFIÉ : Ajouter le nouvel jobId à activeJobIds et à l'état importJobs ---
                setActiveJobIds(prevIds => [...prevIds, jobId]);
                setImportJobs(prevJobs => ({
                    ...prevJobs,
                    [jobId]: {
                        jobId,
                        status: 'pending',
                        totalRecords: 0,
                        processedRecords: 0,
                        errors: [],
                        // Ajoutez d'autres champs initiaux que vous souhaitez afficher immédiatement
                    }
                }));
                startProgressTracking(jobId); // Commencer le suivi de cette nouvelle tâche
                addNotification({
                    title: t('dataimporter.initiated', 'Importation initiée. Suivi de la progression...'),
                    icon: <FaInfo/>,
                    status: 'info'
                });
            } else {
                const errorData = await response.json();
                addNotification({
                    title: errorData.error || t('dataimporter.error', 'Erreur lors de l\'importation.'),
                    status: 'error'
                });
            }
        } catch (e) {
            addNotification({
                title: e.message || t('dataimporter.networkError', 'Erreur réseau lors de l\'importation.'),
                status: 'error'
            });
        }
    });

    // Fonction pour démarrer le suivi de la progression via Server-Sent Events (SSE) pour un jobId spécifique

    // Fonction pour démarrer le suivi de la progression via Server-Sent Events (SSE) pour un jobId spécifique
    const startProgressTracking = (jobId) => {
        // Fermer toute connexion EventSource existante pour ce jobId pour éviter les doublons
        if (eventSourceRefs.current[jobId]) {
            eventSourceRefs.current[jobId].close();
        }

        const eventSource = new EventSource(`/api/import/progress/${jobId}`);
        eventSourceRefs.current[jobId] = eventSource; // Stocker l'instance pour le nettoyage

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // --- MODIFIÉ : Mettre à jour la progression de la tâche spécifique ---
            setImportJobs(prevJobs => ({
                ...prevJobs,
                [jobId]: data
            }));

            // Si la tâche est terminée (succès ou échec), fermer la connexion SSE.
            // NE PAS la retirer de activeJobIds ici, pour qu'elle persiste au rafraîchissement.
            // Elle sera retirar le bouton "Effacer".
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'not_found') {
                eventSource.close();
                delete eventSourceRefs.current[jobId]; // Supprimer la référence de l'EventSource

                // --- LIGNE MODIFIÉE/SUPPRIMÉE ---
                // Supprimez ou commentez la ligne suivante :
                // setActiveJobIds(prevIds => prevIds.filter(id => id !== jobId));

                queryClient.invalidateQueries(['api/data', selectedModel.name, 'page', page]); // Rafraîchir les données du tableau

                if (data.status === 'completed') {
                    addNotification({
                        title: t('dataimporter.success', 'Importation des données réussie.'),
                        icon: <FaInfo/>,
                        status: 'completed'
                    });
                } else if (data.status === 'failed') {
                    addNotification({
                        title: t('dataimporter.failed', 'Importation échouée. Voir les détails pour les erreurs.'),
                        status: 'error'
                    });
                } else if (data.status === 'not_found') {
                    addNotification({
                        title: t('dataimporter.jobNotFound', 'Tâche d\'importation non trouvée ou déjà terminée.'),
                        status: 'warning'
                    });
                }
            }
        };

        eventSource.onerror = (error) => {
            console.error(`EventSource error for job ${jobId}:`, error);
            eventSource.close();
            delete eventSourceRefs.current[jobId];
            setStoredJobIds(prevIds => prevIds.filter(id => id !== jobId));
        };
    };

    const handleImportClick = () => {
        importMutation();
    };

    const handleCloseModal = () => {
        // Fermer toutes les connexions EventSource avant de fermer la modale
        Object.values(eventSourceRefs.current).forEach(es => es.close());
        eventSourceRefs.current = {}; // Effacer les références
        onClose();
    };

    // Déterminer si une importation est actuellement en cours (pour désactiver les boutons)
    const isAnyImportInProgress = Object.values(importJobs).some(job => job.status === 'pending' || job.status === 'processing');

    // Filtrer et trier les tâches à afficher (par exemple, les tâches en cours en premier)
    const jobsToDisplay = Object.values(importJobs).sort((a, b) => {
        // Trier par statut (en attente/en cours en premier, puis échoué, puis terminé)
        const statusOrder = { 'pending': 1, 'processing': 2, 'failed': 3, 'completed': 4, 'not_found': 5 };
        return statusOrder[a.status] - statusOrder[b.status];
    });

    return (
        <Dialog isClosable={true} isModal={true} onClose={handleCloseModal}>
            <>
                <h2>
                    <Trans i18nKey="dataimporter.title" values={{model: t('model_' + selectedModel?.name, selectedModel?.name)}}>
                        Importer des données dans {t('model_' + selectedModel?.name, selectedModel?.name)}
                    </Trans>
                </h2>
                <p>
                    <Trans i18nKey="dataimporter.info" values={{constante: (maxBytesPerSecondThrottleData / kilobytes) + 'ko/s'}}></Trans>
                </p>

                {/* Toujours afficher le formulaire de sélection de fichier et le bouton d'importation */}
                <FileField
                    name="file"
                    maxSize={maxFileSize}
                    mimeTypes={['application/json', 'text/csv']}
                    type="file"
                    multiple={false}
                    onChange={(files) => {
                        setFile(files && files.length > 0 ? files[files.length - 1].file : null);
                    }}
                />
                {file && (file.name.endsWith('.csv') || file.type === 'text/csv') && (
                    <div className="checkbox-label flex flex-row">
                        <label htmlFor="hasHeadersCheckbox">
                            <input
                                type="checkbox"
                                id="hasHeadersCheckbox"
                                checked={hasHeaders}
                                onChange={(e) => setHasHeaders(e.target.checked)}
                            />
                            <Trans i18nKey="dataimporter.hasCsvHeaders"></Trans>
                        </label>
                        {!hasHeaders && (
                            <table>
                                <thead>
                                <tr>
                                    <th><Trans i18nKey={"dataimporter.csvColumn"}>Num de colonne du CSV</Trans></th>
                                    <th><Trans i18nKey="dataimporter.field">Champ du modèle</Trans></th>
                                </tr>
                                </thead>
                                <tbody>
                                {csvHeaders.map((mappedFieldName, index) => {
                                    let fieldObjectForModelField = null;
                                    let currentFieldValueForModelField = null;

                                    if (mappedFieldName && mappedFieldName.trim() !== '') {
                                        fieldObjectForModelField = selectedModel?.fields.find(f_model => f_model.name === mappedFieldName);
                                        if (fieldObjectForModelField) {
                                            currentFieldValueForModelField = fieldObjectForModelField.name;
                                        }
                                    }

                                    return (
                                        <tr key={`${selectedModel.name}-csvmap-${index}`}>
                                            <td><Trans i18nKey="dataimporter.column" values={[index + 1]}>colonne {index + 1}</Trans></td>
                                            <td>
                                                <div className="flex">
                                                    <ModelField
                                                        disableable={true}
                                                        showModel={false}
                                                        value={selectedModel.name}
                                                        fieldValue={currentFieldValueForModelField}
                                                        onChange={({name: propName, value: selectedValue}) => {
                                                            const newCsvHeaders = [...csvHeaders];
                                                            newCsvHeaders[index] = selectedValue?.field ?? '';
                                                            setCSVHeaders(newCsvHeaders);
                                                        }}
                                                        fields={true}
                                                        model={selectedModel}
                                                        field={fieldObjectForModelField}
                                                    />
                                                    <Button className="flex" onClick={() => {
                                                        const csvH = [...csvHeaders];
                                                        setCSVHeaders(csvH.filter((_, i) => i !== index));
                                                    }}><FaTrash/></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr>
                                    <td colSpan={2}>
                                        <Button onClick={() => {
                                            const csvH = [...csvHeaders];
                                            csvH.push('');
                                            setCSVHeaders(csvH)
                                        }}><Trans i18nKey="dataimporter.addColumn">Ajouter une colonne</Trans></Button>
                                    </td>
                                </tr>
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
                <div>
                    <Button onClick={handleImportClick} disabled={isLoading || !file}>
                        <Trans i18nKey="btns.import">Importer</Trans>
                    </Button>
                </div>

                {/* Afficher la progression pour toutes les tâches d'importation actives/suivies */}
                {jobsToDisplay.length > 0 && (
                    <div className="import-jobs-list">
                        <h3><Trans i18nKey="dataimporter.activeImports">Importations en cours / terminées</Trans></h3>
                        {jobsToDisplay.map(job => {
                            const progressPercentage = job.totalRecords > 0
                                ? (job.processedRecords / job.totalRecords) * 100
                                : 0;
                            const isJobFinished = job.status === 'completed' || job.status === 'failed' || job.status === 'not_found';

                            return (
                                <div key={job.jobId} className="import-progress-container">
                                    <h4><Trans i18nKey="dataimporter.jobId">Tâche ID:</Trans> {job.jobId?.substring(0, 8)}...</h4>
                                    <p>
                                        <Trans i18nKey="dataimporter.status">Statut:</Trans>{' '}
                                        <strong>{t(`dataimporter.status.${job.status}`, job.status)}</strong>
                                    </p>
                                    {job.totalRecords > 0 && (
                                        <p>
                                            <Trans i18nKey="dataimporter.recordsProcessed">Enregistrements traités:</Trans>{' '}
                                            {job.processedRecords} / {job.totalRecords}
                                        </p>
                                    )}
                                    <div className="progress-bar-wrapper">
                                        <div
                                            className="progress-bar"
                                            style={{ width: `${progressPercentage}%` }}
                                        >
                                            {progressPercentage.toFixed(0)}%
                                        </div>
                                    </div>

                                    {job.errors && job.errors.length > 0 && (
                                        <div className="import-errors">
                                            <h4><Trans i18nKey="dataimporter.errors">Erreurs:</Trans></h4>
                                            <ul>
                                                {job.errors.map((error, index) => (
                                                    <li key={index}>{error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {isJobFinished && (
                                        <div className="flex justify-end mt-2">
                                            <Button onClick={() => {
                                                setImportJobs(prevJobs => {
                                                    const newJobs = { ...prevJobs };
                                                    delete newJobs[job.jobId];
                                                    return newJobs;
                                                });
                                                setActiveJobIds(prevIds => prevIds.filter(id => id !== job.jobId));
                                            }}><Trans i18nKey="btns.clear">Effacer</Trans></Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex justify-end mt-4">
                    <Button onClick={handleCloseModal} disabled={isAnyImportInProgress}>
                        <Trans i18nKey="btns.close">Fermer</Trans>
                    </Button>
                </div>
            </>
        </Dialog>
    );
}