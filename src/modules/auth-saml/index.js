import { Sso, SSOUserProvider } from '../../sso.js';
import { Logger } from "../../gameObject.js";

let logger;

export async function onInit(engine) {
    logger = engine.getComponent(Logger);

    try {
        // 1. Tenter d'importer dynamiquement la stratégie SAML.
        // Cela ne fonctionnera que si l'utilisateur a exécuté `npm install passport-saml-encrypted`.
        const { Strategy: SamlStrategy } = await import('passport-saml-encrypted');

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
        const { SAML_ENTRY_POINT, SAML_ISSUER, SAML_CERT, SAML_CALLBACK_URL, SAML_DECRYPTION_KEY } = process.env;
        if (!SAML_ENTRY_POINT || !SAML_ISSUER || !SAML_CERT || !SAML_DECRYPTION_KEY) {
            logger.warn("[auth-saml] SAML environment variables (SAML_ENTRY_POINT, SAML_ISSUER, SAML_CERT, SAML_DECRYPTION_KEY) are not fully set. SAML SSO will be disabled.");
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
                decryptionPvk: SAML_DECRYPTION_KEY, // Clé privée pour déchiffrer les assertions.
                encryptedSAML: true, // Indique que nous attendons des assertions chiffrées.
                acceptedClockSkewMs: -1 // Optionnel mais recommandé: pour les problèmes de synchronisation d'horloge.
            },
            async (profile, done) => {
                try {
                    // Normaliser les clés du profil en minuscules pour une correspondance insensible à la casse.
                    const normalizedProfile = Object.keys(profile).reduce((acc, key) => {
                        acc[key.toLowerCase()] = profile[key];
                        return acc;
                    }, {});

                    // Le profil SAML est différent du profil Google. Nous devons l'adapter.
                    // `nameID` est souvent l'email. Les autres attributs dépendent de la configuration de l'IdP.
                    const email = normalizedProfile.email || normalizedProfile.nameid;
                    if (!email) {
                        return done(new Error("SAML profile is missing an email or nameID."));
                    }

                    const adaptedProfile = {
                        provider: 'saml',
                        id: normalizedProfile.nameid,
                        displayName: normalizedProfile.displayname || normalizedProfile.cn || `${normalizedProfile.firstname || ''} ${normalizedProfile.lastname || ''}`.trim() || email,
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
            logger.info("[auth-saml] Module désactivé. Pour l'activer, exécutez 'npm install passport-saml-encrypted'");
        } else {
            logger.error("[auth-saml] Une erreur inattendue a empêché le chargement du module :", e);
        }
    }
}