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
                const commandToRedo = this.history[this.currentIndex]; // Renommé pour plus de clarté
                // Pour refaire, on exécute à nouveau l'action originale.
            await commandToRedo.execute(); // La commande a maintenant sa propre référence à l'apiCall
                await this.invalidateQueries(commandToRedo.modelName, commandToRedo.constructor.name);
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
    constructor(modelName, context, insertApiCall, deleteApiCall, insertedItem = null) {
        // --- CORRECTION ---
        // On stocke les fonctions API directement dans l'instance de la commande
        // pour la rendre autonome.
        this.modelName = modelName;
        this.apiCallParams = context; // Stocke directement les paramètres
        this.insertApiCall = insertApiCall;
        this.deleteApiCall = deleteApiCall;
        this.successMessage = "Donnée ajoutée";
        this.insertedItem = insertedItem; // On initialise la propriété avec la donnée reçue
    }
    
    // La méthode execute est maintenant utilisée uniquement pour le 'redo'.
    // Elle doit refaire l'appel API initial.
    async execute() {
        // --- CORRECTION ---
        // On utilise les données stockées dans le contexte 'after' qui a été
        // correctement sauvegardé lors de la création initiale.
        const redoVariables = {
            record: null, // C'est une insertion, donc pas de 'record'
            apiCallParams: this.apiCallParams.after,
            originalData: this.apiCallParams.after.formData
        };
        console.log("--- REDO (Insert) ---", { redoVariables });
        const response = await this.insertApiCall(redoVariables); // Utilise la fonction API stockée
        if (!response.success) throw new Error(response.error || 'Redo (Insert) failed');
        this.insertedItem = response.data;
        if (!this.insertedItem?._id) throw new Error('No inserted data returned from API');
    }
    
    async undo() {
        // On garde une copie de l'item avant de le supprimer pour le redo.
        if (!this.insertedItem?._id) {
            throw new Error("Cannot undo insert: item ID is missing.");
        }
        console.log("--- UNDO (Delete after Insert) ---", { itemToDelete: this.insertedItem });
        const response = await this.deleteApiCall(this.insertedItem);
        if (!response.success) {
            throw new Error(response.error || 'Undo (delete) failed');
        }
    }
}

export class UpdateCommand {
    constructor(modelName, context) {
        this.modelName = modelName;
        // --- CORRECTION ---
        // On stocke le contexte complet qui contient 'before' et 'after'.
        this.context = context;
        this.successMessage = "Donnée mise à jour";
    }

    // La méthode execute est utilisée pour le 'redo'.
    // Elle refait la mise à jour avec les nouvelles données.
    async execute(apiCall) {
        const redoVariables = {
            record: this.context.after.formData, // Le document mis à jour
            apiCallParams: this.context.after,
            originalData: this.context.after.formData
        };
        console.log("--- REDO (Update) ---", { redoVariables });
        const response = await this.context.after.updateApiCall(redoVariables);
        if (!response.success) throw new Error(response.error || 'Update failed');
    }

    async undo() {
        // --- CORRECTION ---
        // Utilise le contexte 'before' qui contient les données *avant* la mise à jour.
        const undoVariables = {
            record: this.context.before.formData, // Le document original à restaurer
            apiCallParams: this.context.before,
            originalData: this.context.before.formData
        };
        console.log("--- UNDO (Update) ---", { undoVariables });
        const response = await this.context.before.updateApiCall(undoVariables);
        if (!response.success) throw new Error(response.error || 'Undo (Update) failed');
    }
}

export class DeleteCommand {
    constructor(deleteApiCall, modelName, itemsToDelete) {
        this.deleteApiCall = deleteApiCall;
        this.modelName = modelName;
        this.itemsToDelete = Array.isArray(itemsToDelete) ? [...itemsToDelete] : [itemsToDelete];
        this.successMessage = "Donnée(s) supprimée(s)";
    }

    /**
     * La méthode execute est utilisée pour l'action initiale et le 'redo'.
     * Elle effectue la suppression via l'appel API.
     */
    async execute() {
        // On garde une copie des items avant de les supprimer pour pouvoir les restaurer (undo)
        const itemsBeforeDelete = JSON.parse(JSON.stringify(this.itemsToDelete));

        const response = await this.deleteApiCall(this.itemsToDelete);

        // Si la suppression échoue, on lève une erreur pour que le CommandManager l'intercepte.
        if (!response.success) {
            throw new Error(response.error || 'Delete failed');
        }
        // On met à jour l'état interne avec les données qui ont été supprimées.
        this.itemsToDelete = itemsBeforeDelete;
    }

    async redo() {
        const response = await this.deleteApiCall(this.itemsToDelete);
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
                credentials:"include",
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

export const createInsertCommand = (modelName, context, insertApiCall, deleteApiCall, insertedItem = null) => {
    return new InsertCommand(modelName, context, insertApiCall, deleteApiCall, insertedItem);
};
export const createUpdateCommand = (modelName, context) => new UpdateCommand(modelName, context);
export const createDeleteCommand = (deleteApiCall, modelName, itemsToDelete) => new DeleteCommand(deleteApiCall, modelName, itemsToDelete);

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
        commandManagerRef.current.updateDependencies(addNotification, t, onResetQueryClient, queryClient);
    }, [addNotification, t, onResetQueryClient, queryClient]);
    
    const [canUndo, setCanUndo] = useState(commandManagerRef.current.canUndo());
    const [canRedo, setCanRedo] = useState(commandManagerRef.current.canRedo());

    const updateUndoRedoState = () => {
        setCanUndo(commandManagerRef.current.canUndo());
        setCanRedo(commandManagerRef.current.canRedo());
    };
    
    const addCommand = async (command) => {
        // --- CORRECTION MAJEURE ---
        // On exécute la commande AVANT de l'ajouter à l'historique.
        // La commande elle-même contient maintenant la logique d'appel API.
        await command.execute();
        // -------------------------

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