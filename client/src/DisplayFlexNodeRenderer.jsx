// C:/Dev/hackersonline-engine/client/src/DisplayFlexNodeRenderer.jsx
import {useTranslation} from "react-i18next";
import {cssProps} from "data-primals-engine/core";
import FlexDataRenderer from "./FlexDataRenderer.jsx";
import React, {useState} from "react";
import {getFieldPathValue} from "data-primals-engine/data";
import {getFieldDefinitionFromPath} from "./core/data.js";
import {Dialog, DialogProvider} from "./Dialog.jsx";
import {FaPlay} from "react-icons/fa";
import {substituteVariables} from "data-primals-engine/modules/workflow";

/**
 * Récupère une valeur imbriquée dans un objet (ex: 'user.address.city').
 */
const getNestedValue = (obj, path) => {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part] !== undefined ? acc[part] : undefined, obj);
};


/**
 * Remplace les placeholders {{...}} dans une chane de caractères JSON
 * par les valeurs de l'objet de données.
 * C'est une version simplifiée, spécifique au client.
 */
const substituteClientVariables = (templateString, dataObject) => {
    if (typeof templateString !== 'string' || !dataObject) {
        return templateString;
    }
    return templateString.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const value = getNestedValue(dataObject, key.trim());
        if (value === undefined) {
            return match; // Garde le placeholder si la valeur n'est pas trouvée
        }
        if (value === null) {
            return 'null';
        }
        // Pour les nombres et booléens, on les retourne tels quels.
        // Pour les chaînes, l'utilisateur doit mettre les guillemets dans le template : "name": "{{name}}"
        // Pour les objets, on les stringify pour éviter [object Object]
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return value;
    });
};

const CtaNode = ({ node, nodeStyle, dataItem }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleCtaClick = async () => {
        if (!node.endpointPath) return;
        setIsLoading(true);
        setResult(null);

        try {
            // 1. Construire l'URL finale avec les paramètres de requête
            let finalUrl = `/api/actions/${node.endpointPath}`;
            if (node.requestQueryTemplate) {
                const substitutedQuery = substituteClientVariables(node.requestQueryTemplate, dataItem);
                try {
                    const queryParams = JSON.parse(substitutedQuery || '{}');
                    const searchParams = new URLSearchParams(queryParams);
                    if (searchParams.toString()) {
                        finalUrl += `?${searchParams.toString()}`;
                    }
                } catch (e) {
                    console.error("Erreur lors du parsing des paramètres de requête JSON:", e, "Template:", substitutedQuery);
                }
            }

            // 2. Préparer les options du fetch (méthode, corps, etc.)
            const method = node.httpMethod || 'GET';
            const fetchOptions = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
            };

            if (method !== 'GET' && method !== 'HEAD' && node.requestBodyTemplate) {
                fetchOptions.body = substituteClientVariables(node.requestBodyTemplate, dataItem);
            }

            // 3. Exécuter la requête
            const response = await fetch(finalUrl, fetchOptions);
            const responseData = await response.json();
            setResult({ status: response.status, ok: response.ok, data: responseData });

        } catch (error) {
            setResult({ ok: false, error: error.message });
        } finally {
            setIsLoading(false);
            setIsModalOpen(true);
        }
    };

    return (
        <>
            <div className="flex-node preview-item" style={nodeStyle}>
                <button className="btn btn-primary" onClick={handleCtaClick} disabled={isLoading}>
                    {isLoading ? <span className="loading loading-spinner"></span> : <><FaPlay className="mr-2" />{node.label || 'Execute'}</>}
                </button>
            </div>
            <DialogProvider>
                {isModalOpen && (
                    <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Résultat de ${node.httpMethod} /api/actions/${node.endpointPath}`}>
                        <div className="p-4 bg-gray-900 text-white rounded-md mt-4">
                            <pre><code>{JSON.stringify(result, null, 2)}</code></pre>
                        </div>
                    </Dialog>
                )}
            </DialogProvider>
        </>
    );
};


const DisplayFlexNodeRenderer = ({ node, data, dataIndexRef, allModels, baseModelFields, model }) => {
    const { t } = useTranslation();
    const dataItem = data && data.length > 0 ? data[dataIndexRef.current % data.length] : null;

    const baseStyle = node.type === 'container' ? node.containerStyle : node.itemStyle;
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
    }

    if (node.type === 'cta') {
        // On utilise notre nouveau composant intelligent
        return <CtaNode node={node} nodeStyle={nodeStyle} dataItem={dataItem} />;
    }

    if (node.type === 'item') {
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