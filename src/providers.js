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
            },
        };
    }

    async hasFeature(user, feature) {
        return this.plans[user.userPlan]?.features.some(f => f === feature);
    }

    // Ajoutez ici d'autres méthodes nécessaires : findUserById, createUser, etc.
}


export class DefaultUserProvider extends UserProvider {

    users= [{ username: "demo", password: "demo" }];

    async findUserByUsername(username) {
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
        return true;
    }

    async updateUser(user, data) {
        this.users = this.users.map(user => user.username === user.username ? {...user, ...data} : user);
    }

    async initiateUser(req) {
        req.me = this.users[0];
    }

    getUserPlans(){
        return {
            free: {
                features: ['indexes']
            },
        }
    }
}