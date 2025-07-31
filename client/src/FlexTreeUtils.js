import { v4 as uuidv4 } from 'uuid';

/**
 * Crée un nouveau nœud de type 'container' ou 'item'.
 */

export const createNewNode = (type) => {
    const baseNode = { id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` };

    switch (type) {
    case 'container':
        return {
            ...baseNode,
            type: 'container',
            containerStyle: { /* ... styles ... */ },
            children: []
        };

        // --- AJOUTER CE BLOC ---
    case 'cta':
        return {
            ...baseNode,
            type: 'cta',
            label: 'Mon Bouton',
            endpointPath: '',
            itemStyle: { width: 'auto', height: 'auto' },
            // --- AJOUTS POUR LA CONFIGURATION DE LA REQUÊTE ---
            httpMethod: 'GET',
            requestBodyTemplate: '',
            requestQueryTemplate: ''
        };
        // --- FIN DE L'AJOUT ---

    case 'item':
    default: // Le 'cta' tombait ici, créant un 'item' par défaut
        return {
            ...baseNode,
            type: 'item',
            itemStyle: { width: '100px', height: '50px' },
            content: { type: 'placeholder' }
        };
    }
};

/**
 * Nettoie un nœud pour la sauvegarde.
 */
export const cleanNodeForOutput = (node) => {
    const { id, type, children, content, containerStyle, itemStyle, label, endpointPath, httpMethod, requestBodyTemplate, requestQueryTemplate } = node;
    const outputNode = { id, type };

    if (type === 'container') {
        outputNode.containerStyle = containerStyle || {};
        outputNode.children = children ? children.map(cleanNodeForOutput) : [];
    } else if (type === 'item') {
        outputNode.itemStyle = itemStyle || {};
        if (content) {
            outputNode.content = { type: content.type };
            if (content.type === 'dataField' && content.mapping) {
                outputNode.content.mapping = content.mapping;
            } else if (content.type === 'nestedContainer' && content.nestedContainer) {
                outputNode.content.nestedContainer = cleanNodeForOutput(content.nestedContainer);
            } else if (content.type === 'richtext' && content.html) {
                outputNode.content.html = content.html;
            }
        } else {
            outputNode.content = { type: 'placeholder' };
        }
    } else if (type === 'cta') {
        // On sauvegarde les propriétés spécifiques au CTA
        outputNode.label = label || 'Execute';
        outputNode.itemStyle = node.itemStyle || { width: 'auto', height: 'auto' };
        outputNode.httpMethod = httpMethod || 'GET';
        outputNode.requestBodyTemplate = requestBodyTemplate || '';
        outputNode.requestQueryTemplate = requestQueryTemplate || '';
        outputNode.endpointPath = endpointPath || '';
    }
    return outputNode;
};

/**
 * Trouve un nœud par son ID de manière récursive.
 */
export const findNodeRecursive = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.type === 'container' && node.children) {
            const found = findNodeRecursive(node.children, id);
            if (found) return found;
        } else if (node.type === 'item' && node.content.type === 'nestedContainer' && node.content.nestedContainer) {
            if (node.content.nestedContainer.id === id) return node.content.nestedContainer;
            const found = findNodeRecursive(node.content.nestedContainer.children, id);
            if (found) return found;
        }
    }
    return null;
};

/**
 * Met de mise à jour.
 */
export const updateNodeRecursive = (nodes, nodeId, updateFn) => {
    return nodes.map(node => {
        if (node.id === nodeId) return updateFn(node);
        if (node.type === 'container' && node.children) {
            return { ...node, children: updateNodeRecursive(node.children, nodeId, updateFn) };
        }
        if (node.type === 'item' && node.content.type === 'nestedContainer' && node.content.nestedContainer) {
            const nested = node.content.nestedContainer;
            if (nested.id === nodeId) {
                return { ...node, content: { ...node.content, nestedContainer: updateFn(nested) }};
            }
            const updatedChildren = updateNodeRecursive(nested.children, nodeId, updateFn);
            if (updatedChildren !== nested.children) {
                return { ...node, content: { ...node.content, nestedContainer: { ...nested, children: updatedChildren }}};
            }
        }
        return node;
    });
};

/**
 * Supprime un nœud de manière récursive.
 */
export const deleteNodeRecursive = (nodes, nodeId) => {
    const filteredNodes = nodes.filter(node => node.id !== nodeId);
    if (filteredNodes.length < nodes.length) return filteredNodes;

    return nodes.map(node => {
        if (node.type === 'container' && node.children) {
            const updatedChildren = deleteNodeRecursive(node.children, nodeId);
            if (updatedChildren !== node.children) return { ...node, children: updatedChildren };
        } else if (node.type === 'item' && node.content.type === 'nestedContainer' && node.content.nestedContainer) {
            const nested = node.content.nestedContainer;
            if (nested.id === nodeId) return { ...node, content: { type: 'placeholder' } }; // Reset item
            const updatedNestedChildren = deleteNodeRecursive(nested.children, nodeId);
            if (updatedNestedChildren !== nested.children) {
                return { ...node, content: { ...node.content, nestedContainer: { ...nested, children: updatedNestedChildren }}};
            }
        }
        return node;
    });
};

/**
 * Efface les mappings de données de manière récursive.
 */
export const clearMappingsRecursive = (nodes) => nodes.map(node => {
    if (node.type === 'item') {
        if (node.content.type === 'dataField') {
            return { ...node, content: { type: 'placeholder' } };
        }
        if (node.content.type === 'nestedContainer' && node.content.nestedContainer) {
            return { ...node, content: { ...node.content, nestedContainer: { ...node.content.nestedContainer, children: clearMappingsRecursive(node.content.nestedContainer.children) } } };
        }
    } else if (node.type === 'container') {
        return { ...node, children: clearMappingsRecursive(node.children) };
    }
    return node;
});