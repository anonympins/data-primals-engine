import { useEffect, useState } from "react";
import { Dialog } from "./Dialog.jsx";
import Button from "./Button.jsx";
import { FaHistory } from "react-icons/fa";
import {Trans, useTranslation} from "react-i18next";
import "./HistoryDialog.scss";
import {Tooltip} from "react-tooltip";
import {CodeField} from "./Field.jsx";

// Helper to render values in a friendly way for the summary list
const renderSummaryValue = (value) => {
    if (value === undefined || value === null) {
        return <i className="value-empty">empty</i>;
    }
    if (typeof value === 'boolean') {
        return <code className="value-boolean">{value.toString()}</code>;
    }
    if (Array.isArray(value)) {
        return <code className="value-object" title={JSON.stringify(value, null, 2)}>[...] ({value.length} items)</code>
    }
    if (typeof value === 'object' && value !== null) {
        return <code className="value-object" title={JSON.stringify(value, null, 2)}>{`{...}`}</code>
    }
    const strValue = String(value);
    if (strValue.length > 50) {
        return <span className="value-text" title={strValue}>{strValue.substring(0, 47) + '...'}</span>;
    }
    return <span className="value-text">{strValue}</span>;
};

// New sub-component for rendering a single field change
const ChangeDetail = ({ field, from, to }) => {
    const { t } = useTranslation();

    const tt = typeof(to) === 'object' ? JSON.stringify(to,null,2):to;
    const f = typeof(from) === 'object' ? JSON.stringify(from,null,2):from;
    return (
        <div className="change-detail">
            <strong className="change-field-name" title={field}>{field}</strong>
            <div className="change-values">
                <div className="value-from" data-tooltip-id={"changeTooltip"} data-tooltip-content={f}>{renderSummaryValue(from)}</div>
                <div className="change-arrow">→</div>
                <div className="value-to"  data-tooltip-id={"changeTooltip"} data-tooltip-content={tt}>{renderSummaryValue(to)}</div>
            </div>
        </div>
    );
};

// Sub-component for displaying a single history entry
const HistoryEntry = ({ entry, onPreview, isSelected }) => {
    const { t } = useTranslation();
    // The backend has transformed the data for us.
    // _id: history doc id, _v: version, _op: operation type (i,u,d), _rid: original record id
    const { _id, _v, _op, _updatedAt, _user, ...data } = entry; // ...data collects the remaining fields

    const operationDetails = {
        // The keys 'i', 'u', 'd' correspond to what the backend sends now.
        'i': { label: t('history.op.create', 'Creation'), className: 'op-insert' },
        'u': { label: t('history.op.update', 'Update'), className: 'op-update' },
        'd': { label: t('history.op.delete', 'Deletion'), className: 'op-delete' },
    };
    const opInfo = operationDetails[_op] || { label: _op, className: '' };

    const renderData = () => {
        if (_op === 'u') {
            const changes = Object.entries(data).filter(([, value]) => value && typeof value === 'object' && 'from' in value && 'to' in value);
            if (changes.length === 0) {
                return <div className="no-changes-text">{t('history.noChanges', 'No relevant changes recorded.')}</div>;
            }
            return (
                <div className="changes-list">
                    {changes.map(([field, change]) => (
                        <ChangeDetail key={field} field={field} from={change.from} to={change.to} />
                    ))}
                </div>
            );
        }

        // For 'i' (create) and 'd' (delete), show a human-friendly summary of the snapshot.
        const snapshotEntries = Object.entries(data);
        if (snapshotEntries.length === 0) {
            return <div className="no-changes-text">{t('history.noData', 'No data in snapshot.')}</div>;
        }
        return (
            <div className="snapshot-list">
                {snapshotEntries.map(([key, value]) => (
                    <div className="snapshot-item" key={key}>
                        <strong className="snapshot-key" title={key}>{key}:</strong>
                        <span className="snapshot-value">{renderSummaryValue(value)}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={`history-entry ${isSelected ? 'selected' : ''}`}>
            <div className="history-entry-header">
                <span className={`op-badge ${opInfo.className}`}>{opInfo.label}</span>
                <span className="history-date">{t('history.datePrefix', 'On')} {new Date(_updatedAt).toLocaleString()}</span>
                {_user && <span className="history-user">{t('history.byUser', 'by')} <strong>{_user}</strong></span>}
                <span className="history-version">{t('history.version', 'Version:')} {_v}</span>
                <Button className="btn-preview" onClick={() => onPreview(_v)}>
                    <Trans i18nKey={"history.previewAction"}>Preview</Trans>
                </Button>
            </div>
            <div className="history-entry-data">
                {renderData()}
            </div>
        </div>
    );
};

export const HistoryDialog = ({ modelName, recordId, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState(null);
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

    const handlePreview = async (version) => {
        if (selectedVersion === version) return; // Already selected

        setSelectedVersion(version);
        setPreviewLoading(true);
        setPreviewData(null);
        try {
            const res = await fetch(`/api/data/history/${modelName}/${recordId}/${version}`);
            const response = await res.json();
            if (response.success) {
                setPreviewData(response.data);
            } else {
                setPreviewData({ error: response.error || i18n.t("history.previewError", "Could not load revision preview.") });
            }
        } catch (err) {
            setPreviewData({ error: i18n.t("history.previewError", "Could not load revision preview.") });
            console.error(err);
        } finally {
            setPreviewLoading(false);
        }
    };

    return (
        <Dialog
            title={<><FaHistory style={{ marginRight: '8px' }} /> <Trans i18nKey={"history.title"}>Historique de l'enregistrement</Trans></>}
            onClose={onClose}
            isClosable={true}
            className="history-dialog"
        >
            <Tooltip id={"changeTooltip"} clickable={true} />
            <div className="history-dialog-content-split">
                <div className="history-list-container">
                    {loading && <div><Trans i18nKey={"history.loading"}>Chargement de l'historique..</Trans></div>}
                    {error && <div className="error-message">{error}</div>}
                    {!loading && !error && (
                        <div className="history-list">
                            {history.length > 0 ? (
                                history.map(entry =>
                                    <HistoryEntry
                                        key={entry._id}
                                        entry={entry}
                                        onPreview={handlePreview}
                                        isSelected={selectedVersion === entry._v}
                                    />)
                            ) : (
                                <div><Trans i18nKey={"history.noHistory"}>Aucun historique trouvé pour cet enregistrement.</Trans></div>
                            )}
                        </div>
                    )}
                </div>
                <div className="history-preview-container">
                    <h4><Trans i18nKey={"history.previewTitle"}>Revision Preview</Trans></h4>
                    <div className="history-preview-area">
                        {previewLoading && <div><Trans i18nKey={"history.loadingPreview"}>Loading preview...</Trans></div>}
                        {!previewLoading && previewData && <CodeField value={JSON.stringify(previewData,null, 2)} language={"json"} disabled={true} />}
                        {!previewLoading && !previewData && (
                            <div className="placeholder"><Trans i18nKey={"history.selectRevision"}>Select a revision to preview its full state.</Trans></div>
                        )}
                    </div>
                </div>
            </div>
        </Dialog>
    );
};