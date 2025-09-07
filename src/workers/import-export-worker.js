import { parentPort } from 'worker_threads';
import { parse } from 'csv-parse/sync';

parentPort.on('message', ({ action, payload }) => {
    try {
        let result;
        switch (action) {
        case 'parse-json':
            // Tâche: Parser une chaîne/buffer JSON en objet JS
            result = JSON.parse(payload.fileContent.toString('utf-8'));
            break;

        case 'parse-csv':
            // Tâche: Parser une chaîne/buffer CSV en tableau d'objets JS
            result = parse(payload.fileContent, {
                columns: payload.options.columns,
                skip_empty_lines: true,
                trim: true
            });
            break;

        case 'stringify-json':
            // Tâche: Sérialiser un objet/tableau JS en chaîne JSON
            result = JSON.stringify(payload.data);
            break;

        default:
            throw new Error(`Unknown action: ${action}`);
        }
        // Renvoyer le résultat au thread principal
        parentPort.postMessage({ success: true, data: result });
    } catch (error) {
        // Renvoyer l'erreur au thread principal
        parentPort.postMessage({ success: false, error: error.message });
    }
});