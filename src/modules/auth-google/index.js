import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Sso, SSOUserProvider } from '../../sso.js';
import {Logger} from "../../gameObject.js";

let logger;

export async function onInit(engine) {
    logger = engine.getComponent(Logger);

    // Le SSOUserProvider est nécessaire pour l'initialisation et pour la stratégie.
    // On le crée donc en premier.
    const ssoUserProvider = new SSOUserProvider(engine);

    // 1. Récupérer le composant PassportAuth central.
    let passportAuth = engine.getComponent(Sso);
    if (!passportAuth) {
        passportAuth = engine.addComponent(Sso);
        // C'EST ICI QUE L'INITIALISATION DOIT AVOIR LIEU, UNE SEULE FOIS.
        passportAuth.initialize({ ssoUserProvider });
        passportAuth.addLogoutRoute();
        logger.info("[auth-google] Sso component was not found, created and initialized a new one.");
    }

    // 2. Vérifier que les variables d'environnement nécessaires sont présentes.
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        logger.warn("[auth-google] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET are not set. Google SSO will be disabled.");
        return;
    }

    // 3. Créer l'instance de la stratégie Google.
    const googleStrategy = new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // On utilise le SSOUserProvider pour trouver ou créer l'utilisateur.
            const user = await ssoUserProvider.findOrCreate(profile);
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    });

    // 4. Enregistrer la stratégie auprès du composant PassportAuth.
    passportAuth.addStrategy('google', googleStrategy,
        { authPath: '/api/auth/google', callbackPath: '/api/auth/google/callback' },
        { scope: ['profile', 'email'] }
    );
}