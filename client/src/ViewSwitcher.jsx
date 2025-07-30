// client/src/ViewSwitcher.jsx

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FaTable, FaRegCalendarAlt, FaColumns, FaCog } from 'react-icons/fa';
import Button from './Button.jsx';
import { Tooltip } from 'react-tooltip';

import "./ViewSwitcher.scss"
const viewOptions = [
    { id: 'table', icon: <FaTable />, labelKey: 'views.table' },
    { id: 'kanban', icon: <FaColumns />, labelKey: 'views.kanban' },
    //{ id: 'calendar', icon: <FaRegCalendarAlt />, labelKey: 'views.calendar' },
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
                            title={t(view.labelKey, view.id)}
                        >
                            {view.icon}
                            <span className="hidden md:inline-block ml-2">{t(view.labelKey, view.id)}</span>
                        </Button>
                        {/* AJOUT : Bouton de configuration pour la vue active */}
                        {isActive && view.id !== 'table' && (
                            <Button
                                onClick={onConfigureView}
                                className="btn-view-settings"
                                data-tooltip-id="view-settings-tooltip"
                                data-tooltip-content={t('views.configure', { view: t(view.labelKey) })}
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