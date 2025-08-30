
import React, {forwardRef, useEffect, useRef, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from 'react-query';
import {useModelContext} from "./contexts/ModelContext.jsx";
import {FaArrowDown, FaArrowUp, FaEdit, FaInfo, FaMinus, FaPlus, FaSave, FaTrash} from "react-icons/fa";

import "./ModelCreator.scss"
import {CheckboxField, CodeField, ColorField, IconField, NumberField, SelectField, TextField} from "./Field.jsx";
import Button from "./Button.jsx";
import {Trans, useTranslation} from "react-i18next";
import {
    allowedFields,
    defaultMaxRequestData,
    mainFieldsTypes, maxFileSize,
    maxModelNameLength,
    maxRequestData
} from "../../src/constants.js";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {getUserHash, getUserId, isLocalUser} from "../../src/data.js";
import {useNotificationContext} from "./NotificationProvider.jsx";
import ConditionBuilder from './ConditionBuilder.jsx';
import './ConditionBuilder.scss';
import {Tooltip} from "react-tooltip";
import {FaCircleInfo} from "react-icons/fa6";
import i18n from "../../src/i18n.js";
import Draggable from "./Draggable.jsx";
import FlexBuilder from "./FlexBuilder.jsx";
import {NavLink} from "react-router";
import CalculationBuilder from "./CalculationBuilder.jsx";
import CronBuilder from "./CronBuilder.jsx";
import ModelCreatorField from "./ModelCreatorField.jsx";
import useLocalStorage from "./hooks/useLocalStorage.js";

const ModelCreator = forwardRef(({ initialPrompt = '', onModelGenerated, autoGenerate = false, initialModel, onModelSaved }, ref) => {

    const queryClient = useQueryClient();
    const {t, i18n} = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const {models, elementsPerPage, page, setDatasToLoad, selectedModel, setSelectedModel, pagedFilters, relationIds, pagedSort, setGeneratedModels, generatedModels } = useModelContext();
    const [modelName, setModelName] = useState(initialModel?.name || ''); // Utilisation de initialModel
    const [modelMaxRequestData, setModelMaxRequestData] = useState(initialModel?.maxRequestData || ''); // Utilisation de initialModel
    const [modelDescription, setModelDescription] = useState(initialModel?.name ? t(`model_description_${initialModel?.name}`, initialModel?.description) : '');
    const [modelHistory, setModelHistory] = useState(!!initialModel?.history || undefined);
    const [modelIcon, setModelIcon] = useState(!!initialModel?.icon || undefined);
    const [fields, setFields] = useState([]);
    const [changed, setChanged] = useState(false);

    const [selectedGeneratedModelIndex, setSelectedGeneratedModelIndex] = useState(0); // Pour l'index du modèle choisi

    useEffect(() => {
        if (initialModel) {
            // Mode édition : on charge les données du modèle existant
            setModelName(initialModel.name || '');
            setModelMaxRequestData(initialModel.maxRequestData || defaultMaxRequestData);
            setModelDescription(initialModel.name ? t(`model_description_${initialModel.name}`, initialModel.description) : '');
            setFields([...(initialModel.fields || []).map(m => ({...m}))]);
            setModelHistory(initialModel.history);
            setModelIcon(initialModel.icon);
        } else {
            // Mode création : on réinitialise tout pour une nouvelle génération
            setModelName('');
            setModelDescription('');
            setFields([]);
            setUseAI(true); // On active l'IA par défaut
            setModelVisible(false);
            setModelHistory(false);
            setModelIcon(null);
        }
    }, [initialModel]);

    useEffect(() => {
        if (generatedModels.length > 0 && selectedGeneratedModelIndex >= 0) {
            const selectedModel = generatedModels[selectedGeneratedModelIndex];
            if (selectedModel) {
                setModelName(selectedModel.name || '');
                setModelDescription(selectedModel.description || '');
                setFields(selectedModel.fields || []);
                setModelMaxRequestData(selectedModel.maxRequestData || defaultMaxRequestData);
                setModelIcon(selectedModel.icon || null);
            }
        }
    }, [generatedModels, selectedGeneratedModelIndex]);

    useEffect(() => {
        if( !changed)
            setModelDescription(initialModel?.name ? t('model_description_'+initialModel?.name, initialModel?.description) : '');
    }, [lang]);

    const mutationRename = useMutation(
        ({oldName, newName}) => {
            const url = `/api/model/${initialModel._id}/renameField?_user=${encodeURIComponent(getUserId(me))}`;
            return fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldFieldName: oldName, newFieldName: newName }),
            }).then((res) => res.json());
        },
        {
            onSuccess: (data) => {
                setDatasToLoad(datas=>[...datas, modelName]);
                queryClient.invalidateQueries('api/models');
                queryClient.invalidateQueries(['api/data', modelName, 'page', page, elementsPerPage, pagedFilters[modelName], pagedSort[modelName]]);
            },
            onError: (error) => {
                console.error('Erreur:', error);
            },
        }
    );

    const { me } = useAuthContext()

    const  {addNotification} = useNotificationContext()

    const mutation = useMutation(
        (modelData) => {
            const url = initialModel?._id ? `/api/model/${initialModel._id}` : '/api/model'; // Utilisation de initialModel pour l'URL
            const method = initialModel?._id ? 'PUT' : 'POST';
            return fetch(url+'?_user='+me.username, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modelData),
            }).then((res) => res.json());
        },
        {
            onSuccess: (data) => {

                const notificationData = {
                    title: data.success ? t('modelcreator.success', 'Modèle sauvegardé') : t(data.error, data.error),
                    icon: data.success ? <FaInfo /> : undefined,
                    status: data.success ? 'completed': 'error'
                };
                addNotification(notificationData);

                if (!initialModel) {
                    setModelName('');
                    setModelDescription('');
                    setModelMaxRequestData(defaultMaxRequestData);
                    setFields([{ name: '', type: 'string' }]);
                    setModelHistory(undefined);
                    setModelIcon(null);
                }
                setDatasToLoad(datas=>[...datas, modelName]);

                queryClient.invalidateQueries(['api/data', modelName, 'page', page, elementsPerPage, pagedFilters[modelName], pagedSort[modelName]]);
                queryClient.invalidateQueries('api/models');


            },
            onError: (error) => {
                const notificationData = {
                    title: t(error, error),
                    status: 'error'
                };
                addNotification(notificationData);
                console.error('Erreur:', error);
            },
        }
    );

    const handleAddField = () => {
        setFields([...fields, { name: '', type: 'string', _isNewField: true }]);
    };

    const handleRemoveField = (index) => {
        const newFields = [...fields];
        newFields.splice(index, 1);
        setFields(newFields);
    };
    const deleteMutation = useMutation(
        (modelName) =>
            fetch(`/api/model?name=${modelName}&_user=${encodeURIComponent(getUserId(me))}`, {
                method: 'DELETE',
            }).then((res) => res.json()),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('api/models');
                if (onModelSaved) {
                    onModelSaved(); // Vous pouvez passer un argument ici si nécessaire
                }
                // Réinitialiser le formulaire ou rediriger, selon vos besoins
                setModelName('');
                setModelDescription('');
                setSelectedModel(null)
                setModelHistory(undefined)
                setModelIcon(null);
                setFields([{ name: '', type: 'string', _isNewField: true }]);
                setDatasToLoad(datas => datas.filter(f => f !== modelName));
                setGeneratedModels(mods => {
                    return mods.filter(m => m.name !== initialModel.name);
                });
                const notificationData = {
                    title: t('modelcreator.deleteSuccess', 'Modèle supprimé'),
                    icon: <FaInfo />,
                    status: 'completed'
                };
                addNotification(notificationData);
            },
            onError: (error) => {
                console.error('Erreur lors de la suppression:', error);

                const notificationData = {
                    title: t(error, error),
                    status: 'error'
                };
                addNotification(notificationData);
            },
        }
    );

    const handleDelete = () => {
        if (initialModel && window.confirm("Êtes-vous sûr de vouloir supprimer ce modèle ?")) {
            deleteMutation.mutate(initialModel.name);
        }
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        const newModel = {
            name: modelName,
            description: modelDescription,
            maxRequestData: modelMaxRequestData,
            history: modelHistory,
            icon: modelIcon,
            fields: (fields || []).map((field) => {
                delete field['_isNewField'];
                let otherFields = [];
                // Check for specific field types
                switch (field.type) {
                    case 'relation':
                        otherFields = ['relation', 'multiple', 'relationFilter'];
                        break;
                    case 'enum':
                    {
                        otherFields = ['items']
                        break;
                    }
                    case 'number':
                        otherFields = ['min', 'max', 'step', 'unit','delay', 'gauge', 'percent'];
                        break;
                    case 'string':
                    case 'string_t':
                    case 'richtext':
                    case 'url':
                    case 'email':
                    case 'phone':
                    case 'password':
                    case 'code':
                        if (field.type === 'code')
                            otherFields = ['maxlength', 'language', 'conditionBuilder'];
                        else if( ['string_t', 'string'].includes(field.type))
                            otherFields = ['maxlength', 'multiline'];
                        else
                            otherFields = ['maxlength'];
                        break;
                    case 'date':
                    case 'datetime':
                    {
                        otherFields = ['min','max'];
                        break;
                    }
                    case 'image':
                    case 'file':
                        otherFields = ['mimeTypes', 'maxSize'];
                        break;
                    case 'calculated':
                        otherFields = ['calculation'];
                        break;
                    case 'array':
                        otherFields = ['itemsType'];
                        break;
                    default:
                }
                Object.keys(field).forEach(f => {
                    if( ![...allowedFields, ...otherFields].includes(f))
                        delete field[f];
                });
                return field;
            }),
        };
        setGeneratedModels(gen => gen.filter(m => m.name !== newModel.name));
        mutation.mutateAsync(newModel).then(data => {
            queryClient.invalidateQueries('api/models');
            newModel.fields.forEach(field => {
                if( field.type === "relation") {
                    queryClient.invalidateQueries(['api/data', field.relation, relationIds[field.relation]]);
                }
            })
            if (onModelSaved) {
                onModelSaved(data.data);
            }
        });

    };
    const swapElements = (array, index1, index2) => {
        if( index1 < 0 || index2 < 0 || index1 >= array.length || index2 >= array.length)
            return;
        let temp = array[index1];
        array[index1] = array[index2];
        array[index2] = temp;
    };

    const handleUp = (index) => {
        const nf = [...fields];
        swapElements(nf, index, index -1);
        setFields(nf);
    };
    const handleDown = (index) => {
        const nf = [...fields];
        swapElements(nf, index, index + 1);
        setFields(nf);
    };

    const handleAddValue = (fi) => {
        const newFields = [...fields];
        if( !newFields[fi].items )
            newFields[fi].items = [];
        newFields[fi].items.push("");
        setFields(newFields)
    }
    const handleRemoveValue = (fi, index) => {
        const newFields = [...fields];
        const field = newFields[fi];
        field.items = field.items.filter((f,i) => i !== index);
        setFields(newFields)
    }

    const handleRenameField = (fi, oldVal) => {
        const prompted = window.prompt(t('core.renameFields', 'Renommer le champ'), oldVal);
        if (prompted && prompted !== oldVal) {
            mutationRename.mutateAsync({oldName: oldVal, newName: prompted}).then(e =>{
                const newFields = [...fields];
                const field = newFields[fi];
                field.name = prompted;
                setFields(newFields)
            });
        }
    }


    const modelLocked = !!initialModel && (!initialModel?._user ? true : isLocalUser(me) && initialModel?.locked);

    const hint = (description) => t(description, '') && <div className="hint-icon"><FaCircleInfo data-tooltip-id={`tooltipHint`} data-tooltip-content={description} /></div>

    const handleMoveDown = (field, index, i) => {
        const newFields = [...fields];
        if( i + 1 >= newFields[index].items.length )
            return;
        const r = newFields[index].items[i + 1];
        newFields[index].items[i + 1] = newFields[index].items[i];
        newFields[index].items[i] = r;
        setFields(newFields);
    }

    const handleMoveUp = (field, index, i) => {
        const newFields = [...fields];
        if( i < 1 )
            return;
        const r = newFields[index].items[i - 1];
        newFields[index].items[i - 1] = newFields[index].items[i];
        newFields[index].items[i] = r;
        setFields(newFields);
    }

    const [useAI, setUseAI] = useState(true);
    const [showModel, setModelVisible] = useState(true);
    const [prompt, setPrompt] = useState('');

    const [homePrompt, setHomePrompt] = useLocalStorage("ai_model_prompt", null);
    const [promptResult, setPromptResult] = useLocalStorage("ai_model_prompt_result", null);

    // NOUVEAU : Créer une référence pour suivre le déclenchement
    const hasTriggeredAutoGenerate = useRef(false);

    const[generationIsLoading, setGenerationIsLoading] =useState(false);

    const generateModelMutation = useMutation(
        async ({userPrompt, modelToEdit}) => {
            const bodyPayload = { prompt: userPrompt };
            // Si on est en mode édition, on ajoute le modèle au corps de la requête
            if (modelToEdit) {
                bodyPayload.existingModel = modelToEdit;
            }

            const response = await fetch(`/api/model/generate?lang=${lang}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to generate model');
            }

            return response.json();
        },
        {
            onSuccess: (data) => {
                const modelsList = data?.models || data || [];

                if (modelsList && Array.isArray(modelsList) && modelsList.length > 0) {
                    const mds = modelsList.map(m => ({ ...m, _user: getUserId(me) }));
                    setGeneratedModels(g=>[...g, ...mds]);
                    onModelGenerated?.(mds);
                    modelsList.forEach(d => gtag('event', 'model generation "' + d.name + '"'));

                    setSelectedGeneratedModelIndex(0); // Sélectionne le premier par défaut
                    setModelVisible(true); // Affiche la section avec la liste et le formulaire
                    setHomePrompt(null);
                    addNotification({ title: t('modelcreator.generate.success'), status: 'completed' });
                } else {
                    // GA ne retourne aucun modèle
                    setModelVisible(false);
                    setHomePrompt(null);
                    addNotification({
                        title: t('modelcreator.generate.error'),
                        description: t('modelcreator.generate.no_models', "Aucun modèle n'a pu être généré."),
                        status: 'error'
                    });
                }
                setGenerationIsLoading(false);
            },
            onError: (error) => {
                setPromptResult(false);
                addNotification({
                    title: t('modelcreator.generate.error'),
                    description: error.message,
                    status: 'error'
                });
            },
        }
    );

    const handleGenerate = () => {
        if( prompt?.trim() ){
            gtag("event", "generate model by AI");
            setPromptResult(null);
            setGenerationIsLoading(true);
            generateModelMutation.mutate({
                userPrompt: prompt,
                modelToEdit: initialModel
            });
        }
    };

    useEffect(() => {
        // on ne veut la génération du prompt que si il y a un prompt en attente
        if(homePrompt && !hasTriggeredAutoGenerate.current){
            setPrompt(homePrompt);
            hasTriggeredAutoGenerate.current = true;
            setUseAI(true);
            setGenerationIsLoading(true);
            generateModelMutation.mutate({
                userPrompt: homePrompt,
                modelToEdit: initialModel
            });
        }

    }, [initialModel]); // Le tableau vide est toujours correct
    return (
        <div className="model-creator" ref={ref}>


            <Tooltip id={"tooltipHint"}
                     place={"top-end"}
                     globalCloseEvents={{ clickOutsideAnchor: true }}
                     render={({ content, activeAnchor }) => {
                         gtag('render hint ' + content);
                         const c = t(content, content);
                         return c && (
                         <><p className="ws-pre-line">{c}</p></>)
                     }} />
            <h2>
                {!initialModel && <Trans i18nKey={"btns.createModel"}>Créer un modèle</Trans>}
                {!!initialModel && <><Trans i18nKey={"btns.editModel"}>Editer le modèle</Trans> &#34;{t(`model_${modelName}`, modelName)}&#34;</>}
            </h2>
            <form onSubmit={handleSubmit}>

                {/* Section pour choisir le mode de création (IA ou Manuel) */}
                {!initialModel && (
                    <CheckboxField
                        label={<Trans i18nKey="modelcreator.useAI" />}
                        checked={useAI}
                        onChange={() => setUseAI(!useAI)}
                    />
                )}

                {/* Section pour le prompt de l'IA (uniquement si création par IA et avant génération) */}
                {useAI && !selectedModel && !showModel && (
                    <>
                        <div className="ai-prompt-container">
                        <>
                            <TextField
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            multiline
                            help={t("modelcreator.generate.help")}
                            required
                            disabled={generationIsLoading}
                        />
                        <div className="examples" dangerouslySetInnerHTML={{ __html: t('modelcreator.generate.examples') }} />
                        <Button
                            role={"button"}
                            onClick={handleGenerate}
                            disabled={generationIsLoading}
                        >
                            {generationIsLoading
                                ? <Trans i18nKey="modelcreator.generating" />
                                : <Trans i18nKey="modelcreator.generate" />
                            }
                        </Button>
                            </>
                    </div>
                    {generationIsLoading && <p><Trans i18nKey="modelcreator.generating" /></p>}
                    </>
                )}

                {/* Layout principal pour afficher la liste et le formulaire côte à côte APRES génération */}
                {showModel && useAI && (
                    <div className="flex model-generation-layout">
                        {/* Colonne de gauche: Liste des modèles générés */}
                        {generatedModels.some(g => models.find(f => f.name === g.name && f._user === g._user)) && (
                            <>
                                <div className="generated-models-list">
                                    <h4>{t('modelcreator.generate.results_title', 'Suggestions de l\'IA')}</h4>
                                    <ul>
                                        {generatedModels.map((model, index) => (
                                            <li
                                                key={index}
                                                className={index === selectedGeneratedModelIndex ? 'active' : ''}
                                                onClick={() => setSelectedGeneratedModelIndex(index)}
                                            >
                                                {model.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Colonne de droite: Formulaire du modèle sélectionné */}
                                <div className="model-form-container">
                                    {/* Le formulaire existant est placé ici */}
                                    <div className="field">
                                        <div className="flex field-bg">
                                            <label htmlFor="modelName"><Trans i18nKey={"modelcreator.name"}>Nom:</Trans></label>
                                        </div>
                                        <TextField
                                            type="text"
                                            id="modelName"
                                            disabled={modelLocked}
                                            value={modelName}
                                            help={t('modelcreator.field.name.hint')}
                                            onChange={(e) => setModelName(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="field">
                                        <div className="checkbox-label flex flex-1">
                                            <CheckboxField
                                                label={<Trans i18nKey={"history.title"}>Historique</Trans>}
                                                disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                                checked={field.required}
                                                onChange={(e) => {
                                                    const newFields = [...fields];
                                                    newFields[index].history = e ? { enabled: true } : undefined;
                                                    setFields(newFields);
                                                }}
                                                help={field.required && t('modelcreator.history.hint')}
                                            />
                                        </div>
                                    </div>


                                    <h3><Trans i18nKey={"modelcreator.fields"}>Champs du modèle :</Trans></h3>
                                    {fields.map((field, index) => <ModelCreatorField
                                        key={initialModel?.name + '_field_' + index}
                                        handleRemoveValue={handleRemoveValue}
                                        handleAddValue={handleAddValue}
                                        handleRenameField={handleRenameField}
                                        handleUp={handleUp}
                                        handleDown={handleDown}
                                        handleRemoveField={handleRemoveField}
                                        index={index} fields={fields} field={field} model={initialModel} setFields={setFields} />)}
                                </div></>)}
                    </div>
                )}

                {/* Affichage du formulaire en mode manuel ou édition */}
                {(!useAI || initialModel) && (
                    <div className="model-form-container">
                        <div className="flex field-bg">
                            <label htmlFor="modelName"><Trans i18nKey={"modelcreator.name"}>Nom:</Trans></label>
                        </div>
                        <TextField
                            type="text"
                            id="modelName"
                            disabled={modelLocked}
                            value={modelName}
                            help={t('modelcreator.field.name.hint')}
                            onChange={(e) => setModelName(e.target.value)}
                            required
                        />

                        <div className="flex field-bg">
                            <label htmlFor="modelDescription"><Trans i18nKey={"modelcreator.description"}>Description:</Trans></label>
                        </div>
                        <TextField
                            multiline
                            help={t('modelcreator.field.description')}
                            id="modelDescription"
                            disabled={modelLocked}
                            value={modelDescription}
                            onChange={(e) => {
                                setModelDescription(e.target.value);
                                setChanged(true)
                            }}
                        />

                        <div className="flex field-bg">
                            <label htmlFor="modelIcon"><Trans i18nKey={"modelcreator.icon"}>Icône:</Trans></label>
                        </div>
                        <IconField
                            help={t('modelcreator.field.icon')}
                            id="modelIcon"
                            disabled={modelLocked}
                            value={modelIcon}
                            onChange={(e) => {
                                setModelIcon(e);
                                setChanged(true)
                            }}
                        />

                        <div className="flex flex-no-wrap">
                            <div className="checkbox-label flex flex-1">
                                <CheckboxField
                                    label={<Trans i18nKey={"history"}>Historique</Trans>}
                                    help={t('modelcreator.field.history', '')}
                                    disabled={modelLocked}
                                    checked={!!modelHistory}
                                    onChange={(e) => {
                                        setModelHistory(e? { enabled: true }: false);
                                    }}
                                />
                            </div>
                        </div>

                        <h3><Trans i18nKey={"modelcreator.fields"}>Champs du modèle :</Trans></h3>
                        {fields.map((field, index) => <ModelCreatorField
                            key={initialModel?.name + '_field_' + index}
                            handleRemoveValue={handleRemoveValue}
                            handleAddValue={handleAddValue}
                            handleRenameField={handleRenameField}
                            handleUp={handleUp}
                            handleDown={handleDown}
                            handleRemoveField={handleRemoveField}
                            index={index} fields={fields} field={field} model={initialModel} setFields={setFields} />)}
                    </div>
                )}

                {/* Boutons d'action, visibles si un modèle est affiché ou en mode manuel */}
                {(showModel || !useAI || initialModel) && (
                    <div className="actions flex">
                        
                            <Button type="button" onClick={handleAddField}>
                                <FaPlus /> <Trans i18nKey={"btns.addField"}>Ajouter un champ</Trans>
                            </Button>

                        <Button type="submit">
                            <FaSave />
                            <Trans i18nKey={"btns.saveModel"}>Enregistrer le modèle</Trans>
                        </Button>
                        {initialModel && (
                            <Button type="button" onClick={handleDelete}>
                                <FaTrash /><Trans i18nKey={"btns.del"}>Supprimer le modèle</Trans>
                            </Button>
                        )}
                    </div>
                )}

            </form>
        </div>
    );
});
ModelCreator.displayName = "ModelCreator";

export default ModelCreator;