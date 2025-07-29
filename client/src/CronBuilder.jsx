import React, { useState, useEffect } from 'react';
import { CronPartBuilder } from './CronPartBuilder.jsx';
import cronstrue from 'cronstrue/i18n';
import { useTranslation } from 'react-i18next';
import './CronBuilder.scss';

const CronBuilder = ({ cronExpression, cronMask, defaultCronExpression, onCronChange }) => {
    const { t, i18n } = useTranslation();
    const [parts, setParts] = useState({
        second: '*',
        minute: '*',
        hour: '*',
        dayOfMonth: '*',
        month: '*',
        dayOfWeek: '*',
    });
    const [defaultParts, setDefaultParts] = useState({
        second: '*',
        minute: '*',
        hour: '*',
        dayOfMonth: '*',
        month: '*',
        dayOfWeek: '*',
    });
    const [humanReadable, setHumanReadable] = useState('');
    // Nouvel état pour suivre l'initialisation et éviter les boucles de rendu.
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        setIsReady(false);

        const cronParts = (cronExpression || '* * * * * *').split(' ');
        if (cronParts.length === 5) {
            cronParts.unshift('*');
        }

        const defaultParts = (defaultCronExpression || '* * * * * *').split(' ');
        if (defaultParts.length === 5) {
            defaultParts.unshift('*');
        }
        console.log({cronMask})
        setParts({
            second: cronMask && !cronMask[0] ? '0' : cronParts[0] || defaultParts[0] || '*',
            minute: cronMask && !cronMask[1] ? '0' : cronParts[1] || defaultParts[1] || '*',
            hour: cronMask && !cronMask[2] ? '0' : cronParts[2] || defaultParts[2] || '*',
            dayOfMonth: cronMask && !cronMask[3] ? '0' : cronParts[3] || defaultParts[3] || '*',
            month: cronMask && !cronMask[4] ? '0' : cronParts[4] || defaultParts[4] || '*',
            dayOfWeek: cronMask && !cronMask[5] ? '0' : cronParts[5] || defaultParts[5] || '*',
        });
        setIsReady(true);
    }, [cronExpression, defaultCronExpression]); // Ajouter defaultCronExpression aux dépendances

    // Met à jour la chaîne CRON complète et sa version lisible.
    // Ce `useEffect` se déclenche lorsque les `parts` ou la langue changent.
    useEffect(() => {
        // **CORRECTION CLÉ :** On ne fait rien tant que le composant n'est pas prêt.
        // Cela empêche l'appel à `onCronChange` avec l'état par défaut lors du montage initial.
        if (!isReady) {
            return;
        }

        const newCronString = `${parts.second} ${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`;

        // Met à jour le parent si la chaîne a changé.
        // Cette condition est maintenant sûre car elle ne s'exécute qu'après l'initialisation.
        if (newCronString !== cronExpression) {
            onCronChange(newCronString);
        }

        // Met à jour la version lisible (logique inchangée).
        try {
            const lang = (i18n.language || 'en').split('-')[0];
            setHumanReadable(cronstrue.toString(newCronString, { locale: lang }));
        } catch (e) {
            setHumanReadable(t('cron.invalid', 'Expression CRON invalide'));
        }
    }, [parts, i18n.language, isReady]); // `isReady` est ajouté aux dépendances.

    const handlePartChange = (partName, newValue) => {
        // Si une partie devient invalide, CronPartBuilder renvoie `*`.
        // Ce changement est géré normalement.
        setParts(p => ({ ...p, [partName]: newValue || '*' }));
    };

    const cronPartsConfig = [
        { name: 'second', label: t('cron.second', 'Seconde'), min: 0, max: 59 },
        { name: 'minute', label: t('cron.minute', 'Minute'), min: 0, max: 59 },
        { name: 'hour', label: t('cron.hour', 'Heure'), min: 0, max: 23 },
        { name: 'dayOfMonth', label: t('cron.dayOfMonth', 'Jour du mois'), min: 1, max: 31 },
        { name: 'month', label: t('cron.month', 'Mois'), min: 1, max: 12 },
        { name: 'dayOfWeek', label: t('cron.dayOfWeek', 'Jour de la semaine'), min: 0, max: 6 },
    ];

    return (
        <div className="cron-builder-wrapper">
            <div className="cron-builder-inputs">
                {cronPartsConfig.map((part,ind)=>
                    {
                            return <div className="cron-part" key={part.name}>
                                <label htmlFor={`cron-${part.name}`}>{part.label}</label>
                                <CronPartBuilder
                                    label={part.label}
                                    id={`cron-${part.name}`}
                                    value={parts[part.name]}
                                    masked={!(!cronMask || cronMask[ind])}
                                    onChange={(val) => handlePartChange(part.name, val)}
                                    min={part.min}
                                    max={part.max}
                                /></div>
                    })}
            </div>
            <div className="cron-builder-output">
                <div className="cron-string-preview">
                    <span className="label">{t('cron.expression', 'Expression CRON :')}</span>
                    <code>{cronExpression}</code>
                </div>
                <div className="cron-human-readable">
                    <span className="label">{t('cron.preview', 'Aperçu :')}</span>
                    <span className="preview-text">{humanReadable}</span>
                </div>
            </div>
        </div>
    );
};

export default CronBuilder;