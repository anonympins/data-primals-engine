// src/components/FlexBuilderModal.jsx
import React, { useState, useEffect, useCallback } from 'react'; // Ajout de useCallback
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import FlexBuilder from './FlexBuilder';
import './FlexBuilderModal.scss';
import {useAuthContext} from "./contexts/AuthContext.jsx";

const FlexBuilderModal = ({ isOpen, onClose, onSave, models, data, initialConfig = null }) => {
    const { t } = useTranslation();
    const [currentFlexConfig, setCurrentFlexConfig] = useState(initialConfig);
    const {me} = useAuthContext();

    useEffect(() => {
        // Met à jour currentFlexConfig si initialConfig (venant du parent DashboardView) change
        // ou si la modale est (ré)ouverte.
        // Cela est utile si l'utilisateur ferme la modale puis la rouvre pour éditer un autre item
        // ou le même item avec des données potentiellement mises à jour de l'extérieur.
        setCurrentFlexConfig(initialConfig);
    }, [isOpen, initialConfig]); // S'assurer de réagir aux changements de initialConfig

    // Stabiliser handleFlexConfigChange avec useCallback
    const handleFlexConfigChange = useCallback((newConfig) => {
        setCurrentFlexConfig(newConfig);
    }, []); // Les dépendances sont vides car setCurrentFlexConfig est stable

    const handleSave = () => {
        if (currentFlexConfig) {
            onSave(currentFlexConfig);
        }
        // onClose(); // La fermeture est gérée par le parent (DashboardView) après la sauvegarde.
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="flex-builder-config-modal-overlay" onClick={onClose}>
            <div className="flex-builder-config-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="flex-builder-config-modal-header">
                    <h3>{t('dashboard.configureFlexView', 'Configurer la Vue Flex')}</h3>
                    <button onClick={onClose} className="btn-close-x">&times;</button>
                </div>
                <div className="flex-builder-config-modal-body">
                    <FlexBuilder
                        initialConfig={currentFlexConfig}
                        models={(models || []).filter(f => f._user === me?.username)}
                        data={data}
                        onChange={handleFlexConfigChange} // Maintenant, cette prop est stable
                    />
                </div>
                <div className="flex-builder-config-modal-footer">
                    <button onClick={onClose} className="btn-secondary">
                        {t('btns.cancel', 'Annuler')}
                    </button>
                    <button onClick={handleSave} className="btn-primary">
                        {t('btns.save', 'Enregistrer la Vue')}
                    </button>
                </div>
            </div>
        </div>
    );
};

FlexBuilderModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    models: PropTypes.array.isRequired,
    data: PropTypes.array,
    initialConfig: PropTypes.object,
};

export default FlexBuilderModal;