import {compare, hash} from "bcrypt";
import {maxTotalPrivateFilesSize} from "./constants.js";
import {getCollection, ObjectId} from "./modules/mongodb.js";
import {Logger} from "./gameObject.js";
import {Config} from "./config.js";

/**
 * @class UserProvider
 * Définit le contrat pour toutes les implémentations de fournisseurs d'utilisateurs.
 * C'est une classe de base abstraite, elle n'est pas destinée à être utilisée directement.
 */
export class UserProvider {

    plans = {};

    constructor(engine) {
        if (this.constructor === UserProvider) {
            throw new Error("Abstract classes can't be instantiated.");
        }
        this.engine = engine;
        this.plans = this.getUserPlans();
    }

    /**
     * Trouve un utilisateur par son ID unique. Nécessaire pour la désérialisation de Passport.
     * @param {string} id - L'ID de l'utilisateur.
     * @returns {Promise<object|null>} L'objet utilisateur ou null.
     */
    async findUserById(id) {
        throw new Error("Method 'findUserById()' must be implemented.");
    }


    /**
     * Met à jour un nouvel utilisateur.
     * @param user
     * @returns {Promise<void>}
     */
    async updateUser(user, data) {

    }

    /**
     * Trouve un utilisateur par son nom d'utilisateur.
     * @param {string} username - Le nom d'utilisateur à rechercher.
     * @returns {Promise<object|null>} L'objet utilisateur ou null.
     */
    async findUserByUsername(username) {
        throw new Error("Method 'findUserByUsername()' must be implemented.");
    }

    /**
     * Valide le mot de passe d'un utilisateur.
     * @param {object} user - L'objet utilisateur.
     * @param {string} password - Le mot de passe à vérifier.
     * @returns {Promise<boolean>} True si le mot de passe est valide.
     */
    async validatePassword(user, password) {
        throw new Error("Method 'validatePassword()' must be implemented.");
    }

    /**
     * Initialise un utilisateur sur la requête (pour les middlewares).
     * @param {object} req - L'objet requête Express.
     * @returns {Promise<void>}
     */
    async initiateUser(req) {
        throw new Error("Method 'initiateUser()' must be implemented.");
    }

    /**
     * Tente d'authentifier un utilisateur à partir d'un token Bearer JWT.
     * Logique commune pour l'authentification API.
     * @param {object} req - L'objet requête Express.
     * @returns {Promise<boolean>} True si un utilisateur a été authentifié, sinon false.
     */
    async initiateUserFromToken(req) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                // L'import dynamique est conservé pour la performance
                const jwt = (await import('jsonwebtoken')).default;
                const decoded = jwt.verify(token, process.env.JWT_SECRET); // Utilise la clé secrète de l'environnement
                const user = await this.findUserById(decoded.id);
                if (user) {
                    req.me = user; // Attache l'utilisateur à la requête
                    return true; // Authentification réussie
                }
            } catch (error) {
                // Le token est invalide, a expiré, ou l'utilisateur n'existe pas.
                this.engine.getComponent(Logger)?.warn(`[Auth] Invalid Bearer token provided: ${error.message}`);
            }
        }
        return false;
    }

    /**
     * Récupère la limite de stockage d'un utilisateur.
     * @param user
     * @returns {Promise<number>}
     */
    async getUserStorageLimit(user) {
        return Config.Get('maxTotalPrivateFilesSize', maxTotalPrivateFilesSize);
    }

    /**
     * Récupère la fréquence de sauvegarde d'un utilisateur.
     * @param user
     * @returns {Promise<void>}
     */
    async getBackupFrequency(user){
        return 'daily';
    }

    /**
     * Récupère les middlewares d'un utilisateur.
     * @returns {Promise<*[]>}
     */
    async getMiddlewares(){
        return [];
    }

    getUserPlans(){
        return {
            free: {
                requestLimitPerHour: 10000,
                features: ['indexes'] // Feature list : indexes is the only option for now. Use a dedicated collection for this user
            }
        };
    }

    async hasFeature(user, feature) {
        return this.plans[user?.userPlan ?? 'free']?.features.some(f => f === feature);
    }

    // Ajoutez ici d'autres méthodes nécessaires : findUserById, createUser, etc.
}


export class DefaultUserProvider extends UserProvider {

    users= [{ username: "demo", password: "demo", temporary: true }];

    /**
     * Trouve un utilisateur. Gère spécifiquement les utilisateurs de démo.
     */
    async findUserByUsername(username) {
        // Si le nom d'utilisateur commence par "demo", on le considère comme un utilisateur de démo valide et volatile.
        if (this.isDemoUser(username)){
            // On retourne un objet utilisateur de démo avec la structure attendue.
            return { username: username, password: "demo", userPlan: 'free', temporary: true }; // Ajout de userPlan pour la cohérence
        }
        // Logique pour les vrais utilisateurs (si vous en ajoutez plus tard)
        return this.users.find(user => user.username === username);
    }

    async getUserStorageLimit(user) {
        return Config.Get('maxTotalPrivateFilesSize', maxTotalPrivateFilesSize);
    }

    async getBackupFrequency(user){
        return 'daily';
    }

    async getMiddlewares(){
        return []
    }

    isDemoUser(user) {
        return (typeof (user) === 'string' && (/^demo[0-9]{0,2}$/.test(user) || /^perf[0-9]{1,8}$/.test(user)))
    }

    async validatePassword(user, password) {
        // Pour un utilisateur de démo, le mot de passe est toujours valide.
        if (this.isDemoUser(user)){
            return true;
        }
        // Logique pour les vrais utilisateurs
        return true; // ou votre logique de comparaison bcrypt
    }

    async updateUser(user, data) {
        this.users = this.users.map(user => user.username === user.username ? {...user, ...data} : user);
    }
    /**
     * Initialise l'utilisateur sur la requête. C'est ici que la magie opère.
     */
    async initiateUser(req) {
        // Priorité 1: Un utilisateur est déjà authentifié via une session (pour les vrais comptes).
        if (req.session?.user?.username) {
            const user = await this.findUserByUsername(req.session.user.username);
            if (user) {
                req.me = user;
                return; // L'utilisateur est trouvé, on s'arrête là.
            }
        }

        // Priorité 2: Pas de session, mais on vérifie la présence d'un cookie "username" pour la démo.
        const demoUsername = req.cookies?.username;
        if (demoUsername && typeof demoUsername === 'string' && this.isDemoUser(demoUsername)) {
            // On a trouvé un cookie de démo. On crée l'objet utilisateur correspondant.
            const demoUser = await this.findUserByUsername(demoUsername);
            if (demoUser) {
                req.me = demoUser;
                return;
            }
        }

        // Priorité 2: PasF de session, mais on vérifie la présence d'un user dans la requete
        const user = req.query._user;
        if (user && typeof user === 'string' && this.isDemoUser(user)) {
            const demoUser = await this.findUserByUsername(user);
            if (demoUser) {
                req.me = demoUser;
                return;
            }
        }
    }

    getUserPlans(){
        return {
            free: {
                features: ['indexes']
            }
        }
    }
}

/**
 * @class MongoUserProvider
 * Un fournisseur d'utilisateurs prêt pour la production qui stocke les utilisateurs
 * dans MongoDB et gère les mots de passe de manière sécurisée avec bcrypt.
 */
export class MongoUserProvider extends UserProvider {
    constructor(engine) {
        super(engine);
        this.usersCollection = getCollection("users");
        this.logger = engine.getComponent(Logger);
        this.logger.info("MongoUserProvider initialized, using 'users' collection for local accounts.");
    }

    /**
     * Initialise le fournisseur en créant les comptes par défaut si nécessaire.
     * Cette méthode est conçue pour être appelée une seule fois au démarrage.
     */
    async initialize() {
        try {
            const userCount = await this.usersCollection.countDocuments();
            if (userCount === 0) {
                this.logger.info("No users found. Creating default 'admin' and 'demo' accounts...");

                // Récupérer les IDs des rôles "administrator" et "editor"
                const rolesCollection = getCollection('datas');
                const adminRole = await rolesCollection.findOne({ _model: 'role', name: 'administrator' });
                const editorRole = await rolesCollection.findOne({ _model: 'role', name: 'editor' });

                const adminRoles = adminRole ? [adminRole._id.toString()] : [];
                const demoRoles = editorRole ? [editorRole._id.toString()] : [];

                const defaultUsers = [
                    {
                        username: 'admin',
                        email: 'admin@example.com',
                        password: 'admin', // Le mot de passe sera haché par createUser
                        roles: adminRoles
                    },
                    {
                        username: 'demo',
                        email: 'demo@example.com',
                        password: 'demo',
                        roles: demoRoles
                    }
                ];

                for (const userData of defaultUsers) {
                    await this.createUser(userData);
                    this.logger.info(`Default user '${userData.username}' created successfully.`);
                }
            } else {
                this.logger.info(`${userCount} user(s) found. Skipping default account creation.`);
            }
        } catch (error) {
            this.logger.error("Error during MongoUserProvider initialization:", error);
            // Ne pas bloquer le démarrage de l'application pour cette erreur
        }
    }

    /**
     * Trouve un utilisateur par son ID MongoDB.
     * @param {string} id - L'ID de l'utilisateur.
     * @returns {Promise<object|null>}
     */
    async findUserById(id) {
        try {
            if (!ObjectId.isValid(id)) return null;
            // On exclut le mot de passe des requêtes pour des raisons de sécurité
            return await this.usersCollection.findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });
        } catch (e) {
            this.logger.error(`Error in findUserById: ${e.message}`);
            return null;
        }
    }

    /**
     * Trouve un utilisateur par son nom d'utilisateur ou son email.
     * @param {string} username - Le nom d'utilisateur ou l'email.
     * @returns {Promise<object|null>}
     */
    async findUserByUsername(username) {
        // Permet de se connecter avec l'username ou l'email
        return await this.usersCollection.findOne({ $or: [{ username }, { email: username }] });
    }

    /**
     * Valide le mot de passe fourni par rapport au hash stocké.
     * @param {object} user - L'objet utilisateur complet (avec le hash du mot de passe).
     * @param {string} password - Le mot de passe en clair à vérifier.
     * @returns {Promise<boolean>}
     */
    async validatePassword(user, password) {
        if (!user || !user.password || !password) {
            return false;
        }
        return await compare(password, user.password);
    }

    /**
     * Crée un nouvel utilisateur avec un mot de passe haché.
     * @param {object} userData - Données de l'utilisateur (username, email, password, etc.).
     * @returns {Promise<object>} L'utilisateur nouvellement créé (sans le mot de passe).
     */
    async createUser(userData) {
        const { username, email, password, ...otherData } = userData;
        if (!username || !email || !password) {
            throw new Error("Username, email, and password are required to create a user.");
        }

        const existingUser = await this.usersCollection.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            throw new Error("User with this username or email already exists.");
        }

        const hashedPassword = await hash(password, 12);

        const result = await this.usersCollection.insertOne({
            username,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            userPlan: 'free', // Plan par défaut
            storageUsed: 0, // NOUVEAU: Initialiser le compteur de stockage
            ...otherData
        });

        return await this.findUserById(result.insertedId);
    }

    /**
     * Initialise l'utilisateur sur la requête à partir de la session.
     * Ne gère que les utilisateurs locaux. Le SSO est géré par Passport.
     * @param {object} req - L'objet requête Express.
     */
    async initiateUser(req) {
        // Priorité 1: Tente l'authentification par token Bearer (pour les API)
        const tokenAuthenticated = await this.initiateUserFromToken(req);
        if (tokenAuthenticated) return;

        // Priorité 2: Si pas de token, tente l'authentification par session (pour les interfaces web)
        const sessionUserId = req.session?.user?._id;
        if (sessionUserId) {
            const user = await this.findUserById(sessionUserId);
            if (user) {
                req.me = user; // Attache l'utilisateur à la requête
            }
        }
        // Si aucune méthode ne fonctionne, req.me restera non défini.
    }
}