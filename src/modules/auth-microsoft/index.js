import { Sso, SSOUserProvider } from '../../sso.js';
import { Logger } from "../../gameObject.js";

let logger;

export async function onInit(engine) {
    logger = engine.getComponent(Logger);

    try {
        // 1. Tenter d'importer dynamiquement la stratégie Azure AD.
        // L'utilisateur devra exécuter `npm install passport-azure-ad`.
        const { OIDCStrategy } = await import('passport-azure-ad');

        const ssoUserProvider = new SSOUserProvider(engine);

        // 2. Récupérer ou créer le composant SSO central.
        let ssoComponent = engine.getComponent(Sso);
        if (!ssoComponent) {
            ssoComponent = engine.addComponent(Sso);
            ssoComponent.initialize({ ssoUserProvider });
            ssoComponent.addLogoutRoute();
            logger.info("[auth-microsoft] Sso component was not found, created and initialized a new one.");
        }

        // 3. Vérifier les variables d'environnement critiques pour Azure AD.
        const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } = process.env;
        if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
            logger.warn("[auth-microsoft] Microsoft environment variables are not fully set. Microsoft SSO will be disabled.");
            return;
        }

        const callbackUrl = process.env.MICROSOFT_CALLBACK_URL || '/api/auth/microsoft/callback';

        // 4. Créer l'instance de la stratégie OIDC pour Microsoft.
        const microsoftStrategy = new OIDCStrategy({
            identityMetadata: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
            clientID: MICROSOFT_CLIENT_ID,
            responseType: 'code id_token',
            responseMode: 'form_post',
            redirectUrl: callbackUrl,
            allowHttpForRedirectUrl: process.env.NODE_ENV !== 'production',
            clientSecret: MICROSOFT_CLIENT_SECRET,
            validateIssuer: false, // Important pour les tenants multiples
            passReqToCallback: false,
            scope: ['profile', 'email', 'openid']
        },
        async (iss, sub, profile, accessToken, refreshToken, done) => {
            try {
                // Le profil Azure AD est différent. On l'adapte à notre format standard.
                const email = profile.upn || profile._json.email;
                if (!email) {
                    return done(new Error("Microsoft profile is missing an email (upn)."));
                }

                const adaptedProfile = {
                    provider: 'azuread',
                    id: profile.oid, // Object ID de l'utilisateur dans Azure
                    displayName: profile.displayName,
                    emails: [{ value: email }]
                };

                const user = await ssoUserProvider.findOrCreate(adaptedProfile);
                return done(null, user);
            } catch (err) {
                return done(err);
            }
        });

        // 5. Enregistrer la stratégie auprès du composant SSO.
        ssoComponent.addStrategy('azuread-openidconnect', microsoftStrategy, {
            authPath: '/api/auth/microsoft',
            callbackPath: callbackUrl
        });

    } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') {
            logger.info("[auth-microsoft] Module désactivé. Pour l'activer, exécutez 'npm install passport-azure-ad'");
        } else {
            logger.error("[auth-microsoft] Une erreur inattendue a empêché le chargement du module :", e);
        }
    }
}