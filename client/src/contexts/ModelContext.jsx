// ModelContext.jsx
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import { useQueries, useQuery } from 'react-query';
import {getObjectHash} from "../../../src/core.js";
import {useAuthContext} from "./AuthContext.jsx";
import {getUserHash, getUserId} from "../../../src/data.js";
import {useTranslation} from "react-i18next";
import useLocalStorage from "../hooks/useLocalStorage.js";
import {pagedFilterToMongoConds} from "../filter.js";

const ModelContext = createContext(null);

export const ModelProvider = ({ children }) => {
    const [models, setModels] = useState([]);
    const [datasToLoad, setDatasToLoad] = useState([]);
    const [pagedFilters,setPagedFilters] = useLocalStorage('paged_filters', {});
    const [pagedDepth,setPagedDepth] = useState({});
    const [filteredDatasToLoad, setFilteredDatasToLoad] = useState([]);
    const [onSuccessCallbacks, setOnSuccessCallbacks] = useState({});
    const [selectedModel, setSelectedModel] = useState(null);
    const [relationFilters, setRelationFilters] = useState({});
    const [relationIds, setRelationIds] = useState({});
    const [page, setPage] = useState(1);
    const [elementsPerPage, setElementsPerPage] = useState(20);
    const [relationModels, setRelationModels] = useState([]);
    const [pagedSort, setPagedSort] = useState({})
    const [lockedColumns, setLockedColumns] = useState([])
    const [generatedModels, setGeneratedModels] = useLocalStorage('ai_generated_models', []);

    const updateRelationIds = (modelName, ids, cb) => {
        setRelationIds((prevIds) => {
            cb?.();
            return {
                ...prevIds,
                [modelName]: ids,
            };
        });
    };


    const { me } = useAuthContext();
    const { t, i18n } = useTranslation()
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const { data: dataModels = [], isFetched } = useQuery(['api/models', me], () => {
        if(!me)
            return Promise.reject();
        return fetch(`/api/models?lang=${lang}&_user=${encodeURIComponent(getUserId(me))}`).then((res) => {
            if( !res.ok ){
                return [];
            }
            return res.json();
        })}, {
            onSuccess: (data, d) => {
                if( typeof(data) === 'object' && data.success === false) {
                    return;
                }
                setModels(data);
            }, onError: () => {
                setModels([])
        }, enabled: !!me});

    const allModels = useMemo(() => {
        // On filtre les modèles générés pour ne pas inclure ceux qui ont le même nom qu'un modèle déjà sauvegardé.
        const uniqueGeneratedModels = generatedModels.filter(
            genModel => !dataModels.some(apiModel => apiModel._user === genModel._user && apiModel.name === genModel.name)
        );
        return [...dataModels, ...uniqueGeneratedModels];
    }, [dataModels, generatedModels]);

    useEffect(() => {
        if (selectedModel) {
            const rels = selectedModel.fields
                .filter((f) => f.type === 'relation')
                .map((m) => m.relation);
            setRelationModels(rels);
        }
    }, [selectedModel]);

    // This effect synchronizes the selected model with the list of models to load paginated data for.
    // It's crucial for isolated components like RelationSelectorWidget that use their own ModelProvider.
    // When a model is selected in such a widget, this ensures the DataTable inside it will fetch and display data.
    useEffect(() => {
        if (selectedModel?.name) {
            setFilteredDatasToLoad([selectedModel.name]);
        }
    }, [selectedModel]);

    let abortController = new AbortController();

    const [relations, setRelations] = useState([]);

    const rawQueries = models
        ?.filter((f) => datasToLoad?.includes(f.name))
        .map((model) => {
            const rels = relationIds[model.name]?.filter(Boolean) || [];
            if( rels.length === 0)
                return Promise.resolve({data:[], count:0});
            const params = new URLSearchParams();
            params.append('model', model.name);
            params.append('lang', lang);
            params.append("_user", getUserId(me));
            params.append("depth", '1')

            let ids = [...new Set(rels.map(r => r._id || r))].join(',');
            if (rels && rels.length > 0) {
                // Cas des relations : requête par IDs, sans pagination
                params.append('ids', ids);
            }
            return ({
                queryKey: ['api/data', model.name, params.toString()], // Ajout de page et relationIds à la clé de requête
                queryFn: ({signal}) => {
                    if(!me)return Promise.reject();
                    const rel = relations['api/data'+model.name+getObjectHash({ids})];
                    if( rel){
                        return Promise.resolve(rel);
                    }
                    return fetch(`/api/data/search?${params.toString()}`, { signal, method: 'POST', headers: { "Content-Type": "application/json"}})
                        .then((res) => res.json())
                        .then((e) => ({
                            count: e.count,
                            data: (e.data || []).map((m) => {

                                const mod = {...m, _model: model.name};
                                // Parcourir les champs pour normaliser les relations
                                model.fields.forEach(field => {
                                    if (field.type === 'relation') {
                                        const relationValue = mod[field.name];

                                        if (field.multiple) {
                                            // Pour les relations multiples, on s'assure d'avoir un tableau d'IDs.
                                            if (Array.isArray(relationValue)) {
                                                // On extrait l'_id de chaque objet, ou on garde la valeur si c'est déjà un ID.
                                                mod[field.name] = relationValue.map(item => item?._id || item);
                                            } else {
                                                // Si ce n'est pas un tableau, on met un tableau vide pour éviter les erreurs.
                                                mod[field.name] = [];
                                            }
                                        } else {
                                            // Pour une relation simple, on veut juste l'ID ou null.
                                            if (typeof relationValue === 'object' && relationValue !== null) {
                                                // Gère les cas où la relation est un objet { _id: "..." } ou un tableau [ { _id: "..." } ]
                                                const item = Array.isArray(relationValue) ? relationValue[0] : relationValue;
                                                mod[field.name] = item?._id || null;
                                            } else {
                                                // La valeur est déjà un ID (string) ou null/undefined. On la garde telle quelle.
                                                mod[field.name] = relationValue || null;
                                            }
                                        }
                                    }
                                });
                                return mod;
                            })
                        }))
                },
                enabled: !!selectedModel && !!me,
                onSuccess: (data)=>{
                },
                onSettled: (data)=>{
                    const dt = {...relations};
                    dt['api/data'+model.name+getObjectHash({ids})] = data;
                    setRelations(dt);
                    try{
                        if (onSuccessCallbacks?.['api/data/'+model.name])
                            Object.keys(onSuccessCallbacks?.['api/data/'+model.name]).forEach(cb => onSuccessCallbacks?.['api/data/'+model.name][cb](data));
                    } catch (e) {
                        console.error(e);
                    }
                }
            })
        }) || [];

    const rawQueriesPage = models
        ?.filter((f) => filteredDatasToLoad?.includes(f.name))
        .map((model) => ({
            queryKey: ['api/data', model.name, 'page', page, elementsPerPage,pagedFilters[model.name], pagedSort[model.name], lang], // Ajout de page et relationIds à la clé de requête
            queryFn: ({signal}) => {

                const params = new URLSearchParams();
                params.append('model', model.name);
                params.append("_user", getUserId(me));

                // Cas de la table de données : requête paginée
                params.append('lang', lang);
                params.append('limit', elementsPerPage+'');
                params.append('page', page+'');
                params.append("depth", '1');

                const sortParam = [];

                lockedColumns.forEach(s => {
                    sortParam.push(s + ':' + (pagedSort[model.name]?.[s] > 0 ? 'ASC' : 'DESC'));
                });
                Object.keys(pagedSort[model.name] || {}).forEach(s => {
                    if( !lockedColumns.includes(s))
                        sortParam.push(s + ':' + (pagedSort[model.name]?.[s] > 0 ? 'ASC' : 'DESC'));
                })
                if( sortParam.length )
                    params.append("sort", sortParam.join(','));

                const c = pagedFilterToMongoConds(pagedFilters, model)
                const filter= JSON.stringify({filter:{$and:c}});

                return fetch(`/api/data/search?${params.toString()}`, { signal, method: 'POST', body: filter, headers: { "Content-Type": "application/json"}})
                    .then((res) => res.json())
                    .then((e) => {
                        return {
                            count: e.count || 0,
                                data: (e.data || []).map((m) => {
                                    const mod = {...m, _model: model.name};
                                    return mod;
                                }),
                        }
                    });
            },
            enabled: !!selectedModel,
            onSettled: (data)=>{
                try {
                    Object.keys(onSuccessCallbacks?.['api/data/' + model.name + '/paged'] || []).forEach(cb => {
                        onSuccessCallbacks?.['api/data/' + model.name + '/paged'][cb](data)
                    });
                } catch (e){
                    console.error(e)
                }
            },
            onError: (e)=>{
                console.error(e)
            }
        })) || [];

    const modelQueries = useQueries(rawQueries);
    const paginateQueries = useQueries(rawQueriesPage);
    const countByModel = {};

    const dataByModel = models.reduce((acc, model) => {
        const query = modelQueries.find(
            (q) => q.data?.data.length && q.data.data[0]._model === model.name
        );
        if (query?.isSuccess) {
            acc[model.name] = query.data.data;
        } else {
            acc[model.name] = [];
        }
        return acc;
    }, {});

    const paginatedDataByModel = models.reduce((acc, model) => {
        const query = paginateQueries.find(
            (q) => q.data?.data.length && q.data.data[0]._model === model.name
        );
        if (query?.isSuccess) {
            acc[model.name] = query.data.data;
            countByModel[model.name] = query.data.count;
        } else {
            acc[model.name] = [];
            countByModel[model.name] = 0;
        }
        return acc;
    }, {});

    const relatedData = {};
    models.forEach((model) => {
        model.fields.forEach((field) => {
            if (field.type === 'relation') {
                const relatedModelName = field.relation;
                relatedData[relatedModelName] = dataByModel[relatedModelName];
            }
        });
    });

    const contextValue = {
        models: allModels,
        setModels,
        page,
        setPage,
        countByModel,
        selectedModel,
        setSelectedModel,
        datasToLoad,
        setDatasToLoad,
        pagedFilters,
        setPagedFilters,
        dataByModel,
        paginatedDataByModel,
        filteredDatasToLoad,
        setFilteredDatasToLoad,
        relatedData,
        setRelationIds,
        setRelationFilters,
        relationIds,
        updateRelationIds,
        getObjectHash,
        onSuccessCallbacks,
        setOnSuccessCallbacks,
        pagedSort,
        setPagedSort,
        lockedColumns,
        setLockedColumns,
        elementsPerPage,
        setElementsPerPage,
        relations,
        setRelations,
        generatedModels,
        setGeneratedModels
    };

    const func = useCallback(() => {
        setRelations({});
    }, []);
    useEffect(() => {
        window.addEventListener('visibilitychange', func);
        return () => window.removeEventListener('visibilitychanges', func);
    }, []);
    useEffect(() => {
        if( selectedModel && page )
            setRelations({});
    }, [selectedModel, page, pagedFilters]);
    return (
        <ModelContext.Provider value={contextValue}>
            {children}
        </ModelContext.Provider>
    );
};

export const useModelContext = () => {
    const context = useContext(ModelContext);
    if (context === null) {
        throw new Error('useModelContext doit être utilisé dans un ModelProvider');
    }
    return context;
};