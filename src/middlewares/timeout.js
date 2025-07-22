
/**
 * Middleware to set a specific request timeout.
 * If the timeout is reached, it sends a 408 Request Timeout response.
 * @param {number} timeoutMs - The timeout in milliseconds.
 * @returns {function(req, res, next): void}
 */
// Fichier: server/src/middlewares/timeout.js (suggestion)

/**
 * Middleware to set a specific request timeout.
 * If the timeout is reached, it sends a 408 Request Timeout response.
 * @param {number} timeoutMs - The timeout in milliseconds.
 * @returns {function(req, res, next): void}
 */
export const setTimeoutMiddleware = (timeoutMs) => {
    return (req, res, next) => {
        // Set the timeout for this specific request's socket
        req.setTimeout(timeoutMs);

        const timeoutHandler = () => {
            // Check if headers have already been sent
            if (!res.headersSent) {
                res.status(408).json({
                    error: true,
                    message: `Request Timeout: The server did not receive a complete request message within the time that it was prepared to wait (${timeoutMs}ms).`
                });
            }
            // req.abort() n'est généralement pas nécessaire ici.
            // La réponse envoyée ci-dessus signale la fin de la requête.
            // Le serveur gérera la fermeture du socket.
        };

        const cleanupListeners = () => {
            req.removeListener('timeout', timeoutHandler);
        };

        // Assign the timeout handler
        req.on('timeout', timeoutHandler);

        // Clean up the listener when the response finishes or the connection closes
        res.on('finish', cleanupListeners);
        res.on('close', cleanupListeners);

        next();
    };
};