/**
 * Waits for an element to appear in the DOM.
 * @param {string} selector - The CSS selector of the element.
 * @param {number} timeout - The maximum time to wait in milliseconds.
 * @returns {Promise<Element>} A promise that resolves with the element or rejects on timeout.
 */
export function waitForElement(selector, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const intervalTime = 100; // Check every 100ms
        let elapsedTime = 0;

        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                resolve(element);
            } else {
                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`Element "${selector}" not found after ${timeout}ms`));
                }
            }
        }, intervalTime);
    });
}