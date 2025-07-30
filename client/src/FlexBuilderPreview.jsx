import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FlexNodeRenderer } from "./FlexNode.jsx";

const FlexBuilderPreview = ({
                                flexStructure,
                                onSelectNode,
                                selectedNodeId,
                                filteredData,
                                dataIndexRef,
                                modelFields,
                                dnd,
                                onMoveNode
                            }) => {
    const { t } = useTranslation();

    return (
        <div className="flex-builder-preview-area">
            <h3>{t('preview', 'Aperçu')}</h3>
            <FlexNodeRenderer
                node={flexStructure}
                path={[]}
                t={t}
                onSelectNode={onSelectNode}
                selectedNodeId={selectedNodeId}
                data={filteredData}
                dataIndexRef={dataIndexRef}
                modelFields={modelFields}
                dnd={dnd}
                onMoveNode={onMoveNode}
            />
        </div>
    );
};

FlexBuilderPreview.propTypes = {
    flexStructure: PropTypes.object.isRequired,
    onSelectNode: PropTypes.func.isRequired,
    selectedNodeId: PropTypes.string,
    filteredData: PropTypes.array.isRequired,
    dataIndexRef: PropTypes.shape({ current: PropTypes.number }).isRequired,
    modelFields: PropTypes.array.isRequired,
    dnd: PropTypes.object.isRequired,
    onMoveNode: PropTypes.func.isRequired,
};

export default FlexBuilderPreview;