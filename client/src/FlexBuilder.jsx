import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import './FlexBuilder.scss';
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import { applyFilter } from "../../src/data.js";
import { FieldSelectorModal } from "./FlexNode.jsx";
import { deepInsertNode, deepRemoveNode } from "./FlexBuilderUtils.js";
import useDragAndDrop from './hooks/useDragAndDrop.js';
import RichTextEditorModal from "./RichTextEditorModal.jsx";
import FlexBuilderControls from './FlexBuilderControls.jsx';
import FlexBuilderPreview from './FlexBuilderPreview.jsx';
import {
    createNewNode,
    cleanNodeForOutput,
    findNodeRecursive,
    updateNodeRecursive,
    deleteNodeRecursive,
    clearMappingsRecursive
} from './FlexTreeUtils.js';
import {Dialog, DialogProvider} from "./Dialog.jsx";
import {safeAssignObject} from "data-primals-engine/core";

const FlexBuilder = ({ initialConfig = null, models = [], onChange, data = [], lang = 'fr' }) => {
    const { me: user } = useAuthContext();
    const { t } = useTranslation();
    const dnd = useDragAndDrop();

    const [editingHtmlInfo, setEditingHtmlInfo] = useState(null);

    const defaultConfig = useMemo(() => ({
        id: 'root', type: 'container',
        containerStyle: { customCss: '', display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', gap: '10px', padding: '10px', border: '1px dashed #999', width: '100%' },
        children: [createNewNode('container')],
        selectedModelName: null, dataFilter: null,
        dataLimit: 3, refreshInterval: 60000,
    }), [createNewNode]);

    // Fonction utilitaire pour construire l'état à partir de la configuration chargée.
    // Elle fusionne correctement les données par défaut, les métadonnées et la structure de la vue.
    const buildStateFromConfig = useCallback((config) => {
        if (config && config.flexStructure) {
            const { flexStructure: structureData, ...metaData } = config;
            return { ...defaultConfig, ...metaData, ...structureData };
        }
        return defaultConfig;
    }, [defaultConfig]);

    const [flexStructure, setFlexStructure] = useState(() => buildStateFromConfig(initialConfig));

    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const currentlyEditingViewIdRef = useRef(initialConfig?.id || null);

    useEffect(() => {
        const newViewId = initialConfig?.id || null;
        if (newViewId !== currentlyEditingViewIdRef.current) {
            // Utilise la même logique de construction d'état lors du changement de vue
            setFlexStructure(buildStateFromConfig(initialConfig));
            setSelectedNodeId(null);
            currentlyEditingViewIdRef.current = newViewId;
        }
    }, [initialConfig, buildStateFromConfig]);
    // --- FIN DE LA CORRECTION ---

    const selectedNode = useMemo(() => {
        if (!selectedNodeId) return null;
        if (flexStructure.id === selectedNodeId) return flexStructure;
        return findNodeRecursive(flexStructure.children, selectedNodeId);
    }, [flexStructure, selectedNodeId]);

    const currentModelFields = useMemo(() => {
        if (!flexStructure.selectedModelName || !Array.isArray(models)) return [];
        const model = models.find(m => m.name === flexStructure.selectedModelName);
        return model?.fields || [];
    }, [flexStructure.selectedModelName, models]);

    const filteredData = useMemo(() => {
        if (!flexStructure.selectedModelName) return [];
        return applyFilter(data || [], flexStructure.dataFilter);
    }, [data, flexStructure.dataFilter, flexStructure.selectedModelName]);

    const dataIndexRef = useRef(0);
    useEffect(() => { dataIndexRef.current = 0; }, [filteredData, flexStructure]);

    useEffect(() => {
        if (onChange) {
            const { children, containerStyle, id, type, ...rootProps } = flexStructure;
            const output = {
                ...rootProps,
                id: currentlyEditingViewIdRef.current,
                flexStructure: cleanNodeForOutput({ children, containerStyle, id, type }),
            };
            onChange(output);
        }
    }, [flexStructure, onChange]);

    const handleUpdateNode = (nodeId, propertyPath, value) => {
        setFlexStructure(prev => {
            const updateFn = (nodeToUpdate) => {
                const newNode = JSON.parse(JSON.stringify(nodeToUpdate)); // Deep copy for safety
                let current = newNode;
                const pathArray = propertyPath.split('.');
                for (let i = 0; i < pathArray.length - 1; i++) {
                    current[pathArray[i]] = current[pathArray[i]] || {};
                    current = current[pathArray[i]];
                }
                const key = pathArray[pathArray.length - 1];
                safeAssignObject(current, key, value);
                return newNode;
            };

            if (nodeId === prev.id) {
                if (['selectedModelName', 'dataFilter', 'dataLimit', 'refreshInterval'].includes(propertyPath)) {
                    return { ...prev, [propertyPath]: value };
                }
                return updateFn(prev);
            }
            return { ...prev, children: updateNodeRecursive(prev.children, nodeId, updateFn) };
        });
    };

    const handleAddChildNode = (parentId, type) => {
        const newNode = createNewNode(type);
        const updateFn = (node) => ({ ...node, children: [...(node.children || []), newNode] });
        setFlexStructure(prev => {
            if (prev.id === parentId) return updateFn(prev);
            return { ...prev, children: updateNodeRecursive(prev.children, parentId, updateFn) };
        });
        setSelectedNodeId(newNode.id);
    };

    const handleMakeItemNestedContainer = (itemId) => {
        const updateFn = (node) => {
            if (node.type === 'item' && node.content.type !== 'nestedContainer') {
                const newNestedContainer = createNewNode('container');
                newNestedContainer.children = [createNewNode('item')];
                return { ...node, content: { type: 'nestedContainer', nestedContainer: newNestedContainer } };
            }
            return node;
        };
        setFlexStructure(prev => ({ ...prev, children: updateNodeRecursive(prev.children, itemId, updateFn) }));
    };

    const handleDeleteNode = () => {
        if (!selectedNodeId || selectedNodeId === flexStructure.id) {
            alert(t('flexBuilder.cannotDeleteRoot'));
            return;
        }
        if (window.confirm(t('flexBuilder.confirmDeleteNode'))) {
            setFlexStructure(prev => ({ ...prev, children: deleteNodeRecursive(prev.children, selectedNodeId) }));
            setSelectedNodeId(null);
        }
    };

    const handleModelChange = (modelName) => {
        setFlexStructure(prev => ({
            ...prev,
            selectedModelName: modelName,
            dataFilter: null,
            children: clearMappingsRecursive(prev.children)
        }));
        setSelectedNodeId(null);
    };

    const handleFieldSelectedForMapping = (field) => {
        if (selectedNode && selectedNode.type === 'item') {
            const fieldPath = field.path || field.name;
            const displayName = field.displayName || field.name;
            if (!fieldPath) return;
            const newContent = { type: 'dataField', mapping: { fieldPath, displayName } };
            handleUpdateNode(selectedNode.id, 'content', newContent);
        }
        setIsFieldSelectorOpen(false);
    };

    const handleMoveNode = useCallback((nodeId, newParentId, newIndex) => {
        if (!nodeId || !newParentId) {
            dnd.handleItemDragEnd();
            return;
        }
        setFlexStructure(prev => {
            const removal = deepRemoveNode(prev, nodeId);
            if (!removal.removedNode) return prev;
            const insertion = deepInsertNode(removal.newStructure, newParentId, removal.removedNode, newIndex);
            if (!insertion.inserted) return prev;
            if (selectedNodeId === nodeId) setSelectedNodeId(null);
            return insertion.newStructure;
        });
    }, [dnd, selectedNodeId]);

    const handleSaveHtmlContent = (newHtml) => {
        if (editingHtmlInfo) {
            const newContent = { type: 'richtext', html: newHtml };
            handleUpdateNode(editingHtmlInfo.nodeId, 'content', newContent);
            setEditingHtmlInfo(null);
        }
    };

    const modelOptions = useMemo(() => models.map(m => ({ value: m.name, label: t(`model_${m.name}`, m.name) })), [models, t]);
    const flexOptions = useMemo(() => ({
        flexDirection: ['row', 'row-reverse', 'column', 'column-reverse'],
        flexWrap: ['nowrap', 'wrap', 'wrap-reverse'],
        justifyContent: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
        alignItems: ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'],
    }), []);

    return (
        <div className="flex-builder">
            <FlexBuilderControls
                flexStructure={flexStructure}
                selectedNode={selectedNode}
                models={models}
                user={user}
                lang={lang}
                modelOptions={modelOptions}
                flexOptions={flexOptions}
                currentModelFields={currentModelFields}
                onModelChange={handleModelChange}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onAddChildNode={handleAddChildNode}
                onMakeItemNestedContainer={handleMakeItemNestedContainer}
                onSetIsFieldSelectorOpen={setIsFieldSelectorOpen}
                onSetEditingHtmlInfo={setEditingHtmlInfo}
            />

            <FlexBuilderPreview
                flexStructure={flexStructure}
                onSelectNode={setSelectedNodeId}
                selectedNodeId={selectedNodeId}
                filteredData={filteredData}
                dataIndexRef={dataIndexRef}
                modelFields={currentModelFields}
                dnd={dnd}
                onMoveNode={handleMoveNode}
            />

            <DialogProvider>
            {selectedNode?.type === 'item' && (
                <FieldSelectorModal
                    isOpen={isFieldSelectorOpen}
                    onClose={() => setIsFieldSelectorOpen(false)}
                    modelFields={currentModelFields}
                    allModels={models}
                    onSelectField={handleFieldSelectedForMapping}
                />
            )}

            {editingHtmlInfo && (
                <RichTextEditorModal
                    initialContent={editingHtmlInfo.initialContent}
                    onClose={() => setEditingHtmlInfo(null)}
                    onSave={handleSaveHtmlContent}
                />
            )}

            </DialogProvider>
        </div>
    );
};

FlexBuilder.propTypes = {
    initialConfig: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    data: PropTypes.array,
    models: PropTypes.array.isRequired,
    lang: PropTypes.string,
};

export default FlexBuilder;