import passport from 'passport';
import session from 'express-session';
import {Behaviour, Logger} from './gameObject.js';
import { cookiesSecret } from "./constants.js";
import {UserProvider} from "./providers.js";
import {getCollection} from "./modules/mongodb.js";
import process from "process";

/**
 * @class SSOUserProvider
 * Gère les utilisateurs provenant de fournisseurs d'identité externes (SSO).
 * Sa responsabilité principale est de trouver un utilisateur existant correspondant
 * au profil SSO ou d'en créer un nouveau si nécessaire (provisioning à la volée).
 */
export class SSOUserProvider extends UserProvider {

    usersCollection;

    constructor(engine) {
        super(engine);
        // Idéalement, la collection d'utilisateurs devrait être centralisée.
        // Pour cet exemple, nous la récupérons directement.
        this.usersCollection = getCollection("users"); // Assurez-vous que cette collection existe
    }

    /**
     * Trouve un utilisateur par son ID. Nécessaire pour la désérialisation de Passport.
     * @param {string} id - L'ID de l'utilisateur.
     * @returns {Promise<object|null>}
     */
    async findUserById(id) {
        // Note: Assurez-vous que vos utilisateurs ont un champ `_id` stable.
        // Si vous utilisez le `username` comme identifiant principal, adaptez cette méthode.
        try {
            const { ObjectId } = await import('mongodb');
            return await this.usersCollection.findOne({ _id: new ObjectId(id) });
        } catch (e) {
            return null; // Gère le cas où l'ID n'est pas un ObjectId valide
        }
    }

    /**
     * La méthode clé pour l'intégration SSO.
     * Cherche un utilisateur basé sur le profil fourni par le fournisseur d'identité.
     * S'il n'existe pas, il le crée.
     * @param {object} profile - Le profil utilisateur de Passport (ex: de Google, SAML).
     * @returns {Promise<object>} L'utilisateur de votre système.
     */
    async findOrCreate(profile) {
        if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
            throw new Error("Le profil du fournisseur d'identité ne contient pas d'email.");
        }

        const email = profile.emails[0].value;

        // 1. Chercher un utilisateur existant avec cet email.
        const existingUser = await this.usersCollection.findOne({ email: email });

        if (existingUser) {
            // TODO: Mettre à jour les informations de l'utilisateur si nécessaire (ex: nom, photo de profil)
            // await this.usersCollection.updateOne({ _id: existingUser._id }, { $set: { lastLogin: new Date() } });
            return existingUser;
        }

        // 2. Si aucun utilisateur n'est trouvé, en créer un nouveau.
        const newUser = {
            username: email, // Utiliser l'email comme nom d'utilisateur par défaut
            email: email,
            name: profile.displayName || email,
            provider: profile.provider, // ex: 'google', 'saml'
            providerId: profile.id,
            userPlan: 'free', // Assigner un plan par défaut
            createdAt: new Date()
        };

        const result = await this.usersCollection.insertOne(newUser);
        return await this.findUserById(result.insertedId);
    }

    // Les autres méthodes comme validatePassword ne sont pas pertinentes pour le SSO.
    // On peut les laisser vides ou les faire lever une erreur.
    async validatePassword(user, password) { return false; }
    async findUserByUsername(username) { return await this.usersCollection.findOne({ username }); }
    async initiateUser(req) { /* Géré par Passport */ }
}

/**
 * @class Sso
 * @extends Behaviour
 * Un composant réutilisable qui encapsule la logique de Passport.js pour l'authentification.
 * Il gère la session, la sérialisation, et permet à d'autres modules d'enregistrer
 * dynamiquement des stratégies d'authentification (Google, SAML, etc.).
 */
export class Sso extends Behaviour {
    #ssoUserProvider = null;
    #logger = null;

    constructor(gameObject) {
        super(gameObject);
        this.strategies = new Map();
    }

    /**
     * Initialise le composant avec les middlewares et la configuration de base de Passport.
     * @param {object} options
     * @param {UserProvider} options.ssoUserProvider - Le provider pour trouver ou créer des utilisateurs SSO.
     */
    initialize({ ssoUserProvider }) {
        if (!ssoUserProvider) {
            throw new Error("PassportAuth component requires an ssoUserProvider to be initialized.");
        }
        this.#ssoUserProvider = ssoUserProvider;
        this.#logger = this.gameObject.getComponent(Logger); // Assumant que Logger est un composant

        const app = this.gameObject; // this.gameObject est l'instance de l'engine (Express app)

        // 1. Configurer la session Express (prérequis pour Passport)
        app.use(session({
            secret: process.env.COOKIES_SECRET || cookiesSecret,
            resave: false,
            saveUninitialized: false,
            cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' }
        }));

        // 2. Initialiser Passport
        app.use(passport.initialize());
        app.use(passport.session());

        // 3. Configurer la sérialisation/désérialisation
        passport.serializeUser((user, done) => {
            done(null, user._id);
        });

        passport.deserializeUser(async (id, done) => {
            try {
                const user = await this.#ssoUserProvider.findUserById(id);
                done(null, user);
            } catch (err) {
                done(err);
            }
        });

        this.#logger.info("PassportAuth component initialized successfully.");
    }

    /**
     * Permet à d'autres modules d'enregistrer une nouvelle stratégie d'authentification.
     * @param {string} name - Le nom de la stratégie (ex: 'google', 'saml').
     * @param {object} strategy - L'instance de la stratégie Passport.
     * @param {object} routes - Les chemins pour l'authentification.
     * @param {string} routes.authPath - Le chemin pour initier l'authentification (ex: '/api/auth/google').
     * @param {string} routes.callbackPath - Le chemin de callback (ex: '/api/auth/google/callback').
     * @param {object} options - Options d'authentification pour Passport (ex: { scope: ['profile', 'email'] }).
     */
    addStrategy(name, strategy, routes, options = {}) {
        if (this.strategies.has(name)) {
            this.#logger.warn(`Passport strategy '${name}' is already registered. Overwriting.`);
        }

        // Enregistrer la stratégie auprès de Passport
        passport.use(strategy);

        const app = this.gameObject;

        // Créer la route d'initiation
        app.get(routes.authPath, passport.authenticate(name, options));

        // Créer la route de callback
        app.get(
            routes.callbackPath,
            passport.authenticate(name, { failureRedirect: '/login', failureMessage: true }),
            (req, res) => {
                // Redirection après une authentification réussie
                res.redirect(req.session.returnTo || '/dashboard');
                delete req.session.returnTo;
            }
        );

        this.strategies.set(name, { strategy, routes, options });
        this.#logger.info(`Passport strategy '${name}' registered with routes: ${routes.authPath}, ${routes.callbackPath}`);
    }

    addLogoutRoute(path = '/api/auth/logout') {
        this.gameObject.get(path, (req, res, next) => {
            req.logout((err) => {
                if (err) { return next(err); }
                req.session.destroy(() => {
                    res.redirect('/');
                });
            });
        });
        this.#logger.info(`Logout route registered at '${path}'.`);
    }
}