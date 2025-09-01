import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { ModelProvider, useModelContext } from './contexts/ModelContext.jsx';
import { DataTable } from './DataTable.jsx';
import { DataEditor } from './DataEditor.jsx';
import Button from './Button.jsx';
import { useTranslation } from 'react-i18next';
import { FaCheck, FaTimes, FaPlus, FaSearch } from 'react-icons/fa';
import { getDefaultForType } from '../../src/data.js';
import { useAuthContext } from './contexts/AuthContext.jsx';

// These API functions can be moved to a dedicated service file later.
const insertDataAPI = async (modelName, data) => {
    const response = await fetch(`/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({model: modelName,data})
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to insert data');
    }
    return response.json();
};

const searchDataAPI = async (modelName, filter) => {
    const params = new URLSearchParams({ model: modelName, depth: '1' });
    const response = await fetch(`/api/data/search?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search data');
    }
    return response.json();
};

const RelationSelectorWidget = ({ modelName, initialSelection, isMultiple, onValidate, onCancel }) => {
    const { t } = useTranslation();
    const { models, setSelectedModel } = useModelContext();
    const queryClient = useQueryClient();
    const { me } = useAuthContext();
    const [isCreating, setIsCreating] = useState(false);
    const [newRecord, setNewRecord] = useState(null);

    const [filterValues, setFilterValues] = useState({});

    // DataTable's `checkedItems` expects an array of objects with at least an `_id` property.
    // `initialSelection` is an array of string IDs. We convert it.
    const [selection, setSelection] = useState(() => initialSelection.map(id => ({ _id: id })));

    const model = models.find(m => m.name === modelName);

    useEffect(() => {
        if (model) {
            setSelectedModel(model);
        }
    }, [model, setSelectedModel]);

    const mutation = useMutation(
        (formData) => insertDataAPI(model.name, formData),
        {
            onSuccess: async (result) => {
                if (result.success && result.insertedIds?.length > 0) {
                    queryClient.invalidateQueries(['api/data', modelName, 'page']);
                    const newId = result.insertedIds[0];
                    const searchResult = await searchDataAPI(model.name, { _id: newId });
                    if (searchResult.data && searchResult.data.length > 0) {
                        handleCreationSuccess(searchResult.data[0]);
                    } else {
                        console.error('Could not fetch the newly created item.');
                        handleCancelCreation();
                    }
                } else {
                    console.error('Creation failed:', result.error);
                }
            },
            onError: (error) => {
                console.error('Creation mutation failed:', error.message);
            }
        }
    );

    const handleCreationSuccess = (newItem) => {
        setIsCreating(false);
        setNewRecord(null);
        if (isMultiple) {
            setSelection(current => [...current, newItem]);
        } else {
            setSelection([newItem]);
        }
    };

    const handleStartCreation = () => {
        const defaults = model.fields.reduce((acc, field) => {
            acc[field.name] = getDefaultForType(field);
            return acc;
        }, {});
        setNewRecord(defaults);
        setIsCreating(true);
    };

    const handleCancelCreation = () => {
        setIsCreating(false);
        setNewRecord(null);
    };

    const handleSave = (formData) => {
        mutation.mutate(formData);
    };

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

    if (isCreating) {
        return (
            <div className="relation-selector-widget">
                    <Button onClick={handleCancelCreation} className="btn-secondary">
                        <FaSearch /> {t('btns.backToSearch', 'Retour à la recherche')}
                    </Button>
                <ModelProvider>
                    <DataEditor
                        model={model}
                        formData={newRecord}
                        setFormData={setNewRecord}
                        onSubmit={handleSave}
                        onCancel={handleCancelCreation}
                        isLoading={mutation.isLoading}
                        hideNewButton={true}
                    />
                </ModelProvider>
            </div>
        );
    }

    return (
        <div className="relation-selector-widget">
            <DataTable model={model} filterValues={filterValues} setFilterValues={setFilterValues} checkedItems={selection} setCheckedItems={handleCheckboxChange} selectionMode={true} />
            <div className="flex actions right">
                <Button onClick={handleStartCreation} className="btn-secondary" style={{ marginRight: 'auto' }}>
                    <FaPlus /> {t('btns.create', 'Créer')}
                </Button>
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