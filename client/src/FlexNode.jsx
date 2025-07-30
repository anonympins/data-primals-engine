// C:/Dev/hackersonline-engine/client/src/FlexNode.jsx
import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { FaPlus, FaTrash, FaEdit, FaRegSquare, FaRegCheckSquare, FaBox, FaExpandArrowsAlt, FaObjectGroup } from 'react-icons/fa';
// Remove Droppable, Draggable from '@hello-pangea/dnd' if no longer used
import { useTranslation } from 'react-i18next';
// Supprimer l'import de useDragAndDrop s'il n'est plus utilisé localement
// import useDragAndDrop from './hooks/useDragAndDrop.js';

export const FieldSelectorModal = ({ isOpen, onClose, modelFields, allModels, onSelectField }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;
    const getFieldDisplayName = (field) => {
        let displayName = field.displayName || field.name;
        if (field.modelName && field.modelName !== field.originalModelName) {
            displayName = `${t(`model_${field.modelName}`, field.modelName)}.${displayName}`;
        }
        return displayName;
    };
    const renderFieldItem = (field, index) => (
        <li key={`${field.path}-${index}`} onClick={() => onSelectField(field)} title={field.path}>
            {getFieldDisplayName(field)}
            <span className="field-path">({field.type}{field.relation ? ` -> ${field.relation}` : ''})</span>
        </li>
    );
    const groupedFields = modelFields.reduce((acc, field) => {
        const modelName = field.modelName || t('flexBuilder.currentModel', 'Modle actuel');
        if (!acc[modelName]) { acc[modelName] = []; }
        acc[modelName].push(field);
        return acc;
    }, {});
    return (
        <div className="flex-builder-modal-overlay" onClick={onClose}>
            <div className="flex-builder-modal-content" onClick={e => e.stopPropagation()}>
                <h4>{t('flexBuilder.selectDataFieldTitle', 'Sélectionner un champ de données')}</h4>
                {Object.keys(groupedFields).length > 0 ? (
                    Object.entries(groupedFields).map(([modelName, fields]) => (
                        <div key={modelName}>
                            <h5>{modelName === t(`model_${modelName}`, modelName)}</h5>
                                <ul className="field-selector-list">{fields.map(renderFieldItem)}</ul>
                                </div>
                                ))
                                ) : (<p>{t('flexBuilder.noFieldsAvailable', 'Aucun champ disponible pour ce modèle.')}</p>)}
                            <button onClick={onClose} className="btn-cancel">{t('cancel', 'Annuler')}</button>
                        </div>
                    </div>
                    );
                };
FieldSelectorModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    modelFields: PropTypes.array.isRequired,
    allModels: PropTypes.array.isRequired,
    onSelectField: PropTypes.func.isRequired,
};

export const FlexNodeRenderer = React.forwardRef((props, ref) => {
    const {
        node, path, onSelectNode, selectedNodeId, data, dataIndexRef, modelFields, t, onMoveNode,
        dnd, // Recevoir l'objet dnd en tant que prop
    } = props;

    // Déstructurer les valeurs et gestionnaires du prop dnd
    const {
        isDragging, draggedItemRef, dragOverContainerId,
        handleNodeDragStart, handleContainerDragEnter, handleContainerDragLeave,
        handleItemDragEnd,
        finalizeDropAndGetData
    } = dnd;

    const isSelected = selectedNodeId === node.id;

    const handleNodeClick = (e) => {
        e.stopPropagation();
        onSelectNode(node.id);
    };

    const getNestedValue = (obj, fieldPath) => {
        if (!obj || !fieldPath) return 'N/A';
        return fieldPath.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : 'N/A', obj);
    };

    const isCurrentlyDraggingThisNode = isDragging && draggedItemRef.current === node.id;
    // Correction: dragOverContainerId vient directement du hook/prop, pas besoin de le recalculer ici
    // const currentDragOverContainerId = node.type === 'container' ? node.id : (node.content?.nestedContainer?.id);
    // const isContainerBeingDraggedOver = dragOverContainerId === currentDragOverContainerId;
    // Utiliser directement dragOverContainerId pour vérifier si CE conteneur est survolé
    const isThisContainerBeingDraggedOver = (node.type === 'container' && dragOverContainerId === node.id) ||
        (node.type === 'item' && node.content?.type === 'nestedContainer' && dragOverContainerId === node.content.nestedContainer.id);


    const onItemDragStartInternal = (e, nodeId) => {
        console.log("FlexNode: Item drag start", nodeId);
        e.dataTransfer.setData("text/plain", nodeId);
        e.dataTransfer.effectAllowed = "move";
        handleNodeDragStart(nodeId); // Utiliser la fonction du prop dnd
    };

    const onItemDragEndInternal = () => {
        console.log("FlexNode: Item drag end. Current draggedItemRef before hook.handleItemDragEnd:", draggedItemRef.current);
        handleItemDragEnd(); // Utiliser la fonction du prop dnd
    };

    const onContainerDragEnterInternal = (e, containerId) => {
        e.preventDefault();
        console.log("FlexNode: Container drag enter", containerId);
        handleContainerDragEnter(containerId); // Utiliser la fonction du prop dnd
    };

    const onContainerDragOverInternal = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const onContainerDragLeaveInternal = () => {
        console.log("FlexNode: Container drag leave");
        handleContainerDragLeave(); // Utiliser la fonction du prop dnd
    };

    const onContainerDropInternal = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const droppedItemId = finalizeDropAndGetData(); // Utiliser la fonction du prop dnd
        const targetContainerNode = node.type === 'container' ? node : node.content?.nestedContainer;
        const targetContainerId = targetContainerNode?.id;


        console.log("FlexNode: Drop on container. Dropped Item ID:", droppedItemId, "Target Container ID:", targetContainerId);

        if (typeof onMoveNode === 'function' && droppedItemId && targetContainerId) {
            // TODO: Déterminer le bon newIndex
            const newIndex = 0;
            onMoveNode(droppedItemId, targetContainerId, newIndex);
        } else {
            console.warn("FlexNode: onMoveNode not called. Check props or IDs.", { onMoveNodeExists: typeof onMoveNode === 'function', droppedItemId, targetContainerId });
        }
    };

    // useEffect(() => {
    //     console.log(`FlexNode (${node.id} - ${node.type}): onMoveNode type:`, typeof onMoveNode);
    // }, [onMoveNode, node.id, node.type]);


    if (node.type === 'container' || (node.type === 'item' && node.content?.type === 'nestedContainer')) {
        const containerNode = node.type === 'container' ? node : node.content.nestedContainer;
        const children = containerNode.children || [];
        const containerStyle = node.type === 'item' ?
            { ...containerNode.containerStyle, padding: '0', border: 'none', minHeight: '40px' }
            : containerNode.containerStyle;

        const isThisNodeSelected = isSelected && (node.id === selectedNodeId || (node.type === 'item' && containerNode.id === selectedNodeId));
        // Correction pour isThisContainerBeingDraggedOver
        const isThisSpecificContainerDraggedOver = dragOverContainerId === containerNode.id;


        return (
            <div
                ref={ref}
                style={node.type === 'item' ? node.itemStyle : {}}
                className={`flex-node-wrapper ${node.type === 'item' ? 'is-nested-container-wrapper' : ''} ${isCurrentlyDraggingThisNode && node.type === 'item' ? 'is-dragging-dnd' : ''}`}
                draggable={node.type === 'item'}
                onDragStart={node.type === 'item' ? (e) => onItemDragStartInternal(e, node.id) : undefined}
                onDragEnd={node.type === 'item' ? onItemDragEndInternal : undefined}
                onClick={node.type === 'item' ? handleNodeClick : undefined} // Permet de s'item qui est un conteneur imbriqué
            >
                <div
                    style={containerStyle}
                    className={`flex-node preview-container ${isThisNodeSelected ? 'is-selected' : ''} ${isThisSpecificContainerDraggedOver ? 'drag-over-active' : ''}`}
                    onClick={node.type === 'container' ? handleNodeClick : (e) => e.stopPropagation()} // Le clic sur le conteneur racine le sélectionne
                    onDragEnter={(e) => onContainerDragEnterInternal(e, containerNode.id)}
                    onDragLeave={onContainerDragLeaveInternal}
                    onDragOver={onContainerDragOverInternal}
                    onDrop={onContainerDropInternal}
                >
                    {children.length === 0 && !isThisSpecificContainerDraggedOver && (
                        <span className="empty-container-placeholder">{t('flexBuilder.emptyContainerHint', 'Glissez des i ou ajoutez-en via les contrôles.')}</span>
                    )}
                    {children.map((childNode, index) => (
                        <FlexNodeRenderer
                            key={childNode.id}
                            node={childNode}
                            path={[...path, index]}
                            onSelectNode={onSelectNode}
                            selectedNodeId={selectedNodeId}
                            data={data}
                            dataIndexRef={dataIndexRef}
                            modelFields={modelFields}
                            t={t}
                            dnd={dnd} // Passer le prop dnd récursivement
                            onMoveNode={onMoveNode}
                        />
                    ))}
                </div>
            </div>
        );
    } else if (node.type === 'item') {
        const itemStyleWithDefaults = {
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', ...node.itemStyle,
        };
        if (isCurrentlyDraggingThisNode) {
            itemStyleWithDefaults.opacity = 0.7;
            itemStyleWithDefaults.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        }

        let contentElement;
        if (node.content.type === 'placeholder') {
            contentElement = <span className="preview-item-content">{t('flexBuilder.emptyItemHint', 'Case vide')}</span>;
        } else if (node.content.type === 'dataField' && node.content.mapping) {
// Logs de débogage pour dataField (vous pouvez les garder ou les commenter)
            console.log(`[FlexNodeRenderer - ${node.id}] Rendu DataField:`, {
                nodeContent: JSON.parse(JSON.stringify(node.content)),
                nodeMapping: JSON.parse(JSON.stringify(node.content.mapping)),
                fieldPathToUse: node.content.mapping?.fieldPath,
                dataPropLength: data?.length,
                dataIndexAtStartOfItem: dataIndexRef.current,
            });

            let displayValue;
            const fieldPathForDisplay = node.content.mapping?.displayName || node.content.mapping?.fieldPath || t('flexBuilder.noFieldSelected', 'Champ non lié');

            if (data && data.length > 0) {
                let currentDataRecord = {};
                let recordIndex = -1;
                recordIndex = dataIndexRef.current % data.length;
                currentDataRecord = data[recordIndex];

                console.log(`[FlexNodeRenderer - ${node.id}] currentDataRecord (index ${recordIndex}):`, JSON.parse(JSON.stringify(currentDataRecord)));

                const value = node.content.mapping?.fieldPath
                    ? getNestedValue(currentDataRecord, node.content.mapping.fieldPath)
                    : t('flexBuilder.noDataMapped', 'N/A');

                console.log(`[FlexNodeRenderer - ${node.id}] Valeur récupérée pour ${node.content.mapping?.fieldPath}:`, value);

                displayValue = `${fieldPathForDisplay}`;

                if (data && data.length > 0) {
                    dataIndexRef.current = (dataIndexRef.current + 1);
                }
            } else {
                // Si data est vide, afficher le nom du champ
                console.warn(`[FlexNodeRenderer - ${node.id}] data prop est vide ou null. Affichage du nom du champ.`);
                displayValue = `${fieldPathForDisplay}`; // Affiche le nom du champ entre crochets
            }

            contentElement = <span className="preview-item-content" title={node.content.mapping?.fieldPath || 'Champ non lié'}>{displayValue}</span>;

        } else {
            contentElement = <span className="preview-item-content">{node.content.type}</span>;
        }

        return (
            <div
                ref={ref}
                style={itemStyleWithDefaults}
                className={`flex-node preview-item ${isSelected ? 'is-selected' : ''} ${isCurrentlyDraggingThisNode ? 'is-dragging-dnd' : ''}`}
                onClick={handleNodeClick}
                draggable // Les items sont toujours déplaçables
                onDragStart={(e) => onItemDragStartInternal(e, node.id)}
                onDragEnd={onItemDragEndInternal}
            >
                {contentElement}
            </div>
        );
    }

    return (
        <div ref={ref} onClick={handleNodeClick} style={{ padding: '10px', border: '1px dashed red' }}>
            {t('flexBuilder.unknownNodeType', 'Type de nœud inconnu')}: {node.type}
        </div>
    );
});

FlexNodeRenderer.displayName = 'FlexNodeRenderer';
FlexNodeRenderer.propTypes = {
    node: PropTypes.object.isRequired,
    path: PropTypes.array.isRequired,
    onSelectNode: PropTypes.func.isRequired,
    selectedNodeId: PropTypes.string,
    data: PropTypes.array,
    dataIndexRef: PropTypes.object,
    modelFields: PropTypes.array,
    t: PropTypes.func.isRequired,
    onMoveNode: PropTypes.func,
    dnd: PropTypes.object.isRequired, // dnd est maintenant requis
};
FlexNodeRenderer.defaultProps = {
    data: [], modelFields: [], onMoveNode: null,
};