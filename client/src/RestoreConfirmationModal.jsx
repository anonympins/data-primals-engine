// client/src/RestoreConfirmationModal.jsx
import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Dialog } from "./Dialog.jsx";
import Button from "./Button.jsx";
import { TextField } from "./Field.jsx"; // Importer TextField
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { useNotificationContext } from "./NotificationProvider.jsx";
import {FaAws, FaInfo} from "react-icons/fa";
import {NavLink} from "react-router"; // Pour une icône S3

// Ajouter des props pour la configuration S3 et sa gestion
const RestoreConfirmationModal = ({ isOpen, onClose, onConfirm, showS3Config = false }) => {
    const { t } = useTranslation();
    const { me, fetchMe } = useAuthContext(); // fetchMe pour recharger les données utilisateur après sauvegarde
    const { addNotification } = useNotificationContext();

    if (!isOpen) {
        return null;
    }

    return (
        <Dialog isModal={true} isClosable={true} onClose={onClose}>
            <div className="restore-confirmation-modal p-4"> {/* Ajout de padding pour l'esthétique */}
                <h2>{t('backup.restore.title', "Envoi de votre lien de restauration")}</h2>

                <>
                    <p><Trans i18nKey="backup.restore.confirm">Un lien pour restaurer votre sauvegarde vous sera envoyé
                        à votre adresse e-mail. Ce lien expirera dans 30 minutes. Voulez-vous vraiment
                        continuer?</Trans></p>
                    <div className="modal-actions flex justify-end space-x-2 mt-4">
                        <Button onClick={onConfirm} className="btn-primary">
                            <Trans i18nKey="btns.confirm">Confirmer</Trans>
                        </Button>
                        <Button onClick={onClose} className="btn-secondary">
                            <Trans i18nKey="btns.cancel">Annuler</Trans>
                        </Button>
                    </div>
                </>

            </div>
        </Dialog>
    );
};

export default RestoreConfirmationModal;