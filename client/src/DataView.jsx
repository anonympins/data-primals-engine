import React from 'react';
import { Trans } from 'react-i18next';
import Button from './Button.jsx';
import CalendarView from './CalendarView.jsx';
import KanbanView from './KanbanView.jsx';
import { DataTable } from './DataTable.jsx';
import { SheetsView } from './SheetsView.jsx';

const NotConfiguredPlaceholder = ({ type, onConfigure }) => (
    <div className="p-4 border border-dashed rounded-md mt-4 text-center bg-gray-50">
        <h4><Trans i18nKey="dataview.notConfiguredTitle" values={{ type }}>Vue {{type}} non configurée</Trans></h4>
        <p className="text-sm text-gray-600"><Trans i18nKey="dataview.notConfiguredText">Veuillez configurer cette vue pour l'utiliser.</Trans></p>
        <Button onClick={onConfigure} className="mt-2">
            <Trans i18nKey="dataview.configureButton" values={{ type }}>Configurer {{type}}</Trans>
        </Button>
    </div>
);

export const DataView = ({
    currentView,
    selectedModel,
    configuredViews,
    currentModelViewSettings,
    setCalendarModalOpen,
    setKanbanModalOpen,
    onAddData,
    onEdit,
    onDuplicateData,
    checkedItems,
    setCheckedItems,
    filterValues,
    setFilterValues,
    deleteApiCall,
    queryClient,
    insertOrUpdateApiCall,
    patchApiCall
}) => {
    if (!selectedModel) return null;

    switch (currentView) {
        case 'calendar':
            return configuredViews.calendar
                ? <CalendarView settings={currentModelViewSettings.calendar} onEditData={(model, data) => onAddData(model, data)} model={selectedModel} />
                : <NotConfiguredPlaceholder type="calendar" onConfigure={() => setCalendarModalOpen(true)} />;
        case 'kanban':
            return configuredViews.kanban
                ? <KanbanView settings={currentModelViewSettings.kanban} model={selectedModel} />
                : <NotConfiguredPlaceholder type="kanban" onConfigure={() => setKanbanModalOpen(true)} />;
        case 'sheets':
            return <SheetsView
                model={selectedModel}
                checkedItems={checkedItems}
                setCheckedItems={setCheckedItems}
                filterValues={filterValues}
                setFilterValues={setFilterValues}
                deleteApiCall={deleteApiCall}
                insertOrUpdateApiCall={insertOrUpdateApiCall}
                patchApiCall={patchApiCall} // Ajout de la prop manquante
            />;
        case 'table':
        default:
            return <DataTable
                checkedItems={checkedItems}
                setCheckedItems={setCheckedItems}
                filterValues={filterValues}
                setFilterValues={setFilterValues}
                model={selectedModel}
                onAddData={onAddData}
                onDuplicateData={onDuplicateData}
                onEdit={onEdit}
                deleteApiCall={deleteApiCall}
                insertOrUpdateApiCall={insertOrUpdateApiCall}
                queryClient={queryClient}
            />;
    }
};

export default DataView;