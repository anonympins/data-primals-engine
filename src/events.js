
const events = {};

const eventLayerSystems = {
    "priority": ["high", "medium", "low"],
    "log": ["info", "debug", "warn", "error", "critical"],
    "system": ["calls"]
};



export const Event = {
    Trigger: (name, system = "priority", layer = "medium", ...args) => {  // Ajout des arguments system et layer
        if (!events[system] || !events[system][name] || (layer && !events[system][name][layer])) {
            //console.warn(`No trigger found for ${name} in system ${system} layer ${layer}`);
            return;
        }

        const systemsToProcess = system ? [system] : Object.keys(events); // Si system est spécifié, on cible ce système uniquement, sinon tous les systèmes

        for (const currentSystem of systemsToProcess) {
            if (events[currentSystem] && events[currentSystem][name]) {
                const layersToProcess = layer ? [layer] : eventLayerSystems[currentSystem] || Object.keys(events[currentSystem][name]); // Si layer est spécifié, on cible cette couche, sinon toutes les couches ou celles définies dans eventLayerSystems

                if (layersToProcess) {
                    for (const currentLayer of layersToProcess) {
                        if (events[currentSystem][name][currentLayer]) {
                            for (const callback of events[currentSystem][name][currentLayer]) {
                                try {
                                    callback(...args);
                                } catch (error) {
                                    console.error(`Error in callback for event ${name} in system ${currentSystem} layer ${currentLayer}:`, error);
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    Listen: (name = "", callback = () => {}, system = "priority", layer = "medium") => {
        const validSystems = Object.keys(eventLayerSystems); // Récupération des clés pour une vérification plus performante
        if (!validSystems.includes(system)) {
            throw new Error(`System '${system}' does not exist. Valid systems are: ${validSystems.join(', ')}`); // Message d'erreur plus informatif
        }

        const validLayers = eventLayerSystems[system]; // Récupération des couches valides pour le système
        if (!validLayers.includes(layer)) {
            throw new Error(`Layer '${layer}' does not exist in system '${system}'. Valid layers are: ${validLayers.join(', ')}`); // Message d'erreur plus informatif
        }

        events[system] = events[system] || {}; // Simplification de la création des objets
        events[system][name] = events[system][name] || {};
        events[system][name][layer] = events[system][name][layer] || [];
        events[system][name][layer].push(callback);
    },
    RemoveCallback: (name, callback, layer="medium", system='priority') => {
        if (!events[system] || !events[system][name] || !events[system][name][layer]) {
            return; // Si l'événement, le système ou la couche n'existent pas, on ne fait rien
        }

        const index = events[system][name][layer].indexOf(callback);
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
