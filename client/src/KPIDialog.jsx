import React, { useState } from 'react';
import { Dialog } from './Dialog.jsx'; // Assure-toi que Dialog est importé
import { useTranslation } from 'react-i18next';

function KPIDialog({ availableKpis = [], onAddKpi, onClose }) {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredKpis = (availableKpis || []).filter(kpi =>
        kpi.name.value.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Dialog isModal={true} isClosable={true} onClose={onClose} className="add-kpi-dialog">
            <h2>{t('dashboards.add_kpi_title', 'Ajouter un indicateur (kpi)')}</h2>
            <input
                type="text"
                placeholder={t('dashboards.search_kpi', 'Rechercher un KPI...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', marginBottom: '15px' }}
            />
            <ul className="kpi-selection-list">
                {filteredKpis.length > 0 ? (
                    filteredKpis.map(kpi => (
                        <li key={kpi._id} onClick={() => onAddKpi(kpi)}>
                            {kpi.name.value || (typeof(kpi.name) === 'string' ? kpi.name : '')}
                            {/* Tu peux ajouter l'icône ou l'unité ici pour aider oisir */}
                        </li>
                    ))
                ) : (
                    <li>{t('dashboards.no_kpi_found', 'Aucun KPI disponible ou correspondant.')}</li>
                )}
            </ul>
        </Dialog>
    );
}

export default KPIDialog;