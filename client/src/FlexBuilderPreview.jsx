import React, {useState} from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FlexNodeRenderer } from "./FlexNode.jsx";
import {Dialog, DialogProvider} from "./Dialog.jsx";

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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const handleCtaClick = async (node) => {
        if (!node.endpointPath) {
            alert("Cet endpoint n'est pas configuré.");
            return;
        }

        // On prépare le contenu du modal avant même l'appel
        setModalContent({ isLoading: true, path: node.endpointPath });
        setIsModalOpen(true);

        try {
            const response = await fetch(`/api/actions/${node.endpointPath}`, { method: 'GET' });
            const data = await response.json();
            setModalContent({ path: node.endpointPath, status: response.status, data });
        } catch (error) {
            setModalContent({ path: node.endpointPath, error: error.message });
        }
    };

    return (
        <div className="flex-builder-preview-area">
            <h3>{t('preview', 'Aperçu')}</h3>
            <DialogProvider>
            {isModalOpen && (
                <Dialog
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={`Résultat de /api/actions/${modalContent?.path}`}
                >
                    <div className="p-4 bg-gray-900 text-white rounded-md">
                        <pre>
                            <code>
                                {modalContent?.isLoading
                                    ? 'Chargement...'
                                    : JSON.stringify(modalContent, null, 2)
                                }
                            </code>
                        </pre>
                    </div>
                </Dialog>
            )}
            </DialogProvider>
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
                onCtaClick={handleCtaClick}
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