// client/src/RichTextEditorModal.jsx
import React, { useState } from 'react';
import {RTE} from "./RTE.jsx";
import {Dialog} from "./Dialog.jsx";   // Styles pour la modale plein écran

import './RichTextEditorModal.scss';
const RichTextEditorModal = ({ initialContent, title, onSave, onClose }) => {
    const [content, setContent] = useState(initialContent || '');

    const handleSave = () => {
        onSave?.(content.value);
        onClose?.();
    };

    return (
        <Dialog isModal={true} onClose={onClose}
                title={title || 'Éditeur de Texte Riche'} isClosable={true}>
            <div className="flex actions">
                <button onClick={handleSave} className="btn btn-primary">Sauvegarder & Fermer</button>
                <button onClick={onClose} className="btn">Fermer</button>
            </div>
            <div className="editor-container">
                <RTE
                    onChange={(e) => setContent(e)}
                    value={content}
                    name={"rte"}
                    field={{name: 'rte'}}
                />
            </div>
        </Dialog>
    );
};

export default RichTextEditorModal;