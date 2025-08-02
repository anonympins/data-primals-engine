import React, {forwardRef, useEffect, useState} from "react"; // Ajout de useEffect
import {conditionToApiSearchFilter, getDefaultForType} from "../../src/data.js";
import { Trans, useTranslation } from "react-i18next";
import {FaCode, FaLanguage, FaMinus, FaPlus, FaSitemap} from "react-icons/fa";
import Button from "./Button.jsx";
import { RTE } from "./RTE.jsx";
import RelationField from "./RelationField.jsx";
import {
    CheckboxField,
    CodeField,
    ColorField,
    EnumField,
    FileField, ModelField, NumberField,
    PhoneField,
    SelectField,
    TextField
} from "./Field.jsx";
import i18n from "../../src/i18n.js";
import ConditionBuilder from "./ConditionBuilder.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {FaCircleInfo} from "react-icons/fa6";
import {Tooltip} from "react-tooltip";
import Draggable from "./Draggable.jsx";
import CronBuilder from "./CronBuilder.jsx";
import RTETrans from "./RTETrans.jsx";
import uniqid from "uniqid";

// ... (fonction getInputType) ...
// Fonction pour obtenir le type d'input HTML basé sur le type de champ du modèle
const getInputType = (fieldType) => {
    switch (fieldType) {
        case 'number':
            return 'number';
        case 'date':
            return 'date';
        case 'datetime':
            return 'datetime-local';
        case 'email':
            return 'email';
        case 'password':
            return 'password';
        case 'url':
            return 'url';
        case 'phone': // Note: 'tel' est le type HTML correct
            return 'tel';
        case 'color':
            return 'color';
        // Pour les autres types comme 'string', 'string_t', 'enum', etc.
        default:
            return 'text';
    }
};

// C:/Dev/hackersonline-engine/client/src/DataEditor.jsx
// C:/Dev/hackersonline-engine/client/src/DataEditor.jsx


/**
 * Evaluates a single condition against form data.
 * @param {object} currentModelDef - The definition of the current model.
 * @param {object} condition - The condition to evaluate.
 * @param {object} formData - The form data.
 * @param {object[]} allModels - An array of all model definitions.
 * @param {object} user - The current user.
 * @returns {boolean} - True if the condition is met, false otherwise.
 */
const evaluateSingleCondition = (currentModelDef, condition, formData, allModels, user) => {
    // Condition est directement un filtre MongoDB, donc on l'applique
    // en utilisant les opérateurs et les valeurs qu'il contient.

    if (!condition || typeof condition !== 'object') {
        console.warn("[Client Eval] Condition is not an object:", condition);
        return true; // Permissive default
    }

    // Si la condition contient des opérateurs logiques, on les gère ici
    if (condition.$and || condition.$or || condition.$not || condition.$nor) {
        console.warn("[Client Eval] Condition logique détectée dans evaluateSingleCondition, ce n'est pas attendu. Devrait être géré par isConditionMet.");
        return true; // Permissive default
    }

    if (condition.$find) {
        const fieldName = Object.keys(condition)[0];
        const fieldValue = formData[fieldName];
        const findCondition = condition.$find;

        if (!Array.isArray(fieldValue)) return false;

        return fieldValue.some(item => {
            // Gestion spéciale pour la syntaxe $eq: ["$$this.field", value]
            if (findCondition.$eq && Array.isArray(findCondition.$eq)) {
                const [fieldPath, value] = findCondition.$eq;
                if (fieldPath.startsWith("$$this.")) {
                    const fieldToCheck = fieldPath.replace("$$this.", "");
                    return item[fieldToCheck] == value;
                }
            }

            // Sinon, évaluation normale
            const tempData = { ...item };
            return evaluateSingleCondition(currentModelDef, findCondition, tempData, allModels, user);
        });
    }

    // Si la condition contient un opérateur $exists, on le gère ici
    if (condition.$exists !== undefined) {
        const fieldName = Object.keys(condition)[0]; // Récupérer le nom du champ
        const shouldExist = condition.$exists; // Récupérer la valeur de $exists (true ou false)
        const exists = Object.prototype.hasOwnProperty.call(formData, fieldName) && formData[fieldName] !== undefined && formData[fieldName] !== null;
        return exists === shouldExist;
    }

    // Si la condition contient un opérateur $find, on le gère ici
    if (condition.$find) {
        // Récupérer le nom du champ
        const fieldName = Object.keys(condition)[0];
        const fieldValue = formData[fieldName];
        try {
            // Assuming evaluateSingleCondition handles $find
            return evaluateSingleCondition(currentModelDef, condition.$find, formData, allModels, user);
        } catch (error) {
            console.error("Error evaluating $find condition:", condition, error);
            return false;
        }
    }

    // Récupérer le nom du champ et la condition
    const fieldName = Object.keys(condition)[0];
    const fieldValue = condition[fieldName];

    // Récupérer la définition du champ
    const fieldDef = currentModelDef?.fields.find(f => f.name === fieldName);

    // Si la définition du champ n'est pas trouvée, on retourne true
    if (!fieldDef) {
        console.warn(`[Client Eval] Field definition not found for field: ${fieldName}`);
        return true; // Permissive default
    }

    let targetValue = formData[fieldName];
    let processedConditionValue = fieldValue;

    // 1. Handle $exists (on the first field)
    // 2. Convert condition value based on operator's expected input type
    const fieldType = fieldDef?.type; // Type of the first field

    try {
        processedConditionValue = convertValueType(fieldValue, fieldType);
    } catch (e) {
        logClientEvalWarning(`Error converting value type: ${e.message}`, condition);
        return false;
    }

    return evaluateComparison(fieldValue, targetValue, processedConditionValue, condition);

    function logClientEvalWarning(message, details) {
        console.warn(`[Client Eval] ${message}:`, details);
    }

    function convertValueType(value, inputType) {
        switch (inputType) {
            case 'number':
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    throw new Error(`Invalid number value: ${value}`);
                }
                return numValue;
            case 'boolean':
                return String(value).toLowerCase() === 'true';
            case 'csv':
                return String(value).split(',').map(item => item.trim()).filter(Boolean);
            case 'text':
            default:
                return String(value);
        }
    }

    function evaluateComparison(operator, targetValue, processedConditionValue, condition) {
        try {
            switch (typeof operator === 'object' ? Object.keys(operator)[0] : null) {
                case '$eq': return targetValue == processedConditionValue;
                case '$ne': return targetValue != processedConditionValue;
                case '$gt': return targetValue > processedConditionValue;
                case '$lt': return targetValue < processedConditionValue;
                case '$gte': return targetValue >= processedConditionValue;
                case '$lte': return targetValue <= processedConditionValue;
                case '$regex':
                    if (typeof targetValue !== 'string') return false;
                    if (typeof processedConditionValue !== 'string') return false;
                    try {
                        const regex = new RegExp(processedConditionValue, 'i');
                        return regex.test(targetValue);
                    } catch (e) {
                        logClientEvalWarning(`Invalid regex pattern: ${processedConditionValue}`, condition);
                        return false;
                    }
                case '$in':
                    return Array.isArray(processedConditionValue) && processedConditionValue.includes(String(targetValue));
                case '$nin':
                    return !Array.isArray(processedConditionValue) || !processedConditionValue.includes(String(targetValue));
                default:
                    logClientEvalWarning(`Unhandled operator in client evaluation logic: ${operator}`, condition);
                    return true; // Permissive default
            }
        } catch (evalError) {
            logClientEvalWarning(`Error during client condition evaluation: ${operator}, targetValue=${targetValue}, processedConditionValue=${processedConditionValue}`, condition);
            return false;
        }
    }
};

export const isConditionMet = (model, cond, formData, allModels, user) => {
    const isNode = (v) => typeof v === 'object' && v !== null;

    const condition = cond;

    if (!condition) return true;

    if (condition.$and && Array.isArray(condition.$and)) {
        if (condition.$and.length === 0) return true;
        return condition.$and.every(sub => isConditionMet(model, sub, formData, allModels, user));
    }

    if (condition.$or && Array.isArray(condition.$or)) {
        if (condition.$or.length === 0) return false;
        return condition.$or.some(sub => isConditionMet(model, sub, formData, allModels, user));
    }

    if (condition.$not) {
        return !isConditionMet(model, condition.$not, formData, allModels, user);
    }

    if (condition.$nor && Array.isArray(condition.$nor)) {
        if (condition.$nor.length === 0) return true;
        return !condition.$nor.some(sub => isConditionMet(model, sub, formData, allModels, user));
    }

    if (condition.$find) {
        try {
            // Assuming evaluateSingleCondition handles $find
            return evaluateSingleCondition(model, condition, formData, allModels, user);
        } catch (error) {
            console.error("Error evaluating $find condition:", condition, error);
            return false;
        }
    }

    if (condition.path && condition.op) {
        try {
            return evaluateSingleCondition(model, condition, formData, allModels, user);
        } catch (error) {
            console.error("Error evaluating condition:", condition, error);
            return false;
        }
    }

    console.warn("Unknown condition format:", condition);
    return true;
};

export const DataEditor = forwardRef(function MyDataEditor({
   isLoading,
   model,
   onSubmit,
   refreshTime,
   formData,
   setFormData, record, setRecord}, ref){

    const [focusedField, setFocusedField] = useState({});
    const {me} = useAuthContext()
    const {models} = useModelContext()

    const [viewMode, toggleViewMode]= useState(false);

    function renderInputField(model, field, value, handleChange, refreshTime, formData, user, models) { // Ajout de formData

        // Évaluer la condition AVANT de rendre le champ
        if (!isConditionMet(model, field.condition, formData)) {
            return null; // Ne rien rendre si la condition n'est pas remplie
        }

        const inputProps = {
            id: field.name,
            name: field.uniqueName || field.name,
            value: typeof(value) === 'undefined' ? getDefaultForType(field): value,
            onChange: (v) => handleChange(v),
            required: field.required,
            placeholder: field.placeholder,
            key: field.name
        };

        // --- Le reste de la fonction renderInputField reste identique ---
        switch (field.type) {
            case 'model':
                return <ModelField value={value} onChange={handleChange} model={model} field={field} />;
            case 'modelField':
                return <ModelField fields={true} value={value} onChange={handleChange} model={model} field={field} />;
            case 'datetime':
            case 'date':
                if( field.min )
                    inputProps["min"] = field.min;
                if( field.max)
                    inputProps["max"] = field.max;

                // Utilisation d'un wrapper div pour appliquer la clé unique même si le champ est conditionnel
                return <input key={field.name} type={getInputType(field.type)} {...inputProps} onChange={(e) => handleChange({name: field.name, value: e.target.value})} />;
            case 'textarea':
                return <textarea key={field.name} {...inputProps} />
            case 'richtext':
                return <RTE help={focusedField?.name === field.name ? t('field_'+model.name+'_'+field.name+'_hint', field.hint || '') : ''} onFocus={() => setFocusedField(field)} onBlur={() => setFocusedField(null)}  key={field.name} {...inputProps} field={field} name={formData._id} />;
            case 'richtext_t':
                return <RTETrans
                    key={field.name}
                    value={value}
                    onChange={(newValue) => handleChange({ name: field.name, value: newValue })}
                    field={field}
                />;
            case 'enum':
                return <EnumField key={field.name} inputProps={inputProps} value={value} handleChange={handleChange} field={field} />
            case "object":
                return <CodeField
                    language={field.language}
                    name={inputProps.name}
                    // Passer la valeur brute (chaîne JSON) depuis formData
                    value={value ? JSON.stringify(value) : ''}
                    // CodeField appelle déjà handleChange avec { name, value }
                    onChange={handleChange}
                />
            case 'code':
                // --- Détection pour afficher le ConditionBuilder ---
            {
                const isConditionBuilderField =
                    field.type === 'code' &&
                    field.language === 'json' &&
                    field.conditionBuilder === true;
                if (isConditionBuilderField) {
                    // Utiliser la valeur de formData, parsée en objet
                    const conditionObject = formData[field.name];
                    const currentViewMode = viewMode || 'builder';
                    let builderModelName = model.name; // Par défaut, le modèle en cours d'édition
                    if (field.targetModel) {
                        if (typeof field.targetModel === 'string' && field.targetModel.startsWith('$')) {
                            // C'est une référence dynamique à un autre champ du formulaire
                            const dynamicFieldName = field.targetModel.substring(1);
                            // On utilise la valeur du champ pointé s'il existe dans formData, sinon on garde le modèle par défaut
                            builderModelName = formData[dynamicFieldName] || model.name;
                        } else {
                            // C'est un nom de modèle statique
                            builderModelName = field.targetModel;
                        }
                        console.log({builderModelName})
                    }
                    return <div className={"flex flex-1"} style={{width:'100%'}} key={field.name}>
                        {currentViewMode !== 'builder' && ( <div className="condition-builder-toggle">
                            <button
                                type="button"
                                onClick={e => toggleViewMode(!viewMode)}
                                title={currentViewMode === 'builder' ? "Passer à la vue JSON" : "Passer au constructeur visuel"}
                            >
                                {currentViewMode === 'builder' ? <FaCode /> : <FaSitemap />}
                            </button>
                        </div>)}


                        {currentViewMode === 'builder' ? (
                            <ConditionBuilder
                                key={builderModelName}
                                initialValue={conditionObject}
                                models={models}
                                user={user}
                                model={builderModelName}
                                modelFields={model.fields}
                                onChange={(newConditionObject) => {
                                    handleChange({ name: field.name, value: newConditionObject });
                                }}
                            />
                        ) : (
                            <>
                                {/*JSON.stringify(conditionToApiSearchFilter(JSON.parse(formData[field.name])))*/}
                                {formData[field.name] && (<CodeField
                                language={field.language}
                                name={inputProps.name}
                                // Passer la valeur brute (chaîne JSON) depuis formData
                                value={formData[field.name] || ''}
                                // CodeField appelle déjà handleChange avec { name, value }
                                onChange={handleChange}
                            />)}</>
                        )}</div>
                }
                return <CodeField key={field.name} language={field.language} name={inputProps.name}
                                                        value={typeof (value) === 'string' ? value : JSON.stringify(value)}
                                                        onChange={handleChange}/>
            }
            case 'array':
                if (field.itemsType === 'file') {
                    return <div key={field.name}><FileField name={field.name} maxSize={field.maxSize}
                                                            mimeTypes={field.mimeTypes} value={value} onChange={(files) => {
                        handleChange({name: field.name, value: files});
                    }} /></div>;
                } else {
                    const tp = {...field, type: field.itemsType};
                    const lbl = tp.hint;
                    tp.hint = '';
                    tp.uniqueName = uniqid(field.name);
                    let vs = !Array.isArray(value) || !value.length ? [getDefaultForType(tp)] : value;
                    // Note: La condition s'applique au champ 'array' lui-même, pas aux éléments internes.
                    return <><p className="hint">{t('field_' + model.name + '_' + tp.name + '_hint', lbl || '')}</p><Draggable items={vs} onChange={(arr) => {
                        handleChange({name: field.name, value: arr});
                    }} renderItem={(item,i) => <div
                        className="array-element flex">{renderInputField(model, tp, item, (e) => { // Passer formData ici aussi si les éléments internes peuvent avoir des conditions
                        handleChange({name: field.name, value: vs.map(((v, vi) => vi === i ? e.value : v))});
                    }, refreshTime, formData, user, models)}
                        <FaMinus onClick={() => {
                            handleChange({name: field.name, value: value.filter((ve, vj) => vj !== i)});
                        }}/>
                    </div>}/><FaPlus className="cursor-pointer" onClick={() => {
                        handleChange({name: field.name, value: [...vs, getDefaultForType(tp)]});
                    }}/></>;
                }
            case "number":
                inputProps["step"] = field.step || 0.1;
                if( field.min )
                    inputProps["min"] = field.min;
                if( field.max)
                    inputProps["max"] = field.max;
                return <NumberField help={focusedField?.name === field.name ? t('field_'+model.name+'_'+field.name+'_hint', field.hint || '') : ''} onFocus={() => setFocusedField(field)} onBlur={() => setFocusedField(null)} unit={field.unit} key={field.name} {...inputProps} onChange={(e) => handleChange({name: field.name, value: parseFloat(e.target.value.replace(',', '.'))})}  />
            case 'relation':
                return (
                    <RelationField  onFocus={() => setFocusedField(field)} onBlur={() => setFocusedField(null)} help={focusedField?.name === field.name ? t('field_'+model.name+'_'+field.name+'_hint', field.hint || '') : ''} key={field.name} model={model} field={field} value={value} onChange={(e) => {
                        handleChange(e)
                    }} refreshTime={refreshTime} />
                );
            case 'cronSchedule':
                return <CronBuilder
                    cronExpression={value}
                    cronMask={field.cronMask}
                    defaultCronExpression={field.default}
                    onCronChange={(newCron) => {
                        handleChange({name: field.name, value: newCron});
                    }}
                />;
            case 'phone':
                return <PhoneField help={t('field_' + model.name + '_' + field.name + '_hint', field.hint || '')}
                                   key={field.name} name={field.name} value={inputProps.value}
                                   onChange={(e) => handleChange({name: field.name, value: e})}/>
            case 'boolean':
                return <CheckboxField
                    help={value && t('field_' + model.name + '_' + field.name + '_hint', field.hint || '')}
                    key={field.name} {...inputProps} checked={value}
                    onChange={(e) => handleChange({name: field.name, value: e.target.checked})}/>
            case 'string':
            case 'string_t':
                {
                    if (field.maxlength)
                        inputProps["maxlength"] = field.maxlength;
                    if (typeof (field.multiline) !== 'undefined')
                        inputProps["multiline"] = !!field.multiline;

                    const displayValue = (typeof value === 'object' && value !== null) ? value.key : (value || '');

                    return <TextField
                        help={focusedField?.name === field.name ? t('field_' + model.name + '_' + field.name + '_hint', field.hint || '') : ''}
                        onFocus={() => setFocusedField(field)} onBlur={() => setFocusedField(null)} key={field.name}
                        type={getInputType(field.type)} {...inputProps}
                        value={displayValue}
                        onChange={(e) => handleChange({name: field.name, value: e.target.value})}  />
                }
            case 'file':
                return <FileField help={t('field_'+model.name+'_'+field.name+'_hint', field.hint || '')} key={field.name} name={field.name} maxSize={field.maxSize} mimeTypes={field.mimeTypes} value={value} onChange={(file) => handleChange({ name: name, value: file ? file.name : null })} />
            case 'color':
                return <ColorField help={t('field_'+model.name+'_'+field.name+'_hint', field.hint || '')} key={field.name} name={field.name} value={value} onChange={handleChange} />
            default:
                return <TextField onFocus={() => setFocusedField(field)} onBlur={() => setFocusedField(null)} help={focusedField?.name === field.name ? t('field_'+model.name+'_'+field.name+'_hint', field.hint || '') : ''} key={field.name} type={getInputType(field.type)} {...inputProps} onChange={(e) => handleChange({name: field.name, value: e.target.value})} />
        }
    }

    // --- handleChange, handleSubmit, handleNew restent identiques ---
    const handleChange = (event) => {
        const { name, value } = event;
        setFormData(currentFormData => ({ ...currentFormData, [name]: value }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        onSubmit(formData, record); // Pass record to onSubmit
    };

    const handleNew = (e) => {
        const t = [...model.fields].reduce((acc, field, index) => {
            if( field.type === "relation"){
                acc[field.name] = field.multiple ? [] : null;
            }else {
                acc[field.name] = getDefaultForType(field);
            }
            return acc;
        }, {});
        setFormData(t)
        setRecord(null)
        e.preventDefault()
    }

    const {t } = useTranslation();

    // --- Le reste du composant DataEditor reste identique ---

    if (!model) {
        return <p>Sélectionnez un modèle pour afficher le formulaire.</p>;
    }

    const title = record ? t('editData', 'Edit {{0}}', [model.name]) : `${t('add_in_model')} ${t(`model_${model.name}`, model.name)}`;

    const hint = (model, field) => <div className="hint-icon"><FaCircleInfo data-field={t(`field_${model.name}_${field.name}`, field.name)} data-tooltip-id={`tooltipHint`} data-tooltip-content={i18n.t(`field_${model.name}_${field.name}_hint`, field.hint || '')} /></div>

    return (
        <div ref={ref} className="data-add">
            <h2>{title}</h2>
            <Tooltip id={"tooltipHint"}
                     place={"top-end"}
                 render={({ content, activeAnchor }) => {
                     gtag('render hint' + activeAnchor?.getAttribute('data-field'));
                     return (
                     <><strong>{activeAnchor?.getAttribute('data-field')}</strong><br/>
                         <p className="ws-pre-line">{content}</p></>
                 )
                 }} />
            <form className="flex flex-start flex-row flex-1" onSubmit={handleSubmit}>
                {model?.fields.map((field) => {
                    // Appel à renderInputField qui gère maintenant la condition
                    const inputElement = renderInputField(model, field, formData[field.name], handleChange, refreshTime, formData, me, models); // Passer formData

                    if( field.type === 'relation' && !models.find(f => f.name === field.relation && f._user === me?.username ))
                        return <></>

                    // Si l'élément n'estF pas null (condition remplie), on l'affiche avec son label
                    return inputElement ? (
                        <><div key={"editor-"+model.name+":"+field.name} className="flex flex-mini-gap">
                            {t('field_'+model.name+'_'+field.name, '') && hint(model, field)}
                            <label htmlFor={field.name}
                                   data-tooltip-id={`tooltipHint`}
                                   data-field={t(`field_${model.name}_${field.name}`, field.name)}
                                   data-tooltip-content={i18n.t(`field_${model.name}_${field.name}_hint`, field.hint || '')}>
                                {t(`field_${model.name}_${field.name}`, field.name)} {field.required ? <span className={"required"}>*</span> : <></>} {field.type==="string_t" ? <><FaLanguage title={'Translated in "' + (formData?.[field.name]?.value || '')+'"'} /></> : <></>}
                            </label>
                        </div>
                            {inputElement}</>
                    ) : null; // Ne rien afficher si la condition n'est pas remplie
                })}
                <div className="flex flex-centered">
                    <Button type="submit" disabled={isLoading}><Trans i18nKey="btns.save">Enregistrer</Trans></Button>
                    <Button type="submit" onClick={handleNew}><Trans i18nKey="btns.new">Nouveau</Trans></Button>
                </div>
            </form>
        </div>
    );
});