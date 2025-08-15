import { useEffect, useState } from "react";
import { Dialog } from "./Dialog.jsx";
import { FaHistory } from "react-icons/fa";
import {Trans, useTranslation} from "react-i18next";
import "./HistoryDialog.scss";

// Sub-component for displaying a single history entry
const HistoryEntry = ({ entry }) => {
    const { t } = useTranslation();
    // The backend has transformed the data for us.
    // _id: history doc id, _v: version, _op: operation type (i,u,d), _rid: original record id
    const { _id, _v, _op, _updatedAt, _user, _rid, ...data } = entry; // ...data collects the remaining fields

    const operationDetails = {
        // The keys 'i', 'u', 'd' correspond to what the backend sends now.
        'i': { label: t('history.op.create', 'Creation'), className: 'op-insert' },
        'u': { label: t('history.op.update', 'Update'), className: 'op-update' },
        'd': { label: t('history.op.delete', 'Deletion'), className: 'op-delete' },
    };
    const opInfo = operationDetails[_op] || { label: _op, className: '' };

    return (
        <div className="history-entry">
            <div className="history-entry-header">
                <span className={`op-badge ${opInfo.className}`}>{opInfo.label}</span>
                <span className="history-date">{t('history.datePrefix', 'On')} {new Date(_updatedAt).toLocaleString()}</span>
                {_user && <span className="history-user">{t('history.byUser', 'by')} <strong>{_user}</strong></span>}
                <span className="history-version">{t('history.version', 'Version:')} {_v}</span>
            </div>
            <div className="history-entry-data">
                <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
        </div>
    );
};

export const HistoryDialog = ({ modelName, recordId, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { t, i18n } = useTranslation();

    useEffect(() => {
        if (!modelName || !recordId) return;

        const fetchHistory = async () => {
            setLoading(true);
            setError(null);
            try {
                // Assuming the API endpoint for history is structured like this
                const query = await fetch(`/api/data/history/${modelName}/${recordId}`, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
                const response = await query.json();
                if (response.success) {
                    // L'API devrait retourner l'historique trié du plus récent au plus ancien
                    setHistory(response.data);
                } else {
                    setError(response.error || i18n.t("history.error", "Could not load history."));
                }
            } catch (err) {
                setError(i18n.t("history.error", "Could not load history."));
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [modelName, recordId]);

    return (
        <Dialog
            title={<><FaHistory style={{ marginRight: '8px' }} /> <Trans i18nKey={"history.title"}>Historique de l'enregistrement</Trans></>}
            onClose={onClose}
            isClosable={true}
            className="history-dialog"
        >
            <div className="history-dialog-content">
                {loading && <div><Trans i18nKey={"history.loading"}>Chargement de l'historique..</Trans></div>}
                {error && <div className="error-message">{error}</div>}
                {!loading && !error && (
                    <div className="history-list">
                        {history.length > 0 ? (
                            history.map(entry => <HistoryEntry key={entry._id} entry={entry} />)
                        ) : (
                            <div><Trans i18nKey={"history.noHistory"}>Aucun historique trouvé pour cet enregistrement.</Trans></div>
                        )}
                    </div>
                )}
            </div>
        </Dialog>
    );
};