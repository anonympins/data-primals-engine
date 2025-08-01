const TEST_REGEX = /^\$|\./;
const TEST_REGEX_WITHOUT_DOT = /^\$/;
const REPLACE_REGEX = /^\$|\./g;

function isPlainObject(obj) {
    return typeof obj === 'object' && obj !== null;
}

function getTestRegex(allowDots) {
    return allowDots ? TEST_REGEX_WITHOUT_DOT : TEST_REGEX;
}

function withEach(target, cb) {
    (function act(obj) {
        if (Array.isArray(obj)) {
            obj.forEach(act);
        } else if (isPlainObject(obj)) {
            Object.keys(obj).forEach(function (key) {
                const val = obj[key];
                const resp = cb(obj, val, key);
                if (resp.shouldRecurse) {
                    act(obj[resp.key || key]);
                }
            });
        }
    })(target);
}

function has(target, allowDots) {
    const regex = getTestRegex(allowDots);

    let hasProhibited = false;
    withEach(target, function (obj, val, key) {
        if (regex.test(key)) {
            hasProhibited = true;
            return { shouldRecurse: false };
        } else {
            return { shouldRecurse: true };
        }
    });

    return hasProhibited;
}

function _sanitize(target, options) {
    const regex = getTestRegex(options.allowDots);

    let isSanitized = false;
    let replaceWith = null;
    const dryRun = Boolean(options.dryRun);
    if (!regex.test(options.replaceWith) && options.replaceWith !== '.') {
        replaceWith = options.replaceWith;
    }

    const wl = options.whitelist || [];
    RegExp.prototype.toJSON = RegExp.prototype.toString;

    withEach(target, function (obj, val, key) {
        let shouldRecurse = true;

        if( (key === 'regex' && obj.input) || key === '$regex' ){
            obj[key] = new RegExp(val, "ui");
            console.log('regex san', obj[key]);
        }
        else if (!wl.includes(key) && regex.test(key)) {
            isSanitized = true;
            // if dryRun is enabled, do not modify the target
            if (dryRun) {
                return {
                    shouldRecurse: shouldRecurse,
                    key: key
                };
            }
            delete obj[key];
            if (replaceWith) {
                key = key.replace(REPLACE_REGEX, replaceWith);
                // Avoid to set __proto__ and constructor.prototype
                // https://portswigger.net/daily-swig/prototype-pollution-the-dangerous-and-underrated-vulnerability-impacting-javascript-applications
                // https://snyk.io/vuln/SNYK-JS-LODASH-73638
                if (
                    key !== '__proto__' &&
                    key !== 'constructor' &&
                    key !== 'prototype'
                ) {
                    obj[key] = val;
                }
            } else {
                shouldRecurse = false;
            }
        }

        return {
            shouldRecurse: shouldRecurse,
            key: key
        };
    });

    return {
        isSanitized,
        target
    };
}

function sanitize(target, options = {}) {
    return _sanitize(target, options).target;
}

/**
 * @param {{replaceWith?: string, onSanitize?: function, dryRun?: boolean}} options
 * @returns {function}
 */
export function middleware(options = {}) {
    const hasOnSanitize = typeof options.onSanitize === 'function';
    return function (req, res, next) {
        ['body', 'params', 'headers', 'query'].forEach(function (key) {
            if (req[key]) {
                // The _sanitize function mutates the req[key] object in-place.
                // We only need to capture whether it was sanitized to call the hook.
                const { isSanitized } = _sanitize(req[key], options);

                // The problematic assignment `req[key] = target;` is removed.
                if (isSanitized && hasOnSanitize) {
                    options.onSanitize({
                        req,
                        key
                    });
                }
            }
        });
        next();
    };
}