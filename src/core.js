import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export const sleep = (ms = 1000) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export function escapeRegex(string) {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

export const isDate = dt => String(new Date(dt)) !== 'Invalid Date'

export const safeAssignObject = (obj, key, value) => {
    if( !["__proto__", "constructor"].includes(key)){
        obj[key] = value;
    }
}
export function debounce(callback, delay=300){
    var timer;
    return function(){
        var args = arguments;
        var context = this;
        clearTimeout(timer);
        timer = setTimeout(function(){
            callback.apply(context, args);
        }, delay)
    }
}

export function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

export function cssProps(cssString) {
    if (!cssString) return {};

    const style = {};
    const declarations = cssString.split(';');

    declarations.forEach(declaration => {
        const trimmed = declaration.trim();
        if (!trimmed) return;

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) return;

        let property = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        // Convert kebab-case to camelCase
        if (property.includes('-')) {
            property = property.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
        }

        style[property] = value;
    });

    return style;
}


export function removeDir(dirPath) {
    const dirContents = fs.readdirSync(dirPath); // List dir content

    for (const fileOrDirPath of dirContents) {
        try {
            // Get Full path
            const fullPath = path.join(dirPath, fileOrDirPath);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                // It's a sub directory
                if (fs.readdirSync(fullPath).length) removeDir(fullPath);
                // If the dir is not empty then remove it's contents too(recursively)
                fs.rmdirSync(fullPath);
            } else fs.unlinkSync(fullPath); // It's a file
        } catch (ex) {
            console.error(ex.message);
        }
    }

}

export const wordWrap = (str, max, br = '\n') => str.replace(
    new RegExp(`(?![^\\n]{1,${max}}$)([^\\n]{1,${max}})\\s`, 'g'), `$1${br}`
);

export const getObjectHash = (obj, uniqueFields = null, key = "") => {
    let str = "";
    const keysToProcess = Object.keys(obj).sort(); // Trier les clés pour la cohérence

    keysToProcess.forEach(k1 => {
        const v = obj[k1];
        if (v !== undefined) { // Ignorer les clés avec des valeurs undefined
            // Simplification de la logique: on inclut soit les champs uniques, soit tous les champs.
            // La sérialisation est la même dans les deux cas pour un champ donné.
            if (uniqueFields === null || uniqueFields.length === 0 || uniqueFields.includes(k1)) {
                try {
                    // Utiliser JSON.stringify avec un replacer pour gérer plus de types si nécessaire,
                    // ou simplement stringify directement. Attention aux types non sérialisables.
                    str += k1 + ':' + JSON.stringify(v) + ';'; // Inclure clé + valeur sérialisée
                } catch (e) {
                    // Gérer les erreurs de sérialisation (ex: objets circulaires)
                    console.warn(`Could not stringify value for key ${k1} in getObjectHash`, e);
                    str += k1 + ':[unserializable];';
                }
            }
        }
    });

    const buffer = str + key; // Ajouter la clé optionnelle à la fin

    // Utiliser cyrb53 pour le hachage final
    return cyrb53(buffer);
};

export function isPathRelativeTo(dir, parent) {
    const relative = path.relative(parent, dir);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Ensures the value is a valid GUID
 * @param value string value
 */
export function isGUID(value) {
    return typeof(value) === 'string' && value.match(/^[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}$/);
}

export function isPlainObject(obj) {
    return typeof obj === 'object' && obj !== null;
}

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function shuffle(array) {
    let currentIndex = array.length;

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {

        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
}

function sfc32(a, b, c, d) {
    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
}

let seed = 0;
export const setSeed = (s)=>{
    seed = s;
}
function splitmix32(a) {
    a |= 0;
    a = a + 0x9e3779b9 | 0;
    let t = a ^ a >>> 16;
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
}


export const getRand = () =>splitmix32(seed);

const MAX_RANGE_SIZE = 2n ** 64n
const buffer = new BigUint64Array(512)
let offset = buffer.length

/**
 * Returns a cryptographically secure random integer between min and max, inclusive.
 *
 * @param {number} min - the lowest integer in the desired range (inclusive)
 * @param {number} max - the highest integer in the desired range (inclusive)
 * @returns {number} Random number
 */

export function getRandom(min, max) {
    if (!(Number.isSafeInteger(min) && Number.isSafeInteger(max))) {
        throw Error("min and max must be safe integers")
    }
    if (min > max) {
        throw Error("min must be less than or equal to max")
    }
    const bmin = BigInt(min)
    const rangeSize = BigInt(max) - bmin + 1n
    const rejectionThreshold = MAX_RANGE_SIZE - (MAX_RANGE_SIZE % rangeSize)
    let result;
    do {
        if (offset >= buffer.length) {
            crypto.getRandomValues(buffer)
            offset = 0
        }
        result = buffer[offset++]
    } while (result >= rejectionThreshold)
    return Number(bmin + result % rangeSize)
}

/**
 * Returns a cryptographically secure random integer between min and max, inclusive.
 *
 * @param {number} minInclusive - the lowest integer in the desired range (inclusive)
 * @param {number} maxInclusive - the highest integer in the desired range (inclusive)
 * @returns {number} Random number
 */

export function getBrowserRandom(minInclusive, maxInclusive) {
    const randomBuffer = new Uint32Array(1);
    const cr = (window.crypto || window.msCrypto);
    cr?.getRandomValues(randomBuffer);
    const r = cr ? ( randomBuffer[0] / (0xffffffff + 1) ) : getRand();
    return Math.floor(r * (maxInclusive - minInclusive + 1) + minInclusive);
}

export function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
export function isLightColor(color) {
    if( !color )
        return true;
    const hex = color.replace('#', '');
    const c_r = parseInt(hex.substr(0, 2), 16);
    const c_g = parseInt(hex.substr(2, 2), 16);
    const c_b = parseInt(hex.substr(4, 2), 16);
    const brightness = ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
    return brightness > 155;
}

// Mettez cette fonction au début du fichier DataEditor.jsx ou dans un fichier utilitaire importé
export const tryParseJson = (jsonString) => {
    if (!jsonString || typeof jsonString !== 'string') {
        return null; // Retourne null si la chaîne est vide, null, ou pas une chaîne
    }
    try {
        // Tenter de parser la chaîne JSON
        const parsed = JSON.parse(jsonString);
        // S'assurer que c'est un objet ou null (pas un simple nombre, string, etc.)
        return (typeof parsed === 'object' || parsed === null) ? parsed : null;
    } catch (e) {
        console.error("Failed to parse condition JSON:", e, jsonString);
        return null; // Retourne null en cas d'erreur de parsing
    }
};

export function isIsoDate(str) {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
    const d = new Date(str);
    return !isNaN(d.getTime()) && d.toISOString()===str; // valid date
}


Math.seed = function(s) {
    return function() {
        s = Math.sin(s) * 10000; return s - Math.floor(s);
    };
};

const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

String.prototype.hashCode = function() {
    return cyrb53(this);
}

export function random(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


let triggers = {};
export const event_trigger = (name, ...params) => {
    //console.log('Triggering raw event "' + name + '"');
    let ret = false;
    if (Array.isArray(triggers[name])) {
        triggers[name].forEach((t) => {
            const res = t.callback(...params);
            if (Array.isArray(res)) {
                if (!Array.isArray(ret)) ret = [];
                ret = ret.concat(res);
            } else if (typeof res === "string") {
                if (typeof ret !== "string") ret = "";
                ret += res;
            } else if (typeof res === "number") {
                if (typeof ret !== "number") ret = 0;
                ret += res;
            } else if (typeof res === "boolean") {
                if (typeof ret !== "boolean") ret = true;
                ret = res && ret;
            } else {
                ret = res || ret;
            }
        });
    }
    return ret;
};
export const event_on = (name, callback) => {
    if (!Array.isArray(triggers[name])) {
        triggers[name] = [];
    }
    triggers[name].push({ callback });
};
export const event_off = (name, callback) => {
    if (callback && triggers[name]) {
        triggers[name] = triggers[name].filter((f) => f.callback !== callback);
    } else {
        triggers[name] = undefined;
    }
};


export function slugify(str) {
    str = str.replace(/^\s+|\s+$/g, ''); // trim leading/trailing white space
    str = str.toLowerCase(); // convert string to lowercase
    str = str.replace(/[^a-z0-9 -]/g, '') // remove any non-alphanumeric characters
        .replace(/\s+/g, '-') // replace spaces with hyphens
        .replace(/-+/g, '-'); // remove consecutive hyphens
    return str;
}

// resource : https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
export function getFileExtension(fname) {
    return fname.slice((fname.lastIndexOf(".") - 1 >>> 0) + 2);
}

export function object_equals( x, y ) {
    if ( x === y ) return true;
    // if both x and y are null or undefined and exactly the same

    if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) return false;
    // if they are not strictly equal, they both need to be Objects

    if ( x.constructor !== y.constructor ) return false;
    // they must have the exact same prototype chain, the closest we can do is
    // test there constructor.

    for ( var p in x ) {
        if ( ! x.hasOwnProperty( p ) ) continue;
        // other properties were tested using x.constructor === y.constructor

        if ( ! y.hasOwnProperty( p ) ) return false;
        // allows to compare x[ p ] and y[ p ] when set to undefined

        if ( x[ p ] === y[ p ] ) continue;
        // if they have the same strict value or identity then they are equal

        if ( typeof( x[ p ] ) !== "object" ) return false;
        // Numbers, Strings, Functions, Booleans must be strictly equal

        if ( ! object_equals( x[ p ],  y[ p ] ) ) return false;
        // Objects and Arrays must be tested recursively
    }

    for ( p in y )
        if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) )
            return false;
    // allows x[ p ] to be set to undefined

    return true;
}