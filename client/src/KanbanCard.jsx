// client/src/KanbanCard.jsx

import React from 'react';
import {useTranslation} from "react-i18next";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {getDataAsString} from "../../src/data.js";


const KanbanCard = ({ card, model, subItemsField }) => {

    const {models} = useModelContext()
    const subItems = subItemsField && card[subItemsField] ? card[subItemsField] : [];
    const tr = useTranslation();
    // Logique du Drag & Drop natif pour la carte

    const lang = (tr.i18n.resolvedLanguage || tr.i18n.language).split(/[-_]/)?.[0];

    const getfield = (model, data) => {
        const v = getDataAsString(model, data, tr, models);
        if(!v){
            return model.fields.map((field) => {
                    if( field.type === 'array' && field.itemsType === 'file'){
                        return card[field.name].map(it => {
                            const r = `
                            <strong>filename</strong> : ${it.filename}<br />
                            <strong>guid</strong> : ${it.guid}<br />
                            <strong>type</strong> : ${it.mimeType}<br />
                            <strong>size</strong> : ${it.size} bytes<br />
                            <strong>timestamp</strong> : ${it.timestamp ? new Date(it.timestamp).toLocaleString(lang) : ''}
                        `;
                            return <a key={it.guid} href={`/resources/${it.guid}`} target="_blank"
                                      data-tooltip-id={"tooltipFile"} data-tooltip-html={r}
                                      rel="noopener noreferrer" onClick={(e) => click(e, i)}><img
                                className="image" src={`/resources/${it.guid}`}
                                alt={`${it.name} (${it.guid})`}/></a>
                        });
                    } else if(field.type === 'file'){
                        const it = card[field.name];
                        const r = `
                            <strong>filename</strong> : ${it.filename}<br />
                            <strong>guid</strong> : ${it.guid}<br />
                            <strong>type</strong> : ${it.mimeType}<br />
                            <strong>size</strong> : ${it.size} bytes<br />
                            <strong>timestamp</strong> : ${it.timestamp ? new Date(it.timestamp).toLocaleString(lang) : ''}
                        `;
                        return <a key={it.guid} href={`/resources/${it.guid}`} target="_blank"
                                  data-tooltip-id={"tooltipFile"} data-tooltip-html={r}
                                  rel="noopener noreferrer" onClick={(e) => click(e, i)}><img
                            className="image" src={`/resources/${it.guid}`}
                            alt={`${it.name} (${it.guid})`}/></a>
                    }
                    return '';
            }).filter(Boolean)[0];
        }
        return v;
    }

    return (
        <div
            className="kanban-card"
        >
            <div className="kanban-card-title">
                {getfield(model, card)}
            </div>
            {subItems.length > 0 && (
                <div className="kanban-card-subitems">
                    {subItems.map((subItem, index) => {
                        const it = subItem;
                        const v = getDataAsString(model, subItem, tr, models);
                        if (!v) {
                            const r = `
                            <strong>filename</strong> : ${it.filename}<br />
                            <strong>guid</strong> : ${it.guid}<br />
                            <strong>type</strong> : ${it.mimeType}<br />
                            <strong>size</strong> : ${it.size} bytes<br />
                            <strong>timestamp</strong> : ${it.timestamp ? new Date(it.timestamp).toLocaleString(lang) : ''}
                        `;
                            return <a key={it.guid} href={`/resources/${it.guid}`} target="_blank"
                                      data-tooltip-id={"tooltipFile"} data-tooltip-html={r}
                                      rel="noopener noreferrer" onClick={(e) => click(e, i)}><img
                                className="image" src={`/resources/${it.guid}`}
                                alt={`${it.name} (${it.guid})`}/></a>
                        }
                        return '';
                    })}
                </div>
            )}
        </div>
    );
};

export default KanbanCard;