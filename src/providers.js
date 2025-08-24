import {compare} from "bcrypt";
import {maxTotalPrivateFilesSize} from "./constants.js";

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

    users= [{ username: "demo", password: "demo" }];

    /**
     * Trouve un utilisateur. Gère spécifiquement les utilisateurs de démo.
     */
    async findUserByUsername(username) {
        // Si le nom d'utilisateur commence par "demo", on le considère comme un utilisateur de démo valide et volatile.
        if (typeof username === 'string' && username.startsWith('demo')) {
            // On retourne un objet utilisateur de démo avec la structure attendue.
            return { username: username, password: "demo", userPlan: 'free' }; // Ajout de userPlan pour la cohérence
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

    async validatePassword(user, password) {
        // Pour un utilisateur de démo, le mot de passe est toujours valide.
        if (user.username.startsWith('demo')) {
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
        if (demoUsername && typeof demoUsername === 'string' && demoUsername.startsWith('demo')) {
            // On a trouvé un cookie de démo. On crée l'objet utilisateur correspondant.
            const demoUser = await this.findUserByUsername(demoUsername);
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