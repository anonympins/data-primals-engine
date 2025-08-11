import {useAuthContext} from "./contexts/AuthContext.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useNotificationContext} from "./NotificationProvider.jsx";
import {useEffect, useRef, useState} from "react";
import {Trans, useTranslation} from "react-i18next";
import {useMutation, useQueryClient} from "react-query";
import useLocalStorage from "./hooks/useLocalStorage.js";
import {getUserId} from "../../src/data.js";
import {kilobytes, maxBytesPerSecondThrottleData, maxFileSize} from "../../src/constants";
import {FileField, ModelField} from "./Field.jsx";
import Button from "./Button.jsx";
import {FaInfo, FaTrash} from "react-icons/fa";
import {Dialog} from "./Dialog.jsx";
import readXlsxFile from 'read-excel-file'
// Ajoutez cette constante pour la clé de sessionStorage
const SESSION_STORAGE_IMPORT_JOBS_KEY = 'activeImportJobs';

export function DataImporter({onClose}) {
    const [previewData, setPreviewData] = useState(null);
    const [file, setFile] = useState(null);
    const {selectedModel, page} = useModelContext();

    const isCsvFile = file && (file.name.endsWith('.csv') || file.type === 'text/csv');
    const isExcelFile = file && ((file.name.endsWith('.xlsx') ||
        ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'].includes(file.type)));

    const {me} = useAuthContext();
    const {t, i18n} = useTranslation();

    const queryClient = useQueryClient();
    const {addNotification} = useNotificationContext();

    const [hasHeaders, setHasHeaders] = useState(true);
    const [csvHeaders, setCSVHeaders] = useState(selectedModel.fields.map(field => field.name));

    // --- MODIFIÉ : État pour gérer plusieurs tâches d'importation ---
    // Cet objet stockera les données de progression de chaque tâche, indexées par leur jobId
    const [importJobs, setImportJobs] = useState({});
    // Cette liste stockera les IDs des tâches qui sont actuellement suivies via SSE
    const [activeJobIds, setActiveJobIds] = useState([]);

    // Référence pour stocker les instances EventSource, indexées par jobId
    const eventSourceRefs = useRef({});

    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const [storedJobIds, setStoredJobIds] = useLocalStorage(SESSION_STORAGE_IMPORT_JOBS_KEY, []);
    // --- NOUVEAU : Charger/Sauvegarder les IDs des tâches actives depuis sessionStorage ---
    useEffect(() => {
        // Charger les IDs des tâches actives depuis sessionStorage au montage
        setActiveJobIds(storedJobIds);

        // Pour chaque jobId stockpour obtenir le dernier statut
        storedJobIds.forEach(jobId => {
            startProgressTracking(jobId);
        });

        // Fonction de nettoyage : fermer toutes les connexions EventSource lors du démontage du composant
        return () => {
            Object.values(eventSourceRefs.current).forEach(es => es.close());
            eventSourceRefs.current = {}; // Effacer les références
        };
    }, []); // S'exécute une seule fois au montage

    // --- NOUVEAU : Effet pour mettre à jour sessionStorage lorsque activeJobIds change ---
    useEffect(() => {
        setStoredJobIds(activeJobIds);
    }, [activeJobIds]);


    // Mutation pour initier l'importation (envoi du fichier au serveur)
    const {isLoading, mutate: importMutation} = useMutation(async () => {
        console.log('Initiating data import...');
        const params = new FormData();
        params.append('model', selectedModel?.name);
        params.append("_user", getUserId(me));
        params.append("hasHeaders", !!hasHeaders);
        params.append("csvHeaders", csvHeaders.join(','));
        if (file) {
            params.append("file", file);
        } else {
            addNotification({ title: t('dataimporter.noFileSelected', 'Veuillez sélectionner un fichier à importer.'), status: 'warning' });
            return Promise.reject(new Error("No file selected"));
        }

        try {
            const response = await fetch(`/api/data/import?lang=${lang}`, {
                method: 'POST',
                body: params
            });

            if (response.status === 202) {
                const { job } = await response.json();
                const { jobId} = job;

                // --- MODIFIÉ : Ajouter le nouvel jobId à activeJobIds et à l'état importJobs ---
                setActiveJobIds(prevIds => [...prevIds, jobId]);
                setImportJobs(prevJobs => ({
                    ...prevJobs,
                    [jobId]: {
                        jobId,
                        status: 'pending',
                        totalRecords: 0,
                        processedRecords: 0,
                        errors: [],
                        // Ajoutez d'autres champs initiaux que vous souhaitez afficher immédiatement
                    }
                }));
                startProgressTracking(jobId); // Commencer le suivi de cette nouvelle tâche
                addNotification({
                    title: t('dataimporter.initiated', 'Importation initiée. Suivi de la progression...'),
                    icon: <FaInfo/>,
                    status: 'info'
                });
            } else {
                const errorData = await response.json();
                addNotification({
                    title: errorData.error || t('dataimporter.error', 'Erreur lors de l\'importation.'),
                    status: 'error'
                });
            }
        } catch (e) {
            addNotification({
                title: e.message || t('dataimporter.networkError', 'Erreur réseau lors de l\'importation.'),
                status: 'error'
            });
        }
    });

    // Fonction pour démarrer le suivi de la progression via Server-Sent Events (SSE) pour un jobId spécifique

    // Fonction pour démarrer le suivi de la progression via Server-Sent Events (SSE) pour un jobId spécifique
    const startProgressTracking = (jobId) => {
        // Fermer toute connexion EventSource existante pour ce jobId pour éviter les doublons
        if (eventSourceRefs.current[jobId]) {
            eventSourceRefs.current[jobId].close();
        }

        const eventSource = new EventSource(`/api/import/progress/${jobId}`);
        eventSourceRefs.current[jobId] = eventSource; // Stocker l'instance pour le nettoyage

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // --- MODIFIÉ : Mettre à jour la progression de la tâche spécifique ---
            setImportJobs(prevJobs => ({
                ...prevJobs,
                [jobId]: data
            }));

            // Si la tâche est terminée (succès ou échec), fermer la connexion SSE.
            // NE PAS la retirer de activeJobIds ici, pour qu'elle persiste au rafraîchissement.
            // Elle sera retirar le bouton "Effacer".
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'not_found') {
                eventSource.close();
                delete eventSourceRefs.current[jobId]; // Supprimer la référence de l'EventSource

                // --- LIGNE MODIFIÉE/SUPPRIMÉE ---
                // Supprimez ou commentez la ligne suivante :
                // setActiveJobIds(prevIds => prevIds.filter(id => id !== jobId));

                queryClient.invalidateQueries(['api/data', selectedModel.name, 'page', page]); // Rafraîchir les données du tableau

                if (data.status === 'completed') {
                    addNotification({
                        title: t('dataimporter.success', 'Importation des données réussie.'),
                        icon: <FaInfo/>,
                        status: 'completed'
                    });
                } else if (data.status === 'failed') {
                    addNotification({
                        title: t('dataimporter.failed', 'Importation échouée. Voir les détails pour les erreurs.'),
                        status: 'error'
                    });
                } else if (data.status === 'not_found') {
                    addNotification({
                        title: t('dataimporter.jobNotFound', 'Tâche d\'importation non trouvée ou déjà terminée.'),
                        status: 'warning'
                    });
                }
            }
        };

        eventSource.onerror = (error) => {
            console.error(`EventSource error for job ${jobId}:`, error);
            eventSource.close();
            delete eventSourceRefs.current[jobId];
            setStoredJobIds(prevIds => prevIds.filter(id => id !== jobId));
        };
    };

    const handleImportClick = () => {
        importMutation();
    };

    const handleCloseModal = () => {
        // Fermer toutes les connexions EventSource avant de fermer la modale
        Object.values(eventSourceRefs.current).forEach(es => es.close());
        eventSourceRefs.current = {}; // Effacer les références
        onClose();
    };
    const handleFilePreview = async (file) => {
        console.log('handleFilePreview');
        if (!file) {
            setPreviewData(null);
            return;
        }

        const isExcelFile = file && ((file.name.endsWith('.xlsx') ||
            ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'].includes(file.type)));

        if (isExcelFile) {
            console.log('excel');
            try {
                const arrayBuffer = await file.arrayBuffer();
                const rows = await readXlsxFile(arrayBuffer);
                setPreviewData(rows);
                console.log(rows);
            } catch (error) {
                console.error('Error reading Excel file:', error);
                addNotification({
                    title: t('dataimporter.excelReadError', 'Erreur lors de la lecture du fichier Excel'),
                    status: 'error'
                });
            }
        } else {
            setPreviewData(null);
        }
    };

    // Déterminer si une importation est actuellement en cours (pour désactiver les boutons)
    const isAnyImportInProgress = Object.values(importJobs).some(job => job.status === 'pending' || job.status === 'processing');

    // Filtrer et trier les tâches à afficher (par exemple, les tâches en cours en premier)
    const jobsToDisplay = Object.values(importJobs).sort((a, b) => {
        // Trier par statut (en attente/en cours en premier, puis échoué, puis terminé)
        const statusOrder = { 'pending': 1, 'processing': 2, 'failed': 3, 'completed': 4, 'not_found': 5 };
        return statusOrder[a.status] - statusOrder[b.status];
    });

    const { models } = useModelContext();

    return (
        <Dialog isClosable={true} isModal={true} onClose={handleCloseModal}>
            <>
                <h2>
                    <Trans i18nKey="dataimporter.title" values={{model: t('model_' + selectedModel?.name, selectedModel?.name)}}>
                        Importer des données dans {t('model_' + selectedModel?.name, selectedModel?.name)}
                    </Trans>
                </h2>
                <p className="msg msg-info">
                    <Trans i18nKey="dataimporter.info" values={{constante: (maxBytesPerSecondThrottleData / kilobytes) + 'ko/s'}}></Trans>
                </p>

                {/* Toujours afficher le formulaire de sélection de fichier et le bouton d'importation */}
                <FileField
                    name="file"
                    maxSize={maxFileSize}
                    mimeTypes={[
                        'application/json',
                        'text/csv',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'application/vnd.ms-excel'
                    ]}
                    type="file"
                    multiple={false}
                    onChange={async (files) => {
                        const newFile = files && files.length > 0 ? files[files.length - 1].file : null;
                        setFile(newFile);
                        await handleFilePreview(newFile);
                    }}
                />

                {file && (isExcelFile || isCsvFile) && (
                    <div className="checkbox-label flex flex-row">
                        {isCsvFile && (<label htmlFor="hasHeadersCheckbox">
                            <input
                                type="checkbox"
                                id="hasHeadersCheckbox"
                                checked={hasHeaders}
                                onChange={(e) => setHasHeaders(e.target.checked)}
                            />
                            <Trans i18nKey="dataimporter.hasCsvHeaders"></Trans>
                        </label>)}
                        {(!hasHeaders || isExcelFile) && (
                            <table>
                                <thead>
                                <tr>
                                    <th><Trans i18nKey={"dataimporter.columnType"} values={[isExcelFile?'Excel':'CSV']}>Numéro de colonne</Trans></th>
                                    <th><Trans i18nKey="dataimporter.field">Champ du modèle</Trans></th>
                                </tr>
                                </thead>
                                <tbody>
                                {selectedModel?.fields.map((field, index) => {
                                    const currentFieldValue = csvHeaders[index] || '';
                                    const fieldObject = selectedModel.fields.find(f => f.name === currentFieldValue);

                                    return (
                                        <tr key={`${selectedModel.name}-csvmap-${index}`}>
                                            <td><Trans i18nKey="dataimporter.column" values={[index + 1]}>colonne {index + 1}</Trans></td>
                                            <td>
                                                <div className="flex">
                                                    <ModelField
                                                        disableable={true}
                                                        showModel={false}
                                                        value={selectedModel.name}
                                                        fieldValue={currentFieldValue}
                                                        onChange={({name: propName, value: selectedValue}) => {
                                                            const newCsvHeaders = [...csvHeaders];
                                                            newCsvHeaders[index] = selectedValue?.field ?? '';
                                                            setCSVHeaders(newCsvHeaders);
                                                        }}
                                                        fields={true}
                                                        model={selectedModel}
                                                        field={fieldObject}
                                                    />
                                                    <Button className="flex" onClick={() => {
                                                        const newHeaders = [...csvHeaders];
                                                        newHeaders.splice(index, 1);
                                                        setCSVHeaders(newHeaders);
                                                    }}><FaTrash/></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr>
                                    <td colSpan={2}>
                                        <Button onClick={() => {
                                            const csvH = [...csvHeaders];
                                            csvH.push('');
                                            setCSVHeaders(csvH)
                                        }}><Trans i18nKey="dataimporter.addColumn">Ajouter une colonne</Trans></Button>
                                    </td>
                                </tr>
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {previewData && (
                    <div className="excel-preview mt-4">
                        <h3><Trans i18nKey="dataimporter.excelPreview">Aperçu des données Excel</Trans></h3>
                        <div className="msg msg-tiny">
                            <Trans i18nKey="dataimporter.previewNote">
                                Note: Ceci est un aperçu des premières lignes. Les cellules vides sont affichées comme "(vide)".
                            </Trans>
                        </div>
                        <div className="preview-table-container" style={{ maxHeight: '300px', overflow: 'auto' }}>
                            <table className="preview-table">
                                <thead>
                                <tr>
                                    {previewData[0].map((_, colIndex) => {
                                        // Récupérer le nom du champ mappé pour cette colonne depuis l'état `csvHeaders`
                                        const mappedFieldName = csvHeaders[colIndex];

                                        // Si un champ est mappé, on affiche son nom traduit.
                                        // Sinon, on affiche un nom générique comme "Colonne X".
                                        const headerLabel = mappedFieldName
                                            ? t(`field_${mappedFieldName}`, mappedFieldName)
                                            : t('dataimporter.column', 'Colonne {{count}}', { count: colIndex + 1 });

                                        return (
                                            <th key={`header-${colIndex}`}>
                                                {headerLabel}
                                            </th>
                                        );
                                    })}
                                </tr>
                                </thead>
                                <tbody>
                                {previewData.map((row, rowIndex) => (
                                    <tr key={`row-${rowIndex}`}>
                                        {row.map((cell, cellIndex) => (
                                            <td
                                                key={`cell-${rowIndex}-${cellIndex}`}
                                                style={{
                                                    border: '1px solid #ddd',
                                                    padding: '4px',
                                                    backgroundColor: rowIndex === 0 && hasHeaders ? '#f0f0f0' : 'transparent'
                                                }}
                                            >
                                                {cell !== null ? String(cell) : <span style={{ color: '#999' }}><Trans i18nKey="dataimporter.nullValue">(vide)</Trans></span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                <div>
                    <Button onClick={handleImportClick} disabled={isLoading || !file}>
                        <Trans i18nKey="btns.import">Importer</Trans>
                    </Button>
                </div>

                {/* Afficher la progression pour toutes les tâches d'importation actives/suivies */}
                {jobsToDisplay.length > 0 && (
                    <div className="import-jobs-list">
                        <h3><Trans i18nKey="dataimporter.activeImports">Importations en cours / terminées</Trans></h3>
                        {jobsToDisplay.map(job => {
                            const progressPercentage = job.totalRecords > 0
                                ? (job.processedRecords / job.totalRecords) * 100
                                : 0;
                            const isJobFinished = job.status === 'completed' || job.status === 'failed' || job.status === 'not_found';

                            return (
                                <div key={job.jobId} className="import-progress-container">
                                    <h4><Trans i18nKey="dataimporter.jobId">Tâche ID:</Trans> {job.jobId?.substring(0, 8)}...</h4>
                                    <p>
                                        <Trans i18nKey="dataimporter.status">Statut:</Trans>{' '}
                                        <strong>{t(`dataimporter.status.${job.status}`, job.status)}</strong>
                                    </p>
                                    {job.totalRecords > 0 && (
                                        <p>
                                            <Trans i18nKey="dataimporter.recordsProcessed">Enregistrements traités:</Trans>{' '}
                                            {job.processedRecords} / {job.totalRecords}
                                        </p>
                                    )}
                                    <div className="progress-bar-wrapper">
                                        <div
                                            className="progress-bar"
                                            style={{ width: `${progressPercentage}%` }}
                                        >
                                            {progressPercentage.toFixed(0)}%
                                        </div>
                                    </div>

                                    {job.errors && job.errors.length > 0 && (
                                        <div className="import-errors">
                                            <h4><Trans i18nKey="dataimporter.errors">Erreurs:</Trans></h4>
                                            <ul>
                                                {job.errors.map((error, index) => (
                                                    <li key={index}>{error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {isJobFinished && (
                                        <div className="flex justify-end mt-2">
                                            <Button onClick={() => {
                                                setImportJobs(prevJobs => {
                                                    const newJobs = { ...prevJobs };
                                                    delete newJobs[job.jobId];
                                                    return newJobs;
                                                });
                                                setActiveJobIds(prevIds => prevIds.filter(id => id !== job.jobId));
                                            }}><Trans i18nKey="btns.clear">Effacer</Trans></Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex justify-end mt-4">
                    <Button onClick={handleCloseModal} disabled={isAnyImportInProgress}>
                        <Trans i18nKey="btns.close">Fermer</Trans>
                    </Button>
                </div>
            </>
        </Dialog>
    );
}