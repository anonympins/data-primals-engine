// client/src/KanbanView.jsx

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import KanbanColumn from './KanbanColumn.jsx';
import { useNotificationContext } from "./NotificationProvider.jsx";
import "./KanbanView.scss";
import {useAuthContext} from "./contexts/AuthContext.jsx"; // Assurez-vous d'importer le style

/**
 * Traite les données brutes pour les structurer pour le tableau Kanban.
 * @param {Array<Object>} data - La liste des éléments du modèle.
 * @param {string} groupByField - Le nom du champ utilisé pour grouper en colonnes.
 * @param {Object} model - Le modèle de données complet pour accéder aux options des champs.
 * @returns {Object} Un objet où les clés sont les valeurs du champ de regroupement.
 */
const processDataForKanban = (data, groupByField, model) => {
    if (!data || !groupByField || !model) {
        return {};
    }

    // 1. Grouper les items existants
    const grouped = data.reduce((acc, item) => {
        const columnKey = item[groupByField]?.value || item[groupByField] || 'Non classé';

        if (!acc[columnKey]) {
            acc[columnKey] = {
                title: columnKey,
                items: []
            };
        }
        acc[columnKey].items.push(item);
        return acc;
    }, {});

    // 2. S'assurer que toutes les colonnes possibles existent, même si elles sont vides.
    const fieldSchema = model.fields.find(f => f.name === groupByField);
    if (fieldSchema && fieldSchema.type === 'select' && Array.isArray(fieldSchema.options)) {
        fieldSchema.options.forEach(option => {
            const optionValue = typeof option === 'object' ? option.value : option;
            if (!grouped[optionValue]) {
                grouped[optionValue] = { title: optionValue, items: [] };
            }
        });
    }

    if (!grouped['Non classé']) {
        grouped['Non classé'] = { title: 'Non classé', items: [] };
    }

    return grouped;
};

const KanbanView = ({ settings, model }) => {
    const queryClient = useQueryClient();
    const { addNotification } = useNotificationContext();
    const { me } = useAuthContext();
    const [columns, setColumns] = useState({});

    // Requête pour récupérer toutes les données du modèle nécessaires pour le Kanban
    const { data: kanbanData, isLoading, isError } = useQuery(
        ['kanbanData', model.name], // Clé de requête unique pour ce modèle
        () => fetch(`/api/data/search?_user=${me.username}&depth=2`, { // La fonction qui appelle l'API
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // On demande toutes les données pour le modèle spécifié (limit: 0 pour "tout")
            body: JSON.stringify({ model: model.name, page: 1 })
        }).then(res => res.json()),
        {
            // N'exécuter la requête que si le modèle et le champ de regroupement sont définis
            enabled: !!model?.name && !!settings.groupByField,
            // Extraire le tableau de données de la réponse de l'API
            select: (data) => data.data || [],
        }
    );

    useEffect(() => {
        if (kanbanData) {
            const processedColumns = processDataForKanban(kanbanData, settings.groupByField, model);
            setColumns(processedColumns);
        }
    }, [kanbanData, settings.groupByField, model]);

    // Helper pour trouver la carte et sa colonne d'origine dans notre état local
    const findCardAndSourceColumn = (cardId) => {
        for (const [columnId, column] of Object.entries(columns)) {
            const card = column.items.find(item => item._id.toString() === cardId);
            if (card) {
                return { card, sourceColumnId: columnId };
            }
        }
        return { card: null, sourceColumnId: null };
    };

    if (isLoading) return <div>Chargement du Kanban...</div>;
    if (isError) return <div>Erreur lors du chargement des données.</div>;

    return (
        <div className="kanban-board">
            {Object.entries(columns).map(([columnId, column]) => (
                <KanbanColumn
                    key={columnId}
                    columnId={columnId}
                    column={column}
                    model={model}
                    subItemsField={settings.subItemsField}
                />
            ))}
        </div>
    );
};

export default KanbanView;