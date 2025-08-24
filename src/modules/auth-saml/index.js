import { Sso, SSOUserProvider } from '../../sso.js';
import { Logger } from "../../gameObject.js";

let logger;

export async function onInit(engine) {
    logger = engine.getComponent(Logger);

    try {
        // 1. Tenter d'importer dynamiquement la stratégie SAML.
        // Cela ne fonctionnera que si l'utilisateur a exécuté `npm install passport-saml`.
        const { Strategy: SamlStrategy } = await import('passport-saml');

        const ssoUserProvider = new SSOUserProvider(engine);

        // 2. Récupérer le composant SSO central.
        let ssoComponent = engine.getComponent(Sso);
        if (!ssoComponent) {
            // S'il n'existe pas, on l'ajoute. C'est le premier module SSO à se charger.
            ssoComponent = engine.addComponent(Sso);
            ssoComponent.initialize({ ssoUserProvider });
            ssoComponent.addLogoutRoute();
            logger.info("[auth-saml] Sso component was not found, created and initialized a new one.");
        }

        // 3. Vérifier les variables d'environnement critiques pour SAML.
        const { SAML_ENTRY_POINT, SAML_ISSUER, SAML_CERT, SAML_CALLBACK_URL } = process.env;
        if (!SAML_ENTRY_POINT || !SAML_ISSUER || !SAML_CERT) {
            logger.warn("[auth-saml] SAML environment variables (SAML_ENTRY_POINT, SAML_ISSUER, SAML_CERT) are not fully set. SAML SSO will be disabled.");
            return;
        }

        const callbackUrl = SAML_CALLBACK_URL || '/api/auth/saml/callback';

        // 4. Créer l'instance de la stratégie SAML.
        // La configuration SAML est plus complexe que OAuth2.
        const samlStrategy = new SamlStrategy(
            {
                path: callbackUrl, // Le chemin où l'IdP (Identity Provider) enverra la réponse POST.
                entryPoint: SAML_ENTRY_POINT, // L'URL de connexion de l'IdP.
                issuer: SAML_ISSUER, // L'identifiant de votre application (Service Provider).
                cert: SAML_CERT, // Le certificat public de l'IdP pour vérifier la signature.
                // acceptedClockSkewMs: -1 // Optionnel: pour les problèmes de synchronisation d'horloge.
            },
            async (profile, done) => {
                try {
                    // Le profil SAML est différent du profil Google. Nous devons l'adapter.
                    // `nameID` est souvent l'email. Les autres attributs dépendent de la configuration de l'IdP.
                    const email = profile.email || profile.nameID;
                    if (!email) {
                        return done(new Error("SAML profile is missing an email or nameID."));
                    }

                    const adaptedProfile = {
                        provider: 'saml',
                        id: profile.nameID,
                        displayName: profile.displayName || profile.cn || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || email,
                        emails: [{ value: email }]
                    };

                    const user = await ssoUserProvider.findOrCreate(adaptedProfile);
                    return done(null, user);
                } catch (err) {
                    return done(err);
                }
            }
        );

        // 5. Enregistrer la stratégie auprès du composant SSO.
        ssoComponent.addStrategy('saml', samlStrategy, {
            authPath: '/api/auth/saml',
            callbackPath: callbackUrl
        });

    } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') {
            logger.info("[auth-saml] Module désactivé. Pour l'activer, exécutez 'npm install passport-saml'");
        } else {
            logger.error("[auth-saml] Une erreur inattendue a empêché le chargement du module :", e);
        }
    }
}