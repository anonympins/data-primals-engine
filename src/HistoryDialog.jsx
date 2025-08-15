import { useEffect, useState } from "react";
import { Dialog } from "../Dialog.jsx";
import { api } from "../utils/api.js"; // Assurez-vous que le chemin vers votre utilitaire api est correct
import { FaHistory } from "react-icons/fa";
import "./HistoryDialog.scss";

// Sous-composant pour afficher une seule entrée de l'historique
const HistoryEntry = ({ entry }) => {
    // _id: id du doc d'historique, _v: version, _op: type d'opération, _rid: id de l'enregistrement original
    const { _id, _v, _op, _updatedAt, _user, _rid, ...data } = entry;
    const operationDetails = {
        'i': { label: 'Création', className: 'op-insert' },
        'u': { label: 'Mise à jour', className: 'op-update' },
        'd': { label: 'Suppression', className: 'op-delete' },
    };
    const opInfo = operationDetails[_op] || { label: _op, className: '' };

    return (
        <div className="history-entry">
            <div className="history-entry-header">
                <span className={`op-badge ${opInfo.className}`}>{opInfo.label}</span>
                <span className="history-date">Le {new Date(_updatedAt).toLocaleString()}</span>
                {_user && <span className="history-user">par <strong>{_user}</strong></span>}
                <span className="history-version">Version: {_v}</span>
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

    useEffect(() => {
        if (!modelName || !recordId) return;

        const fetchHistory = async () => {
            setLoading(true);
            setError(null);
            try {
                // J'assume que l'endpoint de l'API pour l'historique est structuré ainsi
                const response = await api.get(`/data/history/${modelName}/${recordId}`);
                if (response.success) {
                    // L'API devrait retourner l'historique trié du plus récent au plus ancien
                    setHistory(response.data);
                } else {
                    setError(response.error || "Échec de la récupération de l'historique.");
                }
            } catch (err) {
                setError("Une erreur est survenue lors de la récupération de l'historique.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [modelName, recordId]);

    return (
        <Dialog
            title={<><FaHistory style={{ marginRight: '8px' }} /> Historique de l'enregistrement</>}
            onClose={onClose}
            isClosable={true}
            className="history-dialog"
        >
            <div className="history-dialog-content">
                {loading && <div>Chargement de l'historique...</div>}
                {error && <div className="error-message">{error}</div>}
                {!loading && !error && (
                    <div className="history-list">
                        {history.length > 0 ? (
                            history.map(entry => <HistoryEntry key={entry._id} entry={entry} />)
                        ) : (
                            <div>Aucun historique trouvé pour cet enregistrement.</div>
                        )}
                    </div>
                )}
            </div>
        </Dialog>
    );
};