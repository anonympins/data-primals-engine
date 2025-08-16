import React, { useMemo } from 'react';
import { useQuery } from 'react-query';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { useTranslation } from 'react-i18next';
import { format, parse, startOfWeek, getDay } from 'date-fns';
// Importer les locales dont vous avez besoin

import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuthContext } from "./contexts/AuthContext.jsx";
import './CalendarView.scss';

import { enUS, fr } from 'date-fns/locale';
// Configurer le localizer en fournissant les fonctions de date-fns
const locales = {
    'en-US': enUS,
    'en': enUS,
    'fr': fr,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

/**
 * Traite les données brutes pour les structurer pour le calendrier.
 * @param {Array<Object>} data - La liste des éléments du modèle.
 * @param {Object} settings - Les paramètres de la vue, contenant titleField, startField, endField.
 * @returns {Array<Object>} Un tableau d'objets événement pour react-big-calendar.
 */
const processDataForCalendar = (data, settings) => {
    if (!data || !settings.titleField || !settings.startField || !settings.endField) {
        return [];
    }

    return data.map(item => {
        const title = item[settings.titleField]?.value || item[settings.titleField] || 'Sans titre';
        const start = item[settings.startField] ? new Date(item[settings.startField]) : null;
        const end = item[settings.endField] ? new Date(item[settings.endField]) : null;

        // S'assurer que les dates sont valides
        if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
            return null;
        }

        return {
            title,
            start,
            end,
            resource: item, // Garder l'objet original pour plus de détails au clic
        };
    }).filter(Boolean); // Filtrer les éléments qui n'ont pas pu être convertis
};

const CalendarView = ({ settings, model, onEditData }) => {
    const { me } = useAuthContext();
    const { i18n } = useTranslation();

    // Récupérer toutes les données du modèle nécessaires pour le calendrier
    const { data: calendarData, isLoading, isError } = useQuery(
        ['calendarData', model.name],
        () => fetch(`/api/data/search?_user=${me.username}&depth=1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Note : Pour de très grands ensembles de données, vous pourriez vouloir implémenter une récupération par plage de dates.
            body: JSON.stringify({ model: model.name, page: 1 })
        }).then(res => res.json()),
        {
            enabled: !!model?.name && !!settings.titleField && !!settings.startField && !!settings.endField,
            select: (data) => data.data || [],
        }
    );

    const { events, culture } = useMemo(() => {
        const processedEvents = calendarData ? processDataForCalendar(calendarData, settings) : [];
        const lang = i18n.language.split(/[-_]/)[0];
        const culture = Object.keys(locales).includes(lang) ? lang : 'en';
        return { events: processedEvents, culture };
    }, [calendarData, settings, i18n.language]);

    if (isLoading) return <div>Chargement du calendrier...</div>;
    if (isError) return <div>Erreur lors du chargement des données.</div>;
    if (!settings.titleField || !settings.startField || !settings.endField) {
        return <div>La vue calendrier n'est pas configurée. Veuillez définir les champs pour le titre, la date de début et la date de fin dans les paramètres de la vue.</div>
    }

    return (
        <div className="calendar-view-container">
            <Calendar
                localizer={localizer}
                events={events}
                culture={culture}
                startAccessor="start"
                endAccessor="end"
                // Vous pouvez ajouter un gestionnaire onSelectEvent pour afficher une modale avec les détails de l'événement
                onSelectEvent={event => {
                    onEditData(model, event.resource);
                }}
            />
        </div>
    );
};

export default CalendarView;