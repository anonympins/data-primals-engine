import * as stripeService from './stripe.js';
// Importez d'autres services ici à l'avenir
// import * as anotherService from './anotherService.js';

/**
 * Registre central de tous les services exposés au moteur de workflow.
 */
export const services = {
    stripe: stripeService,
    // anotherService: anotherService,
};