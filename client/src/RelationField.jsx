import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useModelContext } from './contexts/ModelContext.jsx';
import { TextField } from './Field.jsx';
import { useAuthContext } from './contexts/AuthContext.jsx';
import {conditionToApiSearchFilter, getDataAsString, getUserId} from 'data-primals-engine/data';
import { FaEdit, FaTrash } from 'react-icons/fa';
import Button from './Button.jsx';
import {mainFieldsTypes} from "data-primals-engine/constants";
import Draggable from "./Draggable.jsx";
import {useTranslation} from "react-i18next";

const RelationField = ({ field, help, onFocus, onBlur, onChange, value=null }) => {
    const { models, dataByModel, setOnSuccessCallbacks, relationIds, setRelationIds } = useModelContext();
    const { name, relation: modelName } = field;
    const queryClient = useQueryClient();
    const [selectedValues, setSelectedValues] = useState([]);
    const [showResults, setResultsVisible] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [history, setHistory] = useState([]);
    const { me } = useAuthContext();
    const tr = useTranslation()
    const {t, i18n} = tr
    const model = models?.find(f => f.name === modelName && f._user === me?.username);

    // Fetch related data based on search value
    const { data: results = [], isError, refetch } = useQuery(
        ['api/search', model?.name, field?.name, searchValue],
        async ({ signal }) => {
            if (!model) return [];
            const orFilter = [];
            let filter = {};
            if( field.relationFilter ){
                filter = {"$and": field.relationFilter.filter};
            }else if ( searchValue) {
                model.fields.forEach(f => {
                    if (f.asMain) {
                        if( f.type !== 'relation' && mainFieldsTypes.includes(f.type))
                            orFilter.push({"$regexMatch": { input: '$'+f.name, regex: searchValue}});
                    }
                })
                if (!orFilter.length) {
                    model.fields.forEach(f => {
                        if (["string", "string_t", "richtext", "url"]?.includes(f.type)) {
                            orFilter.push({"$regexMatch": { input: '$'+f.name, regex: searchValue}});
                        }
                    });
                    if (!orFilter.length) {
                        orFilter.push({"$eq": ['_id', searchValue]});
                    }
                }
                filter = {'$or':orFilter};
            }
            const params = new URLSearchParams();
            params.append('_user', getUserId(me));
            params.append('model', field.relation);
            params.append('limit', '1000');
            params.append('depth', '2'); // Fetch related data with depth 2
            return fetch(`/api/data/search?${params.toString()}`, {
                body: JSON.stringify({ filter }),
                method: 'POST',
                signal: signal,
                headers: { 'Content-Type': 'application/json' },
            })
                .then(e => e.json())
                .then(e => e.data);
        },
        { enabled: !!model }
    );

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

    //console.log(field, value);
    const updateValue = () => {
        if (!field.multiple) {
            const v = history.find(d => d._id === value);
            if (v) {
                setSearchValue(getDataAsString(model, v, tr, models) || '');
                onChange({ name, value });
            } else {
                //onChange({ name, value: null });
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
                onChange({ name, value });
            }
        }
        setResultsVisible(false);
        ref.current?.focus();
        e.preventDefault();
    };

    useEffect(() => {
        if (showResults) refetch();
    }, [showResults]);

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
                        queryClient.invalidateQueries(['api/search', field.name, searchValue]);
                    }}
                    value={searchValue}
                    onChange={e => {
                        if (!e.target.value) onChange({ name, value: '' });
                        else onChange({ name, value: '' });
                        setResultsVisible(true);
                        setSearchValue(e.target.value);
                    }}
                    onBlur={(e) => {
                        setResultsVisible(false);
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
                    }} onBlur={e => {
                        const t = e.target.parentNode.children[e.target.parentNode.childElementCount-1];
                        if(t === e.target){
                            setResultsVisible(false);
                        }
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
                        const val = history.find(f => f._id === id) || dataByModel[modelName].find(f => f._id === id);
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