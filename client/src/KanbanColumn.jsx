// client/src/KanbanColumn.jsx

import React, { useState } from 'react';
import KanbanCard from './KanbanCard.jsx';

const KanbanColumn = ({ columnId, column, model, subItemsField, handleDrop }) => {

    return (
        <div className="kanban-column">
            <h3 className="kanban-column-title">
                {column.title} ({column.items.length})
            </h3>
            <div
                className={`kanban-column-content`}
            >
                {column.items.map((item, index) => (
                    <KanbanCard
                        key={item._id}
                        card={item}
                        model={model}
                        subItemsField={subItemsField}
                    />
                ))}
            </div>
        </div>
    );
};

export default KanbanColumn;