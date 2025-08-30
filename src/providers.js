import {compare, hash} from "bcrypt";
import {maxTotalPrivateFilesSize} from "./constants.js";
import {getCollection, ObjectId} from "./modules/mongodb.js";
import {Logger} from "./gameObject.js";

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
     * Récupère la limite de stockage d'un utilisateur.
     * @param user
     * @returns {Promise<number>}
     */
    async getUserStorageLimit(user) {
        return maxTotalPrivateFilesSize;
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
        return this.plans[user?.userPlan]?.features.some(f => f === feature);
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
        return maxTotalPrivateFilesSize;
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

        // Priorité 2: PasF de session, mais on vérifie la présence d'un cookie "username" pour la démo.
        const demoUsername = req.cookies?.username;
        if (demoUsername && typeof demoUsername === 'string' && this.isDemoUser(demoUsername)) {
            // On a trouvé un cookie de démo. On crée l'objet utilisateur correspondant.
            const demoUser = await this.findUserByUsername(demoUsername);
            if (demoUser) {
                req.me = demoUser;
                return;
            }
        }

        // Priorité 2: PasF de session, mais on vérifie la présence d'un cookie "username" pour la démo.
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
        if (req.session?.user?._id) {
            const user = await this.findUserById(req.session.user._id);
            if (user) {
                req.me = user; // Attache l'utilisateur à la requête
            }
        }
    }
}