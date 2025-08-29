// src/components/FlexDataRenderer.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {FaCheckSquare, FaCopy, FaExternalLinkAlt, FaImage, FaRegSquare} from 'react-icons/fa';
import './FlexDataRenderer.scss';
import {useModelContext} from "./contexts/ModelContext.jsx";
import RelationValue from "./RelationValue.jsx";
import {CodeField, ColorField} from "./Field.jsx";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {DialogProvider} from "./Dialog.jsx";

// Helper for date formatting
const formatDate = (value, type, t) => {
    if (!value) return '';
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return t('flexDataRenderer.invalidDate', 'Date invalide');

        // Adjust formatting as needed, or use a library like date-fns or moment
        if (type === 'datetime-local' || type === 'datetime') {
            return date.toLocaleString();
        }
        if (type === 'date') {
            return date.toLocaleDateString();
        }
        return date.toISOString(); // Fallback
    } catch (e) {
        console.error("Error formatting date:", e);
        return t('flexDataRenderer.invalidDate', 'Date invalide');
    }
};

const FlexDataRenderer = ({ value, fieldDefinition,data }) => {
    const { t, i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const {models} = useModelContext()
    const {me} = useAuthContext()

    // 'translatedLabel' is added by getFieldDefinitionByPath
    const field = fieldDefinition;
    const translatedLabel = t('model_'+field.name, field.name);

    const renderContent = () => {

        if (value === undefined || value === null) {
            return <span className="data-value-empty">({t('flexDataRenderer.noValue', 'N/A')})</span>;
        }
        if( field.type === 'relation' && !models.find(f => f.name === field.relation && f._user === me?.username ))
            return '';
        if (field.type === "relation" && typeof field.relation === "string") {
            return <RelationValue field={field} data={data}/>;
        }
        if ((field.type === "date" || field.type === "datetime") && value) {
            return new Date(value).toLocaleDateString(i18n.resolvedLanguage || i18n.language, {
                day: "numeric",
                month: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "numeric"
            });
        }
        if (field.type === "enum") {
            return field.items.includes(value) ? `${t(value, value)}` : `${value || ''}`;
        }
        if (field.type === "code") {
            const v = typeof(value) === "string" ? value : (value ? JSON.stringify(value) : '');
            return <CodeField language={field.language} name={field.name} value={v} disabled={true} />
        }
        if (field.type === "object") {
            return <CodeField language={'json'} name={field.name} value={value ? JSON.stringify(value) : ''} disabled={true} />
        }
        if (field.type === 'email') {
            return <a href={"mailto:"+value}>{value}</a>;
        }
        if (field.type === 'phone') {
            return <a href={"tel:"+value}>{value}</a>;
        }
        if (field.type === 'model') {
            return value;
        }
        if (field.type === 'password') {
            return <></>;
        }
        if (field.type === 'array') {
            let t;
            if (field.itemsType === 'file') {
                t = (value || []).map(it =>
                    it &&
                    <a key={it.guid} href={`/resources/${it.guid}`} target="_blank"
                       rel="noopener noreferrer"><img src={`/resources/${it.guid}`}
                                                      alt={`${it.name} (${it.guid})`}/></a>
                );
                return {t};
            }
            return value.join(', ');
        }
        if (field.type === 'url') {
            return value && (<><a href={value}
                                           title={value} style={{color: field.color}}
                                           className={"link-value"}
                                           target="_blank">{value}</a>
                    <button title={"Copy URL"} onClick={(e) => {
                        navigator.clipboard.writeText(value).then(function () {
                            console.log('Async: Copying to clipboard was successful!');
                        }, function (err) {
                            console.error('Async: Could not copy text: ', err);
                        });
                    }}><FaCopy/></button>
                </>)
        }
        if (field.type === "file" && value) {
            if (['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/bmp', 'image/tiff', 'image/x-icon', 'image/x-windows-bmp'].includes(value.type))
                return <a
                    href={`/resources/${value.guid}`} target="_blank"
                    rel="noopener noreferrer"><img
                    src={`/resources/${value.guid}`}
                    alt={`${value.name} (${value.guid})`}/></a>;
            return <a style={{color: field.color}}
            href={`/resources/${value.guid}`}
            target="_blank"
            rel="noopener noreferrer">{value.name} ({value.guid})</a>;
        }
        if (field.type === 'number') {
            let val = value;
            if (val && field.unit) {
                let formatter = new Intl.NumberFormat(lang);
                val = formatter.format(value);
            }
            return val ? `${val} ${field.unit || ''}` : '';
        }
        if (field.type === "boolean") {
            return value ? t('yes') : t('no');
        }
        if (field.type === 'string_t') {
            return t(value.value, '') || value.key || (typeof(value) === 'string' ? value : '');
        }
        if (field.type === 'richtext') {
            return <div className="rte-value"
                     dangerouslySetInnerHTML={{__html: value}}></div>
        }
        if (field.type === 'color') {
            return <ColorField name={field.name} disabled={true}
                          value={value}/>;
        }
        return value;
    };

    return (
        renderContent()
    );
};

FlexDataRenderer.propTypes = {
    value: PropTypes.any,
    fieldDefinition: PropTypes.shape({
        name: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
        labelKey: PropTypes.string,
        label: PropTypes.string,
        translatedLabel: PropTypes.string,
        options: PropTypes.shape({
            items: PropTypes.arrayOf(PropTypes.shape({
                value: PropTypes.any.isRequired,
                label: PropTypes.string.isRequired,
                labelKey: PropTypes.string,
            }))
        }),
    }).isRequired,
};

export default FlexDataRenderer;