import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {Dialog} from './Dialog.jsx'; // Suppose l'existence d'un composant Dialog
import Button from './Button';
import { CheckboxField, SelectField, NumberField } from './Field'; // Suppose l'existence de ces composants
import { FaInfoCircle } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import {useAuthContext} from "./contexts/AuthContext.jsx"; // Utilisation de react-tooltip comme dans App.jsx

/**
 * ExportDialog Component
 *
 * A dialog for configuring data export options.
 *
 * @param {object} props - Component props
 * @param {boolean} props.isOpen - Whether the dialog is open.
 * @param {function} props.onClose - Function to call when closing the dialog.
 * @param {function} props.onExport - Function to call when initiating the export. Passes the configuration object.
 * @param {string} props.currentModel - The name of the currently active model.
 * @param {Array<object>} props.availableModels - Array of available models (e.g., [{ name: 'user', _id: '...' }, ...]).
 * @param {boolean} props.hasSelection - Whether there is currently data selected in the table.
 */
function ExportDialog({ isOpen, onClose, onExport, currentModel, availableModels = [], hasSelection = false }) {
    const { t } = useTranslation();

    const [withModels, setWithModels] = useState(true);
    // --- State Management ---
    const [exportSelection, setExportSelection] = useState(hasSelection);
    // Initialise avec le modèle courant s'il existe dans la liste des modèles disponibles
    const [selectedModels, setSelectedModels] = useState(
        availableModels.some(m => m.name === currentModel) ? [currentModel] : []
    );
    const [depthParam, setDepthParam] = useState(1); // Profondeur par défaut

    // --- Effects ---
    // Met à jour l'état de la case cher si la sélection change pendant que la modale est ouverte
    useEffect(() => {
        setExportSelection(hasSelection);
    }, [hasSelection]);

    // Met à jour le modèle sélectionné par défaut si le modèle courant change
    useEffect(() => {
        if (availableModels.some(m => m.name === currentModel)) {
            // Si un seul modèle est sélectionnable à la fois (comme avec SelectField simple)
            // setSelectedModels([currentModel]);
            // Si plusieurs modèles sont sélectionnables (adapter selon le composant MultiSelect)
            if (!selectedModels.includes(currentModel)) {
                // Optionnel: Ajouter le modèle courant s'il n'est pas déjà sélectionné
                // setSelectedModels(prev => [...prev, currentModel]);
                // Ou le définir comme seule sélection par défaut si c'est l'intention
                setSelectedModels([currentModel]);
            }
        } else if (selectedModels.length === 0 && availableModels.length > 0) {
            // Si aucun modèle n'est sélectionné et qu'il y a des modèles disponibles,
            // sélectionner le premier par défaut (ou laisser vide)
            // setSelectedModels([availableModels[0].name]);
        }
    }, [currentModel, availableModels]);


    // --- Event Handlers ---
    const handleExportClick = () => {
        if (!exportSelection && selectedModels.length === 0) {
            // Afficher une notification ou un message d'erreur si aucun modèle n'est sélectionné
            console.error("Veuillez sélectionner au moins un modèle à exporter.");
            // Idéalement, utiliser un système de notification comme celui de l'application
            // addNotification({ type: 'error', message: t('exportDialog.error.noModelSelected') });
            return;
        }
        onExport({
            exportSelection: hasSelection && exportSelection, // N'exporte la sélection que si elle existe ET est cochée
            models: selectedModels,
            depth: depthParam,
            withModels
        });
        onClose(); // Ferme la modale après avoir lancé l'export
    };

    const handleModelChange = (selectedOptions) => {
        setSelectedModels(selectedOptions);

        // Gérer la sélection multiple (si un composant MultiSelect est utilisé)
        // setSelectedModels(selectedOptions.map(option => option.value));
    };

    const { me } = useAuthContext()
    // --- Render ---
    const modelOptions = availableModels.filter(model => model._user === me?.username).map(model => ({
        label: t(`model_${model.name}`, model.name), // Traduit le nom du modèle si possible
        value: model.name,
    }));

    return isOpen && (
        <Dialog onClose={onClose} title={t('exportDialog.title', "Options d'exportation")}>
            <div className="dialog-content flex flex-row flex-start">

                {/* 1. Export de la sélection */}
                <CheckboxField
                    name="exportSelection"
                    label={t('exportDialog.exportSelection.label', "Exporter la sélection")}
                    checked={exportSelection}
                    onChange={(e) => setExportSelection(e)}
                    disabled={!hasSelection}
                    hint={hasSelection
                        ? t('exportDialog.exportSelection.hint', "Exportera uniquement les lignes actuellement sélectionnées dans le tableau.")
                        : t('exportDialog.exportSelection.hintDisabled', "Aucune ligne n'est sélectionnée dans le tableau.")
                    }
                />

                {/* 2. Modèles à exporter */}
                {/* Utiliser un SelectField simple pour un seul modèle */}
                <SelectField
                    label={t('exportDialog.models.label', "Modèle à exporter")}
                    name="selectedModel"
                    value={selectedModels} // Prend le premier élément pour un Select simple
                    onChange={handleModelChange}
                    items={modelOptions}
                    placeholder={t('exportDialog.models.placeholder', "Sélectionnez un modèle...")}
                    multiple={true}
                />

                <CheckboxField label={t('exportDialog.withModels.label', "Inclure les modèles ?")} checked={withModels} onChange={(e) => setWithModels(e)} />

                {/* OU: Utiliser un composant MultiSelectField (à créer/importer) pour plusieurs modèles */}
                {/*
                <MultiSelectField
                    label={t('exportDialog.models.label', "Modèles à exporter")}
                    name="selectedModels"
                    value={selectedModels}
                    onChange={handleModelChange} // Adapter cette fonction pour gérer un tableau de valeurs
                    options={modelOptions}
                    placeholder={t('exportDialog.models.placeholderMultiple', "Sélectionnez un ou plusieurs modèles...")}
                    required
                />
                */}

                {/* 3. Profondeur de l'export */}
                <NumberField
                    label={
                        <span className="flex flex-mini-gap">
                            {t('exportDialog.depth.label', "Profondeur des relations")}
                            <FaInfoCircle
                                data-tooltip-id="depth-tooltip"
                                data-tooltip-content={t('exportDialog.depth.tooltip', "Détermine jusqu'à quel niveau les données liées (relations) seront incluses. 0 = données du modèle uniquement, 1 = inclut les données directement liées, 2 = inclut les données liées aux données liées, etc.")}
                                className="hint-icon"
                            />
                        </span>
                    }
                    name="depthParam"
                    value={depthParam}
                    onChange={(e) => setDepthParam(parseInt(e.target.value, 10) || 0)}
                    min={0}
                    step={1}
                    required
                />
                <Tooltip id="depth-tooltip" place="top" effect="solid" />


            </div>
            <div className="dialog-actions actions">
                <Button className="btn-secondary" onClick={onClose}>
                    {t('btns.cancel', "Annuler")}
                </Button>
                <Button className="btn-primary" onClick={handleExportClick} disabled={!exportSelection && selectedModels.length === 0}>
                    {t('btns.export', "Exporter")}
                </Button>
            </div>
        </Dialog>
    );
}

export default ExportDialog;
