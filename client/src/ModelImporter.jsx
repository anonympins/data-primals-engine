import React, {useState, useEffect} from 'react';
import { useModelContext } from './contexts/ModelContext.jsx';
import { useAuthContext } from './contexts/AuthContext.jsx';
import {Trans, useTranslation} from 'react-i18next';
import {FaArrowDown, FaInfo} from 'react-icons/fa';
import { CheckboxField } from './Field.jsx';
import Button from './Button.jsx';
import { useQueryClient } from 'react-query';
import { useNotificationContext } from './NotificationProvider.jsx';
import {metaModels} from "../../src/constants.js";


const ModelImporter = ({ onImport }) => {

    const { models } = useModelContext();
    const { me } = useAuthContext();
    const { t } = useTranslation();

    const [selectedModels, setSelectedModels] = useState([]);
    return <>
        <h2>{t('btns.importModels', 'Importer un modèle')}</h2>
        <div className="models-import">
            <div className="msg msg-info">
                <FaInfo/>
                <Trans i18nKey="modelimporter.info">
                    Importez des modèles dans votre base de donnée pour générer rapidement votre API
                    ou étendre ceux-ci.
                </Trans>
            </div>
            {Object.keys(metaModels).map(metaModel => {
                const mods = metaModels[metaModel]['load'];
                const found = true;
                return found ? <>
                    <h2 className="shadow flex">
                        <div className="flex-1">{t(`metamodel_${metaModel}`, metaModel)}</div>
                        <FaArrowDown style={{opacity:0.2}}/>
                    </h2>
                    <div className="list">{mods.map(m => {
                        const model = models.find(f=> f.name === m);
                        if( !model )
                            console.warn("model" + m + " not found");
                        if (model && !models.find(m => m.name === model.name && m._user === me?.username))
                            return <><ModelImporterItem model={model} onUnselect={(model) => {
                                setSelectedModels(models => models.filter(f => f.name !== model.name));
                            }} onSelect={(model) => {
                                if(!selectedModels.find(f => f.name === model.name)) {
                                    gtag('event', 'select_content', {
                                        content_type: 'import_model',
                                        content_id: model.name
                                    });

                                    const rec = [];

                                    const addRequiredMods = (model) => {
                                        let mods = [];
                                        model.fields.forEach(field =>{
                                            if( field.type ==='relation'){
                                                const relMod = models.find(f => f.name === field.relation);
                                                if( !relMod)
                                                    return;
                                                if (models.some(m => m._user === me?.username && m.name === relMod.name))
                                                    return;
                                                if( !rec.includes(relMod.name) ) {
                                                    mods.push(relMod);
                                                    rec.push(relMod.name);
                                                    mods = mods.concat(addRequiredMods(relMod));
                                                }
                                            }
                                        })
                                        return [...new Set(mods)];
                                    };

                                    const allMods = [model, ...addRequiredMods(model)];

                                    setSelectedModels(models => [...new Set([...models, ...allMods])])
                                }
                            }} selected={selectedModels.some(f=>f.name===model.name)} /></>
                    })}</div></> : <></>;
            })}
        </div>
        <div className="flex actions">
            <Button onClick={() => {
                onImport(selectedModels);
            }}>Importer les modèles ( {selectedModels.length} )</Button>
        </div>
    </>
}

const ModelImporterItem = ({ model, onUnselect, onSelect, selected }) => {

    const { t } = useTranslation();
    const [, setSelected] = useState(false);

    useEffect(() => {
        setSelected(selected);
    }, [selected]);

    if( !model )
        return;
    const deps = [...new Set((model.fields || []).filter(f=> f.type === 'relation' && f.relation !== model?.name).map(f=> t(`model_${f.relation}`, f.relation)))];
    return <div className={`model-importer-item ${selected ? 'active' : ''}`} onClick={() => {
        setSelected(!selected);
        if (!selected)
            onSelect(model);
        else
            onUnselect(model);
    }}>
        <CheckboxField checked={selected} onChange={e => {
            setSelected(e.target.checked)
            if (e.target.checked)
                onSelect(model);
            else
                onUnselect(model);
        }} label={t(`model_${model.name}`, model.name)} />
        <ul>
            <li>{t(`model_description_${model.name}`, model.description)}</li>
            {deps.length > 0 &&<li> <><Trans i18nKey="modelimporter.requires">Requiert : </Trans> {deps.join(', ')}</></li>}
        </ul>
    </div>;
}


export { ModelImporter, ModelImporterItem };