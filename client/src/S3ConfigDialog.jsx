import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Dialog } from './Dialog.jsx';
import Button from './Button.jsx';
import { TextField } from './Field.jsx';
import { FaSpinner } from 'react-icons/fa';

const S3ConfigDialog = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // State pour les champs du formulaire
    const [config, setConfig] = useState({
        S3_BUCKET_NAME: '',
        S3_ACCESS_KEY_ID: '',
        S3_SECRET_ACCESS_KEY: '',
        S3_REGION: '',
        S3_PATH_PREFIX: ''
    });

    // Requête pour charger la configuration S3 existante (sans la clé secrète)
    const { data: initialConfig, isLoading: isLoadingConfig } = useQuery(
        's3Config',
        () => fetch('/api/data/search', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'env',
                filter: { "name": { "$in": ["S3_BUCKET_NAME", "S3_ACCESS_KEY_ID", "S3_REGION", "S3_PATH_PREFIX", "S3_ARCHIVE_BUCKET_NAME"] } }
            })
        }).then(res => res.json()),
        {
            enabled: isOpen,
            onSuccess: (data) => {
                if (data?.data) {
                    const loadedConfig = data.data.reduce((acc, item) => {
                        acc[item.name] = item.value;
                        return acc;
                    }, {});
                    setConfig(prev => ({ ...prev, ...loadedConfig, S3_SECRET_ACCESS_KEY: '' })); // Ne pas pré-remplir la clé secrète
                }
            }
        }
    );

    // Mutation pour sauvegarder la configuration
    const { mutate: saveConfig, isLoading: isSaving } = useMutation(
        (newConfig) => fetch('/api/backup/configure-s3', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        }).then(res => res.json()),
        {
            onSuccess: (data) => {
                if (data.success) {
                    alert(t('backup.s3config.saveSuccess', 'Configuration S3 enregistrée avec succès.'));
                    queryClient.invalidateQueries('s3ConfigCheck'); // Invalider la vérification
                    onClose();
                } else {
                    alert(t('backup.s3config.saveError', 'Erreur lors de l\'enregistrement de la configuration S3.') + `\n${data.error}`);
                }
            },
            onError: (error) => {
                alert(t('backup.s3config.saveError', 'Erreur lors de l\'enregistrement de la configuration S3.') + `\n${error.message}`);
            }
        }
    );

    const handleFieldChange = (e) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        const { S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_REGION } = config;
        if (!S3_BUCKET_NAME || !S3_ACCESS_KEY_ID || !S3_REGION) {
            alert(t('backup.s3config.validationError', 'Le nom du bucket, l\'Access Key ID et la Région sont requis.'));
            return;
        }
        saveConfig(config);
    };

    if (!isOpen) return null;

    return (
        <Dialog title={t('backup.s3config.title', 'Configuration du stockage S3')} isClosable={true} onClose={onClose}>
            {isLoadingConfig ? (
                <div className="flex justify-center items-center p-4"><FaSpinner className="spin" /></div>
            ) : (
                <div className="form flex flex-col gap-4 p-2">
                    <p className="msg msg-info">{t('backup.s3.prez', 'Configurez ici votre bucket Amazon S3 pour les sauvegardes et l\'archivage des données.')}</p>
                    <TextField name="S3_BUCKET_NAME" label={t('backup.s3config.bucketName')} value={config.S3_BUCKET_NAME} onChange={handleFieldChange} required />
                    <TextField name="S3_ACCESS_KEY_ID" label={t('backup.s3config.accessKeyId')} value={config.S3_ACCESS_KEY_ID} onChange={handleFieldChange} required />
                    <TextField name="S3_SECRET_ACCESS_KEY" type="password" label={t('backup.s3config.secretAccessKey')} value={config.S3_SECRET_ACCESS_KEY} onChange={handleFieldChange} placeholder={t('backup.s3config.secretPlaceholder')} help={t('backup.s3config.secretHelp')} />
                    <TextField name="S3_REGION" label={t('backup.s3config.region')} value={config.S3_REGION} onChange={handleFieldChange} required />
                    <TextField name="S3_PATH_PREFIX" label={t('backup.s3config.pathPrefix')} value={config.S3_PATH_PREFIX} onChange={handleFieldChange} help={t('backup.s3config.pathPrefixHelp')} />

                    <div className="flex actions right">
                        <Button onClick={onClose} className="btn-secondary">{t('btns.cancel', 'Annuler')}</Button>
                        <Button onClick={handleSave} className="btn-primary" disabled={isSaving}>
                            {isSaving ? <FaSpinner className="spin" /> : t('btns.save', 'Enregistrer')}
                        </Button>
                    </div>
                </div>
            )}
        </Dialog>
    );
};

export default S3ConfigDialog;