import React, {useEffect, useMemo, useState} from 'react';
import {useModelContext} from './contexts/ModelContext';
import {useAuthContext} from "./contexts/AuthContext.jsx";
import Button from "./Button.jsx";
import {Trans, useTranslation} from "react-i18next";
import {getDefaultForType} from "../../src/data.js";
import { CodeBlock, tomorrowNightBright } from 'react-code-blocks';
import {mainFieldsTypes} from "../../src/constants.js";
import {FaFile, FaPlay, FaRunning} from "react-icons/fa";
import {Tooltip} from "react-tooltip";
import {CodeField} from "./Field.jsx";
import {useMutation} from "react-query";
import {getHost} from "./constants.js";

const Test= ({endpoint, lang, index, headers= {}}) =>  {
    const qp = {...endpoint.queryParams};
    const params = new URLSearchParams();
    const isProd = import.meta.env.MODE === 'production';
    Object.keys(qp || {}).forEach(k =>{
        params.append(k, qp[k]);
    })
    params.append("lang", lang);
    const [code, setCode] = useState(JSON.stringify(endpoint.body, null, 2), [endpoint]);


    useEffect(() => {
        setCode(JSON.stringify(endpoint.body, null, 2), [endpoint]);
    }, [endpoint])

    const [response,setResponse] = useState('');
    const query = useMutation(() => {
        return fetch((isProd ? 'https://'+getHost()+"/" : '')+'/api'+endpoint.endpoint+'?'+params.toString(), { method: endpoint.method, headers, body: code || JSON.stringify(endpoint.body) })
            .then(e => e.json())
    },{ onSuccess: (data) => {
        setResponse(data)
        }})

    return (
        <div key={index} className="api-endpoint">
            <Tooltip id={"tooltip"} render={({content, activeAnchor}) => {

            }}/>
            <h2 className="description" dangerouslySetInnerHTML={{ __html: endpoint.title || endpoint.description }}></h2>
            <button onClick={(e) => {
                query.mutate();
                const endpoint = e.target.closest('[data-endpoint]')?.dataset['endpoint'];
                gtag('event', "select_content", {
                    content_type: "endpoint",
                    content_id: endpoint
                });
            }} data-tooltip-id="tooltip" data-endpoint={endpoint.method + " " + endpoint.endpoint} data-tooltip-html={'Run ' + endpoint.method+ ' /api'+endpoint.endpoint }><FaPlay /></button>
            <span className="method">{endpoint.method}</span>
            <span className="endpoint">{endpoint.endpoint}</span>
            {response && <div className={"response fs-mini"}>
                <CodeBlock language="json" theme={tomorrowNightBright}
                           showLineNumbers={false} text={JSON.stringify(response,null,4)} /></div>}
            {Object.keys(qp || {}).length > 0 && (<h4>Query params</h4>)}
            <ul>{Object.keys(qp || {}).map(m => {
                return <li
                    className="query">
                    {( endpoint.requiredParams && endpoint.requiredParams.includes(m)) && (<span className="required">*</span>)}
                    <strong>{m}</strong> = {qp[m]}</li>
            })}</ul>
            {(endpoint.title || endpoint.description) !== endpoint.description && (<p className="description" dangerouslySetInnerHTML={{ __html: endpoint.description}}></p>)}
            {endpoint.body && (<h4>Body Payload</h4>)}
            {endpoint.body &&
                <CodeField
                    value={code}
                    onChange={(e) => {
                        setCode(e.value);
                    }}/>}
        </div>
    )
};

const APIInfo = ({onInit}) => {
    const {selectedModel, setSelectedModel, models} = useModelContext();
    const [apiEndpoints, setApiEndpoints] = useState([]);

    const {me} = useAuthContext();
    const { t, i18n } = useTranslation()
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const   getMatchingFilter = (model, datas, expr)  => {
        if(!model){
            return null;
        }
        const parts = model.fields.filter(f=>f.asMain || f.required || f.type === "relation" || mainFieldsTypes.includes(f.type));
        let fObj = {}, fa = [];
        parts.forEach(field => {
            const f = field.name;
            if( field.type === 'datetime' || field.type === 'date'){
                if( expr ){
                    fa.push({
                        '$lt': ['$'+f, datas[f]]
                    })
                }else{
                    fObj[f] = datas[f];
                }
            }
            else if( field.type === 'relation') {
                if( expr){
                    fa.push({ [field.name]: { $find: {}} });
                }else {
                    fObj[f] = (datas[f] ? getMatchingFilter(models.find(f => f.name === field.relation), datas[f], expr) : {$find: {}});
                }
            }else if( ['string', 'string_t', 'enum', 'richtext', 'url', 'password','email', 'phone'].includes(field.type)) {
                if( expr ){
                    fa.push({"$regexMatch": {input: "$" + f, regex: datas[f]}});
                }else
                fObj[f] = datas[f];
            }
            else{
                if( expr )
                    fa.push({ "$eq": ["$"+f, datas[f]] });
                else
                    fObj[f] = datas[f];
            }
        });
        return fa.length? fa : fObj;
    }

    useEffect(() => {
        onInit?.();
    }, [lang]);
    useEffect(() => {
        if ((!selectedModel || Object.keys(selectedModel).length === 0)) {
            const mockedModel = {
                name: 'modelPresentation',
                description: 'a presentation model used for demonstration usage.',
                fields: [{ name: 'views', type: 'number', default: 100},
                    { name: 'html', type: 'richtext', required: true},
                    { name: 'lastPublishedAt', type: 'datetime', required: true},
                    { name: 'comments', type: 'relation', relation: 'message', multiple: true}]
            };
            const endpoints = generateApiEndpoints(mockedModel);
            setSelectedModel(mockedModel);
            setApiEndpoints(endpoints);
            return;
        }

        // Generate API endpoints based on the selected model
        const endpoints = generateApiEndpoints(selectedModel);
        setApiEndpoints(endpoints);
    }, [selectedModel, lang, me]);

    var mongoObjectId = function () {
        var timestamp = (new Date().getTime() / 1000 | 0).toString(16);
        return 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    };

    const generateApiEndpoints = (model) => {
        if (!model) return [];

        let dt = {};
        let orFields = { or : []};
        model.fields.forEach(field => {
            let val = getDefaultForType(field);
            if( field.type === 'datetime' || field.type === 'date'){
                val = new Date().toISOString();
            }
            else if( field.type === 'enum')
                val = field.items[0];
            else if( field.type === 'phone')
                val = '+33606060606';
            else if( field.type === 'email')
                val = 'email@tld.com';
            else if( Object.prototype.toString.call(val) === '[object Date]' ){
                val = val.toISOString();
            }
            if(val!== undefined) {
                orFields.or.push({[field.name]: val});
                dt[field.name] = val;
            }
        });
        let fields = getMatchingFilter(model, dt, false, true);

        const modelName = model.name;
        const searchFields = getMatchingFilter(model, dt, true, false);

        let endpoints = []
        if (!model.locked) {
            endpoints.push(
                {
                    method: 'POST',
                    endpoint: `/model`,
                    description: t('doc.api.createModel', { model: modelName }),
                    body: {
                        name: modelName,
                        description: model.description,
                        maxRequestData: 50,
                        fields: model.fields
                    }
                })
            endpoints.push({
                method: 'PUT',
                endpoint: `/model/:id`,
                description: t('doc.api.updateModel', { model: modelName }),
                body: {
                    model: {
                        name: modelName,
                        description: model.description,
                        fields: model.fields// Add some template for fields
                    }
                }
            })
            endpoints.push({
                method: 'DELETE',
                endpoint: `/model`,
                queryParams: {
                    name: modelName
                },
                requiredParams: ['model'],
                description: t('doc.api.deleteModel', { model: modelName })
            });
        }
        endpoints = endpoints.concat([
            {
                method: 'POST',
                endpoint: `/data`,
                description: t('doc.api.createData', { model: modelName}),
                body: {
                    model: modelName,
                    data: fields // Add some template for data
                }
            },
            {
                title: t('doc.api.searchData.title', { model: modelName}),
                method: 'POST',
                endpoint: `/data/search`,
                queryParams: {
                    model: modelName,
                    page: 1,
                    limit: 50,
                    expand: 1,
                    timeout: 5000,
                    sort:'createdAt:DESC,updatedAt:DESC'
                },
                requiredParams: ['model'],
                description: t('doc.api.searchData', { model: modelName }),
                body: { filter: { $or: searchFields } }
            },
            /*{
                method: 'GET',
                endpoint: `/api/data/${modelName}/:id`,
                description: `Récupérer une entrée de ${modelName} par ID`,
            },*/
            {
                method: 'PUT',
                endpoint: `/data/:id`,
                description: t('doc.api.updateData', { model: modelName }),
                body: {
                    model: modelName,
                    data: fields // Add some template for data
                }
            },
            {
                method: 'DELETE',
                endpoint: `/data/:id`,
                description: t('doc.api.deleteData', { model: modelName }),
            },
            {
                method: 'GET',
                endpoint: `/models`,
                description: t('doc.api.getModels', { model: modelName }),
            },
        ]);
        return endpoints;
    };

    const [tokenVisible, setTokenVisible] = useState(false);

    const objInit = {
        'Content-type': 'application/json',
        '_user': me?.username || 'demo',
        'Authorization': 'Bearer ' + me?.token,
    };
    const obj = {...objInit,
        'Authorization': 'Bearer ' + (tokenVisible ? me?.token : (me?.token || '').substring(0, 10) + '...'),
    };
    if( /^demo[0-9]{1,2}$/.test(me?.username))
        delete obj['Authorization'];
    const isProd = import.meta.env.MODE === 'production';
    const url = isProd ? 'https://'+getHost()+'/' : 'http://localhost:7632/';
    return (
        <div className="flex-1 api-info">
            <h2><Trans i18nKey={"doc.api.title"}>API Documentation</Trans></h2>
            <p className="hint">
                API source endpoint: <span className={"endpoint"}>{url + 'api'}</span><br/><br/>
                <a href={"/api-docs"} target="_blank"><FaFile/> Swagger / OpenAPI</a><br/>
                <a href={"/doc/API.postman_collection.json"} target="_blank"><FaFile/> Collections Postman
                    (v2.1)</a>
            </p>

            <h3><Trans i18nKey={"doc.api.auth"}>Authentification</Trans></h3>
            Headers :
            <div className="fs-mini"><CodeBlock text={JSON.stringify(obj, null, 2)}
                       language="json" theme={tomorrowNightBright}
                                                showLineNumbers={false}/></div>
            {me && !/^demo[0-9]{1,2}$/.test(me.username) && (
                <Button onClick={() => {
                    setTokenVisible(!tokenVisible)
                }}>{tokenVisible ? <Trans i18nKey={"doc.api.hideToken"}>Cacher le token</Trans> :
                    <Trans i18nKey={"doc.api.seeToken"}>Voir le token</Trans>}</Button>
            )}
            {selectedModel ? (
                <>
                    <div className="api-endpoints">
                        {apiEndpoints.map((endpoint, index) => <Test endpoint={endpoint} index={index} lang={lang} headers={objInit} />)}
                    </div>
                </>
            ) : (
                <p>Sélectionnez un modèle pour voir la documentation.</p>
            )}
            <h2><Trans i18nKey={"doc.api.modelSource"}>Source du modèle</Trans></h2>
            <div className="fs-mini"><CodeBlock text={JSON.stringify({...selectedModel, ...{locked: undefined, _id: undefined, _user: undefined}}, null, 2)} language="json"
                                                theme={tomorrowNightBright} showLineNumbers={false}/></div>
</div>
)
    ;
};

export default APIInfo;