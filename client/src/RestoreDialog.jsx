// C:/Dev/hackersonline-engine/client/src/RestoreDialog.jsx

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import Button from './Button'; // Assure-toi que le chemin est correct
import { FaCheckCircle, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import './RestoreDialog.scss'; // Crée ce fichier pour le style du spinner

function RestoreDialog() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [username, setUsername] = useState(null); // Pour la redirection en cas de succès

    useEffect(() => {
        const token = searchParams.get('token');
        const user = searchParams.get('username');
        setUsername(user); // Stocke le username pour la redirection

        if (!token || !user) {
            setError(t('backup.restore.error.missingParams', "Paramètres 'token' ou 'username' manquants dans l'URL."));
            setLoading(false);
            return;
        }

        const apiUrl = `/api/backup/restore?token=${encodeURIComponent(token)}&username=${encodeURIComponent(user)}`;
        // Note: On utilise un chemin relatif /api/... car le serveur API est probablement servi
        // sur le même domaine/port ou via un proxy configuré dans Vite (vite.config.js)
        // Si l'API est sur un domaine différent (comme https://data.primals.net), utilise l'URL complète.
        // const apiUrl = `https://data.primals.net/api/backup/restore?token=${encodeURIComponent(token)}&username=${encodeURIComponent(user)}`;


        const restoreBackup = async () => {
            setLoading(true);
            setError(null);
            setSuccess(false);

            try {
                const response = await fetch(apiUrl, {
                    method: 'GET', // Ou 'POST' si l'API l'exige, mais GET semble plus probable ici
                    headers: {
                        'Accept': 'application/json',
                        // Ajoute d'autres headers si nécessaire (ex: Authorization si requis)
                    },
                });

                if (!response.ok) {
                    let errorMsg = t('backup.restore.error.generic', "Une erreur est survenue lors de la restauration.");
                    try {
                        // Essaye de lire un message d'erreur plus spécifique de l'API
                        const errorData = await response.json();
                        if (errorData && errorData.message) {
                            errorMsg = errorData.message;
                        } else {
                            errorMsg = `${errorMsg} (Status: ${response.status})`;
                        }
                    } catch (e) {
                        errorMsg = `${errorMsg} (Status: ${response.status})`;
                        console.error("Could not parse error response:", e);
                    }
                    throw new Error(errorMsg);
                }

                // Si l'API renvoie des données JSON en cas de succès, tu peux les traiter ici
                // const result = await response.json();
                // console.log("Restore successful:", result);

                setSuccess(true);

            } catch (err) {
                console.error("Restore error:", err);
                setError(err.message || t('backup.restore.error.network', "Erreur réseau ou serveur inaccessible."));
            } finally {
                setLoading(false);
            }
        };

        restoreBackup();

    }, [searchParams, t]); // Dépendance à searchParams et t

    const handleGoToData = () => {
        if (username) {
            navigate(`/user/${username}/`);
        } else {
            navigate('/'); // Fallback si username n'est pas défini
        }
    };

    const handleGoHome = () => {
        navigate('/');
    };


    return (
        <div className="restore-dialog-container">
            <h2><Trans i18nKey="backup.restore.dialogTitle">Restauration de la sauvegarde</Trans></h2>

            {loading && (
                <div className="restore-status loading">
                    <FaSpinner className="spinner" />
                    <p><Trans i18nKey="backup.restore.restoring">Restauration en cours...</Trans></p>
                </div>
            )}

            {error && (
                <div className="restore-status error msg msg-error">
                    <FaExclamationTriangle />
                    <p><Trans i18nKey="backup.restore.error.prefix">Erreur :</Trans> {error}</p>
                    <Button onClick={handleGoHome} className="btn-primary">
                        <Trans i18nKey="backup.restore.goHome">Retour à l'accueil</Trans>
                    </Button>
                </div>
            )}

            {success && (
                <div className="restore-status success msg msg-success">
                    <FaCheckCircle />
                    <p><Trans i18nKey="backup.restore.success">La restauration de votre sauvegarde a été effectuée avec succès.</Trans></p>
                    <Button onClick={handleGoToData} className="btn-primary">
                        <Trans i18nKey="backup.restore.goToData">Accéder à mes données</Trans>
                    </Button>
                </div>
            )}
        </div>
    );
}

export default RestoreDialog;