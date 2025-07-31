import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {FaTrash, FaBox, FaExpandArrowsAlt, FaObjectGroup, FaEdit, FaFileAlt, FaPlay} from 'react-icons/fa';
import {CodeField, NumberField, SelectField, TextField} from './Field.jsx';
import ConditionBuilder from "./ConditionBuilder.jsx";
import {useQuery} from "react-query";

const FlexBuilderControls = ({
                                 flexStructure,
                                 selectedNode,
                                 models,
                                 user,
                                 lang,
                                 modelOptions,
                                 flexOptions,
                                 currentModelFields,
                                 onModelChange,
                                 onUpdateNode,
                                 onDeleteNode,
                                 onAddChildNode,
                                 onMakeItemNestedContainer,
                                 onSetIsFieldSelectorOpen,
                                 onSetEditingHtmlInfo,
                             }) => {
    const { t } = useTranslation();

    // 1. Récupérer la liste des endpoints GET disponibles pour les lier au bouton
    const { data: availableEndpoints } = useQuery(
        ['endpoints', 'GET'], // Clé de requête
        () => fetch('/api/data/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'endpoint',
                filter: { method: 'GET', isActive: true }
            })
        }).then(res => res.json()),
        {
            select: (response) => response.data || [], // On ne garde que le tableau de données
        }
    );

    // 2. Fonction pour ajouter un nouveau nœud de type CTA
    const handleAddCtaNode = () => {
        const newNode = {
            id: `cta-${Date.now()}`, // ID unique
            type: 'cta',
            label: 'Exécuter', // Label par défaut
            endpointPath: '', // Chemin à configurer
            // Ajoutez d'autres propriétés de style si nécessaire
        };
        // Logique pour ajouter ce nœud à la structure flex...
        // onChange(updatedStructure);
    };

    // 3. Dans le panneau de configuration (quand un nœud CTA est sélectionné)
    const renderCtaNodeEditor = (selectedNode) => {
        return (
            <div>
                <h4>Configurer le Bouton d'Action</h4>
                <TextField
                    label="Texte du bouton"
                    value={selectedNode.label}
                    onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                />
                <SelectField
                    label="Endpoint à appeler"
                    value={selectedNode.endpointPath}
                    onChange={(e) => updateNode(selectedNode.id, { endpointPath: e.target.value })}
                >
                    <option value="">-- Sélectionner un endpoint --</option>
                    {(availableEndpoints || []).map(ep => (
                        <option key={ep._id} value={ep.path}>
                            {ep.name} (/api/actions/{ep.path})
                        </option>
                    ))}
                </SelectField>
            </div>
        );
    };
    const handleDataLimitChange = (e) => {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 8) value = 8;
        onUpdateNode(flexStructure.id, 'dataLimit', value);
    };

    const handleRefreshIntervalChange = (e) => {
        onUpdateNode(flexStructure.id, 'refreshInterval', parseInt(e.target.value, 10) || 0);
    };

    return (
        <div className="flex-builder-controls">
            {/* Section des paramètres de données */}
            <h3>{t('dataSettings', 'Paramètres des données')}</h3>
            <div className="control-group">
                <label htmlFor="selectedModel">{t('flexBuilder.selectDataModel', 'Modèle de données')}:</label>
                <SelectField
                    id="selectedModel"
                    value={flexStructure.selectedModelName}
                    onChange={(selected) => onModelChange(selected.value)}
                    items={[{
                        value: null,
                        label: t('flexBuilder.selectAModel', 'Sélectionner un modèle...')
                    }, ...modelOptions]}
                />
            </div>
            {flexStructure.selectedModelName && (
                <>
                    <label>{t('dataFilter', 'Filtre des données')}:</label>
                    <div className="control-group">
                        <ConditionBuilder
                            modelFields={models.find(f => f.name === flexStructure.selectedModelName)?.fields || []}
                            model={flexStructure.selectedModelName}
                            models={models}
                            selectableModels={false}
                            initialValue={flexStructure.dataFilter}
                            onChange={(newCondition) => onUpdateNode(flexStructure.id, 'dataFilter', newCondition || {})}
                            lang={lang}
                        />
                    </div>
                    <div className="form">
                        <NumberField
                            label={t('flexBuilder.dataLimit', "Nombre d'éléments affichés (1-8)")}
                            id="flex-data-limit"
                            value={flexStructure.dataLimit || 1}
                            onChange={handleDataLimitChange}
                            min="1"
                            max="8"
                        />
                        <NumberField
                            label={t('flexBuilder.refreshInterval', "Intervalle de rafraîchissement (ms)")}
                            id="flex-refresh-interval"
                            value={flexStructure.refreshInterval || 60000}
                            onChange={handleRefreshIntervalChange}
                            min="0"
                            placeholder="0 pour désactiver"
                        />
                    </div>
                </>
            )}



            {/* Section des paramètres du nœud sélectionné */}
            {selectedNode && (
                <div className="selected-node-controls">
                    <h4>
                        {t('flexBuilder.selectedNodeSettings', 'Paramètres')}: {t(selectedNode.type)} ({selectedNode.id.substring(0, 8)})
                        {selectedNode.id !== flexStructure.id &&
                            <button onClick={onDeleteNode} className="btn-delete-node"
                                    title={t('flexBuilder.deleteThisNode', 'Supprimer cet élément')}><FaTrash/></button>
                        }
                    </h4>
                    {selectedNode.type === 'cta' && (
                        <>
                            <p>{t('flexBuilder.ctaControlsTitle', 'Propriétés du Bouton d\'Action:')}</p>
                            <TextField
                                label={t('flexBuilder.ctaLabel', 'Texte du bouton')}
                                value={selectedNode.label || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, 'label', e.target.value)}
                            />
                            <SelectField
                                label={t('flexBuilder.ctaEndpoint', 'Endpoint à appeler')}
                                value={selectedNode.endpointPath || ''}
                                onChange={(sel) => onUpdateNode(selectedNode.id, 'endpointPath', sel.value)}
                                items={[
                                    {value: '', label: t('flexBuilder.selectAnEndpoint', 'Select an endpoint')},
                                    ...availableEndpoints.map(ep => ({
                                        value: ep.path,
                                        label: `${ep.name} (/api/actions/${ep.path})`
                                    }))
                                ]}
                            />
                            <hr className="my-4 border-gray-600"/>
                            <p>{t('flexBuilder.ctaRequestConfig', 'Configuration de la requête')}</p>
                            <SelectField
                                label={t('flexBuilder.httpMethod', 'Méthode HTTP')}
                                value={selectedNode.httpMethod || 'GET'}
                                onChange={(sel) => onUpdateNode(selectedNode.id, 'httpMethod', sel.value)}
                                items={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({value: m, label: m}))}
                            />

                            {/* Affiche l'éditeur de corps de requête pour les méthodes appropriées */}
                            {(selectedNode.httpMethod === 'POST' || selectedNode.httpMethod === 'PUT' || selectedNode.httpMethod === 'PATCH') && (
                                <div className="form-group">
                                    <label>{t('flexBuilder.requestBody', 'Corps de la requête (JSON)')}</label>
                                    <CodeField
                                        language="json"
                                        value={selectedNode.requestBodyTemplate || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, 'requestBodyTemplate', e.value)}
                                        placeholder={`{\n  "productId": "{{_id}}",\n  "name": "{{name}}"\n}`}
                                        rows={5}
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label>{t('flexBuilder.requestQuery', 'Paramètres de requête (JSON)')}</label>
                                <CodeField
                                    language="json"
                                    value={selectedNode.requestQueryTemplate || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, 'requestQueryTemplate', e.value)}
                                    placeholder={`{\n  "source": "dashboard",\n  "userId": "{{user._id}}"\n}`}
                                    rows={4}
                                />
                            </div>
                            <small
                                className="block my-2 text-xs text-gray-500">{t('flexBuilder.usePlaceholders', 'Utilisez "{{fieldName}}" pour insérer des données de l\'élément courant. Le champ doit être une chaîne de caractères.')}</small>

                        </>
                    )}
                    {/* Contrôles pour un conteneur */}
                    {selectedNode.type === 'container' && (
                        <>
                            <p>{t('flexBuilder.containerControlsTitle', 'Propriétés du conteneur Flex:')}</p>
                            <div className="control-group actions">
                                <button onClick={() => onAddChildNode(selectedNode.id, 'item')}>
                                    <FaBox/> {t('flexBuilder.addItem', 'Ajouter une case')}</button>
                                <button onClick={() => onAddChildNode(selectedNode.id, 'container')}>
                                    <FaExpandArrowsAlt/> {t('flexBuilder.addNestedContainer', 'Ajouter un conteneur')}
                                </button>
                                <button onClick={() => onAddChildNode(selectedNode.id, 'cta')}>
                                    <FaPlay/> {t('flexBuilder.addCtaButton', 'Ajouter un Bouton CTA')}
                                </button>
                            </div>
                            <div className="control-group"><label>{t('flexDirection')}:</label><SelectField
                                items={flexOptions.flexDirection.map(o => ({label: t(o, o), value: o}))}
                                value={selectedNode.containerStyle.flexDirection}
                                onChange={sel => onUpdateNode(selectedNode.id, 'containerStyle.flexDirection', sel.value)}/>
                            </div>
                            <div className="control-group"><label>{t('flexWrap')}:</label><SelectField
                                items={flexOptions.flexWrap.map(o => ({label: t(o, o), value: o}))}
                                value={selectedNode.containerStyle.flexWrap}
                                onChange={sel => onUpdateNode(selectedNode.id, 'containerStyle.flexWrap', sel.value)}/>
                            </div>
                            <div className="control-group"><label>{t('justifyContent')}:</label><SelectField
                                items={flexOptions.justifyContent.map(o => ({label: t(o, o), value: o}))}
                                value={selectedNode.containerStyle.justifyContent}
                                onChange={sel => onUpdateNode(selectedNode.id, 'containerStyle.justifyContent', sel.value)}/>
                            </div>
                            <div className="control-group"><label>{t('alignItems')}:</label><SelectField
                                items={flexOptions.alignItems.map(o => ({label: t(o, o), value: o}))}
                                value={selectedNode.containerStyle.alignItems}
                                onChange={sel => onUpdateNode(selectedNode.id, 'containerStyle.alignItems', sel.value)}/>
                            </div>
                            <div className="control-group"><label>{t('gap')}:</label><input type="text"
                                                                                            value={selectedNode.containerStyle.gap || ''}
                                                                                            onChange={e => onUpdateNode(selectedNode.id, 'containerStyle.gap', e.target.value)}
                                                                                            placeholder="ex: 10px"/>
                            </div>
                            <div className="form-group"><CodeField id="customCss" name="customCss" language="css"
                                                                   value={selectedNode.containerStyle.customCss || ''}
                                                                   onChange={(e) => onUpdateNode(selectedNode.id, 'containerStyle.customCss', e.value)}
                                                                   placeholder={t('flexBuilder.customCssPlaceholder', 'Ex: background-color: red;')}
                                                                   rows={4}/></div>
                        </>
                    )}

                    {/* Contrôles pour un item */}
                    {selectedNode.type === 'item' && (
                        <>
                            <p>{t('flexBuilder.itemControlsTitle', 'Propriétés de la case:')}</p>
                            <div className="control-group actions">
                                {flexStructure.selectedModelName && (
                                    <button onClick={() => onSetIsFieldSelectorOpen(true)}>
                                        <FaEdit/> {selectedNode.content.type === 'dataField' ? t('flexBuilder.editDataMapping', 'Modifier le champ lié') : t('flexBuilder.mapDataField', 'Lier un champ de données')}
                                    </button>
                                )}
                                <button onClick={(e) => {
                                    onSetEditingHtmlInfo({
                                        nodeId: selectedNode.id,
                                        initialContent: selectedNode.content.html || ''
                                    });
                                    e.stopPropagation()
                                }}>
                                    <FaFileAlt/> {t('flexBuilder.editHTML', 'Éditer le contenu')}
                                </button>
                                {selectedNode.content.type !== 'nestedContainer' && (
                                    <button onClick={() => onMakeItemNestedContainer(selectedNode.id)}>
                                        <FaObjectGroup/> {t('flexBuilder.makeNestedContainer', 'Transformer en conteneur')}
                                    </button>
                                )}
                            </div>
                            <div className="control-group"><label>{t('itemWidth')}:</label><input type="text"
                                                                                                  value={selectedNode.itemStyle.width || ''}
                                                                                                  onChange={e => onUpdateNode(selectedNode.id, 'itemStyle.width', e.target.value)}
                                                                                                  placeholder="ex: 100px, 20%"/>
                            </div>
                            <div className="control-group"><label>{t('itemHeight')}:</label><input type="text"
                                                                                                   value={selectedNode.itemStyle.height || ''}
                                                                                                   onChange={e => onUpdateNode(selectedNode.id, 'itemStyle.height', e.target.value)}
                                                                                                   placeholder="ex: 50px, auto"/>
                            </div>
                            <div className="control-group">
                                <label>{t('flexBuilder.itemFlexGrow', 'Flex Grow')}:</label><input type="number"
                                                                                                   value={selectedNode.itemStyle.flexGrow || 0}
                                                                                                   onChange={e => onUpdateNode(selectedNode.id, 'itemStyle.flexGrow', parseFloat(e.target.value) || 0)}
                                                                                                   min="0" step="0.1"/>
                            </div>
                            <div className="control-group">
                                <label>{t('flexBuilder.itemFlexShrink', 'Flex Shrink')}:</label><input type="number"
                                                                                                       value={selectedNode.itemStyle.flexShrink === undefined ? 1 : selectedNode.itemStyle.flexShrink}
                                                                                                       onChange={e => onUpdateNode(selectedNode.id, 'itemStyle.flexShrink', parseFloat(e.target.value))}
                                                                                                       min="0"
                                                                                                       step="0.1"/>
                            </div>
                            <div className="control-group">
                                <label>{t('flexBuilder.itemFlexBasis', 'Flex Basis')}:</label><input type="text"
                                                                                                     value={selectedNode.itemStyle.flexBasis || 'auto'}
                                                                                                     onChange={e => onUpdateNode(selectedNode.id, 'itemStyle.flexBasis', e.target.value)}
                                                                                                     placeholder="auto, 100px, 20%"/>
                            </div>
                            <div className="form-group"><CodeField id="customCssItem" name="customCssItem"
                                                                   language="css"
                                                                   value={selectedNode.itemStyle.customCss || ''}
                                                                   onChange={(e) => onUpdateNode(selectedNode.id, 'itemStyle.customCss', e.value)}
                                                                   placeholder={t('flexBuilder.customCssPlaceholder', 'Ex: background-color: blue;')}
                                                                   rows={4}/></div>
                        </>
                    )}
                </div>
            )}
            {!selectedNode &&
                <p className="no-node-selected-hint">{t('flexBuilder.clickToSelectNode', 'Cliquez sur un élément dans l\'aperçu pour le configurer.')}</p>
            }
        </div>
    );
};

FlexBuilderControls.propTypes = {
    flexStructure: PropTypes.object.isRequired,
    selectedNode: PropTypes.object,
    models: PropTypes.array.isRequired,
    user: PropTypes.object,
    lang: PropTypes.string.isRequired,
    modelOptions: PropTypes.array.isRequired,
    flexOptions: PropTypes.object.isRequired,
    currentModelFields: PropTypes.array.isRequired,
    onModelChange: PropTypes.func.isRequired,
    onUpdateNode: PropTypes.func.isRequired,
    onDeleteNode: PropTypes.func.isRequired,
    onAddChildNode: PropTypes.func.isRequired,
    onMakeItemNestedContainer: PropTypes.func.isRequired,
    onSetIsFieldSelectorOpen: PropTypes.func.isRequired,
    onSetEditingHtmlInfo: PropTypes.func.isRequired,
};

export default FlexBuilderControls;