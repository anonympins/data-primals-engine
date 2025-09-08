import {safeAssignObject} from "./core.js";

const events = {};

const eventLayerSystems = {
    "priority": ["high", "medium", "low"],
    "log": ["info", "debug", "warn", "error", "critical"],
    "system": ["calls", "users"],
    "event": ["system","user"],
    "custom": ["data"]
};

/**
 * Parses a priority string/number into a structured object for sorting.
 * @param {string|number} [priority='identity'] - The priority value.
 *   - 'beforeAll': Executes before all others in the same layer.
 *   - 'afterAll': Executes after all others in the same layer.
 *   - A number (e.g., 50): A numeric weight (lower is higher priority).
 *   - 'identity' or undefined: Default, executes in registration order after weighted listeners.
 * @returns {{type: string, weight: number}}
 * @private
 */
function _parsePriority(priority = 'identity') {
    if (priority === 'beforeAll') {
        return { type: 'special', weight: -Infinity };
    }
    if (priority === 'afterAll') {
        return { type: 'special', weight: Infinity };
    }

    const numericWeight = parseInt(priority, 10);
    if (!isNaN(numericWeight)) {
        return {
            type: 'weighted',
            weight: numericWeight
        };
    }

    // Default for 'identity' or any unrecognized format
    return { type: 'identity', weight: Number.MAX_SAFE_INTEGER };
}





export const Event = {
    Trigger: async (name, system = "priority", layer = "medium", ...args) => {  // Ajout des arguments system et layer
        if (!name || typeof name !== 'string') {
            throw new Error('Event name must be a non-empty string');
        }

        if (!events[system] || !events[system][name] || (layer && !events[system][name][layer])) {
            //console.warn(`No trigger found for ${name} in system ${system} layer ${layer}`);
            return null;
        }

        const systemsToProcess = system ? [system] : Object.keys(events); // Si system est spécifié, on cible ce système uniquement, sinon tous les systèmes
        console.log(`[Event] Triggering ${system}.${layer}.${name}`, {
            callbacks: events[system]?.[name]?.[layer]?.length || 0
        });
        let ret = null;
        for (const currentSystem of systemsToProcess) {
            if (events[currentSystem] && events[currentSystem][name]) {
                const layersToProcess = layer ? [layer] : eventLayerSystems[currentSystem] || Object.keys(events[currentSystem][name]); // Si layer est spécifié, on cible cette couche, sinon toutes les couches ou celles définies dans eventLayerSystems

                if (layersToProcess) {
                    for (const currentLayer of layersToProcess) {
                        if (events[currentSystem][name][currentLayer]) {
                            // Create a copy and sort listeners based on priority before execution
                            const sortedListeners = [...events[currentSystem][name][currentLayer]].sort((a, b) => {
                                const weightDifference = a.priority.weight - b.priority.weight;
                                if (weightDifference !== 0) {
                                    return weightDifference;
                                }
                                // For listeners with the same weight (especially 'identity'), maintain registration order
                                return a.originalIndex - b.originalIndex;
                            });

                            for (const listener of sortedListeners) {
                                try {
                                    const res = await listener.callback(...args);
                                    if (typeof res === "object" && !Array.isArray(res)) {
                                        if (typeof ret !== "object") ret = {};
                                        ret = {...ret, ...res};
                                    } else if (Array.isArray(res)) {
                                        if (!ret || !Array.isArray(ret)) ret = [];
                                        ret = ret.concat(res);
                                    } else if (res !== undefined && res !== null) {
                                        // Simplified aggregation for primitive types
                                        if (typeof res === "string") {
                                            ret = (ret || "") + res;
                                        } else if (typeof res === "number") {
                                            ret = (ret || 0) + res;
                                        } else if (typeof res === "boolean") {
                                            ret = res && (ret === null ? true : ret);
                                        }
                                    } else {
                                        ret = res || ret;
                                    }
                                } catch (error) {
                                    const errorMsg = `Error in callback for event ${name} in system ${currentSystem} layer ${currentLayer}: ${error.message}`;
                                    const newError = new Error(errorMsg);
                                    newError.originalError = error; // Conserve l'erreur originale
                                    newError.eventDetails = { name, system: currentSystem, layer: currentLayer };
                                    throw newError;
                                }
                            }
                        }
                    }
                }
            }
        }
        return ret;
    },
    Listen: function(name = "", callback, ...args) {
        let system = "priority";
        let layer = "medium";
        let priority = 'identity';

        // Détecte si la nouvelle signature (avec objet) ou l'ancienne (avec arguments multiples) est utilisée.
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
            // Nouvelle signature: Listen(name, cb, { system, layer, priority })
            ({ system = "priority", layer = "medium", priority = 'identity' } = args[0]);
        } else if (args.length > 0) {
            // Ancienne signature: Listen(name, cb, system, layer, priority)
            [system = "priority", layer = "medium", priority = 'identity'] = args;
        }

        const validSystems = Object.keys(eventLayerSystems);
        if (!validSystems.includes(system)) {
            throw new Error(`System '${system}' does not exist. Valid systems are: ${validSystems.join(', ')}`);
        }

        const validLayers = eventLayerSystems[system];
        if (!validLayers.includes(layer)) {
            throw new Error(`Layer '${layer}' does not exist in system '${system}'. Valid layers are: ${validLayers.join(', ')}`);
        }

        safeAssignObject(events, system, events[system] || {});
        safeAssignObject(events[system], name, events[system][name] || {});
        safeAssignObject(events[system][name], layer, events[system][name][layer] || []);

        const listener = {
            callback,
            priority: _parsePriority(priority),
            originalIndex: events[system][name][layer].length
        };
        events[system][name][layer].push(listener);
    },
    addSystem: (system) => {
        if (typeof system !== 'string' || system.trim() === '') {
            throw new Error('Le nom du système doit être une chaîne de caractères non vide.');
        }
        if (!eventLayerSystems.hasOwnProperty(system)) {
            eventLayerSystems[system] = [];
        } else {
            console.warn(`[Event] Le système '${system}' existe déjà.`);
        }
    },
    addLayer: (system, layer) => {
        if (typeof system !== 'string' || system.trim() === '') {
            throw new Error('Le nom du système doit être une chaîne de caractères non vide.');
        }
        if (typeof layer !== 'string' || layer.trim() === '') {
            throw new Error('Le nom de la couche doit être une chaîne de caractères non vide.');
        }
        if (!eventLayerSystems.hasOwnProperty(system)) {
            throw new Error(`Le système '${system}' n'existe pas. Veuillez l'ajouter avec addSystem('${system}').`);
        }
        if (!eventLayerSystems[system].includes(layer)) {
            eventLayerSystems[system].push(layer);
        }
    },
    RemoveCallback: function(name, callback, ...args) {
        let system = "priority";
        let layer = "medium";

        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
            // Nouvelle signature: Unlisten(name, cb, { system, layer })
            ({ system = "priority", layer = "medium" } = args[0]);
        } else if (args.length > 0) {
            // Ancienne signature: Unlisten(name, cb, system, layer)
            [system = "priority", layer = "medium"] = args;
        }

        if (!events[system] || !events[system][name] || !events[system][name][layer]) {
            return;
        }

        const index = events[system][name][layer].findIndex(listener => listener.callback === callback);
        if (index > -1) {
            events[system][name][layer].splice(index, 1);
        }
    },
    // Ajout d'une méthode pour supprimer tous les callbacks d'un événement (optionnel)
    RemoveAllCallbacks: (name, system = 'priority') => {
        if (events[system] && events[system][name]) {
            delete events[system][name]; // Supprime l'objet contenant les couches et les callbacks
        }
    },

    // Ajout d'une méthode pour supprimer tous les callbacks d'un système (optionnel)
    RemoveSystemCallbacks: (system) => {
        if (events[system]) {
            delete events[system];
        }
    }
}
