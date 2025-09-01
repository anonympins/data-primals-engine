import React, { useState, useEffect } from 'react';
import { useModelContext } from './contexts/ModelContext.jsx';
import { DataTable } from './DataTable.jsx';
import Button from './Button.jsx';
import { useTranslation } from 'react-i18next';
import { FaCheck, FaTimes } from 'react-icons/fa';

const RelationSelectorWidget = ({ modelName, initialSelection, isMultiple, onValidate, onCancel }) => {
    const { t } = useTranslation();
    const { models, setSelectedModel } = useModelContext();

    // DataTable's `checkedItems` expects an array of objects with at least an `_id` property.
    // `initialSelection` is an array of string IDs. We convert it.
    const [selection, setSelection] = useState(() => initialSelection.map(id => ({ _id: id })));

    const model = models.find(m => m.name === modelName);

    useEffect(() => {
        if (model) {
            setSelectedModel(model);
        }
    }, [model, setSelectedModel]);

    if (!model) {
        return <div>{t('loading', 'Chargement...')}</div>;
    }

    const handleValidate = () => {
        // `onValidate` expects an array of full objects to update the display correctly.
        onValidate(selection);
    };

    const handleCheckboxChange = (items) => {
        if (!isMultiple) {
            // For single selection, we only keep the last selected item.
            // DataTable's setCheckedItems gives the full list.
            const lastItem = items.length > 0 ? [items[items.length - 1]] : [];
            setSelection(lastItem);
        } else {
            setSelection(items);
        }
    };

    const [filterValues, setFilterValues] = useState({});
    return (
        <div className="relation-selector-widget">
            <DataTable model={model} filterValues={filterValues} setFilterValues={setFilterValues} checkedItems={selection} setCheckedItems={handleCheckboxChange} selectionMode={true} />
            <div className="flex actions right">
                <Button onClick={onCancel} className="btn-secondary">
                    <FaTimes /> {t('btns.cancel', 'Annuler')}
                </Button>
                <Button onClick={handleValidate} className="btn-primary">
                    <FaCheck /> {t('btns.validate', 'Valider')}
                </Button>
            </div>
        </div>
    );
};

export default RelationSelectorWidget;