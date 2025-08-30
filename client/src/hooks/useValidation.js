import {useMutation, useQuery} from 'react-query';
import { debounce } from '../../../src/core.js';
import { useState, useCallback, useMemo } from 'react';

/**
 * Validates a field on the server.
 * @param {object} api - The API client instance.
 * @param {object} payload - The validation payload.
 * @param {string} payload.model - The model name.
 * @param {object} payload.data - The field and value to validate, e.g., { email: '...' }.
 * @param {string} [payload.contextId] - The ID of the document being edited.
 * @returns {Promise<any>}
 */
const validateFieldOnServer = async (api, payload) => {
    return fetch('/api/data/validate', { method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
};

export const useRealtimeValidation = (modelName, docId) => {

    const [validationState, setValidationState] = useState({}); // { fieldName: { status, error } }

    const mutation = useMutation(
        (payload) => validateFieldOnServer(api, payload),
        {
            onSuccess: (data, variables) => {
                const fieldName = Object.keys(variables.data)[0];
                setValidationState(prev => ({
                    ...prev,
                    [fieldName]: { status: 'valid', error: null }
                }));
            },
            onError: (error, variables) => {
                const fieldName = Object.keys(variables.data)[0];
                setValidationState(prev => ({
                    ...prev,
                    [fieldName]: { status: 'invalid', error: error.response?.data?.error || 'Validation failed' }
                }));
            }
        }
    );

    const debouncedValidate = useMemo(
        () => debounce((field, value) => {
            if (value === '' || value === null || value === undefined) {
                setValidationState(prev => ({ ...prev, [field]: { status: 'idle', error: null } }));
                mutation.reset();
                return;
            }

            setValidationState(prev => ({ ...prev, [field]: { status: 'validating', error: null } }));
            mutation.mutate({
                model: modelName,
                contextId: docId,
                data: { [field]: value }
            });
        }, 500),
        [modelName, docId, mutation]
    );

    const validate = useCallback((field, value) => {
        if (!modelName) return; // Don't validate if not configured
        debouncedValidate(field, value);
    }, [debouncedValidate, modelName]);

    const resetValidation = useCallback(() => {
        setValidationState({});
        mutation.reset();
    }, [mutation]);

    return { validate, validationState, resetValidation };
};