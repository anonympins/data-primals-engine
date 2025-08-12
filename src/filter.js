/**
 * Evaluates a single condition against form data.
 * @param {object} currentModelDef - The definition of the current model.
 * @param {object} condition - The condition to evaluate.
 * @param {object} formData - The form data.
 * @param {object[]} allModels - An array of all model definitions.
 * @param {object} user - The current user.
 * @returns {boolean} - True if the condition is met, false otherwise.
 */
const evaluateSingleCondition = (currentModelDef, condition, formData, allModels, user) => {
    // Condition est directement un filtre MongoDB, donc on l'applique
    // en utilisant les opérateurs et les valeurs qu'il contient.

    if (!condition || typeof condition !== 'object') {
        console.warn("[Client Eval] Condition is not an object:", condition);
        return true; // Permissive default
    }

    // Si la condition est de la forme {field: value}, on la transforme en {$eq: value}
    if (!Object.keys(condition)[0].startsWith('$') && typeof condition[Object.keys(condition)[0]] !== 'object') {
        const fieldName = Object.keys(condition)[0];
        const value = condition[fieldName];
        return evaluateSingleCondition(currentModelDef, {[fieldName]: {$eq: value}}, formData, allModels, user);
    }

    // Gestion des opérateurs d'agrégation (commencent par $)
    const operator = Object.keys(condition)[0];
    if (operator === '$eq' && Array.isArray(condition[operator])) {
        // Cas spécial pour {$eq: ['$field', value]}
        const [fieldPath, expectedValue] = condition[operator];
        if (typeof fieldPath === 'string' && fieldPath.startsWith('$')) {
            const fieldName = fieldPath.substring(1); // Enlève le $ devant
            return formData[fieldName] == expectedValue;
        }
    }

    // Si la condition contient des opérateurs logiques, on les gère ici
    if (condition.$and || condition.$or || condition.$not || condition.$nor) {
        console.warn("[Client Eval] Condition logique détectée dans evaluateSingleCondition, ce n'est pas attendu. Devrait être géré par isConditionMet.");
        return true; // Permissive default
    }

    if (condition.$find) {
        const fieldName = Object.keys(condition)[0];
        const fieldValue = formData[fieldName];
        const findCondition = condition.$find;

        if (!Array.isArray(fieldValue)) return false;

        return fieldValue.some(item => {
            // Gestion spéciale pour la syntaxe $eq: ["$$this.field", value]
            if (findCondition.$eq && Array.isArray(findCondition.$eq)) {
                const [fieldPath, value] = findCondition.$eq;
                if (fieldPath.startsWith("$$this.")) {
                    const fieldToCheck = fieldPath.replace("$$this.", "");
                    return item[fieldToCheck] == value;
                }
            }

            // Sinon, évaluation normale
            const tempData = { ...item };
            return evaluateSingleCondition(currentModelDef, findCondition, tempData, allModels, user);
        });
    }

    // Si la condition contient un opérateur $exists, on le gère ici
    if (condition.$exists !== undefined) {
        const fieldName = Object.keys(condition)[0]; // Récupérer le nom du champ
        const shouldExist = condition.$exists; // Récupérer la valeur de $exists (true ou false)
        const exists = Object.prototype.hasOwnProperty.call(formData, fieldName) && formData[fieldName] !== undefined && formData[fieldName] !== null;
        return exists === shouldExist;
    }

    // Si la condition contient un opérateur $find, on le gère ici
    if (condition.$find) {
        // Récupérer le nom du champ
        const fieldName = Object.keys(condition)[0];
        const fieldValue = formData[fieldName];
        try {
            // Assuming evaluateSingleCondition handles $find
            return evaluateSingleCondition(currentModelDef, condition.$find, formData, allModels, user);
        } catch (error) {
            console.error("Error evaluating $find condition:", condition, error);
            return false;
        }
    }

    // Récupérer le nom du champ et la condition
    const fieldName = Object.keys(condition)[0];
    const fieldValue = condition[fieldName];

    // Récupérer la définition du champ
    const fieldDef = currentModelDef?.fields.find(f => f.name === fieldName);

    // Si la définition du champ n'est pas trouvée, on retourne true
    if (!fieldDef) {
        console.warn(`[Client Eval] Field definition not found for field: ${fieldName}`);
        return true; // Permissive default
    }

    let targetValue = formData[fieldName];
    let processedConditionValue = fieldValue;

    // 1. Handle $exists (on the first field)
    // 2. Convert condition value based on operator's expected input type
    const fieldType = fieldDef?.type; // Type of the first field

    try {
        processedConditionValue = convertValueType(fieldValue, fieldType);
    } catch (e) {
        logClientEvalWarning(`Error converting value type: ${e.message}`, condition);
        return false;
    }

    return evaluateComparison(fieldValue, targetValue, processedConditionValue, condition);

    function logClientEvalWarning(message, details) {
        console.warn(`[Client Eval] ${message}:`, details);
    }

    function convertValueType(value, inputType) {
        switch (inputType) {
        case 'number':
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                throw new Error(`Invalid number value: ${value}`);
            }
            return numValue;
        case 'boolean':
            return String(value).toLowerCase() === 'true';
        case 'csv':
            return String(value).split(',').map(item => item.trim()).filter(Boolean);
        case 'text':
        default:
            return String(value);
        }
    }

    function evaluateComparison(operator, targetValue, processedConditionValue, condition) {
        try {
            switch (typeof operator === 'object' ? Object.keys(operator)[0] : null) {
            case '$eq': return targetValue == processedConditionValue;
            case '$ne': return targetValue != processedConditionValue;
            case '$gt': return targetValue > processedConditionValue;
            case '$lt': return targetValue < processedConditionValue;
            case '$gte': return targetValue >= processedConditionValue;
            case '$lte': return targetValue <= processedConditionValue;
            case '$regex':
                if (typeof targetValue !== 'string') return false;
                if (typeof processedConditionValue !== 'string') return false;
                try {
                    const regex = new RegExp(processedConditionValue, 'i');
                    return regex.test(targetValue);
                } catch (e) {
                    logClientEvalWarning(`Invalid regex pattern: ${processedConditionValue}`, condition);
                    return false;
                }
            case '$in':
                return Array.isArray(processedConditionValue) && processedConditionValue.includes(String(targetValue));
            case '$nin':
                return !Array.isArray(processedConditionValue) || !processedConditionValue.includes(String(targetValue));
            default:
                logClientEvalWarning(`Unhandled operator in client evaluation logic: ${operator}`, condition);
                return true; // Permissive default
            }
        } catch (evalError) {
            logClientEvalWarning(`Error during client condition evaluation: ${operator}, targetValue=${targetValue}, processedConditionValue=${processedConditionValue}`, condition);
            return false;
        }
    }
};

export const isConditionMet = (model, cond, formData, allModels, user) => {
    const condition = cond;

    if (!condition) return true;

    // Cas 0: Condition est une valeur primitive (string, number, boolean)
    // On la considère comme toujours vraie (comportement de searchData)
    if (typeof condition !== 'object' || condition === null) {
        return true;
    }

    // Cas 1: Condition simple {field: value} → transformée en {field: {$eq: value}}
    if (typeof condition === 'object' && !Array.isArray(condition)) {
        const keys = Object.keys(condition);

        // Cas spécial pour les conditions de type {field: value} (pas d'opérateur $)
        if (keys.length === 1 && !keys[0].startsWith('$') &&
            typeof condition[keys[0]] !== 'object') {
            const fieldName = keys[0];
            const value = condition[fieldName];

            // Si la valeur est null/undefined, on vérifie simplement l'existence
            if (value === null || value === undefined) {
                return formData[fieldName] === value;
            }

            // Sinon on fait une comparaison d'égalité simple
            return formData[fieldName] == value;
        }

        // Cas spécial pour les tableaux - vérifie si la valeur est incluse
        if (keys.length === 1 && !keys[0].startsWith('$') &&
            Array.isArray(condition[keys[0]])) {
            const fieldName = keys[0];
            const values = condition[fieldName];
            const fieldValue = formData[fieldName];

            // Si le champ est aussi un tableau, vérifie l'intersection
            if (Array.isArray(fieldValue)) {
                return fieldValue.some(v => values.includes(v));
            }

            // Sinon vérifie si la valeur est dans le tableau
            return values.includes(fieldValue);
        }
    }

    // Cas 2: Opérateurs logiques ($and, $or, $not, $nor)
    if (condition.$and && Array.isArray(condition.$and)) {
        if (condition.$and.length === 0) return true;
        return condition.$and.every(sub => isConditionMet(model, sub, formData, allModels, user));
    }

    if (condition.$or && Array.isArray(condition.$or)) {
        if (condition.$or.length === 0) return false;
        return condition.$or.some(sub => isConditionMet(model, sub, formData, allModels, user));
    }

    if (condition.$not) {
        return !isConditionMet(model, condition.$not, formData, allModels, user);
    }

    if (condition.$nor && Array.isArray(condition.$nor)) {
        if (condition.$nor.length === 0) return true;
        return !condition.$nor.some(sub => isConditionMet(model, sub, formData, allModels, user));
    }

    // Cas 3: Syntaxe d'agrégation {$eq: ['$field', value]}
    if (Object.keys(condition).length === 1) {
        const operator = Object.keys(condition)[0];
        if (operator.startsWith('$') && operator !== '$find' &&
            Array.isArray(condition[operator])) {
            return evaluateSingleCondition(model, condition, formData, allModels, user);
        }
    }

    // Cas 4: Tous les autres cas (conditions normales avec opérateurs)
    return evaluateSingleCondition(model, condition, formData, allModels, user);
};