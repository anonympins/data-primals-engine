import React, {createContext, useContext, useState, useCallback, useRef, useEffect, useMemo} from 'react';
import { useQueryClient } from 'react-query';
import { useNotificationContext } from '../NotificationProvider.jsx';
import { useTranslation } from 'react-i18next';

const CommandContext = createContext({});

export const useCommand = () => useContext(CommandContext);

// --- Command Manager ---
class CommandManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        // Les dépendances seront injectées via updateDependencies
        this.addNotification = () => {};
        this.t = (key) => key;
        this.onResetQueryClient = () => {};
        this.queryClient = null; // Ajout pour stocker le queryClient
    }

    updateDependencies(addNotification, t, onResetQueryClient, queryClient) {
        this.addNotification = addNotification;
        this.t = t;
        this.onResetQueryClient = onResetQueryClient;
        this.queryClient = queryClient; // Injection du client
    }

    // La méthode execute est maintenant beaucoup plus simple.
    // Elle n'appelle plus de fonction API, elle enregistre juste la commande.
    add(command) {
        try {
            // Supprimer l'historique "redo" si on exécute une nouvelle commande
            this.history = this.history.slice(0, this.currentIndex + 1);
            this.history.push(command);
            this.currentIndex++;
            this.invalidateQueries(command.modelName, command.constructor.name);
        } catch (e) {
            
        }
    }

    async undo() {
        if (this.canUndo()) {
            try {
                const command = this.history[this.currentIndex];
                await command.undo();
                this.currentIndex--;
                await this.invalidateQueries(command.modelName, command.constructor.name + 'Undo');
                this.addNotification({ title: this.t('command.success.undo', 'Action annulée'), status: 'completed' });
            } catch (error) {
                console.error("Command undo failed:", error);
                this.addNotification({ title: this.t('command.error.undo', 'Erreur d\'annulation'), message: error.message, status: 'error' });
            }
        }
    }

    async redo() {
        if (this.canRedo()) {
            try {
                this.currentIndex++;
                const commandToRedo = this.history[this.currentIndex];
                // Pour refaire, on exécute à nouveau l'action originale.
                await commandToRedo.execute();
                await this.invalidateQueries(command.modelName, command.constructor.name);
                this.addNotification({ title: this.t('command.success.redo', 'Action rétablie'), status: 'completed' });
            } catch (error) {
                console.error("Command redo failed:", error);
                this.addNotification({ title: this.t('command.error.redo', 'Erreur de rétablissement'), message: error.message, status: 'error' });
            }
        }
    }

    canUndo() {
        return this.currentIndex >= 0;
    }

    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    async invalidateQueries(modelName, commandType) {
        // Solution plus fine : on invalide seulement les requêtes concernées.
        // React Query s'occupera de rafraîchir les données de manière optimisée.
        if (this.queryClient && modelName) {
            // Invalide toutes les requêtes liées à ce modèle (listes, paginations, etc.)
            await this.queryClient.invalidateQueries(['api/data', modelName]);
        }
    }
}

// --- Command Definitions ---

export class InsertCommand {
    constructor(modelName, apiCallParams) {
        this.modelName = modelName;
        this.apiCallParams = apiCallParams; // Stocke directement les paramètres
        this.insertedItem = null; // On va stocker l'objet complet inséré
        this.successMessage = "Donnée ajoutée";
    }

    // La méthode execute est maintenant utilisée uniquement pour le 'redo'.
    // Elle doit refaire l'appel API initial.
    async execute(apiCall) {
        const response = await apiCall(this.apiCallParams);
        if (!response.success) throw new Error(response.error || 'Redo (Insert) failed');
        // On stocke l'objet complet retourné par l'API, qui inclut le nouvel _id.
        // C'est important pour que le 'undo' suivant fonctionne.
        this.insertedItem = response.data;
        if (!this.insertedItem?._id) throw new Error('No inserted data returned from API');
    }

    async undo() {
        // On garde une copie de l'item avant de le supprimer pour le redo.
        if (!this.insertedItem?._id) throw new Error("Cannot undo insert: item ID is missing.");
        const response = await fetch(`/api/data/${this.insertedItem._id}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Undo (delete) failed');
        }
    }
}

export class UpdateCommand {
    constructor(modelName, originalData, apiCallParams, apiCall) {
        this.modelName = modelName;
        this.originalData = { ...originalData }; // Copie pour l'undo
        this.apiCallParams = apiCallParams;
        this.apiCall = apiCall; // Stocke la fonction pour l'undo
        this.recordId = originalData._id;
        this.successMessage = "Donnée mise à jour";
    }

    // La méthode execute est utilisée pour le 'redo'.
    // Elle refait la mise à jour avec les nouvelles données.
    async execute() {
        const response = await this.apiCall(this.apiCallParams);
        if (!response.success) throw new Error(response.error || 'Update failed');
    }

    async undo() {
        // Pour annuler, on ré-applique les données originales
        await this.apiCall({ ...this.apiCallParams, formData: this.originalData, record: this.originalData });
    }
}

export class DeleteCommand {
    constructor(apiCall, modelName, itemsToDelete) { // queryClient a été retiré
        this.apiCall = apiCall; // La fonction pour supprimer
        this.modelName = modelName;
        this.itemsToDelete = Array.isArray(itemsToDelete) ? [...itemsToDelete] : [itemsToDelete];
        this.successMessage = "Donnée(s) supprimée(s)";
    }

    // La méthode execute est utilisée pour le 'redo'.
    // Elle doit refaire la suppression.
    async execute() {
        // On utilise la fonction stockée dans le constructeur.
        const response = await this.apiCall(this.itemsToDelete);
        if (!response.success) throw new Error(response.error || 'Delete failed');
    }

    async undo() {
        // Pour annuler, on ré-insère chaque document supprimé
        // Note : cela crée de nouveaux _id, mais restaure les données.
        const reinsertPromises = this.itemsToDelete.map(item => {
            const reinsertData = { ...item };
            delete reinsertData._id; // L'API doit générer un nouvel ID
            delete reinsertData._hash;
 
            return fetch('/api/data?_user=system', { // On ajoute _user=system pour tracer l'origine de l'action
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: this.modelName, data: reinsertData }),
            }).then(res => res.json().then(data => {
                if (!res.ok || !data.success) {
                    throw new Error(data.error || `Undo (re-insert) failed for item ${item._id}.`);
                }
                // On retourne l'objet complet retourné par l'API, qui contient le nouvel _id
                return data.data;
            }));
        });

        // On attend que toutes les réinsertions soient terminées.
        const reinsertedItems = await Promise.all(reinsertPromises);

        // *** CORRECTION CRUCIALE ***
        // On met à jour la liste des items de la commande avec les nouvelles données (et les nouveaux _id).
        // Ainsi, si un "redo" est exécuté, il ciblera les bons documents à supprimer.
        this.itemsToDelete = reinsertedItems;
    }
}

// --- Singleton Command Manager ---
// On crée l'instance du manager EN DEHORS du composant React.
// Ainsi, elle ne sera pas détruite et recréée à chaque re-rendu de l'application,
// ce qui permet de conserver l'historique des commandes (undo/redo).
const commandManagerInstance = new CommandManager();

export const createInsertCommand = (modelName, apiCallParams) => new InsertCommand(modelName, apiCallParams);
export const createUpdateCommand = (modelName, record, apiCallParams) => new UpdateCommand(modelName, record, apiCallParams);
export const createDeleteCommand = (apiCall, modelName, itemsToDelete) => new DeleteCommand(apiCall, modelName, itemsToDelete);

// --- Provider Component ---
export const CommandProvider = ({ children, onResetQueryClient }) => {
    const { addNotification } = useNotificationContext();
    const { t, i18n } = useTranslation();
    const queryClient = useQueryClient(); // On récupère le client ici
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    
    // On utilise l'instance unique et on met à jour ses dépendances via useEffect
    // pour s'assurer qu'elle a toujours les dernières fonctions (qui sont recréées à chaque rendu).
    const commandManagerRef = useRef(commandManagerInstance);
    useEffect(() => {
        commandManagerInstance.updateDependencies(addNotification, t, onResetQueryClient, queryClient);
    }, [addNotification, t, onResetQueryClient, queryClient]);
    
    const [canUndo, setCanUndo] = useState(commandManagerRef.current.canUndo());
    const [canRedo, setCanRedo] = useState(commandManagerRef.current.canRedo());

    const updateUndoRedoState = () => {
        setCanUndo(commandManagerRef.current.canUndo());
        setCanRedo(commandManagerRef.current.canRedo());
    };

    // Renommée en 'addCommand' pour plus de clarté.
    const addCommand = (command) => {
        commandManagerRef.current.add(command);
        updateUndoRedoState();
    };

    const undo = async () => {
        await commandManagerRef.current.undo();
        updateUndoRedoState();
    };

    const redo = async () => {
        await commandManagerRef.current.redo();
        updateUndoRedoState();
    };
    // --- CORRECTION ---
    // On inclut `setManagerContext` directement dans la valeur du contexte
    // et on mémorise l'objet avec `useMemo` pour la stabilité.
    const value = useMemo(() => ({
        addCommand, // (command)
        undo,
        redo,
        canUndo, // boolean
        canRedo, // boolean
        createInsertCommand,
        createUpdateCommand,
        createDeleteCommand,
        setManagerContext: (context) => {
            commandManagerRef.current.context = context;
        }
    }), [canUndo, canRedo]); // Dépendances pour la mémorisation

    return (
        <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
    );
};