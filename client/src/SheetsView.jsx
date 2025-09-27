import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useModelContext } from "./contexts/ModelContext.jsx";
import { useCommand } from './contexts/CommandContext.jsx';
import { useTranslation } from "react-i18next";
import { NumberField, SelectField, TextField } from "./Field.jsx";
import RelationValue from "./RelationValue.jsx";
import { isConditionMet } from "../../src/filter.js";
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { HiddenableCell } from "./HiddenableCell.jsx";
import { Header } from "./DataTable.jsx";

// --- Composant pour une cellule éditable ---
const EditableCell = ({ item, field, children, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const { t } = useTranslation();
    const [value, setValue] = useState(item[field.name]);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if (inputRef.current.select) {
                inputRef.current.select();
            }
        }
    }, [isEditing]);

    const handleSave = () => {
        if (value !== item[field.name]) {
            onSave(item, field.name, value);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setValue(item[field.name]);
            setIsEditing(false);
        }
    };

    const renderInput = () => {
        switch (field.type) {
            case 'number':
                return <NumberField
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                />;
            case 'enum':
                return <SelectField
                    ref={inputRef}
                    value={value}
                    items={(field.items || []).map(item => ({ label: t(item, item), value: item }))}
                    onChange={(item) => setValue(item.value)}
                    onBlur={handleSave}
                    // onKeyDown n'est pas supporté par SelectField, onBlur suffira
                />;
            case 'string_t':
                // Pour un champ traduisible, on édite la 'value'
                return <TextField
                    ref={inputRef}
                    value={value?.value || value || ''}
                    onChange={(e) => setValue({ ...value, value: e.target.value })}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                />;
            case 'string':
            case 'email':
            case 'url':
            case 'text':
            default:
                return <TextField
                    ref={inputRef}
                    value={value || ''}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                />;
        }
    };

    const isEditable = ['string', 'number', 'email', 'url', 'text', 'string_t', 'enum'].includes(field.type);

    return (
        <td onClick={() => isEditable && setIsEditing(true)}>
            {isEditing ? renderInput() : children}
        </td>
    );
};


export function SheetsView({
    model,
    checkedItems,
    setCheckedItems,
    filterValues,
    setFilterValues,
    data: propData,
    deleteApiCall,
    insertOrUpdateApiCall,
    patchApiCall
}) {
    const {
        models,
        paginatedDataByModel,
        pagedFilters,
        setPagedFilters,
    } = useModelContext();
    const { t } = useTranslation();
    const { me } = useAuthContext();
    const { execute, PatchCommand } = useCommand();

    const data = propData || paginatedDataByModel[model?.name] || [];

    const handleInlineUpdate = async (originalItem, fieldName, newValue) => {
        const oldValue = originalItem[fieldName];
        const command = new PatchCommand(patchApiCall, model.name, originalItem._id, fieldName, oldValue, newValue);
        await execute(command);
    };

    const onChangeFilterValue = (field, value) => {
        setPagedFilters(pagedFilters => ({
            ...pagedFilters, [model.name]: {...pagedFilters[model.name] || {}, [field.name]: value || pagedFilters[model.name]?.[field.name] || undefined}
        }));
    }

    if (!model) return <></>;

    return (
        <div className="datatable sheets-view">
            <div className={"table-wrapper"}>
                <table>
                    <thead>
                        <Header
                            advanced={true}
                            model={model}
                            setCheckedItems={setCheckedItems}
                            filterValues={filterValues}
                            data={data}
                            setFilterValues={setFilterValues}
                            onChangeFilterValue={onChangeFilterValue}
                            checkedItems={checkedItems}
                            filterActive={true}
                            handleFilter={() => {}}
                            selectionMode={false}
                        />
                    </thead>
                    <tbody>
                    {(data || []).map((item) => (
                        <tr key={item._id}>
                            <td className={"mini"}>
                                {/* Placeholder for checkbox or actions */}
                            </td>
                            {(model?.fields || []).map(field => {
                                if (field.type === 'password') return null;

                                if (!isConditionMet(model, field.condition, item, models, me, false)) {
                                    return <td className={"notmet"} key={item._id + field.name}></td>;
                                }

                                const hiddenable = (content) => {
                                    if (field.hiddenable) return <HiddenableCell value={content} />;
                                    return content;
                                };

                                let cellContent;

                                // Simplified rendering logic, focusing on editable types
                                switch (field.type) {
                                    case "relation":
                                        cellContent = <RelationValue field={field} data={item} />;
                                        break;
                                    case "boolean":
                                        cellContent = item[field.name] ? t('yes') : t('no');
                                        break;
                                    case "string_t":
                                        cellContent = t(item[field.name].key || '', item[field.name].value || item[field.name]);
                                        break;
                                    case "date":
                                        cellContent = item[field.name] ? new Date(item[field.name]).toLocaleDateString() : '';
                                        break;
                                    case "datetime":
                                        cellContent = item[field.name] ? new Date(item[field.name]).toLocaleString() : '';
                                        break;
                                    default:
                                        cellContent = item[field.name];
                                        break;
                                }

                                return (
                                    <EditableCell
                                        key={item._id + field.name}
                                        item={item}
                                        field={field}
                                        onSave={handleInlineUpdate}
                                    >
                                        {hiddenable(cellContent)}
                                    </EditableCell>
                                );
                            })}
                            <td>
                                {/* Placeholder for row actions */}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}