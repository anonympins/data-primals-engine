// C:/Dev/hackersonline-engine/client/src/DisplayFlexNodeRenderer.jsx
import {useTranslation} from "react-i18next";
import {cssProps} from "data-primals-engine/core";
import FlexDataRenderer from "./FlexDataRenderer.jsx";
import React from "react";
import {getFieldPathValue} from "data-primals-engine/data";
import {getFieldDefinitionFromPath} from "./core/data.js";

const DisplayFlexNodeRenderer = ({ node, data, dataIndexRef, allModels, baseModelFields, model }) => {
    const { t } = useTranslation();

    const baseStyle = node.type === 'container' ? node.containerStyle : node.itemStyle;
    // MODIFICATION: Correction pour appliquer le CSS custom sur les items aussi
    const customCssStyle = (node.type === 'container' ? node.containerStyle?.customCss : node.itemStyle?.customCss) || '';
    const customStyle = customCssStyle ? cssProps(customCssStyle) : {};
    const nodeStyle = { ...baseStyle, border: 'none', ...customStyle };

    if (node.type === 'container') {
        return (
            <div
                className="flex-node preview-container"
                style={nodeStyle}
            >
                {node.children.length === 0 && <div className="empty-container-placeholder">{t('flexBuilder.emptyContainer', 'Conteneur vide.')}</div>}
                {node.children.map((child) => (
                    <DisplayFlexNodeRenderer
                        key={child.id || `flex-child-${Math.random()}`}
                        node={child}
                        data={data}
                        dataIndexRef={dataIndexRef}
                        allModels={allModels}
                        baseModelFields={baseModelFields}
                        model={model}
                    />
                ))}
            </div>
        );
    } else if (node.type === 'item') {
        let contentToRender;

        if (node.content.type === 'dataField' && node.content.mapping) {
            const dataItem = data && data.length > 0 ? data[dataIndexRef.current % data.length] : null;
            let fieldValue;
            let valueStatus = 'ok';

            if (dataItem) {
                fieldValue = getFieldPathValue(dataItem, node.content.mapping.fieldPath);
                if (fieldValue === undefined || fieldValue === null) {
                    valueStatus = 'valueNotFound';
                }
            } else {
                valueStatus = 'noDataAvailable';
            }

            const fieldDefinition = getFieldDefinitionFromPath(
                node.content.mapping.fieldPath,
                model,
                allModels
            );

            if (valueStatus === 'ok' && fieldDefinition) {
                contentToRender = (
                    <FlexDataRenderer
                        value={fieldValue}
                        data={dataItem}
                        fieldDefinition={fieldDefinition}
                    />
                );
            } else {
                const placeholderLabel = fieldDefinition?.translatedLabel || node.content.mapping.displayName || node.content.mapping.fieldPath;
                if (valueStatus === 'valueNotFound') {
                    contentToRender = null;
                } else if (valueStatus === 'noDataAvailable') {
                    contentToRender = <span className="preview-item-content-placeholder">{t('flexDataRenderer.noDataFor', '{{label}}: (pas de données)', { label: placeholderLabel })}</span>;
                } else {
                    contentToRender = <span className="preview-item-content-placeholder error">{t('flexDataRenderer.missingDefFor', '{{label}}: (erreur/déf. manquante)', { label: placeholderLabel })}</span>;
                }
            }
            dataIndexRef.current++;
        } else if (node.content.type === 'nestedContainer' && node.content.nestedContainer) {
            contentToRender = (
                <DisplayFlexNodeRenderer
                    node={node.content.nestedContainer}
                    data={data}
                    dataIndexRef={dataIndexRef}
                    allModels={allModels}
                    baseModelFields={baseModelFields}
                    model={model}
                />
            );
        } else if (node.content.type === 'richtext' && node.content.html) {
            // --- NOUVEAU : GESTION DU RICHTEXT ---
            contentToRender = (
                <div className="richtext-content" dangerouslySetInnerHTML={{ __html: node.content.html }} />
            );
        } else {
            contentToRender = (
                <span className="preview-item-content-placeholder">
                    {/* Placeholder pour les autres types ou les items non configurés */}
                </span>
            );
        }
        return (
            contentToRender && <div
                className={`flex-node preview-item ${node.content.type === 'dataField' ? 'is-data-badge-item' : ''} ${node.content.type === 'richtext' ? 'is-richtext-item' : ''}`}
                style={nodeStyle}
                title={node.content.type === 'dataField' && node.content.mapping ? `${t('mappedTo')} ${node.content.mapping.displayName}` : ''}
            >
                {contentToRender}
            </div>
        );
    }
    return null;
};
export { DisplayFlexNodeRenderer};