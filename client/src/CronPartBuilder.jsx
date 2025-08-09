
import React, { useMemo } from 'react';
import { SelectField, TextField, NumberField } from './Field.jsx';
import { useTranslation } from 'react-i18next';

/**
 * Ce composant gère une seule partie de l'expression CRON.
 * Il est "contrôlé" : son affichage est entièrement dérivé de la prop `value`
 * et les interactions utilisateur appellent directement `onChange` avec la nouvelle valeur.
 * Cette version renforce la logique de parsing pour éviter les interprétations incorrectes.
 */
export const CronPartBuilder = ({ label, masked, value, defaultValue, onChange, min, max, id }) => {
    const { t } = useTranslation();


    const { mode, specificValue, intervalValue, rangeStart, rangeEnd } = useMemo(() => {
        const initialState = {
            mode: 'every',
            specificValue: '',
            intervalValue: 5,
            rangeStart: min,
            rangeEnd: max,
        };

        // --- CORRECTION ICI ---
        // On utilise la prop `defaultValue` quand le champ est masqué.
        const valStr = String(value || '');
        // --- FIN DE LA CORRECTION ---

        if (valStr === '*') {
            return { ...initialState, mode: 'every' };
        }
        // ... (le reste du useMemo est correct)
        if (valStr.includes('/')) {
            const parts = valStr.split('/');
            // Assurez-vous que la valeur par défaut est bien parsée si elle est de type intervalle
            return { ...initialState, mode: 'interval', intervalValue: parseInt(parts[1], 10) || 5 };
        }
        if (valStr.includes('-')) {
            const parts = valStr.split('-');
            const start = parseInt(parts[0], 10);
            const end = parseInt(parts[1], 10);
            return { ...initialState, mode: 'range', rangeStart: isNaN(start) ? min : start, rangeEnd: isNaN(end) ? max : end };
        }
        if (valStr.includes(',')) {
            return { ...initialState, mode: 'specific_multiple', specificValue: valStr };
        }
        if (/^\d+$/.test(valStr)) {
            return { ...initialState, mode: 'specific_single', specificValue: valStr };
        }

        return initialState;

    }, [value, min, max, masked, defaultValue]);

    // GESTIONNAIRES D'ÉVNEMENTS : Calculent la nouvelle chaîne et appellent `onChange` directement.

    const handleModeChange = (item) => {
        const newMode = item.value;
        let newValue = defaultValue;
        switch (newMode) {
            case 'every':
                newValue = '*';
                break;
            case 'specific_single':
                newValue = String(min);
                break;
            case 'specific_multiple':
                newValue = `${min},${min + 1 > max ? min : min + 1}`;
                break;
            case 'interval':
                newValue = '*/5';
                break;
            case 'range':
                newValue = `${min}-${max}`;
                break;
            default:
                newValue = defaultValue;
        }
        if (newValue !== value) {
            onChange(newValue);
        }
    };

    const handleSpecificValueChange = (e) => {
        const cleanedValue = e.target.value.replace(/[^0-9,]/g, '');
        onChange(cleanedValue || '*'); // Retour à '*' si le champ est vide
    };

    const handleIntervalChange = (e) => {
        const newInterval = parseInt(e.target.value, 10) || 1;
        onChange(`*/${newInterval}`);
    };

    const handleRangeChange = (part, e) => {
        const newRangeValue = parseInt(e.target.value, 10);
        if (isNaN(newRangeValue)) return; // Ne pas mettre à jour si l'entrée n'est pas un nombre

        if (part === 'start') {
            onChange(`${newRangeValue}-${rangeEnd}`);
        } else {
            onChange(`${rangeStart}-${newRangeValue}`);
        }
    };

    const modeOptions = [
        { value: 'every', label: t('cron.every', `Chaque {{label}}`, {label:label.toLowerCase()}) },
        { value: 'specific_single', label: t('cron.specific_single', `Spécifique (ex: 15)`) },
        { value: 'specific_multiple', label: t('cron.specific_multiple', `Spécifiques (ex: 0,15,30)`) },
        { value: 'interval', label: t('cron.interval', `Toutes les X {{label}}s`, {label:label.toLowerCase()}) },
        { value: 'range', label: t('cron.range', `Plage (ex: 9-17)`) },
    ];

    return (
        <div className="cron-part-controls">
            <SelectField disabled={masked} items={modeOptions} value={mode} onChange={handleModeChange} />

            <div className="cron-part-inputs">
                {['specific_single', 'specific_multiple'].includes(mode) && (
                    <TextField
                        id={id}
                        disabled={masked}
                        value={specificValue}
                        onChange={handleSpecificValueChange}
                        placeholder={mode === 'specific_single' ? '15' : '0,15,30,45'}
                    />
                )}
                {mode === 'interval' && (
                    <NumberField
                        id={id}
                        value={intervalValue}
                        onChange={handleIntervalChange}
                        min={1}
                        max={max}
                    />
                )}
                {mode === 'range' && (
                    <div className="range-inputs">
                        <NumberField id={id} value={rangeStart} onChange={(e) => handleRangeChange('start', e)} min={min} max={max} />
                        <span>-</span>
                        <NumberField value={rangeEnd} onChange={(e) => handleRangeChange('end', e)} min={min} max={max} />
                    </div>
                )}
            </div>
        </div>
    );
};