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

    // États pour les champs de configuration S3
    const [s3Config, setS3Config] = useState({
        bucketName: '',
        accessKeyId: '',
        secretAccessKey: '', // Ne sera pas affiché directement mais envoyé
        region: ''
    });
    const [isSavingS3Config, setIsSavingS3Config] = useState(false);
    const [showConfig, setConfigVisible] = useState(false);

    // Charger la configuration S3 existante de l'utilisateur au montage si me.s3Config existe
    useEffect(() => {
        if (me?.s3Config && showS3Config) {
            setS3Config({
                bucketName: me.s3Config.bucketName || '',
                accessKeyId: me.s3Config.accessKeyId || '',
                secretAccessKey: '', // Ne pas pré-remplir la clé secrète pour la sécurité
                region: me.s3Config.region || '',
                pathPrefix: me.s3Config.pathPrefix || ''
            });
        } else if (showS3Config) {
            // Réinitialiser si pas de config ou si on quitte la section S3
            setS3Config({ bucketName: '', accessKeyId: '', secretAccessKey: '', region: '', pathPrefix: '' });
        }
    }, [me, showS3Config, isOpen]); // Ajouter isOpen pour recharger si la modale est rouverte


    const handleS3ConfigChange = (e) => {
        const { name, value } = e.target;
        setS3Config(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveS3Config = async () => {
        setIsSavingS3Config(true);
        // Validation basique côté client
        if (!s3Config.bucketName || !s3Config.accessKeyId || !s3Config.region) {
            addNotification({ type: 'error', message: t('backup.s3config.validationError', 'Le nom du bucket, l\'Access Key ID et la Région sont requis.') });
            setIsSavingS3Config(false);
            return;
        }

        try {
            const payload = { ...s3Config };
            // N'envoyer la clé secrète que si elle a été modifiée
            if (!payload.secretAccessKey) {
                delete payload.secretAccessKey;
            }

            const response = await fetch('/api/user/s3-config', { // Endpoint pour sauvegarder la config S3
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Les en-têtes d'authentification (_user, Authorization) sont gérés globalement par le fetch wrapper si tu en as un, sinon ajoute-les ici
                    // Exemple:
                    // '_user': me?.username,
                    // 'Authorization': `Bearer ${me?.token}`,
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (response.ok && result.success) {
                addNotification({ status: 'completed', title: t('backup.s3config.saveSuccess', 'Configuration S3 enregistrée avec succès.') });
            } else {
                addNotification({ status: 'error', title: result.error || t('backup.s3config.saveError', 'Erreur lors de l\'enregistrement de la configuration S3.') });
            }
        } catch (error) {
            addNotification({ status: 'error', title: t('backup.s3config.saveError', 'Erreur lors de l\'enregistrement de la configuration S3.') });
            console.error("Error saving S3 config:", error);
        } finally {
            setIsSavingS3Config(false);
        }
    };


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
                    <div className={"flex flex-centered actions"}>
                        {!showConfig && (<NavLink onClick={() => setConfigVisible(true)}><Trans i18nKey={"backup.s3config.title"}></Trans></NavLink>)}
                    </div>
                </>

                {showConfig && (<>
                    <h2>{t('backup.s3config.title', 'Configuration du stockage S3')}</h2>
                    <p><Trans i18nKey="backup.prez"></Trans></p>
                    <form className="s3-config-form space-y-4"> {/* Ajout de space-y pour l'espacement vertical */}
                        <TextField
                            name="bucketName"
                            className={"flex flex-1"}
                            label={t('backup.s3config.bucketName', 'Nom du Bucket S3')}
                            value={s3Config.bucketName}
                            onChange={handleS3ConfigChange}
                            placeholder="my-bucket-name"
                            required
                        />
                        <TextField
                            name="accessKeyId"
                            className={"flex flex-1"}
                            label={t('backup.s3config.accessKeyId', 'Access Key ID AWS')}
                            value={s3Config.accessKeyId}
                            onChange={handleS3ConfigChange}
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            required
                        />
                        <TextField
                            name="secretAccessKey"
                            className={"flex flex-1"}
                            label={t('backup.s3config.secretAccessKey', 'Secret Access Key AWS')}
                            type="password" // Important pour masquer la clé
                            value={s3Config.secretAccessKey}
                            onChange={handleS3ConfigChange}
                            placeholder={t('backup.s3config.secretPlaceholder', 'Laisser vide pour ne pas modifier')} />
                        <TextField
                            name="region"
                            className={"flex flex-1"}
                            label={t('backup.s3config.region', 'Région AWS')}
                            value={s3Config.region}
                            onChange={handleS3ConfigChange}
                            placeholder="eu-west-3"
                            required
                        />
                        <TextField
                            name="pathPrefix"
                            label={t('backup.s3config.pathPrefix', 'Préfixe de chemin (Optionnel)')}
                            value={s3Config.pathPrefix}
                            onChange={handleS3ConfigChange}
                            placeholder="saves/my-app/"
                            help={t('backup.s3config.pathPrefixHelp', 'Ex: "mon-dossier/". Laissez vide pour la racine du bucket.')}
                        />
                        <div
                            className="modal-actions flex justify-end space-x-2 mt-4"> {/* Flex pour aligner les boutons */}
                            <Button onClick={handleSaveS3Config} disabled={isSavingS3Config}
                                    className="btn-primary"> {/* Classe btn-primary pour le bouton principal */}
                                {isSavingS3Config ? t('btns.saving', 'Enregistrement...') : t('btns.save', 'Enregistrer la configuration S3')}
                            </Button>
                            <Button onClick={onClose} className="btn-secondary">
                                <Trans i18nKey="btns.cancel">Annuler</Trans>
                            </Button>
                        </div>
                    </form>
                </>)}

            </div>
        </Dialog>
    );
};

export default RestoreConfirmationModal;