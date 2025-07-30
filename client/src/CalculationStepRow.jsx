import React, {useEffect} from 'react';
import { FaTrash, FaEquals } from 'react-icons/fa';
import {getFieldDefinitionFromPath, isAtomicDateOperator} from "./core/data.js";
import {MONGO_OPERATORS, OPERAND_TYPES} from "./constants.js";

// --- Sub-component for a single calculation step ---
const CalculationStepRow = ({
                                step,
                                onUpdateStep,
                                onRemoveStep,
                                allFlattenedFields,
                                previousStepAliases,
                                isLastStep,
                                currentModelName,
                                models,
                            }) => {
    const handleOperandChange = (operandKey, part, value) => {
        const newOperand = { ...step[operandKey], [part]: value };
        if (part === 'type') {
            if (value === OPERAND_TYPES.CONSTANT) {
                newOperand.value = (step.operator === MONGO_OPERATORS.CONCAT.mongo) ? '' : 0;
            } else {
                newOperand.value = '';
            }
        }
        onUpdateStep(step.id, { ...step, [operandKey]: newOperand });
    };

    const handleOperatorChange = (e) => {
        const newOperator = e.target.value;
        const updatedStep = { ...step, operator: newOperator };

        const adjustConstantOperand = (operand) => {
            if (operand.type === OPERAND_TYPES.CONSTANT) {
                if (newOperator === MONGO_OPERATORS.CONCAT.mongo) {
                    operand.value = String(operand.value);
                } else {
                    const num = parseFloat(operand.value);
                    operand.value = isNaN(num) ? 0 : num;
                }
            }
            return operand;
        };

        updatedStep.operand1 = adjustConstantOperand({...updatedStep.operand1});
        if (!isAtomicDateOperator(newOperator)) {
            updatedStep.operand2 = adjustConstantOperand({...updatedStep.operand2});
        } else {
            delete updatedStep.operand2;
        }
        onUpdateStep(step.id, updatedStep);
    };

    const handleAliasChange = (e) => {
        onUpdateStep(step.id, { ...step, outputAlias: e.target.value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') });
    };

    const renderOperandInput = (operandKey) => {
        const operand = step[operandKey];
        const isDateOperator = Object.values(MONGO_OPERATORS).filter(op => op.isDate).map(op => op.mongo).includes(step.operator);
        const isAtomic = isAtomicDateOperator(step.operator);
        const isDisabled = isAtomic && isDateOperator;
        // Filtrage des champs pour le type d'opérande, appliqué au mapping des options
        const filteredFields = allFlattenedFields.filter(field => {
            if (step.operator === MONGO_OPERATORS.CONCAT.mongo) return true;
            const targetFieldDef = getFieldDefinitionFromPath(field.value, currentModelName, models);
            return targetFieldDef && (isDateOperator ? ['date', 'datetime'].includes(targetFieldDef.type) : targetFieldDef.type === 'number');
        });

        // Group fields by model for the dropdown
        const groupedFields = filteredFields.reduce((acc, field) => {
            const modelLabel = field.modelLabel || 'Current Model';
            if (!acc[modelLabel]) {
                acc[modelLabel] = [];
            }
            acc[modelLabel].push(field);
            return acc;
        }, {});

        return (
            <div className="flex">
                <select
                    value={operand.type}
                    onChange={(e) => handleOperandChange(operandKey, 'type', e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    disabled={isDisabled}
                >
                    <option value={OPERAND_TYPES.FIELD}>Field</option>
                    {!isDateOperator && !isAtomic && <option value={OPERAND_TYPES.CONSTANT}>Constant</option>}
                    {previousStepAliases.length > 0 && (
                        <option value={OPERAND_TYPES.PREVIOUS_STEP}>Previous Step Result</option>
                    )}
                </select>

                {operand.type === OPERAND_TYPES.FIELD && (
                    <select
                        value={operand.value}
                        onChange={(e) => handleOperandChange(operandKey, 'value', e.target.value)}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '150px' }}
                    >
                        <option value="">Select Field</option>
                        {Object.entries(groupedFields).map(([modelLabel, fieldsInGroup]) => (
                            <optgroup label={modelLabel} key={modelLabel}>
                                {fieldsInGroup.map((field) => (
                                    <option key={field.value} value={field.value}>
                                        {field.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                )}

                {operand.type === OPERAND_TYPES.CONSTANT && (
                    (step.operator === MONGO_OPERATORS.CONCAT.mongo) ? (
                        <input
                            type="text"
                            value={operand.value}
                            onChange={(e) => handleOperandChange(operandKey, 'value', e.target.value)}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100px' }}
                            placeholder="Enter text"
                        />
                    ) : (
                        <input
                            type="number"
                            value={operand.value}
                            onChange={(e) => handleOperandChange(operandKey, 'value', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100px' }}
                        />
                    )
                )}

                {operand.type === OPERAND_TYPES.PREVIOUS_STEP && (
                    <select
                        value={operand.value}
                        onChange={(e) => handleOperandChange(operandKey, 'value', e.target.value)}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '120px' }}
                    >
                        <option value="">Select Step</option>
                        {previousStepAliases.map((alias) => (
                            <option key={alias} value={alias}>
                                {alias}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        );
    };


    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px',
            border: '1px solid #eee',
            borderRadius: '4px',
            marginBottom: '10px',
            flexWrap: 'wrap',
            backgroundColor: isLastStep ? '#f0f8ff' : '#fff'
        }}>
            <input
                type="text"
                placeholder="Output Alias (no spaces)"
                value={step.outputAlias}
                onChange={handleAliasChange}
                style={{ maxWidth: "120px", padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontWeight: 'bold' }}
                title="Name for the result of this calculation step (e.g., my_calculated_value)"
            />
            <FaEquals color="#555" />
            {renderOperandInput('operand1')}
            <select
                value={step.operator}
                onChange={handleOperatorChange}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
                {Object.entries(MONGO_OPERATORS).map(([key, op]) => (
                    <option key={key} value={op.mongo}>
                        {op.label}
                    </option>
                ))}
            </select>
            {/* Suppression du second operande si l'opérateur est atomique */}
            {!isAtomicDateOperator(step.operator) && renderOperandInput('operand2')}
            <button
                type="button"
                onClick={() => onRemoveStep(step.id)}
                style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '1.2em' }}
                title="Remove this step"
            >
                <FaTrash />
            </button>
        </div>
    );
};

export default CalculationStepRow;