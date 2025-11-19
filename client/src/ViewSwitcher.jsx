// client/src/ViewSwitcher.jsx

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FaTable, FaRegCalendarAlt, FaColumns, FaCog } from 'react-icons/fa';
import Button from './Button.jsx';
import { Tooltip } from 'react-tooltip';

import "./ViewSwitcher.scss"
const viewOptions = [
    { id: 'table', icon: <FaTable />, labelKey: 'views.table', defaultLabel: 'Tableau' },
    { id: 'kanban', icon: <FaColumns />, labelKey: 'views.kanban', defaultLabel: 'Kanban' },
    { id: 'calendar', icon: <FaRegCalendarAlt />, labelKey: 'views.calendar', defaultLabel: 'Calendrier' },
];

const ViewSwitcher = ({ currentView, onViewChange, configuredViews, onConfigureView }) => {
    const { t } = useTranslation();

    return (
        <div className="view-switcher flex items-center gap-1 p-1 bg-gray-200 rounded-md">
            {viewOptions.map(view => {
                const isConfigured = view.id === 'table' || configuredViews[view.id];
                const isActive = currentView === view.id;

                return (
                    <div key={view.id} className="relative flex items-center">
                        <Button
                            onClick={() => onViewChange(view.id)}
                            className={`btn-view ${isActive ? 'active' : ''}`}
                            title={t(view.labelKey, view.defaultLabel)}
                        >
                            {view.icon}
                            {/*<span className="hidden md:inline-block ml-2">{t(view.labelKey, view.defaultLabel)}</span>*/}
                        </Button>
                        {/* AJOUT : Bouton de configuration pour la vue active */}
                        {isActive && view.id !== 'table' && (
                            <Button
                                onClick={onConfigureView}
                                className="btn-view-settings"
                                data-tooltip-id="view-settings-tooltip"
                                data-tooltip-content={t('views.configure', 'Configurer la vue {{view}}', { view: t(view.labelKey, view.defaultLabel) })}
                            >
                                <FaCog />
                            </Button>
                        )}
                    </div>
                );
            })}
            <Tooltip id="view-settings-tooltip" />
        </div>
    );
};

export default ViewSwitcher;