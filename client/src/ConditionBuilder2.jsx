import React, {useEffect, useState} from 'react';
import { Tooltip } from 'react-tooltip';
import {FaPlus, FaProjectDiagram, FaTrash, FaInfoCircle, FaEdit, FaTags, FaCalendarAlt} from 'react-icons/fa';
import { Trans } from 'react-i18next';
import {convertInputValue, MONGO_CALC_OPERATORS} from "./filter.js";
import i18n from "i18next";
import {FaRepeat} from "react-icons/fa6";
import {useAuthContext} from "./contexts/AuthContext.jsx";


// Déterminer si le champ doit être une date
const isDateArg = (operator, argIndex) => {
    if (!operator) return false;

    const opConfig = MONGO_CALC_OPERATORS[operator];
    if (!opConfig) {
        console.warn(`Opérateur non trouvé: ${operator}`);
        return false;
    }

    // Cas spécial pour les opérateurs de date
    if (operator === '$dateAdd' || operator === '$dateSubtract' ||
        operator === '$dateDiff' || operator === '$dateToString') {
        return true;
    }

    // Pour les autres opérateurs marqués isDate (comme $hour, $second, etc.)
    if (opConfig.isDate) {
        return true; // Tous les arguments sont des dates pour ces opérateurs
    }

    return false;
};


const OperatorSelector = ({ onSelect }) => {
    const [search, setSearch] = useState('');

    const filteredOps = Object.entries(MONGO_CALC_OPERATORS)
        .filter(([key, config]) =>
            key.toLowerCase().includes(search.toLowerCase()) ||
            config.label.toLowerCase().includes(search.toLowerCase())
        );

    return (
        <div className="operator-selector">
            <input
                type="text"
                placeholder={i18n.t("cb.searchOperator")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
            />
            <div className="operator-list">
                {filteredOps.map(([key, config]) => (
                    <div
                        key={'ol'+key}
                        className="operator-item"
                        onClick={() => onSelect(key)}
                        data-tooltip-id="op-tooltip"
                        data-tooltip-content={config.description}
                    >
                        <span className="op-key">{key}</span>
                        <span className="op-label">{config.label}</span>
                    </div>
                ))}
            </div>
            <Tooltip id="op-tooltip" />
        </div>
    );
};

const ExpressionField = ({ value, onChange, path = [], fieldNames, isRoot = false, models = [], currentModelFields = [], isInFindContext = false }) => {
    const [editing, setEditing] = useState(false);
    const [currentValue, setCurrentValue] = useState(value);
    useEffect(() => {
        setCurrentValue(value);
    }, [value]);


    const openDoc =(op) =>{
        window.open(`https://www.mongodb.com/docs/manual/reference/operator/aggregation/${op}`, '_blank');
    }

    const handleOperatorSelect = (operator) => {
        const opConfig = MONGO_CALC_OPERATORS[operator];
        let newValue;
        if (operator === '$find') {
            // Cas spécial pour créer un $find au niveau racine dans un champ
            const newValue = { "": { "$find": { "$eq": ["", ""] } } };
            onChange(newValue, path);
            setCurrentValue(newValue);
            setEditing(false);
            return;
        }
        if (operator === '$and' || operator === '$or' || operator === '$not' || operator === '$nor') {
            // Cas spécial pour les opérateurs logiques - conserve la structure existante si possible
            if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
                const existingKey = Object.keys(currentValue)[0];
                if (existingKey === '$and' || existingKey === '$or' || existingKey === '$not' || existingKey === '$nor') {
                    // Si on transforme un opérateur logique en un autre, on garde le contenu
                    newValue = { [operator]: currentValue[existingKey] };
                } else {
                    // Sinon, on crée une nouvelle structure avec l'opérateur logique
                    newValue = { [operator]: [currentValue] };
                }
            } else {
                // Par défaut, création d'une nouvelle structure logique
                newValue = { [operator]: [{ $eq: ["", ""] }] };
            }
        }else if (operator === '$find') {
            // Cas spécial pour $find qui prend une expression de recherche
            newValue = { [operator]: { $eq: ["", ""] } };
        }else if (operator === '$regexMatch') {
            // Structure spéciale pour $regexMatch
            newValue = {
                [operator]: {
                    input: "",
                    regex: ""
                }
            };
        } else if (opConfig.specialStructure) {
            if (opConfig.args) {
                // Initialiser seulement les champs obligatoires
                const initialArgs = {};
                opConfig.args.forEach(arg => {
                    if (!arg.optional) {
                        initialArgs[arg.name] = arg.type === 'select' ? (arg.options[0] || '') : '';
                    }
                });
                newValue = { [operator]: initialArgs };
            } else {
                newValue = { [operator]: {} };
            }
        } else if (opConfig.converter || (!opConfig.multi && !opConfig.args)) {
            newValue = { [operator]: "" };
        } else {
            // Nouvelle logique qui prend en compte args et multi
            if (opConfig.args) {
                // Cas où on a un nombre fixe d'arguments
                const argsArray = Array(opConfig.args).fill("");
                newValue = { [operator]: argsArray };
            } else if (opConfig.multi) {
                // Cas multi-arguments (tableau avec un élément par défaut)
                newValue = { [operator]: [""] };
            } else {
                // Cas mono-argument (valeur directe)
                newValue = { [operator]: "" };
            }
        }

        gtag('event', '[cb] operator ' + operator);
        onChange(newValue, path);
        setCurrentValue(newValue);
        setEditing(false);
    };

    const renderArgument = (arg, index, parentOperator, args) => {
        const isSimpleValue = typeof arg !== 'object' || arg === null || Array.isArray(arg);
        const parentOpConfig = MONGO_CALC_OPERATORS[parentOperator];
        // Fonction pour mettre à jour cet argument spécifique
        const handleArgChange = (newArgValue) => {
            const updatedArgs = [...args];

            gtag('event', '[cb] advanced');
            updatedArgs[index] = newArgValue;
            onChange({ [parentOperator]: updatedArgs }, path);
        };

        // Fonction pour supprimer cet argument
        const removeArgument = () => {
            // Vérifier si args est un tableau avant de tenter de le modifier
            if (!Array.isArray(args)) {
                console.error("Impossible de supprimer - args n'est pas un tableau", args);
                return;
            }

            const updatedArgs = [...args]; // Crée une copie du tableau
            updatedArgs.splice(index, 1); // Supprime l'élément

            // Si c'est le dernier argument, on supprime complètement
            if (updatedArgs.length === 0) {
                onChange(null, path); // Demande de suppression
            } else {
                onChange({ [parentOperator]: updatedArgs }, path);
            }
        };
        return (
            <div key={`arg-${index}`} className="expression-arg">
                <div className="arg-content">
                    {isSimpleValue ? (
                        // Cas 1: C'est une valeur simple (texte, nombre, $champ)
                        <div className="simple-value-container">
                            <FieldInput
                                value={arg}
                                onChange={(newValue) => {
                                    const updatedArgs = [...args];
                                    updatedArgs[index] = newValue;
                                    onChange({ [parentOperator]: updatedArgs }, path);
                                }}
                                isDate={isDateArg(path[path.length - 1], 0)} // Utilis
                                fieldNames={fieldNames}
                                isInFindContext={isInFindContext}
                            />
                            {!parentOpConfig?.disableAdvancedValue && !isDateArg(path[path.length -1]) && (<button
                                type="button"
                                className="switch-to-expr"
                                onClick={() => handleArgChange({ $eq: [arg, ""] })}
                                title={i18n.t("cb.convertToExpression")}
                            >
                                <FaProjectDiagram />
                            </button>)}
                            <button
                                type="button"
                                onClick={removeArgument}
                                className="remove-arg"
                                title={i18n.t("cb.deleteArgument")}
                            >
                                <FaTrash/>
                            </button>
                        </div>
                    ) : (
                        // Cas 2: C'est une expression imbriquée
                        <ExpressionField
                            value={arg}
                            onChange={handleArgChange}
                            fieldNames={fieldNames}
                            path={[...path, parentOperator, index]}
                            currentModelFields={currentModelFields}
                            models={models}
                        />
                    )}
                </div>
            </div>
        );
    };

    if (isRoot && (!currentValue || Object.keys(currentValue).length === 0)) {
        const addRootGroup = (operator) => {
            onChange({ [operator]: [{ $eq: ["", ""] }] });
        };
        const addRootCondition = () => {
            onChange({ $eq: ["", ""] });
        }

        return (
            <div className="empty-state">
                <div className="empty-actions">
                    <button type="button" onClick={addRootCondition}>
                        <FaPlus/> <Trans i18nKey={"cb.condition"}>Condition</Trans>
                    </button>
                    <button type="button" onClick={() => addRootGroup('$and')}>
                        <FaProjectDiagram/> <Trans i18nKey={"conditionBuilder.andGroup"} />
                    </button>
                    <button type="button" onClick={() => addRootGroup('$or')}>
                        <FaProjectDiagram/> <Trans i18nKey={"conditionBuilder.orGroup"} />
                    </button>
                </div>
            </div>
        );
    }

    if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {

        const operator = Object.keys(currentValue).find(k => k.startsWith('$'));
        const args = currentValue[operator];
        const isFieldWithFind = !operator && Object.values(currentValue)[0]?.$find;

        // Cas unique pour un champ contenant $find
        if (isFieldWithFind) {
            const fieldName = Object.keys(currentValue)[0];
            const findExpr = currentValue[fieldName].$find;
            const findCondition = findExpr || { $eq: ["", ""] };

            // --- Logique corrigée pour trouver les champs du modèle lié ---
            const fieldDef = currentModelFields.find(f => f.name === fieldName);
            let relatedFieldNames = [];
            let relatedModelFields = [];
            if (fieldDef && fieldDef.type === 'relation' && fieldDef.relation) {
                const relatedModel = models.find(m => m.name === fieldDef.relation);
                if (relatedModel) {
                    relatedFieldNames = relatedModel.fields.map(f => f.name);
                    relatedModelFields = relatedModel.fields;
                }
            }

            // --- Fin de la correction ---

            const handleFieldChange = (newField) => {
                const newValue = {
                    [newField]: {
                        $find: findCondition
                    }
                };
                onChange(newValue, path);
                setCurrentValue(newValue);
            };

            const handleConditionChange = (newCondition) => {
                const newValue = {
                    [fieldName]: {
                        $find: newCondition
                    }
                };
                onChange(newValue, path);
                setCurrentValue(newValue);
            };

            return (
                <div className="expression-block field-with-find">
                    <div className="field-header">
                        <div className="expression-header">
                            {/* L'opérateur est implicite ($find), on affiche directement le sélecteur de champ */}
                            <FieldInput
                                value={fieldName}
                                onChange={handleFieldChange}
                                fieldNames={fieldNames}
                                isFieldName={true}
                                isDate={isDateArg(path[path.length - 1])}
                                currentModelFields={currentModelFields} // Passer les champs complets
                                onlyRelations={true}
                            />
                            <div className="expression-actions">
                                <button
                                    type="button"
                                    onClick={() => setEditing(!editing)}
                                    title={i18n.t("cb.changeOperator")}
                                >
                                    <FaRepeat/>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => onChange(null, path)}
                                    title={i18n.t("cb.deleteBlock")}
                                >
                                    <FaTrash/>
                                </button>
                            </div>
                        </div>
                    </div>

                    {editing && (
                        <div className="operator-selector-overlay">
                            <OperatorSelector onSelect={handleOperatorSelect}/>
                            <button type="button" onClick={() => setEditing(false)}>Annuler</button>
                        </div>
                    )}

                    <div className="find-content">
                        <div className="find-condition">
                            <ExpressionField
                                value={findCondition}
                                onChange={handleConditionChange}
                                // On passe les champs du modèle lié s'ils existent
                                fieldNames={relatedFieldNames.length > 0 ? relatedFieldNames : fieldNames}
                                path={[...path, fieldName, '$find']}
                                models={models}
                                currentModelFields={relatedModelFields.length > 0 ? relatedModelFields : currentModelFields}
                                isInFindContext={true} // On active le contexte $$this pour les enfants
                            />
                        </div>
                    </div>
                </div>
            );
        }

        // Gestion spéciale pour $and et $or
        let opConfig;
        if (operator === '$and' || operator === '$or' || operator === '$not' || operator === '$nor') {
            opConfig = {
                label: operator === '$and' ? 'ET logique'
                    : operator === '$or' ? 'OU logique'
                        : operator === '$not' ? 'NON logique'
                            : 'OU NON logique',
                description: operator === '$and'
                    ? 'Combine plusieurs expressions avec ET logique'
                    : operator === '$or'
                        ? 'Combine plusieurs expressions avec OU logique'
                        : operator === '$not'
                            ? 'Inverse la condition (ex: non égal à)'
                            : 'Renvoie vrai si aucune des conditions n\'est vérifiée',
                multi: true
            };
        }  else if (operator) {
            opConfig = MONGO_CALC_OPERATORS[operator];
        } else {
            return <></>;
        }

        if( !opConfig )
            return <></>
        const isMulti = opConfig.multi && !opConfig.args; // vrai seulement si multi sans args fixe
        const isFixedArgs = opConfig.args; // vrai si nombre d'args fixé

        // Déterminer si le parent est un opérateur logique ou $find
        const parentIsLogicalOrFind = path.length === 0 ||
            (path[path.length - 1] === '$and' ||
            path[path.length - 1] === '$or' ||
            path[path.length - 1] === '$and' ||
            path[path.length - 1] === '$or' ||
            path[path.length - 1] === '$find');

        if (!opConfig) {
            console.error(`Opérateur non reconnu: ${operator}`);
            return <div>Erreur: Opérateur non reconnu</div>;
        }
        // Dans ExpressionField, remplacer la partie qui gère opConfig.converter par:
        if (opConfig.converter || (!isMulti && !isFixedArgs)) {
            // Rendu pour les convertisseurs et opérateurs mono-argument
            return (
                <div className="expression-block single-arg-block">
                    <div className="expression-header">
                        <span className="operator">{operator}</span>
                        {editing && (
                            <div className="operator-selector-overlay">
                                <OperatorSelector onSelect={handleOperatorSelect} />
                                <button type="button" onClick={() => setEditing(false)}>Annuler</button>
                            </div>
                        )}
                        <div className="expression-actions">
                            <button type="button" onClick={() => setEditing(!editing)}><FaRepeat /></button>
                            <button type="button" onClick={() => openDoc(operator.substring(1))}><FaInfoCircle /></button>
                            {!parentIsLogicalOrFind && (
                                <button
                                    type="button"
                                    className="switch-to-expr"
                                    onClick={() => {
                                        // Convertir en valeur simple
                                        onChange(args, path);
                                    }}
                                    title={i18n.t("cb.enterValue")}
                                >
                                    <FaEdit/>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onChange(null, path)}
                                className="remove-expr"
                                title={i18n.t("cb.deleteBlock")}
                            >
                                <FaTrash/>
                            </button>
                        </div>
                    </div>
                    <div className="single-arg">
                        <ExpressionField
                            value={args} // args est directement la valeur pour mono-argument
                            onChange={(newVal) => {
                                const newValue = { [operator]: newVal };
                                onChange(newValue, path);
                                setCurrentValue(newValue);
                            }}
                            fieldNames={fieldNames}
                            path={[...path, operator]}
                            models={models}
                            currentModelFields={currentModelFields}
                            isInFindContext={isInFindContext}
                        />
                    </div>
                </div>
            );
        }

        if (opConfig.specialStructure) {
            const handleSpecialArgChange = (argName, newValue) => {
                const newArgs = {...args};

                // Si la nouvelle valeur est vide et que l'argument est optionnel, on le supprime
                if (newValue === '' || newValue === null || newValue === undefined) {
                    delete newArgs[argName];
                } else {
                    newArgs[argName] = newValue;
                }

                // Si tous les arguments obligatoires sont vides, on supprime complètement
                const hasRequiredArgs = opConfig.args?.some(a => !a.optional && newArgs[a.name]);
                if (!hasRequiredArgs && Object.keys(newArgs).length === 0) {
                    onChange(null, path);
                } else {
                    onChange({[operator]: newArgs}, path);
                }
            };

            return (
                <div className="expression-block special-structure-block">
                    <div className="expression-header">
                        <span className="operator">{operator}</span>
                        {editing && (
                            <div className="operator-selector-overlay">
                                <OperatorSelector onSelect={handleOperatorSelect}/>
                                <button type="button" onClick={() => setEditing(false)}>Annuler</button>
                            </div>
                        )}
                        <div className="expression-actions">
                            <button type="button" onClick={() => setEditing(!editing)}><FaRepeat/></button>
                            <button type="button" onClick={() => openDoc(operator.substring(1))}><FaInfoCircle/></button>
                            <button
                                type="button"
                                onClick={() => onChange(null, path)}
                                className="remove-expr"
                                title={i18n.t("cb.deleteBlock")}
                            >
                                <FaTrash/>
                            </button>
                        </div>
                    </div>
                    <div className="special-structure-args">
                        {opConfig.args ? (
                            opConfig.args.map((argConfig) => {
                                const currentArgValue = args[argConfig.name] || '';
                                return (
                                    <div key={argConfig.name} className="special-arg">
                                        <label>{argConfig.label}</label>
                                        {argConfig.type === 'select' ? (
                                            <select
                                                value={currentArgValue}
                                                onChange={(e) => handleSpecialArgChange(argConfig.name, e.target.value)}
                                            >
                                                <option value="">Select {argConfig.label}</option>
                                                {argConfig.options.map(option => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        ) : argConfig.type === 'date' ? (
                                            <input
                                                type="datetime-local"
                                                value={currentArgValue ? new Date(currentArgValue).toISOString().slice(0, 16) : ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleSpecialArgChange(argConfig.name, val ? new Date(val).toISOString() : '');
                                                }}
                                            />
                                        ) : (
                                            <input
                                                type={argConfig.type === 'number' ? 'number' : 'text'}
                                                value={currentArgValue}
                                                onChange={(e) => handleSpecialArgChange(argConfig.name, e.target.value)}
                                                placeholder={argConfig.label}
                                            />
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            // Ancien cas pour les structures spéciales non configurées
                            Object.entries(args).map(([key, val]) => (
                                <div key={key} className="special-arg">
                                    <label>{key}</label>
                                    <ExpressionField
                                        value={val}
                                        onChange={(newVal) => {
                                            const newArgs = {...args, [key]: newVal};
                                            // Supprimer si vide
                                            if (newVal === '' || newVal === null || newVal === undefined) {
                                                delete newArgs[key];
                                            }
                                            onChange(Object.keys(newArgs).length > 0 ? {[operator]: newArgs} : null, path);
                                        }}
                                        fieldNames={fieldNames}
                                        path={[...path, operator, key]}
                                        models={models}
                                        currentModelFields={currentModelFields}
                                        isInFindContext={isInFindContext}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            );
        }
        // Rendu pour les opérateurs avec nombre d'arguments fixe
        if (isFixedArgs) {
            return (
                <div className="expression-block fixed-args-block">
                    <div className="expression-header">
                        <span className="operator">{operator}</span>
                        {editing && (
                            <div className="operator-selector-overlay">
                                <OperatorSelector onSelect={handleOperatorSelect}/>
                                <button type="button" onClick={() => setEditing(false)}>Annuler</button>
                            </div>
                        )}
                        <div className="expression-actions">
                            <button type="button" onClick={() => setEditing(!editing)}><FaRepeat/></button>
                            <button type="button" onClick={() => openDoc(operator.substring(1))}><FaInfoCircle /></button>
                            {!parentIsLogicalOrFind && (<button
                                type="button"
                                className="switch-to-expr"
                                onClick={() => {
                                    // Convertir l'expression en valeur simple
                                    onChange("", path);
                                }}
                                title={i18n.t("cb.enterValue")}
                            >
                                <FaEdit/>
                            </button>)}
                            <button
                                type="button"
                                onClick={() => onChange(null, path)} // Envoie null pour indiquer la suppression
                                className="remove-expr"
                                title={i18n.t("cb.deleteBlock")}
                            >
                                <FaTrash/>
                            </button>
                        </div>
                    </div>
                    <div className="expression-args">
                        {Array.isArray(args) && args.map((arg, i) => (
                            <div key={`arg-${i}`} className="expression-arg">
                                <ExpressionField
                                    value={arg}
                                    onChange={(newVal) => {
                                        const updatedArgs = [...args];
                                        updatedArgs[i] = newVal;
                                        onChange({[operator]: updatedArgs}, path);
                                    }}
                                    fieldNames={fieldNames}
                                    path={[...path, operator, i]}
                                    models={models}
                                    currentModelFields={currentModelFields}
                                    isInFindContext={isInFindContext}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return (
            <div className="expression-block">
                <div className="expression-header">
                    <span className="operator">{operator}</span>
                    {editing && (
                        <div className="operator-selector-overlay">
                            <OperatorSelector onSelect={handleOperatorSelect}/>
                            <button type="button" onClick={() => setEditing(false)}><Trans i18nKey={"cb.cancel"}>Annuler</Trans></button>
                        </div>
                    )}
                    <div className="expression-actions">
                        {!parentIsLogicalOrFind && (
                            <button
                                type="button"
                                className="switch-to-expr"
                                onClick={() => onChange("", path)}
                                title={i18n.t("cb.enterValue")}
                            >
                                <FaEdit/>
                            </button>
                        )}
                        <button type="button" onClick={() => setEditing(!editing)}><FaRepeat/></button>
                        <button type="button" onClick={() => openDoc(operator.substring(1))}><FaInfoCircle/></button>
                    </div>
                </div>
                <div className="expression-args">
                {Array.isArray(args) ? (
                        <>
                            {args.map((arg, i) => renderArgument(arg, i, operator, args))}
                            {opConfig.multi && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const updatedArgs = [...args, operator === '$and' || operator === '$or' || operator === '$not' || operator === '$nor' ? {$eq: ["", ""]} : ""];
                                        const newValue = {[operator]: updatedArgs};
                                        onChange(newValue, path);
                                        setCurrentValue(newValue);
                                    }}
                                    className="add-arg"
                                >
                                    <FaPlus/> <Trans i18nKey={"cb.addArgument"}>Ajouter un argument</Trans>
                                </button>
                            )}
                        </>
                    ) : (
                        <ExpressionField
                            value={args}
                            onChange={(newVal) => {
                                onChange({[operator]: newVal}, path);
                            }}
                            fieldNames={fieldNames}
                            path={[...path, operator]}
                            models={models}
                            currentModelFields={currentModelFields}
                        />
                    )}
                </div>
            </div>
        );
    }
    const parentOperator = path.length > 1 ? path[path.length - 1] : null;
    const parentOpConfig = parentOperator ? MONGO_CALC_OPERATORS[parentOperator] : null;


    return (
        <div className="simple-value">
            <div className="simple-value-container">
                <FieldInput
                    value={currentValue}
                    onChange={(newValue) => {
                        setCurrentValue(newValue);
                        onChange(convertInputValue(newValue), path);
                    }}
                    fieldNames={fieldNames}
                    isInFindContext={isInFindContext}
                    isDate={isDateArg(path[path.length - 1])}
                    currentModelFields={currentModelFields} // On propage le contexte
                />

                {/* --- MODIFICATION --- */}
                {/* On affiche le bouton de conversion uniquement si l'opérateur parent le permet */}
                {parentOpConfig?.disableAdvancedValue !== true && !isDateArg(path[path.length - 1]) && (
                    <button
                        type="button"
                        className="switch-to-expr"
                        onClick={() => {
                            gtag('event', '[cb] advanced');
                            // On transforme la valeur simple en une expression $eq par défaut
                            onChange({ $eq: [currentValue, ""] }, path);
                        }}
                        title={i18n.t("cb.convertToExpression")}
                    >
                        <FaProjectDiagram />
                    </button>
                )}
            </div>
        </div>
    );
};
const FieldInput = ({
                        value,
                        onChange,
                        fieldNames,
                        isFieldName = false,
                        isInFindContext = false,
                        currentModelFields = [],
                        onlyRelations = false,
                        isDate = false
                    }) => {
    const [inputValue, setInputValue] = useState(value);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isDateMode, setIsDateMode] = useState(isDate);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
        setInputValue(value);
        // Détermine le mode d'affichage en fonction de la valeur
        const shouldBeDateMode = isDate && (
            // Soit c'est une date ISO valide
            (typeof value === 'string' && !value.startsWith('$') && !isNaN(new Date(value).getTime())) ||
            // Soit c'est une valeur vide et le champ est marqué comme date
            (value === '' && isDate)
        );
        setIsDateMode(shouldBeDateMode);
    }, [value, isDate]);

    useEffect(() => {
        // Filtrer les suggestions selon le contexte
        let filtered = fieldNames;
        if (onlyRelations && currentModelFields.length > 0) {
            filtered = currentModelFields
                .filter(field => field.type === 'relation')
                .map(field => field.name);
        }
        setSuggestions(filtered);
    }, [fieldNames, currentModelFields, onlyRelations]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputValue(val);

        const prefix = isFieldName ? '' : (isInFindContext ? '$$this.' : '$');

        if (val.startsWith(prefix)) {
            const searchTerm = val.substring(prefix.length).toLowerCase();
            const filtered = suggestions.filter(name =>
                name.toLowerCase().includes(searchTerm));
            setSuggestions(filtered);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }

        onChange(val);
    };

    const handleDateChange = (dateValue) => {
        // Convertir la date en format ISO
        const isoDate = dateValue ? new Date(dateValue).toISOString() : '';
        setInputValue(isoDate);
        onChange(isoDate);
    };


    const toggleDateMode = () => {
        const newMode = !isDateMode;
        setIsDateMode(newMode);

        if (newMode) {
            // Si on passe en mode date et que la valeur actuelle est un champ, on la vide
            if (inputValue && inputValue.startsWith('$')) {
                setInputValue('');
                onChange('');
            }
        } else {
            // Si on quitte le mode date et que la valeur est une date, on la vide
            if (inputValue && !isNaN(new Date(inputValue).getTime())) {
                setInputValue('');
                onChange('');
            }
        }
    };

    const handleSuggestionClick = (suggestion) => {
        const prefix = isFieldName ? '' : (isInFindContext ? '$$this.' : '$');
        const newValue = `${prefix}${suggestion}`;
        setInputValue(newValue);
        onChange(newValue);
        setShowSuggestions(false);
    };

    return (
        <div className="field-input-container">
            {isDateMode ? (
                <div className="date-input-wrapper">
                    <input
                        type="datetime-local"
                        value={inputValue && !isNaN(new Date(inputValue)) ? new Date(inputValue).toISOString().slice(0, 16) : ''}
                        onChange={(e) => handleDateChange(e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={toggleDateMode}
                        className="toggle-date-mode"
                        title={i18n.t("cb.switchToField")}
                    >
                        <FaEdit />
                    </button>
                </div>
            ) : (
                <>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        placeholder={
                            onlyRelations ? i18n.t("cb.selectRelationField") :
                                isInFindContext ? i18n.t("cb.enterThisField") :
                                    i18n.t("cb.enterValueOrField")
                        }
                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    {isDate && (
                        <button
                            type="button"
                            onClick={toggleDateMode}
                            className="toggle-date-mode"
                            title={i18n.t("cb.switchToDate")}
                        >
                            <FaCalendarAlt />
                        </button>
                    )}
                </>
            )}

            {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-dropdown">
                    {suggestions.map((suggestion, index) => {
                        const fieldInfo = currentModelFields.find(f => f.name === suggestion);
                        return (
                            <div
                                key={index}
                                className="suggestion-item"
                                onClick={() => handleSuggestionClick(suggestion)}
                                data-tooltip-id="field-tooltip"
                                data-tooltip-content={fieldInfo?.relation ?
                                    i18n.t('cb.relationTooltip', { relation: fieldInfo.relation}) : ''}
                            >
                                {suggestion}
                                {fieldInfo?.relation && (
                                    <span className="relation-info">
                                        <FaTags /> {fieldInfo.relation}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
export const ConditionBuilder2 = ({initialValue = {}, onChange, models, model}) => {
    const { me: user } = useAuthContext();
    const mod = (models||[]).find(f=>f.name===model && f._user === user.username ) || models.find(f => f._user === user.username) || null;
    const fieldNames = mod?.fields?.map(f => f.name) || [];
    const modelFields = mod?.fields || [];

    // Parse initial value if it's a string
    const parsedInitialValue = typeof initialValue === 'string'
        ? JSON.parse(initialValue)
        : initialValue;

    // L'état reste le même
    const [expression, setExpression] = useState(() => ({ ...parsedInitialValue }));

    const handleExpressionChange = (newExpr, path = []) => {
        // Cas de suppression (quand newExpr est null)
        if (newExpr === null) {
            // Fonction récursive pour supprimer un élément dans une structure imbriquée
            const removeAtPath = (obj, path) => {
                if (path.length === 0) return null;

                const [currentKey, ...remainingPath] = path;

                if (remainingPath.length === 0) {
                    // Cas 1: Suppression dans un tableau
                    if (Array.isArray(obj)) {
                        const newArray = [...obj];
                        newArray.splice(currentKey, 1);
                        return newArray.length === 0 ? null : newArray;
                    }
                    // Cas 2: Suppression dans un objet
                    else if (obj && typeof obj === 'object') {
                        const newObj = {...obj};
                        delete newObj[currentKey];
                        return Object.keys(newObj).length === 0 ? null : newObj;
                    }
                }

                // Traverser la structure
                if (Array.isArray(obj)) {
                    const newArray = [...obj];
                    newArray[currentKey] = removeAtPath(obj[currentKey], remainingPath);
                    return newArray.filter(x => x !== null); // Retire les nulls
                }
                else if (obj && typeof obj === 'object') {
                    const newObj = {...obj};
                    newObj[currentKey] = removeAtPath(obj[currentKey], remainingPath);
                    return Object.keys(newObj).every(k => newObj[k] === null) ? null : newObj;
                }

                return obj;
            };

            const newExpression = path.length === 0
                ? {}
                : removeAtPath(JSON.parse(JSON.stringify(expression)), path);

            setExpression(newExpression || {});
            if (onChange) onChange(newExpression || {});
        }
        // Cas normal de mise à jour
        else {
            setExpression(newExpr);
            if (onChange) onChange(newExpr);
        }
    };

    // Le rendu est maintenant beaucoup plus propre !
    return (
        <div className="expr-builder">
            <div className="expression-container">
                <ExpressionField
                    value={expression}
                    onChange={handleExpressionChange}
                    fieldNames={fieldNames}
                    // On passe des props supplémentaires pour gérer les actions au niveau racine
                    isRoot={true}
                    models={models}
                    currentModelFields={modelFields}
                />
            </div>
            <Tooltip id="field-tooltip"/>
        </div>
    );
};