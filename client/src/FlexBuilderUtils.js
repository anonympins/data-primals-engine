


// Helper to recursively remove a node. Returns { newStructure: object, removedNode: object | null }
export const deepRemoveNode = (current, nodeIdToRemove) => {
    let removedNodeInstance = null;

    if (!current.children) {
        return { newStructure: current, removedNode: null };
    }

    const newChildren = [];
    let modifiedChildren = false;

    for (const child of current.children) {
        if (child.id === nodeIdToRemove) {
            removedNodeInstance = child;
            modifiedChildren = true;
        } else {
            if (child.type === 'container' || (child.type === 'item' && child.content?.type === 'nestedContainer')) {
                const containerNode = child.type === 'container' ? child : child.content.nestedContainer;
                const result = deepRemoveNode(containerNode, nodeIdToRemove);

                if (result.removedNode) {
                    removedNodeInstance = result.removedNode;
                    modifiedChildren = true;
                    if (child.type === 'container') {
                        newChildren.push(result.newStructure);
                    } else {
                        newChildren.push({ ...child, content: { ...child.content, nestedContainer: result.newStructure } });
                    }
                } else {
                    newChildren.push(child);
                }
            } else {
                newChildren.push(child);
            }
        }
    }

    if (modifiedChildren) {
        return { newStructure: { ...current, children: newChildren }, removedNode: removedNodeInstance };
    }
    return { newStructure: current, removedNode: null };
};

// Helper to recursively insert a node. Returns { newStructure: object, inserted: boolean }
export const deepInsertNode = (current, targetParentId, nodeToInsert, index) => {
    if (current.id === targetParentId) {
        const currentChildren = current.children || [];
        const newTargetChildren = [...currentChildren];
        newTargetChildren.splice(index, 0, nodeToInsert);
        return { newStructure: { ...current, children: newTargetChildren }, inserted: true };
    }

    if (!current.children) {
        return { newStructure: current, inserted: false };
    }

    let opCompleted = false;
    const newChildren = current.children.map(child => {
        if (opCompleted) return child;

        if (child.type === 'container' || (child.type === 'item' && child.content?.type === 'nestedContainer')) {
            const containerNode = child.type === 'container' ? child : child.content.nestedContainer;
            const result = deepInsertNode(containerNode, targetParentId, nodeToInsert, index);

            if (result.inserted) {
                opCompleted = true;
                if (child.type === 'container') {
                    return result.newStructure;
                } else {
                    return { ...child, content: { ...child.content, nestedContainer: result.newStructure } };
                }
            }
        }
        return child;
    });

    if (opCompleted) {
        return { newStructure: { ...current, children: newChildren }, inserted: true };
    }
    return { newStructure: current, inserted: false };
};
