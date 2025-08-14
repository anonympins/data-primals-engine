import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { useModelContext } from './contexts/ModelContext.jsx';
import {getDataAsString, getUserId} from '../../src/data.js';
import { Trans, useTranslation } from 'react-i18next';
import {Dialog, DialogProvider} from './Dialog.jsx';
import {FaMagnifyingGlass} from "react-icons/fa6";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {CodeField, ColorField} from "./Field.jsx";
import { randomColor } from "randomcolor";
import {getObjectHash, getRand, isLightColor, setSeed} from "../../src/core.js";

const RelationValue = ({ field, data, align }) => {
    const { models, relations, setRelations, dataByModel, relationIds, setRelationIds, setDatasToLoad, datasToLoad } = useModelContext();
    const [popupVisible, setPopupVisible] = useState(false);
    const tr = useTranslation();
    const { t, i18n } = tr;
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const { me } = useAuthContext();
    const value = data[field.name];
    const relatedModelName = field.relation;
    const model = models.find(m => m.name === relatedModelName && m._user === me?.username);
    const params = new URLSearchParams();
    params.append('_user', getUserId(me));
    params.append('model', relatedModelName);
    params.append('depth', '1');
    params.append('lang', lang);
    let ids = [];// Fetch related data with depth 2
    if( value ){
        if (Array.isArray(value)) {
            ids = value.map(v => v._id || v).join(',');
        } else {
            ids = [value._id || value];
        }
    }
    params.append('ids', ids);
    const { data: relatedData, isLoading } = useQuery(
        ['api/data/relation', field, value],
        async () => {
            if (!model || (typeof(ids) === 'object' && !ids.length) || !value) return [];
            const rel = relations['api/data'+model.name+getObjectHash({ids})];
            if( rel )
                return Promise.resolve(rel.data);

            return fetch(`/api/data/search?${params.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
                .then(res => res.json())
                .then(res => {
                    return res.data
                });
        },
        { enabled: !!model && !!value, onSettled: (data) => {

                const dt = {...relations};
                dt['api/data'+model.name+getObjectHash({ids})] = { count: data.length, data };
                setRelations(dt);
            } }
    );
    const [intVal, setIntVal] = useState({});

    useEffect(() => {
        if (relatedData?.length > 0) {
            updateIds();
        }
    }, [relatedData]);

    const updateIds = () => {
        let dt = [];
        if (!model) {
            return;
        }
        setRelationIds(rels => {
            const relationIds = { ...rels };
            let hasChanged = false;
            model.fields.forEach(f => {
                if (f.type === 'relation') {

                    if (!datasToLoad.includes(f.relation) && !dt.includes(f.relation))
                        dt.push(f.relation);
                    const vals = Array.isArray(value) || value === null ? value : [value];

                    if (!vals)
                        return;
                    vals.forEach((val) => {
                        const v = typeof (val) === 'string' ? val : (val?._id || val);
                        if( !v )
                            return;
                        if (!relationIds[f.relation])
                            relationIds[f.relation] = [];
                        if (!relationIds[f.relation].includes(v)) {
                            relationIds[f.relation].push(v);
                            hasChanged = true;
                        }
                    })
                }
            })
            setDatasToLoad(datasToLoad => [...datasToLoad, ...dt]);
            if (!hasChanged)
                return rels;
            return relationIds;
        })
    };


    const handleModal = (rel) => {
        setIntVal(rel);
        setPopupVisible(true);
    };

    if (isLoading) return <>...</>;

    return (
<DialogProvider>
        <div className="flex">
            {(Array.isArray(value) ? value : [value]).map((v,vi) => {
                const rel = relatedData?.find(f => {
                    if (typeof (v) === 'string') {
                        return f._id === v;
                    } else if (Array.isArray(v)) {
                        return f._id === v[0]._id;
                    } else {
                        return f._id === v._id;
                    }
                });
                if (!rel) {
                    return <></>;
                }
                let displayValue ;
                try {
                    displayValue = getDataAsString(model, rel, tr, models);
                } catch (e) {
                    console.log(e);
                }
                const bgColor = // Returns a bright color in RGB
                    randomColor({
                        seed: rel._hash+rel._id,
                        luminosity: isLightColor(field.color) ? 'light' : 'dark',
                        alpha: 0.42,
                        format: 'rgba' // e.g. 'rgb(225,200,20)'
                    });
                return (
                    <div style={{backgroundColor: bgColor, color: isLightColor(field.color) ? 'black' : '#eeeded'}} className={`relation-value flex flex-border ${align === 'left' ? '' : 'flex-centered'}`} key={rel._id}>
                        {popupVisible && (
                            <Dialog onClose={() => setPopupVisible(false)} isClosable={true} isModal={true} className="dialog-relation">
                                <dl>
                                    {model.fields.map(f => {
                                        if (intVal[f.name] === undefined || intVal[f.name] === null || intVal[f.name] === '')
                                            return <></>;
                                        let columnName = t(`field_${model.name}_${f.name}`, f.name);
                                        let span = columnName !== f.name ? <span style={{ fontWeight: 'lighter' }}>({f.name})</span> : "";
                                        if (f.type === 'richtext') {
                                            return <><dt>{columnName} {span}</dt><dd><div dangerouslySetInnerHTML={{ __html: intVal[f.name] }}></div></dd></>;
                                        }
                                        if(f.type === 'datetime'){
                                            return <><dt>{columnName} {span}</dt><dd><>{new Date(intVal[f.name]).toLocaleDateString(lang, {year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'})}</></dd></>
                                        }
                                        if(f.type === 'date'){
                                            return <><dt>{columnName} {span}</dt><dd><>{new Date(intVal[f.name]).toLocaleDateString(lang, {year: 'numeric', month: 'numeric', day: 'numeric'})}</></dd></>
                                        }
                                        if (f.type === 'boolean') {
                                            return <><dt>{columnName} {span}</dt><dd>{intVal[f.name] === true ? t('yes') : t('no')}</dd></>;
                                        }
                                        if (f.type === 'relation') {
                                            return <><dt>{columnName} {span}</dt><dd><><RelationValue align='left' field={f} data={intVal || {}} /></></dd></>;
                                        }
                                        if (f.type === 'file') {
                                            const value = intVal[f.name];
                                            if (['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/bmp', 'image/tiff', 'image/x-icon', 'image/x-windows-bmp'].includes(value.type))
                                                return <><dt>{columnName} {span}</dt><dd><a
                                                href={`/resources/${value.guid}`} target="_blank"
                                                rel="noopener noreferrer"><img
                                                src={`/resources/${value.guid}`}
                                                alt={`${value.name} (${value.guid})`}/></a></dd></>;
                                                return <><dt>{columnName} {span}</dt><dd><a style={{color: field.color}}
                                                                                            href={`/resources/${value.guid}`}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer">{value.name} ({value.guid})</a>;
                                                    </dd></>;
                                        }
                                        if (f.type === 'color') {
                                            return <><dt>{columnName} {span}</dt><dd>
                                               <ColorField disabled={true} value={intVal} name={f.name} />
                                            </dd></>;
                                        }
                                        if (f.type === 'code') {
                                            let t;
                                            try {
                                                t = f.language === 'json' ? JSON.stringify(intVal[f.name], null, 2) : t = intVal[f.name].toString();
                                            } catch (e) {
                                                t = intVal[f.name].toString();
                                            }
                                            return <>
                                                <dt>{columnName} {span}</dt>
                                                <dd>
                                                    <CodeField onChange={() => {
                                                    }} language={f.language || 'json'}
                                                               name={f.name} value={f.language === 'json' ? JSON.stringify(intVal[f.name], null, 2) : t}  />
                                                </dd>
                                            </>;
                                        }
                                        if (f.type === 'password') {
                                            return <></>;
                                        }
                                        if (f.type === 'string_t') {
                                            return <>
                                                <dt>{columnName} {span}</dt>
                                                <dd>{intVal[f.name]?.value}</dd>
                                            </>;
                                        }
                                        return <>
                                            <dt>{columnName} {span}</dt>
                                            <dd>{intVal[f.name]}</dd>
                                        </>;
                                    })}
                                </dl>
                            </Dialog>
                        )}
                        {rel && <div className="flex flex-no-wrap flex-mini-gap" onClick={() => handleModal(rel)}>{displayValue}<button><FaMagnifyingGlass /></button></div>}
                    </div>
                );
            })}
        </div></DialogProvider>
    );
};

export default RelationValue;