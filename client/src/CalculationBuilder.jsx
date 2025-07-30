import React, {useState, useEffect, useCallback, useRef} from 'react';
import { FaPlus, FaTrash, FaEquals } from 'react-icons/fa';
import {object_equals} from "data-primals-engine/core"; // Assuming this is a deep equality check
import CalculationStepRow from "./CalculationStepRow.jsx";
import {getFieldDefinitionFromPath, isAtomicDateOperator} from "./core/data.js";
import {MONGO_OPERATORS, OPERAND_TYPES} from "../src/constants.js";

// --- Helper Functions & Constants ---
const generateId = () => `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;


// --- Main Calculation Builder Component ---
const CalculationBuilder = ({
                                currentModelName, // Name of the model these calculations are for
                                availableFields: rootModelFields = [], // Fields of the currentModelName
                                models = [], // All model definitions
                                initialSteps = [],
                                onCalculationChange,
                            }) => {

    const generateFlattenedFieldsRecursive = useCallback((modelName, allModels, maxDepth = 3, currentDepth = 0, pathPrefix = '', labelPrefix = '', visitedModelsInPath = new Set()) => {
        if (currentDepth > maxDepth) return [];

        const model = allModels.find(m => m.name === modelName);
        if (!model || !model.fields) return [];

        // Prevent infinite recursion for circular dependencies within the current path
        if (visitedModelsInPath.has(modelName)) {
            return [];
        }
        const newVisitedInPath = new Set(visitedModelsInPath).add(modelName);

        let options = [];
        const fieldsToProcess = currentDepth === 0 ? rootModelFields : model.fields;


        fieldsToProcess.forEach(field => {
            if (!field.name) return;
            const value = `${pathPrefix}${field.name}`;
            const displayLabel = `${labelPrefix}${field.label || field.name}`;
            const modelLabel = currentDepth === 0 ? (model.label || model.name) : labelPrefix.substring(0, labelPrefix.length - 3); // Get the parent model label

            options.push({
                value,
                label: displayLabel,
                type: field.type, // Original type of this specific field
                modelName: model.name,
                modelLabel: modelLabel,
            });

            if (field.type === 'relation' && field.relation) {
                const newPathPrefix = `${value}.`;
                const newLabelPrefix = `${displayLabel} > `;
                options = options.concat(
                    generateFlattenedFieldsRecursive(field.relation, allModels, maxDepth, currentDepth + 1, newPathPrefix, newLabelPrefix, newVisitedInPath)
                );
            }
        });
        return options;
    }, [rootModelFields]);

    const [allFlattenedFields, setAllFlattenedFields] = useState([]);

    useEffect(() => {
        if (currentModelName && models.length > 0) {
            setAllFlattenedFields(generateFlattenedFieldsRecursive(currentModelName, models));
        }
    }, [currentModelName, models, generateFlattenedFieldsRecursive]);


    const createDefaultStepArray = useCallback(() => {
        const numericFields = allFlattenedFields.filter(f => {
            const fieldDef = getFieldDefinitionFromPath(f.value, currentModelName, models);
            return fieldDef && fieldDef.type === 'number';
        });
        const defaultOperand1Value = numericFields.length > 0 ? numericFields[0].value : '';

        return [{
            id: generateId(),
            outputAlias: 'result',
            operand1: { type: OPERAND_TYPES.FIELD, value: defaultOperand1Value },
            operator: MONGO_OPERATORS.ADD.mongo,
            operand2: { type: OPERAND_TYPES.CONSTANT, value: 0 },
        }];
    }, [allFlattenedFields, currentModelName, models]);

    const [steps, setSteps] = useState(
        initialSteps && initialSteps.length > 0 ? initialSteps : createDefaultStepArray()
    );

    useEffect(() => {
        //Re-initialize steps if initialSteps change or if allFlattenedFields are populated for the first time
        if (initialSteps && initialSteps.length > 0) {
            setSteps([...initialSteps]);
        } else if (allFlattenedFields.length > 0) { // Ensure fields are ready before creating default
            setSteps(createDefaultStepArray());
        }
    }, [initialSteps, createDefaultStepArray, allFlattenedFields.length]);


    const getPreviousStepAliases = useCallback((currentIndex) => {
        return steps
            .slice(0, currentIndex)
            .map((s) => s.outputAlias)
            .filter(Boolean);
    }, [steps]);
    const handleAddStep = () => {
        const newStep = {
            id: generateId(),
            outputAlias: `calc_step_${steps.length + 1}`,
            operand1: { type: OPERAND_TYPES.FIELD, value: '' }, // Changer ici
            operator: MONGO_OPERATORS.ADD.mongo,
            operand2: { type: OPERAND_TYPES.CONSTANT, value: 0 },
        };
        setSteps([...steps, newStep]);
    };

    const handleRemoveStep = (id) => {
        if (steps.length === 1 && steps[0].id === id) {
            setSteps(createDefaultStepArray());
        } else {
            setSteps(steps.filter((step) => step.id !== id));
        }
    };

    const handleUpdateStep = (id, updatedStepData) => {
        setSteps(
            steps.map((step) => (step.id === id ? { ...step, ...updatedStepData } : step))
        );
    };

    const lastEmittedCalculation = useRef(null);

    useEffect(() => {
        if (!onCalculationChange || !currentModelName || models.length === 0) return;

        const abstractPipeline = { lookups: [], addFields: {} };
        const definedLookupAsFields = new Set(); // Tracks 'as' names of lookups
        let isValid = true;
        let finalOutputFieldName = null;

        if (steps.length === 0 || (steps.length === 1 && !steps[0].outputAlias && !steps[0].operand1?.value && steps[0].operand2?.value === 0)) {
            const emptyCalc = { final: null, pipeline: null, steps: JSON.parse(JSON.stringify(steps)) };
            if (!object_equals(emptyCalc, lastEmittedCalculation.current)) {
                lastEmittedCalculation.current = emptyCalc;
                onCalculationChange(emptyCalc);
            }
            return;
        }


        for (const [idx, step] of steps.entries()) {
            if (!step.outputAlias || !step.operator) {
                isValid = false; break;
            }
            if (step.outputAlias.startsWith("__calc_lookup_")) { // Prevent conflicts
                console.warn(`Step alias "${step.outputAlias}" is reserved. Please choose another name.`);
                isValid = false; break;
            }


            const parseOperandToMongoPath = (operand, currentStepOperator, idx) => {
                if (operand.type === OPERAND_TYPES.CONSTANT) {
                    if (currentStepOperator === MONGO_OPERATORS.CONCAT.mongo) {
                        if (operand.value === undefined || operand.value === null) { isValid = false; return null; }
                        return String(operand.value);
                    } else if (isAtomicDateOperator(currentStepOperator) && typeof operand.value === 'string') {
                        // Conversion de la chaîne constante en date pour les opérateurs de date
                        return { $toDate: operand.value };
                    } else {
                        if (operand.value === '' || operand.value === null || operand.value === undefined) { isValid = false; return null; }
                        const num = parseFloat(operand.value);
                        if (isNaN(num)) { isValid = false; return null; }
                        return num;
                    }
                }

                if (operand.type === OPERAND_TYPES.PREVIOUS_STEP) {
                    if (!operand.value || !getPreviousStepAliases(idx).includes(operand.value)) {
                        isValid = false; return null;
                    }
                    const prevStepPath = `$${operand.value}`;
                    if (currentStepOperator === MONGO_OPERATORS.CONCAT.mongo) {
                        return { $toString: prevStepPath }; // Conversion en string
                    } else if (isAtomicDateOperator(currentStepOperator)) {
                        // Conversion en date si on attend une date
                        return { $toDate: prevStepPath }; // À adapter en fonction du type réel de prevStepPath
                    }
                    return prevStepPath;
                }

                if (operand.type === OPERAND_TYPES.FIELD) {
                    if (!operand.value) { isValid = false; return null; }

                    const pathParts = operand.value.split('.');
                    let currentModelForPath = models.find(m => m.name === currentModelName);
                    let mongoPath = '$'; // Starts from the root document fields
                    let lastFieldDef = null;

                    for (let i = 0; i < pathParts.length; i++) {
                        const partName = pathParts[i];
                        if (!currentModelForPath || !currentModelForPath.fields) { isValid = false; return null; }
                        const fieldDef = currentModelForPath.fields.find(f => f.name === partName);
                        if (!fieldDef) { isValid = false; return null; }
                        lastFieldDef = fieldDef;

                        if (i < pathParts.length - 1) {
                            if (fieldDef.type !== 'relation' || !fieldDef.relation) { isValid = false; return null; }

                            const lookupAs = `__calc_lookup_${pathParts.slice(0, i + 1).join('_')}`;
                            mongoPath = `$${lookupAs}`;

                            if (!definedLookupAsFields.has(lookupAs)) {
                                abstractPipeline.lookups.push({
                                    fromModel: currentModelForPath.name,
                                    localField: (i === 0) ? fieldDef.name : `${pathParts.slice(0, i).map(p => `${p}`).join('.')}.${fieldDef.name}`,
                                    foreignModel: fieldDef.relation,
                                    as: lookupAs,
                                    isMultiple: fieldDef.multiple || false
                                });
                                definedLookupAsFields.add(lookupAs);
                            }
                            currentModelForPath = models.find(m => m.name === fieldDef.relation);
                        } else {
                            mongoPath += (mongoPath === '$' ? '' : '.') + partName;
                        }
                    }

                    if( 'date' === lastFieldDef.type) {
                        return {$toDate: mongoPath };
                    }else if('datetime' === lastFieldDef.type){
                        return {$toDate: mongoPath };
                    }
                    if (currentStepOperator !== MONGO_OPERATORS.CONCAT.mongo && lastFieldDef && lastFieldDef.type === 'string') {
                        return { $toDate: mongoPath };
                    }
                    return mongoPath;
                }
                isValid = false; return null;
            };

            const op1Value = parseOperandToMongoPath(step.operand1, step.operator);
            const op2Value = parseOperandToMongoPath(step.operand2, step.operator);

            if (!isValid) break;

            if (isAtomicDateOperator(step.operator)) {
                // Pour les opérateurs atomiques de date, passer op1Value directement
                abstractPipeline.addFields[step.outputAlias] = { [step.operator]: op1Value };
            } else {
                // Pour les autres opérateurs, conserver la logique actuelle
                abstractPipeline.addFields[step.outputAlias] = { [step.operator]: [op1Value, op2Value] };
            }
        }

        if (isValid && steps.length > 0) {
            finalOutputFieldName = steps[steps.length - 1].outputAlias;
            if (!abstractPipeline.addFields[finalOutputFieldName] && steps.some(s => s.outputAlias)) {
                // If the last step's output isn't in addFields, but there were valid steps, it's an issue
                // unless all steps were invalid.
                if (Object.keys(abstractPipeline.addFields).length > 0) isValid = false;
            }
        } else if (steps.length === 0) {
            isValid = true; // No steps is valid, calc will be null
        }


        let currentCalculationData;
        if (isValid && finalOutputFieldName && (abstractPipeline.lookups.length > 0 || Object.keys(abstractPipeline.addFields).length > 0)) {
            currentCalculationData = {
                final: finalOutputFieldName,
                pipeline: abstractPipeline, // Send the abstract pipeline
                steps: JSON.parse(JSON.stringify(steps))
            };
        } else {
            currentCalculationData = {
                final: null,
                pipeline: null,
                steps: JSON.parse(JSON.stringify(steps))
            };
        }

        if (!object_equals(currentCalculationData, lastEmittedCalculation.current)) {
            lastEmittedCalculation.current = currentCalculationData;
            onCalculationChange(currentCalculationData);
        }

    }, [steps, onCalculationChange, currentModelName, models, getPreviousStepAliases]);


    return (
        <div style={{ fontFamily: 'Arial, sans-serif', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>Calculation Builder</h3>
            {steps.map((step, index) => (
                <CalculationStepRow
                    key={step.id}
                    step={step}
                    onUpdateStep={handleUpdateStep}
                    onRemoveStep={handleRemoveStep}
                    allFlattenedFields={allFlattenedFields}
                    previousStepAliases={getPreviousStepAliases(index)}
                    isLastStep={index === steps.length - 1}
                    currentModelName={currentModelName}
                    models={models}
                />
            ))}
            <button
                type={"button"}
                onClick={handleAddStep}
                style={{
                    padding: '10px 15px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}
            >
                <FaPlus /> Add Calculation Step
            </button>
            {steps.length > 0 && steps[steps.length - 1].outputAlias && (
                <p style={{marginTop: '15px', fontSize: '0.9em', color: '#555'}}>
                    Final result will be available in the field: <strong>{steps[steps.length - 1].outputAlias}</strong>
                </p>
            )}
            {steps.length > 0 && !steps[steps.length - 1].outputAlias && steps.some(s => s.operand1?.value || s.operand2?.value) && (
                <p style={{marginTop: '15px', fontSize: '0.9em', color: 'red'}}>
                    <strong>Warning:</strong> Define an output alias for the last calculation step.
                </p>
            )}
        </div>
    );
};

export default CalculationBuilder;