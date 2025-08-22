import React, {useState} from "react";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {isLocalUser} from "../../src/data.js";
import {Trans, useTranslation} from "react-i18next";
import {FaCircleInfo} from "react-icons/fa6";
import {CheckboxField, CodeField, ColorField, NumberField, SelectField, TextField} from "./Field.jsx";
import Button from "./Button.jsx";
import {FaArrowDown, FaArrowUp, FaEdit, FaMinus, FaPlus, FaTrash} from "react-icons/fa";
import CalculationBuilder from "./CalculationBuilder.jsx";
import ConditionBuilder from "./ConditionBuilder.jsx";
import Draggable from "./Draggable.jsx";
import {mainFieldsTypes} from "../../src/constants.js";

function RelationModelSelector({relation, onChange, ...rest}) {
    const {models} = useModelContext()
    const {me} = useAuthContext()
    const {t} = useTranslation();
    return (
        <select {...rest} onChange={(e) => onChange(e.target.value)}>
            <option value=""><Trans i18nKey={"relation.selectModel"}>Sélectionner un modèle</Trans></option>
            {models.filter(f => f._user === me?.username).map((model) => (
                <option selected={model.name === relation} key={model.name} value={model.name}>
                    {t(`model_${model.name}`, model.name)}
                </option>
            ))}
        </select>
    );
}


const ValueField = ({v, setValue, disabled}) => {
    const {t} = useTranslation();
    return <TextField value={v} placeholder={t('modelcreator.field.value', 'Valeur')} disabled={disabled} onChange={(e) => setValue(e.target.value)} />
}

const ModelCreatorField = ({model, handleRenameField, handleRemoveField, handleUp, handleDown, handleRemoveValue, handleAddValue, setFields, fields, field, index}) => {

    const {models} = useModelContext()
    const {me } = useAuthContext()
    const modelLocked = !!model && (!model?._user ? true : isLocalUser(me) && model?.locked);
    const { t, i18n } = useTranslation();
    const [showMore, setMoreVisible] = useState(false);
    const hint = (description) => t(description, '') && <div className="hint-icon"><FaCircleInfo data-tooltip-id={`tooltipHint`} data-tooltip-content={description} /></div>

    return (
        <div className="field-edit">

            <div className="actions right">
                {index < fields.length - 1 && (
                    <button title={"Déplacer vers le bas"} type="button"
                            onClick={() => handleDown(index)}>
                        <FaArrowDown/>
                    </button>)}
                {index > 0 && (
                    <button title="Déplacer vers le haut" type="button"
                            onClick={() => handleUp(index)}>
                        <FaArrowUp/>
                    </button>)}
            </div>
            <div className="flex flex-row flex-stretch">

                <div className="flex fieldName field-bg">{hint('modelcreator.name.hint')}
                    <div className="flex flex-no-gap flex-no-wrap flex-1">
                        <TextField
                            label={t('modelcreator.fieldName')}
                            className={!modelLocked && !field._isNewField && "input-fit"}
                            disabled={modelLocked || (!!model && !field._isNewField)}
                            value={field.name}
                            onChange={(e) => {
                                const newFields = [...fields];
                                newFields[index].name = e.target.value;
                                setFields(newFields);
                            }}
                            help={t('modelcreator.name.hint')}
                            required
                            after={!(!modelLocked && isLocalUser(me) && field.locked) && !field._isNewField && (
                                <Button type={"button"} className={"btn-form btn-last"}
                            onClick={() => handleRenameField(index, field.name)}><FaEdit/></Button>)}
                        />
                    </div>

                </div>

                <div className="flex">

                    <div className="flex flex-1 flex-stretch field-bg flex-no-gap">

                        <SelectField
                            label={<div className={"flex"}>{hint('modelcreator.type.hint')}{t('modelcreator.type', 'Type de champ')}</div>}
                            className={"flex-1"}
                            value={field.type}
                            onChange={(e) => {
                                const newFields = [...fields];

                                const nf = newFields[index];
                                nf.type = e.value;

                                setFields(newFields);
                                gtag('event', 'model set field ' + e.value);
                            }}
                            items={[
                                {label: t("field.string"), value: "string"},
                                {label: t("field.string_t"), value: "string_t"},
                                {label: t("field.richtext"), value: "richtext"},
                                {label: t("field.richtext_t"), value: "richtext_t"},
                                {label: t("field.number"), value: "number"},
                                {label: t("field.boolean"), value: "boolean"},
                                {label: t("field.enum"), value: "enum"},
                                {label: t("field.date"), value: "date"},
                                {label: t("field.datetime"), value: "datetime"},
                                {label: t("field.password"), value: "password"},
                                {label: t("field.email"), value: "email"},
                                {label: t("field.phone"), value: "phone"},
                                {label: t("field.url"), value: "url"},
                                {label: t("field.color"), value: "color"},
                                {label: t("field.array"), value: "array"},
                                {label: t("field.relation"), value: "relation"},
                                {label: t("field.file"), value: "file"},
                                {label: t("field.code"), value: "code"},
                                {label: t("field.calculated", "calculated data"), value: "calculated"},
                                {label: t("field.cronSchedule", "task schedule"), value: "cronSchedule"},
                            ]}
                        />
                        {/* Afficher le sélecteur de modèle lié si le type est "relation" */}

                        {(field.type === 'relation' || field.type === 'array') && <div className={"div"}>
                            {/* Afficher le sélecteur de modèle lié si le type est "relation" */}
                            {field.type === 'relation' && (
                                <>
                                    <RelationModelSelector
                                        className={"flex-1 mg-v-1"}
                                        relation={field.relation}
                                        onChange={(relation) => {
                                            const newFields = [...fields];
                                            newFields[index].relation = relation;
                                            setFields(newFields);

                                        }}
                                    />
                                </>
                            )}
                            {/* Afficher le sélecteur de modèle lié si le type est "relation" */}
                            {field.type === 'array' && (
                                <>
                                    <select
                                        className={"flex-1 mg-v-1"}
                                        value={field.itemsType}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].itemsType = e.target.value;
                                            setFields(newFields);

                                            gtag('event', 'model set itemsType ' + e.target.value);
                                        }}
                                    >
                                        <option value="string"><Trans i18nKey={"field.string"}>Texte</Trans></option>
                                        <option value="string_t"><Trans i18nKey={"field.string_t"}>Texte traduit</Trans>
                                        </option>
                                        <option value="richtext"><Trans i18nKey={"field.richtext"}>Texte enrichi</Trans>
                                        </option>
                                        <option value="richtext_t"><Trans i18nKey={"field.richtext_t"}>Texte enrichi
                                            traduit</Trans>
                                        </option>
                                        <option value="number"><Trans i18nKey={"field.number"}>Nombre</Trans></option>
                                        <option value="boolean"><Trans i18nKey={"field.boolean"}>Booléen</Trans>
                                        </option>
                                        <option value="date"><Trans i18nKey={"field.date"}>Date</Trans></option>
                                        <option value="datetime"><Trans i18nKey={"field.datetime"}>Date / Heure</Trans>
                                        </option>
                                        <option value="file"><Trans i18nKey={"field.file"}>Fichier</Trans>
                                        </option>
                                        <option value="email"><Trans i18nKey={"field.email"}>Email</Trans></option>
                                        <option value="phone"><Trans i18nKey={"field.phone"}>Téléphone</Trans></option>
                                        <option value="url"><Trans i18nKey={"field.url"}>URL</Trans></option>
                                        <option value="color"><Trans i18nKey={"field.color"}>Couleur</Trans></option>
                                        <option value="code"><Trans i18nKey={"field.code"}>Code</Trans></option>
                                        <option value="calculated"><Trans i18nKey={"field.calculated"}>Calculated
                                            data</Trans></option>
                                        <option value="cronSchedule"><Trans i18nKey={"field.cronSchedule"}>Task
                                            schedule</Trans></option>
                                        {/* Ajoutez d'autres types de champs ici */}
                                    </select>
                                </>
                            )}
                        </div>}
                    </div>
                </div>

                    {field.type === 'calculated' && (
                        <>
                            <CalculationBuilder
                                // Clé : Assurez-vous que modelName est utilisé si model n'existe pas (nouveau modèle)
                                key={`${model?.name || modelName}-${field.name}-calc`}
                                // Prop AJOUTÉE : Nom du modèle en cours de création/modification
                                currentModelName={model?.name}
                                // Champs disponibles du modèle actuel (on filtre le champ calculé lui-même)
                                availableFields={fields.filter(f => f.name !== field.name)}
                                // Tous les modèles (pour les relations)
                                models={models} // Vient de useModelContext(), semble correct
                                initialSteps={field.calculation?.steps || []}
                                onCalculationChange={(calc) => {
                                    const newFields = [...fields];
                                    newFields[index].calculation = calc; // 'index' est l'index du champ calculé dans 'fields'
                                    setFields(newFields);
                                }}
                            />
                        </>
                    )}
                    {field.type === "relation" && (

                        <div className="flex flex-no-wrap">
                            {hint('modelcreator.relationFilter.hint')}
                            <label className="checkbox-label flex flex-1"><Trans
                                i18nKey={"modelcreator.relationFilter"}>Filtre</Trans> :
                                <input
                                    type="checkbox"
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    checked={field.relationFilter !== undefined}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        if (e.target.checked) {
                                            newFields[index].relationFilter = null;
                                        } else {
                                            delete newFields[index].relationFilter;
                                        }
                                        setFields(newFields);
                                    }}
                                />
                            </label>
                        </div>)}


                    {field.relationFilter !== undefined && Array.isArray(models) && (
                        <div className={"condition-details flex flex-start"}>
                            <ConditionBuilder
                                modelFields={models.find(f => f.name === field.relation)?.fields || []}
                                model={field.relation}
                                models={models}
                                selectableModels={false}
                                initialValue={field.relationFilter}
                                onChange={(newCondition) => {
                                    const newFields = [...fields];
                                    newFields[index].relationFilter = newCondition || {};
                                    setFields(newFields);
                                }}
                            />
                        </div>
                    )}

                    {(field.itemsType || field.type) === 'file' && (
                        <>
                            <div className={"flex"}>
                                {hint('modelcreator.mimeTypes.hint')}
                                <label className={"flex"}>
                                    <Trans i18nKey={"modelcreator.mimeTypes"}>Types de fichiers
                                        acceptés
                                        :</Trans>
                                    <input
                                        type="text"
                                        value={field.mimeTypes}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        placeholder={t('modelcreator.field.mimeTypes.ph', "image/png, image/jpeg...")}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].mimeTypes = e.target.value.split(',').map(m => m.trim());
                                            setFields(newFields);
                                        }}
                                    />
                                </label></div>
                        </>
                    )}

                    {['string', 'string_t'].includes(field.itemsType || field.type) && (
                        <>
                            <div className="flex flex-no-wrap">
                                {hint('modelcreator.multiline.hint')}
                                <div className={"checkbox-label flex flex-1"}>
                                    <CheckboxField
                                        label={<Trans i18nKey={"modelcreator.multiline"}>Multi-lignes :</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.multiline}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].multiline = e;
                                            setFields(newFields);
                                        }}
                                        help={field.multiline && t('modelcreator.multiline.hint')}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {['string', 'string_t', 'richtext', 'richtext_t', 'email', 'phone', 'url', 'password', 'code'].includes(field.itemsType || field.type) && (
                        <>
                            <div className={"flex flex-no-wrap"}>
                                {hint('modelcreator.maxlength.hint')}
                                <label className={"flex flex-1"}>
                                    <Trans i18nKey={"modelcreator.maxlength"}>Longueur
                                        maximale :</Trans>
                                    <NumberField
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        step={1}
                                        min={0}
                                        className={"flex-1"}
                                        value={field.maxlength}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            const val = parseInt(e, 10);
                                            if (!val)
                                                newFields[index].maxlength = undefined;
                                            else
                                                newFields[index].maxlength = val;
                                            setFields(newFields);
                                        }}
                                    />
                                </label>
                            </div>
                        </>
                    )}
                    {(field.itemsType || field.type) === 'number' && (
                        <>
                            <div className={"flex flex-no-wrap field-bg"}>
                                {hint('modelcreator.precision.hint')}
                                <div className="flex-1"><NumberField
                                    label={<Trans
                                        i18nKey={"modelcreator.precision"}>Précision :</Trans>}
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    value={field.step || 1}
                                    step={0.1}
                                    className={"flex-1"}
                                    placeholder={t('modelcreator.field.step.ph', "Précision (1, 0.1...)")}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        newFields[index].step = e.target.value;//.replace('.', ','));
                                        setFields(newFields);
                                    }}
                                />
                                </div>
                            </div>
                            <div className="flex flex-no-wrap field-bg">
                                {hint('modelcreator.unit.hint')}
                                <div className="flex-1"><TextField
                                    label={<Trans
                                        i18nKey={"modelcreator.unit"}>Unité :</Trans>}
                                    type="string"
                                    className={"flex-1"}
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    value={field.unit}
                                    placeholder={t('modelcreator.field.unit.ph', "€, cm, kg...")}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        newFields[index].unit = e.target.value;
                                        setFields(newFields);
                                    }}
                                /></div>
                            </div>
                            <div className="flex flex-no-wrap">
                                {hint('modelcreator.delay.hint')}
                                <div className="checkbox-label flex flex-1">
                                    <CheckboxField
                                        label={<Trans i18nKey={"modelcreator.delay"}>Délai ?</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.delay}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].delay = e;
                                            setFields(newFields);
                                        }}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    {(field.itemsType || field.type) === "relation" && (
                        <div className="flex flex-no-wrap">
                            {hint('modelcreator.multiple.hint')}
                            <div className="checkbox-label flex flex-1">
                                <CheckboxField
                                    label={<Trans i18nKey={"modelcreator.multiple"}>Multiple :</Trans>}
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    checked={field.multiple}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        newFields[index].multiple = e;
                                        setFields(newFields);
                                    }}
                                /></div>
                        </div>)}

                    {(field.itemsType || field.type) === "enum" && (
                        <div className="values">
                            <p><Trans i18nKey={"modelcreator.enumValues"}>Valeurs possibles
                                :</Trans></p>
                            <Draggable items={field.items} renderItem={(v, i) => {
                                return <div className="flex flex-no-wrap">
                                    <ValueField v={v}
                                                disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                                setValue={(value) => {
                                                    const newFields = [...fields];
                                                    newFields[index].items[i] = value;
                                                    setFields(newFields);
                                                }}/>
                                    <button type="button"
                                            onClick={() => handleRemoveValue(index, i)}>
                                        <FaMinus/>
                                    </button>
                                </div>
                            }} onChange={(arr) => {
                                const newFields = [...fields];
                                newFields[index].items = arr;
                                setFields(newFields);
                            }}/>
                            <button type="button" onClick={() => handleAddValue(index)}><FaPlus/>
                            </button>
                        </div>
                    )}

                    <details className="advanced-options-details">
                        <summary>
                            <Trans i18nKey={"modelcreator.advancedOptions"}>Advanced options</Trans>
                        </summary>
                        <>

                            <div className="flex flex-no-wrap">
                                {hint('modelcreator.required.hint')}
                                <div className="checkbox-label flex flex-1">
                                    <CheckboxField
                                        label={<Trans i18nKey={"modelcreator.required"}>Requis :</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.required}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].required = e;
                                            setFields(newFields);
                                        }}
                                        help={field.required && t('modelcreator.required.hint')}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-no-wrap">
                                {hint('modelcreator.unique.hint')}
                                <div className="checkbox-label flex flex-1">

                                    <CheckboxField
                                        label={<Trans i18nKey={"modelcreator.unique"}>Unique :</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.unique}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].unique = e;
                                            setFields(newFields);
                                        }}
                                        help={field.unique && t('modelcreator.unique.hint')}
                                    />
                                </div>
                            </div>

                            {!['file', 'relation', 'array', 'calculated'].includes(field.type) && (<div
                                className="flex flex-no-wrap mg-item">

                                {['string_t', 'string', 'richtext', 'password', 'url', 'phone', 'email'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}
                                    <div className="flex flex-1 field-bg">
                                        <TextField
                                            className="flex-1"
                                            value={field.default}
                                            label={<Trans i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans>}
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].default = e.target.value;
                                                setFields(newFields);
                                            }}
                                        />
                                    </div>
                                </>)}
                                {['number'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}
                                    <div className="flex flex-1 field-bg">
                                    <NumberField
                                        label={<Trans i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans>}
                                        type="number"
                                        className="flex-1"
                                        value={field.default}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            const val = parseInt(e.target.value, 10);
                                            if (!val)
                                                newFields[index].default = undefined;
                                            else
                                                newFields[index].default = val;
                                            setFields(newFields);
                                        }}
                                    />
                                    </div>
                                </>)}
                                {['enum'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}
                                    <div className="flex flex-1 field-bg">
                                    <SelectField
                                        label={<Trans i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans>}
                                        value={field.default}
                                        className="flex-1"
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        items={(field.items || []).map(m => ({label: t(m, m), value: m}))}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].default = e.value;
                                            setFields(newFields);
                                        }}
                                    /></div>
                                </>)}
                                {['code'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}
                                    <div className="flex flex-1 field-bg">
                                    <CodeField
                                        label={<Trans i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans>}
                                        value={field.language === 'json' ? JSON.stringify(field.default, 2, null) : field.default}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].default = e.value;
                                            setFields(newFields);
                                        }}
                                    />
                                    </div>
                                </>)}
                                {['boolean'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}
                                    <div className="checkbox-label flex flex-1">
                                        <CheckboxField
                                            label={<Trans i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans>}
                                            checked={field.default}
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].default = e;
                                                setFields(newFields);
                                            }}
                                        />
                                    </div>
                                </>)}
                                {['color'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}
                                    <div className="flex flex-1 field-bg">
                                    <ColorField
                                        label={<Trans i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans>}
                                        value={field.default || null} name={field.name}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        onChange={(e) => {
                                            const newFields = [...fields];

                                            newFields[index].default = e.value;
                                            setFields(newFields);
                                        }}
                                    />
                                    </div>
                                </>)}
                                {['date', 'datetime'].includes(field.type) && (<>
                                    {hint('modelcreator.default.hint')}

                                    <div className="flex flex-1 field-bg">
                                    <label className="flex flex-1">
                                        <span className={"flex-1"}><Trans  i18nKey={"modelcreator.default"}>Valeur par défaut :</Trans></span>
                                        <input
                                            value={field.default}
                                            className="flex-1"
                                            type={field.type === 'date' ? 'date' : 'datetime-local'}
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].default = e.target.value;
                                                setFields(newFields);
                                            }}
                                        />
                                    </label>
                                    </div>
                                </>)}
                            </div>)}


                            {field.type === 'number' && (
                                <>
                                    <div
                                    className="flex flex-no-wrap mg-item">{hint('modelcreator.min.hint')}
                                    <div className="flex field-bg flex-1">
                                            <NumberField
                                            label={<Trans
                                                className={"flex-1"}
                                                i18nKey={"modelcreator.min"}>Valeur minimale :</Trans>}
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            value={(field.min + '').replace('.', ',')}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].min = parseInt(e.target.value, 10);
                                                setFields(newFields);
                                            }}
                                        />
                                    </div>
                                    </div>
                                    <div
                                        className="flex flex-no-wrap mg-item">{hint('modelcreator.max.hint')}
                                        <div className="flex field-bg flex-1">
                                            <NumberField
                                                label={<Trans
                                                    className={"flex-1"}
                                                    i18nKey={"modelcreator.max"}>Valeur maximale :</Trans>}
                                                disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                                value={(field.max + '').replace('.', ',')}
                                                onChange={(e) => {
                                                    const newFields = [...fields];
                                                    newFields[index].max = parseInt(e.target.value, 10);
                                                    setFields(newFields);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {(['datetime', 'date'].includes(field.itemsType || field.type)) && (
                                <>
                                    <div className="flex flex-no-wrap mg-item">
                                        {hint('modelcreator.min.hint')}
                                        <label className={"flex-1"}><Trans i18nKey={"modelcreator.min"}>Valeur minimale :</Trans></label>
                                        <div className="flex flex-1 field-bg "><input
                                            className={"flex-1"}
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            type={field.type === 'datetime' ? 'datetime-local' : field.type}
                                            value={field.type === "number" ? (field.min + '').replace('.', ',') : field.min}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                if (['datetime', 'date'].includes(field.itemsType || field.type)) {
                                                    newFields[index].min = e.target.value;
                                                } else {
                                                    newFields[index].min = parseInt(e.target.value, 10);
                                                }
                                                setFields(newFields);
                                            }}
                                        /></div>
                                    </div>

                                    <div className="flex flex-no-wrap mg-item">
                                        {hint('modelcreator.max.hint')}
                                        <label className={"flex-1"}><Trans i18nKey={"modelcreator.max"}>Valeur maximale :</Trans></label>
                                        <div className="flex flex-1 field-bg "><input
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            type={field.type === 'datetime' ? 'datetime-local' : field.type}
                                            value={field.type === "number" ? (field.max + '').replace('.', ',') : field.max}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                if (['datetime', 'date'].includes(field.itemsType || field.type)) {
                                                    newFields[index].max = e.target.value;
                                                } else {
                                                    newFields[index].max = parseInt(e.target.value, 10);
                                                }
                                                setFields(newFields);
                                            }}
                                        /></div>
                                    </div>
                                </>
                            )}
                            <div className="flex flex-no-wrap mg-item">
                                {hint('modelcreator.condition.hint')}

                                    <CheckboxField
                                        label={<Trans
                                            i18nKey={"modelcreator.condition"}>Condition</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.condition !== undefined}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            if (e) {
                                                newFields[index].condition = null;
                                            } else {
                                                delete newFields[index].condition;
                                            }
                                            setFields(newFields);
                                        }}
                                    />
                            </div>
                            {field.condition !== undefined && (
                                <div className={"condition-details flex flex-start"}>

                                    <p>{t('modelcreator.condition.hint')}</p>
                                    <ConditionBuilder key="test"
                                                      onChange={(newCondition) => {
                                                          const newFields = [...fields];
                                                          newFields[index].condition = newCondition || {};
                                                          setFields(newFields);
                                                      }} initialValue={field.condition || {}}
                                                      model={model} models={models}/>

                                </div>
                            )}
                            {field.type === 'code' && (<>
                                <div className="flex">
                                    {hint('modelcreator.language.hint')}
                                    <label className="checkbox-label flex flex-1">
                                        <Trans i18nKey={"modelcreator.language"}>Language :</Trans>
                                        <TextField placeholder={"json, javascript..."}
                                                   value={field.language}
                                                   onChange={e => {
                                                       const newFields = [...fields];
                                                       newFields[index].language = e.target.value;
                                                       setFields(newFields);
                                                   }}/>
                                    </label>
                                </div>
                                {field.language === 'json' && (<div className="flex flex-no-wrap">
                                    {hint('modelcreator.conditionBuilder.hint')}
                                    <label className="checkbox-label flex flex-1">
                                        <Trans i18nKey={"modelcreator.conditionBuilder"}>Condition Builder
                                            :</Trans>
                                        <input
                                            type="checkbox"
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            checked={field.conditionBuilder}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].conditionBuilder = e.target.checked ? true : undefined;
                                                setFields(newFields);
                                            }}
                                        />
                                    </label>
                                </div>)}

                            </>)}

                            {me.userPlan === 'premium' && (
                                <div className="flex flex-no-wrap"
                                     title={t('index_field_info', 'Améliore les performances sur la recherche mais demande un espace de stockage plus élevé et diminue les performances sur l\'insertion de données.')}>
                                    {hint('modelcreator.index.hint')}
                                    <label className="checkbox-label flex flex-1">
                                        <Trans i18nKey={"indexed_field"}>Champ indexé</Trans> :
                                        <input
                                            type="checkbox"
                                            disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                            checked={!!field.index}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].index = e.target.checked;
                                                setFields(newFields);
                                            }}
                                        />
                                    </label>
                                </div>)}


                            {mainFieldsTypes.includes(field.itemsType || field.type) && (<div
                                className="flex flex-no-wrap mg-item"
                                title={t("modelcreator.field.asMain", "Une information principale sera affichée dans le titre de l'enregistrement")}>
                                {hint('modelcreator.asMain.hint')}
                                <div className="flex flex-1">

                                    <CheckboxField
                                        label={<Trans i18nKey={"modelcreator.asMain"}>Information principale :</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.asMain}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].asMain = e;
                                            setFields(newFields);
                                        }}
                                        help={field.asMain && t('modelcreator.asMain.hint')}
                                    />
                                </div>
                            </div>)}

                            <div className="flex flex-row flex-stretch">
                                <div className="flex">
                                    {hint('modelcreator.description.hint')}
                                    <label className={"flex-1 field-bg"} htmlFor={`textarea-model-description${field.name}`}><Trans
                                        i18nKey={"modelcreator.fieldDesc"}>Description du champ :</Trans></label>
                                </div>
                                <div className="flex flex-1">
                                        <textarea id={`textarea-model-description${field.name}`}
                                                  disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                                  onChange={(e) => {
                                                      const newFields = [...fields];
                                                      newFields[index].hint = e.target.value;
                                                      setFields(newFields);
                                                  }}
                                                  defaultValue={field.hint || ''}/>
                                </div>
                            </div>


                            <label className="flex mg-item ">
                                {hint('modelcreator.color.hint')}
                                <Trans i18nKey={"field.color"}>Color :</Trans>
                                <ColorField
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    value={field.color || '#FFFFFF'}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        newFields[index].color = e.value;
                                        setFields(newFields);
                                    }}
                                />
                            </label>

                            <div className="flex flex-no-wrap">
                                {hint('modelcreator.hiddenable.hint')}
                                <div className="checkbox-label flex flex-1">

                                    <CheckboxField
                                        label={<Trans i18nKey={"modelcreator.hiddenable"}>Dissimulable :</Trans>}
                                        disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                        checked={field.hiddenable}
                                        onChange={(e) => {
                                            const newFields = [...fields];
                                            newFields[index].hiddenable = e;
                                            setFields(newFields);
                                        }}
                                        help={field.unique && t('modelcreator.hiddenable.hint')}
                                    />
                                </div>
                            </div>

                            <div className={"flex flex-no-wrap"}>
                                {hint('modelcreator.anonymized.hint')}
                                <CheckboxField
                                    label={<Trans i18nKey={"modelcreator.anonymized"}>Donnée anonymisée :</Trans>}
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    checked={field.anonymized}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        newFields[index].anonymized = e;
                                        setFields(newFields);
                                    }}
                                />
                            </div>


                            {false && (<label className="checkbox-label flex">
                                <Trans i18nKey={"modelcreator.locked"}>Locked :</Trans>
                                <input
                                    disabled={modelLocked || (isLocalUser(me) && field.locked)}
                                    type={"checkbox"}
                                    checked={field.locked}
                                    onChange={(e) => {
                                        const newFields = [...fields];
                                        newFields[index].locked = e.target.checked;
                                        setFields(newFields);
                                    }}
                                />
                            </label>)}
                        </>
                    </details>

                    <div className="flex actions">
                        <Button type="button" onClick={() => handleRemoveField(index)}>
                            <FaTrash/>
                        </Button>
                    </div>
                </div>

        </div>
    );
}

export default ModelCreatorField;