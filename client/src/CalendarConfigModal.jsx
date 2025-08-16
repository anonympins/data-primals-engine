// src/components/dataview/CalendarConfigModal.jsx
import React, {useState, useMemo, useEffect} from 'react';
import { useTranslation } from 'react-i18next';
import {Dialog} from "./Dialog.jsx";

// Remplacez par vos propres composants Modal, Select, Button
const Modal = ({ isOpen, onClose, title, children }) => isOpen ? <div style={{...modalStyles}}>{title}{children}{onClose}</div> : null;
const Select = ({ children, ...props }) => <select {...props}>{children}</select>;
const Button = (props) => <button {...props} />;

export default function CalendarConfigModal({ isOpen, onClose, onSave, modelFields, initialSettings }) {
    const { t } = useTranslation();
    const [selectedField, setSelectedField] = useState('');
    // État pour contenir la configuration complète
    const [config, setConfig] = useState({
        titleField: '',
        startField: '',
        endField: '',
    });

    // Remplir l'état à partir des `initialSettings` lorsque la modale s'ouvre
    useEffect(() => {
        if (isOpen) {
            setConfig({
                titleField: initialSettings?.titleField || '',
                startField: initialSettings?.startField || '',
                endField: initialSettings?.endField || '',
            });
        }
    }, [initialSettings, isOpen]);

    const handleConfigChange = (e) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const dateFields = useMemo(() =>
            modelFields.filter(f => ['date', 'datetime'].includes(f.type)),
        [modelFields]
    );

    const titleFields = useMemo(() => modelFields.filter(f =>
        ['string', 'string_t', 'enum', 'number'].includes(f.type)
    ), [modelFields]);


    const handleSave = () => {
        onSave(config);
    };

    const isSaveDisabled = !config.titleField || !config.startField || !config.endField;

    if (!isOpen) return null;

    return (
        <Dialog isOpen={isOpen} onClose={onClose}>
            <h2>{t('dataview.calendar.configureTitle', 'Configurer la vue Calendrier')}</h2>
            <p>{t('dataview.calendar.configureText', 'Sélectionnez les champs à utiliser pour afficher les données dans le calendrier.')}</p>

            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                    <label htmlFor="titleField">{t('dataview.calendar.titleFieldLabel', "Champ pour le titre de l'événement")}</label>
                    <Select id="titleField" name="titleField" value={config.titleField} onChange={handleConfigChange}>
                        <option value="">{t('dataview.calendar.selectPlaceholder', 'Sélectionner un champ...')}</option>
                        {titleFields.map(field => (<option key={field.name} value={field.name}>{field.name}</option>))}
                    </Select>
                </div>
                <div>
                    <label htmlFor="startField">{t('dataview.calendar.startFieldLabel', 'Champ pour la date de début')}</label>
                    <Select id="startField" name="startField" value={config.startField} onChange={handleConfigChange}>
                        <option value="">{t('dataview.calendar.selectPlaceholder', 'Sélectionner un champ...')}</option>
                        {dateFields.map(field => (<option key={field.name} value={field.name}>{field.name}</option>))}
                    </Select>
                </div>
                <div>
                    <label htmlFor="endField">{t('dataview.calendar.endFieldLabel', 'Champ pour la date de fin')}</label>
                    <Select id="endField" name="endField" value={config.endField} onChange={handleConfigChange}>
                        <option value="">{t('dataview.calendar.selectPlaceholder', 'Sélectionner un champ...')}</option>
                        {dateFields.map(field => (<option key={field.name} value={field.name}>{field.name}</option>))}
                    </Select>
                </div>
            </div>

            <Button onClick={handleSave} disabled={isSaveDisabled}>{t('btns.saveConfig', 'Enregistrer')}</Button>
            <Button onClick={onClose} style={{ marginLeft: '10px' }}>{t('btns.cancel', 'Annuler')}</Button>
        </Dialog>
    );
}