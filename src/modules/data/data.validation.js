import {Event} from "../../events.js";
import i18n from "../../i18n.js";
import {allowedFields, maxFileSize, maxModelNameLength, maxStringLength} from "../../constants.js";
import {getDefaultForType} from "../../data.js";
import { generateRegexFromMask } from './data.core.js';

import {dataTypes} from "./data.operations.js";
import {Logger} from "../../gameObject.js";


let engine, logger;
export function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);

    Event.Listen("OnValidateModelStructure", async (modelStructure) =>{

        const objectKeys = Object.keys(modelStructure);

        if( objectKeys.find(o => !["name", "_user", "icon", "history", "locked", "_id", "description", "maxRequestData", "fields", "tags", "constraints"].includes(o)) ){
            throw new Error(i18n.t('api.model.invalidStructure'));
        }

        // Vérification du type de name
        if (typeof modelStructure.name !== 'string' || !modelStructure.name) {
            throw new Error(i18n.t("api.validate.requiredFieldString", ["name"]));
        }

        // Vérification du type de description
        if (typeof modelStructure.description !== 'string') {
            throw new Error(i18n.t("api.validate.fieldString", ["description"]));
        }

        // Vérification de la présence et du type du tableau fields
        if (!Array.isArray(modelStructure.fields)) {
            throw new Error(i18n.t('api.validate.fieldArray', ["fields"]));
        }

        // Vérification de la présence et du type du tableau fields
        if (typeof(modelStructure.tags) !== 'undefined' && (!Array.isArray(modelStructure.tags) || modelStructure.tags.some(tag => typeof tag !== 'string'))) {
            throw new Error(i18n.t('api.validate.fieldArray', ["tags"]));
            //todo: fieldStringArray trad
        }

        // Vérification de chaque champ dans le tableau fields
        for (const field of modelStructure.fields) {
            validateField(field);
        }

        if (modelStructure.constraints) {
            if (!Array.isArray(modelStructure.constraints)) {
                throw new Error('Model "constraints" property must be an array.');
            }
            const fieldNames = new Set(modelStructure.fields.map(f => f.name).concat(['_user']));
            for (const constraint of modelStructure.constraints) {
                if (constraint.type === 'unique') {
                    if (!constraint.name || !Array.isArray(constraint.keys) || constraint.keys.length === 0) {
                        throw new Error('Unique constraint must have a "name" and a non-empty "keys" array.');
                    }
                    for (const key of constraint.keys) {
                        if (!fieldNames.has(key)) {
                            throw new Error(`Constraint key "${key}" in constraint "${constraint.name}" does not exist as a field in the model.`);
                        }
                    }
                }
            }
        }

        return true; // La structure du modèle est valide
    }, "event", "system");

}

export async function validateModelStructure(modelStructure) {
    return await Event.Trigger("OnValidateModelStructure", "event", "system", modelStructure);
}

export const validateField = (field) => {

    const allowedFieldTest = (fields) => {
        // Check for unknown fields
        const unknownFields = Object.keys(field).filter(f => ![...allowedFields, ...fields].includes(f));

        if (unknownFields.length > 0) {
            throw new Error(i18n.t('api.validate.unknowField', `Propriété(s) non reconnue(s): '{{0}}' pour le champ '{{1}}'`, [unknownFields.join(', '), field.name]));
        }

        const fieldInvalid = Object.keys(fields).find(f => JSON.stringify(field[f] || '').length > maxStringLength);
        if (fieldInvalid) {
            throw new Error(i18n.t('api.validate.invalidField', `Champ(s) non valide(s): '{{0}}'`, [fieldInvalid.name]));
        }
    }

    // Check for required fields
    if (!field.name || typeof field.name !== 'string') {
        throw new Error(i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["name"]));
    }
    if (!field.type || typeof field.type !== 'string') {
        throw new Error(i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["type"]));
    }

    // Check for specific field types
    switch (field.type) {
    case 'relation':
        allowedFieldTest(['relation', 'multiple', 'relationFilter']);
        if (!field.relation || typeof field.relation !== 'string' || field.relation.length > maxModelNameLength) {
            throw new Error(i18n.t('api.validate.requiredFieldString', "Le champ '{{0}}' est requis et doit être une chaîne de caractères.", ["relation"]));
        }
        if (field.multiple !== undefined && typeof field.multiple !== 'boolean') {
            throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["multiple"]));
        }
        if (field.relationFilter && typeof field.relationFilter !== 'object') {
            throw new Error(i18n.t('api.validate.fieldObject', "L'attribut '{{0}}' doit être un objet.", ["relationFilter"]));
        }
        break;
    case 'enum': {
        allowedFieldTest(['items']);
        if (!field.items || !Array.isArray(field.items) || field.items.length === 0) {
            throw new Error(i18n.t('api.validate.fieldStringArray', "L'attribut '{{0}}' doit être un tableau de chaines de caractères.", ["items"]));
        }
        let id = field.items.findIndex(item => typeof item !== 'string');
        if (id !== -1) {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["items[" + id + "]"]));
        }
        break;
    }
    case 'number':
        allowedFieldTest(['min', 'max', 'step', 'unit', 'delay', 'gauge', 'percent']);
        if (field.min !== undefined && typeof field.min !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["min"]));
        }
        if (field.max !== undefined && typeof field.max !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["max"]));
        }
        if (field.max < field.min) {
            throw new Error(i18n.t('api.validate.inferiorTo', "L'attribut '{{0}}' doit être inférieur à l'attribut '{{1}}'.", ["min", "max"]));
        }
        if (field.step !== undefined && typeof field.step !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["step"]));
        }
        if (field.unit !== undefined && typeof field.unit !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["unit"]));
        }
        if (field.delay !== undefined && typeof field.delay !== 'boolean') {
            throw new Error(i18n.t('api.validate.fieldBoolean', "Le champ '{{0}}' doit être un booléen.", ["unit"]));
        }
        if (field.gauge !== undefined && typeof field.gauge !== 'boolean') {
            throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["gauge"]));
        }
        if (field.percent !== undefined && typeof field.percent !== 'boolean') {
            throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["percent"]));
        }
        break;
    case 'string':
    case 'string_t':
    case 'richtext':
    case 'richtext_t':
    case 'url':
    case 'email':
    case 'phone':
    case 'password':
    case 'code':
        if (field.type === 'code')
            allowedFieldTest(['maxlength', 'language', 'conditionBuilder', 'targetModel']);
        else if (['string_t', 'string'].includes(field.type)) {
            allowedFieldTest(['maxlength', 'multiline', 'mask', 'replacement']);
        }
        else
            allowedFieldTest(['maxlength']);
        if (field.maxlength !== undefined && typeof field.maxlength !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["maxlength"]));
        }
        if (field.mask !== undefined && typeof field.mask !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["mask"]));
        }
        if (field.replacement !== undefined && typeof field.replacement !== 'object') {
            throw new Error(i18n.t('api.validate.fieldObject', "L'attribut '{{0}}' doit être un objet.", ["replacement"]));
        }
        if (field.mask && !field.replacement) {
            throw new Error(i18n.t('api.validate.missingField', "L'attribut 'replacement' est requis quand 'mask' est défini."));
        }
        break;
    case 'model':
    case 'modelField':
        allowedFieldTest(['targetModel']);
        if (field.targetModel !== undefined && typeof field.targetModel !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["targetModel"]));
        }
        break;
    case 'object':
        allowedFieldTest([]);
        break;
    case 'boolean':
        allowedFieldTest([]);
        break;
    case 'date':
    case 'datetime': {
        allowedFieldTest(['min', 'max']);
        if (field.min !== undefined && typeof field.min !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["min"]));
        }
        if (field.max !== undefined && typeof field.max !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["max"]));
        }
        const dtMin = field.min ? new Date(field.min) : null;
        const dtMax = field.max ? new Date(field.max) : null;
        if (dtMin && dtMax && dtMin > dtMax) {
            throw new Error(i18n.t('api.validate.inferiorTo', "L'attribut '{{0}}' doit être inférieur à l'attribut '{{1}}'.", ["min", "max"]));
        }
        break;
    }
    case 'image':
    case 'file': {
        allowedFieldTest(['mimeTypes', 'maxSize']);
        if (field.mimeTypes !== undefined && !Array.isArray(field.mimeTypes)) {
            throw new Error(i18n.t('api.validate.fieldStringArray', "L'attribut '{{0}}' doit être un tableau de chaines de caractères.", ["mimeTypes"]));
        }
        let id;
        if (field.mimeTypes !== undefined && (id = field.mimeTypes.findIndex(item => typeof item !== 'string')) !== -1) {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["mimeTypes[" + id + "]"]));
        }
        if (field.maxSize !== undefined && typeof field.maxSize !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["maxSize"]));
        }
        if (field.maxSize !== undefined && field.maxSize > maxFileSize) {
            throw new Error(i18n.t('api.validate.fileSize', `L'attribut 'maxSize' ne doit pas dépasser {{0}} octets.`, [maxFileSize]));
        }
        break;
    }
    case 'color':
        allowedFieldTest([]);
        return true;
    case 'cronSchedule':
        allowedFieldTest(['cronMask']);
        return true;
    case 'geolocation':
        allowedFieldTest([]);
        return true;
    case 'calculated':
        allowedFieldTest(['calculation']);
        return true;
    case 'array':
        if (!field.itemsType || typeof field.itemsType !== 'string') {
            throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["itemsType"]));
        }
        if (!dataTypes[field.itemsType]) {
            throw new Error(i18n.t('api.validate.invalidField', `Champ(s) non valide(s): '{{0}}'`, ["itemsType"]));
        }
        if (field.minItems !== undefined && typeof field.minItems !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["minItems"]));
        }
        if (field.maxItems !== undefined && typeof field.maxItems !== 'number') {
            throw new Error(i18n.t('api.validate.fieldNumber', "L'attribut '{{0}}' doit être un nombre.", ["maxItems"]));
        }
        break;
    default:
        throw new Error(i18n.t('api.validate.unknowType', `Le type '{{0}}' n'est pas reconnu.`, [field.type]));
    }

    // Check for optional fields
    if (field.required !== undefined && typeof field.required !== 'boolean') {
        throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["required"]));
    }
    if (field.hint !== undefined && typeof field.hint !== 'string') {
        throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["hint"]));
    }
    if (field.default !== undefined && field.default !== null && typeof field.default !== typeof getDefaultForType(field) && typeof field.default !== 'function') {
        throw new Error(i18n.t('api.validate.sameType', `L'attribut '{{0}}' doit être du même type que l'attribut '{{0}}' (${field.type}).`, ['default', 'type']));
    }
    if (field.validate !== undefined && typeof field.validate !== 'function') {
        throw new Error(i18n.t('api.validate.fieldFunction', "L'attribut '{{0}}' doit être une fonction.", ['validate']));
    }
    if (field.unique !== undefined && typeof field.unique !== 'boolean') {
        throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["unique"]));
    }
    if (field.placeholder !== undefined && typeof field.placeholder !== 'string') {
        throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["placeholder"]));
    }
    if (field.asMain !== undefined && typeof field.asMain !== 'boolean') {
        throw new Error(i18n.t('api.validate.fieldBoolean', "L'attribut '{{0}}' doit être un booléen.", ["asMain"]));
    }
    if (field.unit !== undefined && typeof field.unit !== 'string') {
        throw new Error(i18n.t('api.validate.fieldString', "Le champ '{{0}}' doit être une chaîne de caractères.", ["unit"]));
    }

    return true;
};

/**
 * Valide la structure et le contenu du document selon le modèle
 */
export async function validateModelData(doc, model, isPatch = false) {
    if (!isPatch) {
        model.fields.forEach(field => {
            const value = doc[field.name];
            if (field.required) {
                if (value === undefined && !('default' in field)) {
                    throw new Error(i18n.t('api.field.missingRequired', {field: field.name + " (" + model.name + ")"}));
                }
                if (value === '' || value === null) {
                    throw new Error(i18n.t('api.field.requiredCannotBeEmpty', {field: field.name}));
                }
            }
        });
    }

    // 2. Validation des types de champs (toujours exécutée pour les champs fournis)
    for (const [fieldName, value] of Object.entries(doc)) {
        const fieldDef = model.fields.find(f => f.name === fieldName);
        if (!fieldDef) continue; // On ignore les champs supplémentaires

        // Validation du masque si défini
        if (fieldDef.mask && value) {
            const regexString = generateRegexFromMask(fieldDef.mask, fieldDef.replacement);
            if (regexString) {
                const regex = new RegExp(regexString);
                if (!regex.test(value)) {
                    throw new Error(i18n.t('api.field.maskValidationFailed', { field: fieldName, value: value, mask: fieldDef.mask }));
                }
            }
        }

        const validator = dataTypes[fieldDef.type]?.validate;
        const valid = validator && validator(value, fieldDef);
        const realValidation = await Event.Trigger('OnDataValidate', "event", "system", value, fieldDef, doc);
        if (!(valid || realValidation)) {
            throw new Error(i18n.t('api.field.validationFailed', {field: fieldName, value}));
        }
    }
}