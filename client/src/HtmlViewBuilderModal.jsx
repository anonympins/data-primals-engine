import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog.jsx';
import {TextField, SelectField, NumberField, CodeField, ModelField} from './Field.jsx';
import Button from './Button.jsx';
import { FaSave, FaTimes } from 'react-icons/fa';
import './HtmlViewBuilderModal.scss';

const HtmlViewBuilderModal = ({ isOpen, onClose, onSave, models, initialConfig }) => {
    const { t } = useTranslation();
    const [config, setConfig] = useState({});
    const [jsonError, setJsonError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfig(initialConfig || {
                title: '',
                model: '',
                limit: 10,
                filter: {},
                template: '',
                css: '',
                ...initialConfig
            });
            setJsonError('');
        }
    }, [isOpen, initialConfig]);

    const modelOptions = useMemo(() => {
        return (models || []).map(m => ({ label: m.name, value: m.name }));
    }, [models]);

    const handleChange = (e) => {
        const { name, value } = e.target || e;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleCodeChange = (name, value) => {
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleFilterChange = (codeValue) => {
        try {
            const parsed = JSON.parse(codeValue);
            setConfig(prev => ({ ...prev, filter: parsed }));
            setJsonError('');
        } catch (e) {
            setJsonError(t('dashboards.invalidJson', 'JSON invalide'));
        }
    };

    const handleSave = () => {
        if (!config.model || !config.template) {
            console.error("Model and template are required.");
            return;
        }
        if (jsonError) return;
        onSave(config);
    };

    if (!isOpen) return null;

    return (
        <Dialog
            isModal={true}
            isClosable={true}
            onClose={onClose}
            title={initialConfig?.id ? t('dashboards.editHtmlViewTitle', 'Modifier la Vue HTML') : t('dashboards.addHtmlViewTitle', 'Ajouter une Vue HTML')}
            className="html-view-builder-modal"
        >
            <div className="form-grid">
                <TextField name="title" label={t('dashboards.widgetTitle', 'Titre du widget')} value={config.title || ''} onChange={handleChange} />
                <ModelField name="model" label={t('model', 'Modèle')} value={config.model || ''} onChange={(option) => handleChange({ name: 'model', value: option?.value })} required />
                <NumberField name="limit" label={t('dashboards.dataLimit', 'Limite de données')} value={config.limit ?? 10} onChange={handleChange} min={1} max={100} />
                <CodeField name="filter" label={t('filter', 'Filtre (JSON)')} value={typeof config.filter === 'string' ? config.filter : JSON.stringify(config.filter || {}, null, 2)} language="json" onChange={(e) => handleFilterChange(e.value)} error={jsonError} />
                <CodeField name="template" label={t('dashboards.htmlTemplate', 'Template HTML')} value={config.template || ''} language="html" onChange={(e) => handleCodeChange('template', e.value)} required height="200px" />
                <CodeField name="css" label={t('dashboards.cssStyles', 'Styles CSS')} value={config.css || ''} language="css" onChange={(e) => handleCodeChange('css', e.value)} height="150px" />
            </div>
            <div className="flex actions right">
                <Button onClick={onClose} className="btn-secondary">
                    <FaTimes /> {t('btns.cancel', 'Annuler')}
                </Button>
                <Button onClick={handleSave} className="btn-primary" disabled={!!jsonError}>
                    <FaSave /> {t('btns.save', 'Enregistrer')}
                </Button>
            </div>
        </Dialog>
    );
};

export default HtmlViewBuilderModal;