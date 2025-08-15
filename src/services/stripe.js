import Stripe from 'stripe';
import {editData, insertData, searchData} from '../modules/data/index.js';
import {getEnv} from "../modules/user.js";

const stripeInstances = {};

/**
 * Retrieves a cached or creates a new Stripe client instance for a given user.
 * This function centralizes API key retrieval and client initialization.
 * @param {object} user - The user object.
 * @returns {Promise<{client: Stripe, webhookSecret: string}|null>} The Stripe client and webhook secret, or null if not configured.
 */
async function getStripeClient(user) {
    const userId = user._id.toString();
    if (!stripeInstances[userId]) {
        const env = await getEnv(user);
        if (env.STRIPE_SECRET_KEY) {
            stripeInstances[userId] = {
                client: new Stripe(env.STRIPE_SECRET_KEY),
                webhookSecret: env.STRIPE_WEBHOOK_SECRET
            };
        }
    }
    return stripeInstances[userId] || null;
}

/**
 * Crée ou récupère un client Stripe pour un utilisateur de notre système.
 */
async function getOrCreateCustomer(user, db) {
    const stripeInfo = await getStripeClient(user);
    if (!stripeInfo?.client) {
        throw new Error("Stripe is not configured for this user.");
    }
    const { client: stripe } = stripeInfo;

    // Vérifier que l'utilisateur et son email de contact sont valides
    if (!user || !user.contact || !user.contact.email) {
        // Dans un vrai scénario, il faudrait peut-être chercher l'email directement sur le modèle user
        const userRecord = await db.findOne('user', {_id: user._id});
        if(!userRecord || !userRecord.contact || !userRecord.contact.email) {
            throw new Error("User or user contact email is missing.");
        }
        user = userRecord;
    }

    const existingCustomer = await db.findOne('StripeCustomer', { user: user._id });

    if (existingCustomer) {
        return existingCustomer;
    }

    // Créer le client sur Stripe
    const stripeCustomer = await stripe.customers.create({
        email: user.contact.email,
        name: user.username,
        metadata: {
            userId: user._id.toString() // Lien vers notre système
        }
    });

    // Enregistrer le client dans notre BDD
    const newCustomerData = {
        user: user._id,
        stripeCustomerId: stripeCustomer.id,
        email: user.contact.email // Utiliser l'email de contact pour la cohérence
    };
    const { insertedIds } = await insertData('StripeCustomer', newCustomerData, {}, user);

    // Pas besoin de refaire une recherche, on a déjà toutes les infos.
    return { _id: insertedIds[0], ...newCustomerData };
}
/**
 * Crée une session de checkout Stripe.
 */
export async function createCheckoutSession(priceId, user, db, mode = 'subscription') {
    const stripeInfo = await getStripeClient(user);
    if (!stripeInfo?.client) {
        throw new Error("Stripe is not configured for this user.");
    }
    const { client: stripe } = stripeInfo;

    const env = await getEnv(user);
    const appBaseUrl = env.APP_BASE_URL || 'https://your-domain.com'; // Fallback

    const customer = await getOrCreateCustomer(user, db);
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: mode, // 'subscription' or 'payment'
        customer: customer.stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBaseUrl}/cancel`
    });
    return session;
}

/**
 * Vérifie le statut d'une session de checkout.
 */
export async function verifyCheckoutSession(sessionId, user) {
    const stripeInfo = await getStripeClient(user);
    if (!stripeInfo?.client) {
        throw new Error("Stripe is not configured for this user.");
    }
    const { client: stripe } = stripeInfo;
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        return {
            status: session.status,
            payment_status: session.payment_status,
            customer: session.customer,
            subscription: session.subscription
        };
    } catch (error) {
        console.error("Error verifying checkout session:", error);
        throw new Error("Could not verify checkout session.");
    }
}

/**
 * Vérifie la signature d'un webhook Stripe pour s'assurer qu'il est authentique.
 * C'est une étape de sécurité cruciale.
 *
 * @param {object} headers - Les en-têtes de la requête (notamment 'stripe-signature').
 * @param {string} rawBody - Le corps brut de la requête.
 * @returns {Stripe.Event} L'objet événement Stripe vérifié.
 * @throws {Error} Si la signature est invalide ou si les en-têtes/body sont manquants.
 */
export async function verifyWebhookSignature(headers, rawBody, user) {
    const stripeInfo = await getStripeClient(user);

    if (!stripeInfo) {
        throw new Error("Stripe is not configured for this user.");
    }
    const { client: stripe, webhookSecret } = stripeInfo;
    if (!stripe) {
        throw new Error("Stripe unknown API key.");
    }
    if (!webhookSecret) {
        throw new Error("Stripe webhook secret (STRIPE_WEBHOOK_SECRET) is not configured on the server.");
    }

    const signature = headers['stripe-signature'];
    if (!signature) {
        throw new Error("Missing 'stripe-signature' header.");
    }

    try {
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
        console.error(`❌ Error verifying Stripe webhook signature: ${err.message}`);
        throw new Error(`Webhook signature verification failed: ${err.message}`);
    }
}

/**
 * Crée un remboursement pour une commande spécifique.
 */
export async function createRefund(returnId, db, user) {
    const stripeInfo = await getStripeClient(user);
    if (!stripeInfo?.client) {
        throw new Error("Stripe is not configured for this user.");
    }
    const { client: stripe } = stripeInfo;

    const returnRequest = await db.findOne('return', { _id: returnId });
    if (!returnRequest) {
        throw new Error("Return request not found.");
    }

    // Trouver la commande et le paiement associés
    const order = await db.findOne('order', { _id: returnRequest.order });
    if (!order || !order.paymentIntentId) {
        throw new Error("Associated order or its paymentIntentId not found.");
    }

    const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        amount: Math.round(returnRequest.amount * 100), // Stripe attend le montant en centimes
        reason: 'requested_by_customer',
        metadata: {
            returnId: returnId.toString(),
            orderId: order.orderId
        }
    });

    // Mettre à jour le statut de la demande de retour dans notre BDD
    await editData('return', { _id: returnId }, {
        status: 'refunded',
        refundDate: new Date()
    }, {}, user);

    return { refundId: refund.id, status: refund.status };
}
