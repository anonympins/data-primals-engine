import {compare} from "bcrypt";

/**
 * @class UserProvider
 * Définit le contrat pour toutes les implémentations de fournisseurs d'utilisateurs.
 * C'est une classe de base abstraite, elle n'est pas destinée à être utilisée directement.
 */
export class UserProvider {
    constructor(engine) {
        if (this.constructor === UserProvider) {
            throw new Error("Abstract classes can't be instantiated.");
        }
        this.engine = engine;
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

    // Ajoutez ici d'autres méthodes nécessaires : findUserById, createUser, etc.
}


export class DefaultUserProvider extends UserProvider {

    users= [{ username: "demo", password: "demo" }];

    async findUserByUsername(username) {
        return this.users.find(user => user.username === username);
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
}