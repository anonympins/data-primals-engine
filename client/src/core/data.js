import { MONGO_OPERATORS} from "../constants.js";
import {getHost} from "../../../src/constants";

const isProd = import.meta.env.MODE === 'production';
export const urlData = isProd ? 'https://'+getHost()+'/' : 'http://localhost:7633/';


// Fonction pour vérifier si un opérateur est "atomique" (date, 1 seul opérande)
export const isAtomicDateOperator = (operator) => {
    return Object.keys(MONGO_OPERATORS).some(f => MONGO_OPERATORS[f].mongo === operator && (MONGO_OPERATORS[f].isDate || MONGO_OPERATORS[f].isAtomic));
};

// --- Helper to get the definition of a field, possibly nested ---
export const getFieldDefinitionFromPath = (fieldPath, startModelName, allModels) => {
    if (!fieldPath || !startModelName || !allModels) return null;
    const parts = fieldPath.split('.');
    let currentModel = allModels.find(m => m.name === startModelName);
    if (!currentModel) return null;

    let fieldDef = null;
    for (let i = 0; i < parts.length; i++) {
        const partName = parts[i];
        if (!currentModel || !currentModel.fields) return null;
        fieldDef = currentModel.fields.find(f => f.name === partName);
        if (!fieldDef) return null;

        if (i < parts.length - 1) { // This is a relation part
            if (fieldDef.type === 'relation' && fieldDef.relation) {
                currentModel = allModels.find(m => m.name === fieldDef.relation);
            } else {
                return null; // Path broken, intermediate part is not a valid relation
            }
        }
    }
    return fieldDef; // Definition of the final field in the path
};
