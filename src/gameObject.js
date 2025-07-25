import {Event} from "./events.js";
import chalk from "chalk";
import util from "node:util"

export const GameObject = {
    Create: (name = 'untitled', params = {}) => {
        const go = {
            name,
            components: [], // Tableau pour stocker les composants
            addComponent : function(Component, ...args) {
                if (!(Component.prototype instanceof Behaviour)) {
                    throw new Error("Le composant doit hériter de la classe Behavior.");
                }
                const component = new Component(this, ...args);
                this.components.push(component);
                return component;
            },
            getComponent: function(Component) {
                return this.components.find(c => c instanceof Component);
            },
            getComponents: function(Component) {
                return this.components.filter(c => c instanceof Component);
            },
            on : (event, callback) => {
                Event.Listen("GameObject." + event, callback);
            },
            off: (event, callback) => {
                Event.RemoveCallback("GameObject." + event, callback);
            }
        };
        Object.assign(go, params);
        return go;
    }
}
// Behavior.js
class Behaviour {
    constructor(gameObject) {
        this.gameObject = gameObject;
        Event.Trigger("GameObject."+(this.constructor.name)+".init", "system", "calls", this);
    }

    // Méthodes communes à tous les comportements (exemples)
    onEnable() {
        // Logique d'initialisation du comportement
    }

    onDisable() {
        // Logique de nettoyage du comportement
    }
}
// MovableBehavior.js
export class MovableBehaviour extends Behaviour {
    constructor(gameObject, speed = 5) {
        super(gameObject);
        this.speed = speed;
    }

    update() {
        const { x, y } = this.gameObject;
        // Logique de déplacement (exemple)
        this.gameObject.x += this.speed;
    }
}

// UsableBehavior.js
export class UsableBehaviour extends Behaviour {
    constructor(gameObject) {
        super(gameObject);
    }

    use() {
        Event.Trigger("GameObject.UsableBehavior.use",  "system", "calls", this);
    }
}

const mainDriver = GameObject.Create("MainDrivers");

// Exemple d'attachement de comportements
mainDriver.addComponent(MovableBehaviour, 10);
mainDriver.addComponent(UsableBehaviour);

// Accéder et utiliser les composants
const movable = mainDriver.getComponent(MovableBehaviour);
if (movable) {
    movable.update();
}
const usable = mainDriver.getComponent(UsableBehaviour);
if (usable) {
    usable.use();
}


export class Logger extends Behaviour {
    constructor(gameObject) {
        super(gameObject);
    }

    trace(level, ...args) {
        const message = args.map(arg => {
            // 1. Gérer null et undefined en premier
            if (arg === undefined) {
                return 'undefined';
            }
            if (arg === null) {
                return 'null';
            }

            // 2. Gérer les erreurs de manière plus sûre
            // Utilise le duck-typing si instanceof échoue mais que l'objet ressemble à une erreur
            if (typeof arg === 'object' && (arg instanceof Error || (arg.message && arg.stack))) {
                try {
                    // Accès sécurisé aux propriétés
                    const name = arg.name || 'Error';
                    const msg = arg.message || String(arg); // Fallback si .message n'existe pas
                    const stack = arg.stack || '';
                    // Optionnel: Limiter la longueur de la stack trace
                    const shortStack = stack.split('\n').slice(0, 10).join('\n'); // Limite à 10 lignes
                    return `${name}: ${msg}\n${shortStack}${stack.length > shortStack.length ? '...' : ''}`;
                } catch (formatError) {
                    // Fallback si même l'accès aux propriétés de base échoue
                    return '[Error (formatting failed)]';
                }
            }

            // 3. Gérer les autres objets (avec inspection sécurisée)
            if (typeof arg === 'object') {
                try {
                    // Utiliser util.inspect avec une profondeur contrôlée pour éviter les erreurs/trop de logs
                    return util.inspect(arg, { depth: 2, colors: false }); // Ajustez la profondeur si nécessaire
                } catch (inspectError) {
                    // Attrape les erreurs pendant l'inspection (références circulaires, getters problématiques)
                    return `[Object (inspect error: ${inspectError.message})]`;
                }
            }

            // 4. Fallback pour les types primitifs (string, number, boolean, etc.)
            try {
                return String(arg);
            } catch (stringError) {
                // Très improbable, mais pour être exhaustif
                return '[Value (string conversion failed)]';
            }
        }).join(' ');

        const timestamp = new Date().toISOString(); // Ou votre format préféré
        // Utilisez console.log, console.error, ou votre mécanisme de sortie de log
        const msg = `[${timestamp}] [${level}] ${message}`;
        return msg
    }
    info(...args) {
        console.log(chalk.green(this.trace("info", ...args)));
        Event.Trigger("GameObject.LoggableBehaviour.info",  "log", "info", ...args, this);
    }
    debug(...args) {
        console.log(chalk.yellow(this.trace("debug", ...args)));
        Event.Trigger("GameObject.LoggableBehaviour.debug",  "log", "debug", ...args, this);
    }
    warn(...args) {
        console.warn(chalk.magenta(this.trace("warn", ...args)));
        Event.Trigger("GameObject.LoggableBehaviour.warn",  "log", "warn", ...args, this);
    }
    error(...args) {
        console.error(chalk.red(this.trace("error", ...args)));
        Event.Trigger("GameObject.LoggableBehaviour.error",  "log", "error", ...args, this);
    }
    critical(...args) {
        console.error(chalk.red(chalk.bold(this.trace("critical", ...args))));
        Event.Trigger("GameObject.LoggableBehaviour.critical",  "log", "critical", ...args, this);
    }

}

export class BenchmarkTool extends Behaviour{
    constructor(gameObject) {
        super(gameObject);
        this.time = 0;
    }
    start() {
        this.time = performance.now();
    }
    stop() {
        const stopTime = performance.now();
        const elapsedTime = stopTime - this.time; // Calcule le temps écoulé une seule fois
        console.log(`Time elapsed: ${elapsedTime.toFixed(4)}ms`); // Utilisation de template literals pour une meilleure lisibilité
        return elapsedTime; // Retourne le temps écoulé (pas besoin de le recalculer)
    }
}
