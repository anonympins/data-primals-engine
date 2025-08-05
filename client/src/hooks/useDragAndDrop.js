import { useState, useRef, useCallback } from 'react';

const useDragAndDrop = () => {
    const [isDragging, setIsDragging] = useState(false);
    const draggedItemRef = useRef(null); // Changed name for clarity
    const [dragOverContainerId, setDragOverContainerId] = useState(null);
    // dropPosition might not be needed if we simplify

    const handleNodeDragStart = useCallback((nodeId) => {
        setIsDragging(true);
        draggedItemRef.current = nodeId;
        console.log("useDragAndDrop: Dragging node with ID:", nodeId);
    }, []);

    const handleContainerDragEnter = useCallback((containerId) => {
        setDragOverContainerId(containerId);
    }, []);

    const handleContainerDragLeave = useCallback(() => {
        setDragOverContainerId(null);
    }, []);

    // This is for the draggable item's onDragEnd
    const handleItemDragEnd = useCallback(() => {
        setIsDragging(false);
        // Do NOT reset draggedItemRef.current here.
        // It's needed by the onDrop handler of the container.
        console.log("useDragAndDrop: Item drag ended. Current draggedItemRef:", draggedItemRef.current);
    }, []);

    // This is for the droppable container's onDrop
    const finalizeDropAndGetData = useCallback(() => {
        const droppedItemId = draggedItemRef.current;

        // Reset state after retrieving the ID
        setIsDragging(false);
        draggedItemRef.current = null;
        setDragOverContainerId(null);
        // setDropPosition(null); // if you were using it

        console.log("useDragAndDrop: Finalized drop. Dropped ID:", droppedItemId);
        return droppedItemId; // Return the ID of the item that was dropped
    }, []);

    return {
        isDragging,
        draggedItemRef, // Expose the ref object
        dragOverContainerId,
        // dropPosition,
        handleNodeDragStart,
        handleContainerDragEnter,
        handleContainerDragLeave,
        handleItemDragEnd,    // For draggable's onDragEnd
        finalizeDropAndGetData // For droppable's onDrop
    };
};

export default useDragAndDrop;