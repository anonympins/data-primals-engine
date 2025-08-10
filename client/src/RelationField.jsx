import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useModelContext } from './contexts/ModelContext.jsx';
import { TextField } from './Field.jsx';
import { useAuthContext } from './contexts/AuthContext.jsx';
import { getDataAsString } from '../../src/data.js';
import { FaEdit, FaTrash } from 'react-icons/fa';
import Button from './Button.jsx';
import { mainFieldsTypes } from "../../src/constants.js";
import Draggable from "./Draggable.jsx";
import { useTranslation } from "react-i18next";

const RelationField = ({ field, help, onFocus, onBlur, onChange, value = null }) => {
    const { models, dataByModel, setOnSuccessCallbacks, relationIds, setRelationIds } = useModelContext();
    const { name, relation: modelName } = field;
    const queryClient = useQueryClient();
    const [selectedValues, setSelectedValues] = useState([]);
    const [showResults, setResultsVisible] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [history, setHistory] = useState([]);
    const { me } = useAuthContext();
    const tr = useTranslation();
    const { t, i18n } = tr;
    const model = models?.find(f => f.name === modelName && f._user === me?.username);

    // Fetch related data based on search value
    const { data: results = [], isError, refetch } = useQuery(
        // La clé de la requête inclut maintenant le filtre de relation pour une mise en cache correcte
        ['api/search', model?.name, field?.name, searchValue, JSON.stringify(field.relationFilter)],
        async ({ signal }) => {
            if (!model) return [];

            // --- DÉBUT DE LA NOUVELLE LOGIQUE DE FILTRAGE ---

            // 1. On récupère le filtre permanent défini dans le modèle.
            // S'il n'y en a pas, on utilise un objet vide qui n'aura aucun effet.
            const permanentFilter = field.relationFilter || {};

            // 2. On construit le filtre basé sur la recherche de l'utilisateur.
            const searchFilter = {};
            if (searchValue) {
                const orConditions = [];
                // Recherche sur les champs principaux (asMain)
                model.fields.forEach(f => {
                    if (f.asMain && mainFieldsTypes.includes(f.type)) {
                        orConditions.push({ [f.name]: { "$regex": searchValue, "$options": "i" } });
                    }
                });
                // Si aucun champ principal, recherche sur les champs texte
                if (orConditions.length === 0) {
                    model.fields.forEach(f => {
                        if (["string", "string_t", "richtext", "url"].includes(f.type)) {
                            orConditions.push({ [f.name]: { "$regex": searchValue, "$options": "i" } });
                        }
                    });
                }
                // Si toujours rien, on cherche sur l'ID (utile pour les développeurs)
                if (orConditions.length === 0) {
                    orConditions.push({ "_id": searchValue });
                }
                searchFilter['$or'] = orConditions;
            }

            // 3. On combine les deux filtres avec un opérateur $and.
            // Un document devra correspondre au filtre permanent ET au filtre de recherche.
            const finalFilter = {
                "$and": [
                    permanentFilter,
                    searchFilter
                ]
            };

            // --- FIN DE LA NOUVELLE LOGIQUE DE FILTRAGE ---

            const params = new URLSearchParams();
            params.append('model', field.relation);
            params.append('limit', '100'); // Limite raisonnable pour les suggestions
            params.append('depth', '2');

            return fetch(`/api/data/search?${params.toString()}`, {
                // On envoie le filtre final et complet
                body: JSON.stringify({ filter: finalFilter }),
                method: 'POST',
                signal: signal,
                headers: { 'Content-Type': 'application/json' },
            })
                .then(e => e.json())
                .then(e => e.data);
        },
        { enabled: !!model && showResults } // La requête ne s'exécute que si le panneau de résultats est visible
    );

    // ... (le reste du composant reste identique) ...

    useEffect(() => {
        setSearchValue('');
        setHistory([]);
    }, [modelName]);

    useEffect(()=>{
        if(searchValue==='' && !value && !field.multiple ){
            onChange({ name, value: null });
        }
    },[searchValue])

    useEffect(() => {
        if (results?.length > 0) {
            setHistory([...new Set([...history, ...results])]);
        }
    }, [results]);

    useEffect(() => {
        updateValue();
    }, [history]);

    useEffect(() => {
        if( value)
            updateValue();
    }, [value]);
    useEffect(() => {
        if( value === null ){
            onChange({name, value: null});
            setSearchValue('');
        }
    }, [value]);

    const updateValue = () => {
        if (!field.multiple) {
            const v = history.find(d => d._id === value);
            if (v) {
                setSearchValue(getDataAsString(model, v, tr, models) || '');
                onChange({ name, value });
            } else {
                // Ne rien faire si la valeur n'est pas dans l'historique pour éviter d'effacer
            }
        } else {
            if (Array.isArray(value)) {
                setSelectedValues(value);
                onChange({ name, value });
            } else {
                setSelectedValues([]);
                onChange({ name, value: [] });
            }
        }
    };

    const handleClick = (e, data) => {
        if (!field.multiple) {
            setSearchValue(getDataAsString(model, history.find(d => d._id === data._id), tr, models) || '');
            onChange({ name, value: data._id });
        } else {
            if (!selectedValues.includes(data._id)) {
                setSelectedValues(values => {
                    const value = [...values, data._id];
                    onChange({ name, value });
                    return value;
                });
            } else {
                onChange({ name, value: selectedValues });
            }
        }
        setResultsVisible(false);
        ref.current?.focus();
        e.preventDefault();
    };

    const handleRemove = (element) => {
        if (!field.multiple) return;
        setSelectedValues(values => {
            const value = values.filter(f => f !== element);
            onChange({ name, value });
            return value;
        });
    };

    const ref = useRef();
    const inputRef = useRef();

    useEffect(() => {
        if( inputRef?.current ){
            inputRef.current.ref.setAttribute('autocomplete', 'off');
        }
    }, [inputRef]);

    return (
        <div onFocus={onFocus} onBlur={onBlur} className="field field-relation flex flex-row flex-start flex-1">
            {help && <div className={"flex help"}>{help}</div>}

            <div className="inner">
                <TextField
                    required={!field.multiple && field.required}
                    ref={inputRef}
                    multiline={field.multiline}
                    autocomplete="none"
                    name={field.name}
                    id={field.name}
                    onFocus={e => {
                        setResultsVisible(true);
                    }}
                    value={searchValue}
                    onChange={e => {
                        if (!e.target.value) onChange({ name, value: null });
                        setResultsVisible(true);
                        setSearchValue(e.target.value);
                    }}
                    onBlur={(e) => {
                        setTimeout(() => setResultsVisible(false), 150); // Léger délai pour permettre le clic sur un résultat
                    }}
                />
                <Button
                    type="button" className="btn-form btn-last" onClick={() => {
                    setSearchValue('');
                    onChange({ name, value: null });
                    setResultsVisible(!showResults);
                }}><FaEdit /></Button>

                {showResults && (
                    <div className="results" onKeyDown={e => {
                        if( e.key === 'Escape' )
                            setResultsVisible(false);
                    }} >
                        {!isError &&
                            (results || []).map(r => {
                                const v = getDataAsString(models.find(m => m.name === modelName && m._user === me?.username), r, tr, models);
                                return (
                                    <div tabIndex={0} onKeyDown={e => {
                                        if( e.key === 'Enter')
                                            handleClick(e, r);
                                    }} onMouseDown={e => handleClick(e, r)} className="item" key={r._id}>
                                        {v}
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>
            {field.multiple && selectedValues.length > 0 && (
                <div ref={ref} tabIndex={0} className="selected-values flex flex-border flex-row flex-no-gap flex-start flex-1">
                    <Draggable items={selectedValues} renderItem={(id,i) =>{
                        const val = history.find(f => f._id === id) || dataByModel[modelName]?.find(f => f._id === id);
                        if (!val) {
                            return <div className="flex" key={id}>data non chargée<FaTrash onClick={() => handleRemove(id)} /></div>;
                        }
                        const v = getDataAsString(models.find(m => m.name === modelName && m._user === me?.username), val, tr, models);
                        return <div onClick={() => handleRemove(id)} className="selected-value flex" key={id}>
                            <span className="flex-1">{v}</span>
                            <FaTrash className="cursor-pointer" />
                        </div>;
                    }} onChange={(arr) => {
                        setSelectedValues(arr);
                        onChange({ name, value: arr });
                    }} />
                </div>
            )}
        </div>
    );
};

export default RelationField;