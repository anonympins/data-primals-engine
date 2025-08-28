
import React, {useState, useEffect, useRef} from 'react';
import {
    FaPlus,
    FaTrashAlt,
    FaProjectDiagram,
    FaChevronRight,
    FaCode,
    FaListAlt,
    FaMinusCircle,
    FaExchangeAlt
} from 'react-icons/fa';
import './ConditionBuilder.scss';
import { useTranslation, Trans } from "react-i18next";
import { CodeField } from "./Field.jsx";
import { useAuthContext } from "./contexts/AuthContext.jsx";
import {ConditionBuilder2} from "./ConditionBuilder2.jsx";
import {mongoOperators} from "./constants.js";
import {MONGO_CALC_OPERATORS} from "../../src/constants";

const getFieldDefinition = (fields, fieldName) => fields?.find(f => f.name === fieldName);
const getModelFields = (modelName, allModels, user) => {
    const model = allModels?.find(m => m.name === modelName && (m._user === user?.username || !m._user));
    return model?.fields || [];
};

const ConditionRow = ({ condition, onChange, onRemove, allModels, currentModel, user }) => {
    const { t } = useTranslation();
    const [showCalcEditor, setShowCalcEditor] = useState(!!condition.transform);

    const [fieldPath, setFieldPath] = useState(condition.path || []);
    const [operator, setOperator] = useState(condition.op || '$eq');
    const [value, setValue] = useState(condition.value ?? '');
    const [transform, setTransform] = useState(condition.transform || null);

    const modelFields = getModelFields(currentModel, allModels, user);


    const updatePath = (levelIndex, selectedField) => {
        const newPath = [...fieldPath.slice(0, levelIndex), selectedField];
        setFieldPath(newPath);
        setValue('');
        setTransform(null);
        onChange({ path: newPath, op: operator, value: '', transform: null });
    };

    const getFinalFieldDef = () => {
        let fields = modelFields;
        let def = null;
        for (let i = 0; i < fieldPath.length; i++) {
            def = getFieldDefinition(fields, fieldPath[i]);
            if (!def) return null;
            fields = def.type === 'relation' ? getModelFields(def.relation, allModels, user) : [];
        }
        return def;
    };

    useEffect(() => {
        const def = getFinalFieldDef();
        const newCondition = {
            path: fieldPath,
            op: operator,
            value,
            transform
        };

        // Si c'est une transformation pure sans opérateur, on nettoie la valeur
        if (transform && !operator) {
            newCondition.value = undefined;
        }

        // Comparaison profonde pour éviter les mises à jour inutiles
        const oldCondition = { path: condition.path || [], op: condition.op, value: condition.value, transform: condition.transform };
        if (JSON.stringify(newCondition) !== JSON.stringify(oldCondition)) {
            onChange(newCondition);
        }
    }, [operator, value, transform, fieldPath, condition.path, condition.op, condition.value, condition.transform, onChange]);


    const renderValueInput = () => {
        if (fieldPath.length === 0) return null;

        const def = getFinalFieldDef();
        const isDate = def?.type === 'date';
        const isDatetime = def?.type === 'datetime';
        const isBoolean = def?.type === 'boolean';
        const isEnum = def?.type === 'enum';
        const isNumber = def?.type === 'number';
        const isString = def?.type === 'string';

        // Si l'opérateur existe et n'est pas '$exists'
        if (operator && operator !== '$exists') {
            return (
                <div className="value-input-container">
                    {showCalcEditor ? (
                        <CalculationEditor
                            expr={transform || { op: '$add', args: [`$${fieldPath.join('.')}`] }}
                            onChange={(newTransform) => {
                                setTransform(newTransform);
                                if (!operator) setValue(undefined);
                            }}
                        />
                    ) : (
                        <input
                            placeholder={t('value', 'Valeur')}
                            value={value || ''}
                            onChange={(e) => setValue(e.target.value)}
                            className="condition-value-input"
                        />
                    )}
                    {/* Bouton pour basculer l'éditeur de calcul */}
                    <button type="button" onClick={() => setShowCalcEditor(!showCalcEditor)} title="Utiliser une expression calculée">
                        fx
                    </button>
                </div>
            );
        }
        if (operator === '$exists') {
            return (
                <select
                    value={String(value === true)}
                    onChange={(e) => setValue(e.target.value === 'true')}
                    className="condition-value-input"
                >
                    <option value="true">{t('exists', 'Existe')}</option>
                    <option value="false">{t('doesNotExist', 'N\'existe pas')}</option>
                </select>
            );
        }

        if (isEnum && def.items) {
            return (
                <select
                    value={value || ''}
                    onChange={(e) => setValue(e.target.value)}
                    className="condition-value-input"
                >
                    <option value="">{t('selectValue', 'Choisir une valeur...')}</option>
                    {def.items.map(item => (
                        <option key={item} value={item}>{t(item, item)}</option>
                    ))}
                </select>
            );
        }

        if (isBoolean) {
            return (
                <select
                    value={String(value === true)}
                    onChange={(e) => setValue(e.target.value === 'true')}
                    className="condition-value-input"
                >
                    <option value="true">{t('true', 'Vrai')}</option>
                    <option value="false">{t('false', 'Faux')}</option>
                </select>
            );
        }

        if (isDate || isDatetime || isNumber || isString) {
            return (
                <>
                    <CalculationEditor
                        expr={transform || { op: '$add', args: [`$${fieldPath.join('.')}`] }}
                        onChange={(newTransform) => {
                            setTransform(newTransform);
                            // Effacer la valeur si c'est une transformation pure
                            if (!operator) {
                                setValue(undefined);
                            }
                        }}
                    />
                    {operator && operator !== '$exists' && (
                        <input
                            placeholder={t('value', 'Valeur')}
                            value={value || ''}
                            onChange={(e) => setValue(e.target.value)}
                            className="condition-value-input"
                        />
                    )}
                </>
            );
        }

        return (
            <input
                placeholder={t('value', 'Valeur')}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="condition-value-input"
            />
        );
    };
    const renderFieldSelectors = () => {
        const selectors = [];
        let currentFieldsForLevel = modelFields;

        for (let i = 0; ; i++) {
            const currentPathSegment = fieldPath[i] || '';
            if (!currentFieldsForLevel || currentFieldsForLevel.length === 0) break;

            selectors.push(
                <span key={i} className="field-selector">
                    {i > 0 && <FaChevronRight className="path-separator" />}
                    <select
                        value={currentPathSegment}
                        onChange={(e) => updatePath(i, e.target.value)}
                        className="condition-field-select"
                    >
                        <option value="">{t('selectField', 'Champ...')}</option>
                        <option value="_id">_id</option>
                        {currentFieldsForLevel.map(f => (
                            <option key={f.name} value={f.name}>
                                {t(`field_${currentModel}_${f.name}`, f.name)}
                                {f.type === 'relation' ? ' (...)' : ''}
                            </option>
                        ))}
                    </select>
                </span>
            );

            if (!currentPathSegment) break;
            const fieldDef = getFieldDefinition(currentFieldsForLevel, currentPathSegment);
            if (fieldDef?.type === 'relation') {
                currentFieldsForLevel = getModelFields(fieldDef.relation, allModels, user);
            } else {
                currentFieldsForLevel = [];
            }
        }
        return selectors;
    };
    return (
        <div className="condition-node condition-simple">
            {renderFieldSelectors()}
            {fieldPath.length > 0 && (
                <>
                    <select
                        value={operator || ''}
                        onChange={(e) => {
                            setOperator(e.target.value || undefined);
                            if (!e.target.value) {
                                setValue(undefined);
                            }
                        }}
                        className="condition-operator-select"
                    >
                        <option value="">{t('noComparison', 'Transformation seule')}</option>
                        {mongoOperators.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    {renderValueInput()}
                </>
            )}
            <button onClick={onRemove} className="delete-button" title={t('conditionBuilder.deleteCondition')}>
                <FaTrashAlt />
            </button>
        </div>
    );
};
const ConditionGroup = ({ node, onChange, allModels, currentModel, user }) => {
    const { t } = useTranslation();
    const [type, setType] = useState(node.$and ? '$and' : '$or');
    const [children, setChildren] = useState(node[type] || []);

    useEffect(() => {
        onChange({ [type]: children });
    }, [type, children]);

    const updateChild = (index, newChild) => {
        const newChildren = [...children];
        newChildren[index] = newChild;
        setChildren(newChildren);
    };

    const removeChild = (index) => {
        setChildren(children.filter((_, i) => i !== index));
    };

    const addCondition = () => {
        gtag('event', '[cb] add condition');
        setChildren([...children, { path: [], op: '$eq', value: '' }]);
    };

    const addGroup = (groupType) => {
        gtag('event', '[cb] add group');
        setChildren([...children, { [groupType]: [] }]);
    };

    return (
        <div className={`condition-node condition-group ${type === '$and' ? 'condition-and' : 'condition-or'}`}>
            <div className="group-header">
                <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="$and">{t('conditionBuilder.logical.and', 'ET')}</option>
                    <option value="$or">{t('conditionBuilder.logical.or', 'OU')}</option>
                </select>
            </div>
            <div className="group-content">
                {children.map((child, index) => (
                    child.path ? (
                        <ConditionRow
                            key={index}
                            condition={child}
                            onChange={(updated) => updateChild(index, updated)}
                            onRemove={() => removeChild(index)}
                            allModels={allModels}
                            currentModel={currentModel}
                            user={user}
                        />
                    ) : (
                        <ConditionGroup
                            key={index}
                            node={child}
                            onChange={(updated) => updateChild(index, updated)}
                            allModels={allModels}
                            currentModel={currentModel}
                            user={user}
                        />
                    )
                ))}
                <div className="add-buttons">
                    <button type={"button"} onClick={addCondition}><FaPlus /> <Trans i18nKey="addCondition">Condition</Trans></button>
                    <button type={"button"} onClick={() => addGroup('$and')}><FaProjectDiagram /> <Trans i18nKey="conditionBuilder.andGroup">Groupe ET</Trans></button>
                    <button type={"button"} onClick={() => addGroup('$or')}><FaProjectDiagram /> <Trans i18nKey="conditionBuilder.orGroup">Groupe OU</Trans></button>
                </div>
            </div>
        </div>
    );
};

const CalculationEditor = ({ expr, onChange }) => {
    const { t } = useTranslation();
    const [currentOp, setCurrentOp] = useState(expr?.op || '$add');
    const [args, setArgs] = useState(expr?.args || []);
    const isConstant = currentOp === '$const';
    const isConverter = MONGO_CALC_OPERATORS[currentOp]?.converter;

    useEffect(() => {
        if (isConstant && args.length === 0) {
            setArgs(['']); // Initialiser avec une valeur vide pour les constantes
        }
        onChange?.({ op: currentOp, args });
    }, [currentOp, args]);

    const updateArg = (index, value) => {
        const updated = [...args];
        updated[index] = value;
        setArgs(updated);
    };

    const addArg = () => {
        if (isConstant) return; // Pas d'ajout d'argument pour les constantes
        setArgs([...args, '']);
    };

    const removeArg = (index) => {
        if (isConstant) return; // Pas de suppression pour les constantes
        setArgs(args.filter((_, i) => i !== index));
    };

    const toggleArgType = (index) => {
        const arg = args[index];
        const isObject = typeof arg === 'object' && arg !== null;

        if (isObject) {
            // Convertir en valeur simple
            updateArg(index, '');
        } else {
            // Convertir en expression (par défaut $add)
            updateArg(index, { op: '$add', args: [arg || ''] });
        }
    };

    const renderConstantInput = () => {
        const value = args[0] ?? '';
        return (
            <div className="constant-input">
                <select
                    value={typeof value}
                    onChange={(e) => {
                        // Convertir le type de la constante
                        const newValue = e.target.value === 'boolean' ? true :
                            e.target.value === 'number' ? 0 : '';
                        updateArg(0, newValue);
                    }}
                >
                    <option value="string">String</option>
                    <option value="number">Nombre</option>
                    <option value="boolean">Booléen</option>
                </select>

                {typeof value === 'boolean' ? (
                    <select
                        value={String(value)}
                        onChange={(e) => updateArg(0, e.target.value === 'true')}
                    >
                        <option value="true">Vrai</option>
                        <option value="false">Faux</option>
                    </select>
                ) : (
                    <input
                        type={typeof value === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => {
                            const val = typeof value === 'number' ?
                                Number(e.target.value) : e.target.value;
                            updateArg(0, val);
                        }}
                        placeholder="Valeur constante"
                    />
                )}
            </div>
        );
    };

    const renderArgInput = (arg, index) => {
        const isObject = typeof arg === 'object' && arg !== null;

        return isObject ? (
            <div className="nested-calc-editor">
                <CalculationEditor
                    expr={arg}
                    onChange={(val) => updateArg(index, val)}
                />
                <div className="arg-actions">
                    <button
                        type="button"
                        onClick={() => toggleArgType(index)}
                        className="icon-btn"
                        title={t('convertToValue', 'Convertir en valeur simple')}
                    >
                        <FaCode />
                    </button>
                    <FaMinusCircle
                        onClick={() => removeArg(index)}
                        className="icon-btn"
                        title={t('removeArg', 'Supprimer cet argument')}
                    />
                </div>
            </div>
        ) : (
            <div className="simple-arg">
                <input
                    placeholder={t('value', 'Valeur')}
                    value={arg}
                    onChange={(e) => updateArg(index, e.target.value)}
                />
                <div className="arg-actions">
                    <button
                        type="button"
                        onClick={() => toggleArgType(index)}
                        className="icon-btn"
                        title={t('convertToExpression', 'Convertir en expression')}
                    >
                        <FaProjectDiagram />
                    </button>
                    <FaMinusCircle
                        onClick={() => removeArg(index)}
                        className="icon-btn"
                        title={t('removeArg', 'Supprimer cet argument')}
                    />
                </div>
            </div>
        );
    };

    useEffect(() => {
        if ((isConverter || isConstant) && args.length === 0) {
            setArgs(['']); // Initialiser avec une valeur vide
        }
        onChange?.({ op: currentOp, args });
    }, [currentOp, args]);


    const renderConverterInput = () => {
        return (
            <div className="converter-input">
                {args[0] && typeof args[0] === 'object' && args[0].op ? (
                    <CalculationEditor
                        expr={args[0]}
                        onChange={(val) => updateArg(0, val)}
                    />
                ) : (
                    <input
                        placeholder="Expression ou valeur"
                        value={args[0] || ''}
                        onChange={(e) => updateArg(0, e.target.value)}
                    />
                )}
                <button
                    type="button"
                    onClick={() => toggleArgType(0)}
                    className="icon-btn"
                    title={t('toggleArgType', 'Basculer entre valeur et expression')}
                >
                    <FaExchangeAlt />
                </button>
            </div>
        );
    };
    return (
        <div className="calc-editor">
            <select
                value={currentOp}
                onChange={(e) => {
                    setCurrentOp(e.target.value);
                    const isNewConverter = MONGO_CALC_OPERATORS[e.target.value]?.converter;
                    if (isNewConverter || e.target.value === '$const') {
                        setArgs(['']);
                    }
                }}
                className="calc-operator-select"
            >
                <option value="$const">Constante</option>
                <optgroup label="Conversions">
                    <option value="$toBool">toBool</option>
                    <option value="$toString">toString</option>
                    <option value="$toInt">toInt</option>
                    <option value="$toDouble">toDouble</option>
                </optgroup>
                <optgroup label="Opérations">
                    {Object.entries(MONGO_CALC_OPERATORS)
                        .filter(([_, def]) => !def.converter)
                        .map(([key, def]) => (
                            <option key={key} value={key}>{def.label}</option>
                        ))}
                </optgroup>
            </select>

            {isConstant ? (
                renderConstantInput()
            ) : isConverter ? (
                renderConverterInput()
            ) : (
                <>
                    <div className="calc-args">
                        {args.map((arg, index) => (
                            <div key={index} className="calc-arg-wrapper">
                                {renderArgInput(arg, index)}
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addArg}
                        className="add-arg-button"
                        disabled={isConstant || isConverter}
                    >
                        <FaPlus /> {t('addArg', 'Ajouter un argument')}
                    </button>
                </>
            )}
        </div>
    );
};

const ConditionBuilder = ({ initialValue = null, onChange, models, model = null, label = null}) => {
    const { t } = useTranslation();
    const [root, setRoot] = useState(initialValue);
    const [showJsonEditor, setShowJsonEditor] = useState(false);
    const [jsonError, setJsonError] = useState('');
    const { me:user } = useAuthContext()

    const handleJsonChange = (e) => {
        const p = typeof(e.value) === 'string' ? JSON.parse(e.value) : e.value;
        setRoot(p);
        onChange(p);
    };
    useEffect(() => {
        let parsedValue = {}; // Valeur par défaut si tout échoue

        if (typeof initialValue === 'string' && initialValue.trim().startsWith('{')) {
            try {
                // Tenter de parser la chaîne en objet JSON
                parsedValue = JSON.parse(initialValue);
            } catch (e) {
                console.error("ConditionBuilder: Impossible de parser la chaîne JSON initialValue.", initialValue, e);
                parsedValue = {}; // Revenir à un état sûr en cas d'erreur
            }
        } else if (typeof initialValue === 'object' && initialValue !== null) {
            // Si c'est déjà un objet, on le prend tel quel
            parsedValue = initialValue;
        }

        setRoot(parsedValue);
    }, [initialValue]); // <-- Très important : réagir aux changements de la prop


    return (
        <div className="condition-builder">
            {label && <label>{label}</label>}
            <button type="button" onClick={() => {
                setShowJsonEditor(!showJsonEditor);
                gtag('event', '[cb] show ' + (showJsonEditor ? 'CB' : 'JSON'));
            }} className="condition-builder-toggle-view">
                {showJsonEditor ? <FaListAlt title={t('conditionBuilder.showBuilderTooltip', 'Afficher le constructeur')} /> : <FaCode title={t('conditionBuilder.showJsonTooltip', 'Afficher le JSON')} />}
            </button>
            {showJsonEditor ? (
                <div className="condition-builder-json">
                    <CodeField
                        name="conditionJsonEditor"
                        language="json"
                        value={JSON.stringify(root, null, 2)}
                        onChange={handleJsonChange}
                    />
                    {jsonError && <p className="condition-builder-json-error">{jsonError}</p>}
                </div>
            ) : (
                <ConditionBuilder2
                    initialValue={root}
                    onChange={onChange}
                    models={models}
                    model={model}
                />
            )}
        </div>
    );
};

export default ConditionBuilder;