// src/components/AddWidgetTypeModal.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FaChartBar, FaTachometerAlt, FaThLarge } from 'react-icons/fa';
import './AddWidgetTypeModal.scss';
import {Dialog} from "./Dialog.jsx"; // Créez ce fichier SCSS

const AddWidgetTypeModal = ({ onClose, onSelectType }) => {
    const { t } = useTranslation();

    return (
        <Dialog className={"add-widget-type-modal-content"} isModal={true} isClosable={true} onClose={onClose} title={t('dashboard.addWidgetTitle', 'Ajouter un élément au tableau de bord')}>
<>
                <div className="flex widget-type-options">
                    <button onClick={() => onSelectType('KPI')} className="widget-type-button">
                        <FaTachometerAlt size={40} />
                        <span>{t('dashboard.addKPI', 'Ajouter un KPI')}</span>
                    </button>
                    <button onClick={() => onSelectType('Chart')} className="widget-type-button">
                        <FaChartBar size={40} />
                        <span>{t('dashboard.addChart', 'Ajouter un Graphique')}</span>
                    </button>
                    <button disabled={false} onClick={() => onSelectType('FlexView')} className="widget-type-button">
                        <FaThLarge size={40} />
                        <span>{t('dashboard.addFlexView', 'Ajouter une Vue Flex')}</span>
                    </button>
                </div>
    <div className={"flex actions center"}>
                <button onClick={onClose} className="btn-close-modal">
                    {t('btns.cancel', 'Annuler')}
                </button>
    </div>
</>
        </Dialog>
    );
};

AddWidgetTypeModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onSelectType: PropTypes.func.isRequired,
};

export default AddWidgetTypeModal;