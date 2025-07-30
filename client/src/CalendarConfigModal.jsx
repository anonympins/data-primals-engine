// src/components/dataview/CalendarConfigModal.jsx
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {Dialog} from "./Dialog.jsx";

// Remplacez par vos propres composants Modal, Select, Button
const Modal = ({ isOpen, onClose, title, children }) => isOpen ? <div style={{...modalStyles}}>{title}{children}{onClose}</div> : null;
const Select = ({ children, ...props }) => <select {...props}>{children}</select>;
const Button = (props) => <button {...props} />;

export default function CalendarConfigModal({ isOpen, onClose, onSave, modelFields }) {
    const { t } = useTranslation();
    const [selectedField, setSelectedField] = useState('');

    const dateFields = useMemo(() =>
            modelFields.filter(f => f.type === 'date' || f.type === 'datetime'),
        [modelFields]
    );

    const handleSave = () => {
        if (selectedField) {
            onSave({ dateField: selectedField });
        }
    };

    if (!isOpen) return null;

    return (
        // Utilisez votre propre composant Modal ici
        <Dialog isOpen={isOpen} onClose={onClose}>
            <h2>{t('dataview.calendar.configureTitle')}</h2>
            <p>{t('dataview.calendar.notConfigured')}</p>

            <div style={{ margin: '20px 0' }}>
                <label htmlFor="dateField">{t('dataview.calendar.dateFieldLabel')}</label>
                <br />
                <Select id="dateField" value={selectedField} onChange={e => setSelectedField(e.target.value)}>
                    <option value="">{t('dataview.calendar.dateFieldPlaceholder')}</option>
                    {dateFields.map(field => (
                        <option key={field.name} value={field.name}>{field.name}</option>
                    ))}
                </Select>
            </div>

            <Button onClick={handleSave} disabled={!selectedField}>{t('btns.saveConfig')}</Button>
            <Button onClick={onClose} style={{ marginLeft: '10px' }}>{t('btns.cancel')}</Button>
        </Dialog>
    );
}