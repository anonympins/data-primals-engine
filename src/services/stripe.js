import Stripe from 'stripe';
import {editData, insertData, searchData} from '../modules/data/index.js';
import {getEnv} from "../modules/user.js";


/**
 * Crée ou récupère un client Stripe pour un utilisateur de notre système.
 */
async function getOrCreateCustomer(user, db) {
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
    const { insertedIds } = await insertData('StripeCustomer', {
        user: user._id,
        stripeCustomerId: stripeCustomer.id,
        email: user.email
    }, {}, user);

    const newCustomer = await searchData({ model: 'StripeCustomer', filter: { _id: insertedIds[0] } });
    return newCustomer.data[0];
}
/**
 * Crée une session de checkout Stripe.
 */
export async function createCheckoutSession(priceId, user, db) {
    const customer = await getOrCreateCustomer(user, db);
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription' // ou 'payment' pour un paiement unique
    });
}

/**
 * Vérifie le statut d'une session de checkout.
 */
export async function verifyCheckoutSession(sessionId) {
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
    // Initialisation de Stripe avec la clé secrète (à charger depuis une config sécurisée)
    const env = await getEnv(user);
    const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    if( !stripe ){
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
