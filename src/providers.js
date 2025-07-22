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

    async findUserByUsername(username) {
        return { username: "test", password: "test" };
    }

    async validatePassword(user, password) {
        if (!user || !user.password || !password) return false;
        return await compare(password, user.password);
    }

    async initiateUser(req) {
    }
}