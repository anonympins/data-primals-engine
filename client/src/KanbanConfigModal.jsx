// client/src/KanbanConfigModal.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Dialog } from './Dialog.jsx';
import Button from './Button.jsx';
import { SelectField } from './Field.jsx';

const KanbanConfigModal = ({ isOpen, onClose, onSave, model, initialSettings }) => {
    const { t } = useTranslation();

    // --- MODIFICATION 1 : Simplifier l'initialisation de l'--
    // On initialise les états à vide. Le useEffect s'occupera de tout.
    const [groupByField, setGroupByField] = useState('');
    const [subItemsField, setSubItemsField] = useState('');

    const modelFields = model?.fields || [];

    const groupableFields = useMemo(() => {
        // ... (pas de changement ici)
        return modelFields
            .filter(field => ['select', 'string', 'string_t'].includes(field.type))
            .map(field => ({
                label: t(`field_${model.name}_${field.name}`, field.name),
                value: field.name,
            }));
    }, [modelFields, t]);

    const subItemFields = useMemo(() => {
        // ... (pas de changement ici)
        return modelFields
            .filter(field => field.type === 'relation' && field.multiple)
            .map(field => ({
                label: t(`field_${field.name}`, { defaultValue: field.name }),
                value: field.name,
            }));
    }, [modelFields, t]);


    // --- MODIFICATION 2 : La logique d'initialisation est centralisée ici ---
    useEffect(() => {
        // Cet effet s'exécute chaque fois que la modale est ouverte.
        if (isOpen) {
            // S'il y a une configuration initiale (mode édition), on charge ses valeurs.
            if (initialSettings && initialSettings.groupByField) {
                setGroupByField(initialSettings.groupByField);
                setSubItemsField(initialSettings.subItemsField || '');
            } else {
                // Sinon (nouvelle configuration), on initialise avec les valeurs par défaut.
                // Cela corrige aussi le bug du premier chargement.
                setGroupByField(groupableFields[0]?.value || '');
                setSubItemsField('');
            }
        }
    }, [isOpen, initialSettings, groupableFields]); // On ajoute groupableFields aux dépendances


    const handleSave = () => {
        if (!groupByField) {
            alert(t('kanban.config.groupByRequired', 'Le champ de regroupement est obligatoire.'));
            return;
        }
        // Pour être sûr de ne pas envoyer une valeur vide si isClearable a été utilisé
        onSave({ groupByField, subItemsField: subItemsField || '' });
    };

    // --- MODIFICATION 3 : Supprimer le useEffect fautif ---
    // useEffect(() => {
    //     setGroupByField(groupableFields[0]?.value || '');
    // }, []); // <--- CE BLOC EST SUPPRIMÉ

    if (!isOpen) return null;

    return (
        <Dialog isModal={true} isClosable={true} onClose={onClose}>
            <div className="kanban-config-modal p-4">
                <h2><Trans i18nKey="kanban.config.title">Configurer la vue Kanban</Trans></h2>
                <p><Trans i18nKey="kanban.config.description">Choisissez le champ qui servira à créer les colonnes du tableau Kanban.</Trans></p>

                <div className="my-4">
                    <label htmlFor="groupByField" className="block text-sm font-medium text-gray-700"><Trans i18nKey="kanban.config.groupByLabel">Regrouper par</Trans></label>
                    <SelectField
                        id="groupByField"
                        name="groupByField"
                        value={groupByField}
                        onChange={e => setGroupByField(e?.value || '')} // Gérer le cas où on efface la sélection
                        items={groupableFields}
                        placeholder={t('kanban.config.selectField', 'Sélectionner un champ...')}
                    />
                </div>

                <div className="my-4">
                    <label htmlFor="subItemsField" className="block text-sm font-medium text-gray-700"><Trans i18nKey="kanban.config.subItemsLabel">Champ des sous-éléments (optionnel)</Trans></label>
                    <SelectField
                        id="subItemsField"
                        name="subItemsField"
                        isClearable={true}
                        value={subItemsField}
                        onChange={e => setSubItemsField(e?.value || '')} // Gérer le cas où on efface la sélection
                        items={subItemFields}
                        placeholder={t('kanban.config.selectSubItemsField', 'Sélectionner un champ...')}
                    />
                    <p className="text-xs text-gray-500 mt-1"><Trans i18nKey="kanban.config.subItemsHint">Sélectionnez un champ de type relation multiple pour afficher des sous-éléments dans les cartes.</Trans></p>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <Button onClick={onClose} className="btn-secondary"><Trans i18nKey="btns.cancel">Annuler</Trans></Button>
                    <Button onClick={handleSave} className="btn-primary"><Trans i18nKey="btns.save">Enregistrer</Trans></Button>
                </div>
            </div>
        </Dialog>
    );
};

export default KanbanConfigModal;