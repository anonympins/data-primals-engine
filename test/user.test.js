import { expect, describe, it, afterEach, beforeAll, afterAll } from 'vitest';
import { hasPermission, getUserActivePermissions } from '../src/modules/user.js';
import {initEngine} from "../src/setenv";
import {generateUniqueName} from "../src/setenv.js";
import {
    getCollectionForUser as getAppUserCollection,
    modelsCollection as getAppModelsCollection
} from "../src/modules/mongodb.js";
import {Config} from "../src/index.js";
let permRead, permWrite, permDelete, permManage;
let roleEditor;
let testUser, adminUser, roleViewer;
let currentTestUser;
let testModelsColInstance, testDatasColInstance;
// Cette fonction va remplacer la logique de votre beforeEach pour la création de contexte
async function setupTestContext() {


    // Créer un utilisateur unique pour ce test
    const username = generateUniqueName('testuserUserIntegration');
    currentTestUser = {
        username,
        userPlan: 'free',
        _model: 'user',
        _user: username,
        email: generateUniqueName('test') + '@example.com'
    };

    // Initialize collection instances after the engine is ready
    testModelsColInstance = getAppModelsCollection;
    testDatasColInstance = await getAppUserCollection(currentTestUser);

    await testDatasColInstance.deleteMany({}); // Nettoyage de la base de test
    // 1. Créer les permissions
    const permissions = await testDatasColInstance.insertMany([
        { _model: 'permission', name: 'post:read', description: 'Lire les articles' },
        { _model: 'permission', name: 'post:write', description: 'Écrire des articles' },
        { _model: 'permission', name: 'post:delete', description: 'Supprimer des articles' },
        { _model: 'permission', name: 'user:manage', description: 'Gérer les utilisateurs' }
    ]);
    permRead = permissions.insertedIds[0];
    permWrite = permissions.insertedIds[1];
    permDelete = permissions.insertedIds[2];
    permManage = permissions.insertedIds[3];

    // 2. Créer les rôles
    const roles = await testDatasColInstance.insertMany([
        { _user: currentTestUser.username, _model: 'role', name: 'Viewer', permissions: [permRead.toString()] },
        { _user: currentTestUser.username, _model: 'role', name: 'Editor', permissions: [permRead.toString(), permWrite.toString()] }
    ]);
    roleViewer = roles.insertedIds[0];
    roleEditor = roles.insertedIds[1];

    // 3. Créer les utilisateurs
    const users = await testDatasColInstance.insertMany([
        { _user: currentTestUser.username, _model: 'user', roles: [roleEditor.toString()] },
        { _user: currentTestUser.username, _model: 'user', roles: [roleEditor.toString()] }
    ]);
    testUser = {...currentTestUser, _id: users.insertedIds[0].toString(), roles: [roleEditor.toString()] };
    adminUser = {...currentTestUser,  _id: users.insertedIds[1].toString(), roles: [roleEditor.toString()] };

    return testDatasColInstance;
};
let engine;
describe('User Permission Logic', () => {

    // --- SETUP : Création des données de test avant tous les tests ---
    beforeAll(async () => {
        Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow","user", "assistant", "auth-google", "auth-saml", "auth-microsoft"]);
        engine = await initEngine();

    });

    // --- Tests pour la fonction principale de calcul ---
    describe('getUserActivePermissions()', () => {

        it('should return base permissions from the user\'s role', async () => {
            const coll = await setupTestContext();
            const permissions = await getUserActivePermissions(testUser);
            expect(permissions).to.be.an.instanceOf(Set);
            expect(permissions.size).to.equal(2);
            expect(permissions.has('post:read')).to.be.true;
            expect(permissions.has('post:write')).to.be.true;
            expect(permissions.has('post:delete')).to.be.false;
            await coll.drop();
        });

        it('should grant a temporary permission via an exception', async () => {
            const coll = await setupTestContext();
            // Ajoute une exception qui donne la permission de supprimer, expirant demain
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            await coll.insertOne({
                _model: 'userPermission',
                user: testUser._id,
                permission: permDelete,
                isGranted: true,
                expiresAt: futureDate
            });

            const permissions = await getUserActivePermissions(testUser);
            expect(permissions.size).to.equal(3);
            expect(permissions.has('post:delete')).to.be.true;

            // Nettoyage de l'exception pour ne pas affecter les autres tests
            await coll.deleteOne({ _model: 'userPermission', user: testUser._id });

            await coll.drop();
        });

        it('should NOT grant an expired temporary permission', async () => {
            const coll = await setupTestContext();
            // Ajoute une exception qui a expiré hier
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            await coll.insertOne({
                _model: 'userPermission',
                user: testUser._id,
                permission: permDelete,
                isGranted: true,
                expiresAt: pastDate
            });

            const permissions = await getUserActivePermissions(testUser);
            expect(permissions.size).to.equal(2); // Revient la normale
            expect(permissions.has('post:delete')).to.be.false;

            await coll.deleteOne({ _model: 'userPermission', user: testUser._id });
            await coll.drop();
        });

        it('should revoke a base permission via an exception', async () => {
            const coll = await setupTestContext();
            // L'utilisateur est "Editor", mais on lui retire le droit d'écriture temporairement
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            await coll.insertOne({
                _model: 'userPermission',
                user: testUser._id,
                permission: permWrite,
                isGranted: false, // Révocation
                expiresAt: futureDate
            });

            const permissions = await getUserActivePermissions(testUser);
            expect(permissions.size).to.equal(1);
            expect(permissions.has('post:read')).to.be.true;
            expect(permissions.has('post:write')).to.be.false; // La permission a été retirée

            await coll.deleteOne({ _model: 'userPermission', user: testUser._id });
            await coll.drop();
        });

        it('should restore a revoked permission if the revocation has expired', async () => {
            const coll = await setupTestContext();
            // La révocation a expiré, l'utilisateur devrait retrouver son droit d'écriture
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            await coll.insertOne({
                _model: 'userPermission',
                user: testUser._id,
                permission: permWrite,
                isGranted: false,
                expiresAt: pastDate
            });

            const permissions = await getUserActivePermissions(testUser);
            expect(permissions.size).to.equal(2);
            expect(permissions.has('post:write')).to.be.true; // La permission est de retour

            await coll.deleteOne({ _model: 'userPermission', user: testUser._id });
            await coll.drop();
        });
    });

    // --- Tests pour la fonction publique `hasPermission` ---
    describe('hasPermission()', () => {
        it('should return true for a permission the user has', async () => {
            const coll = await setupTestContext();
            const result = await hasPermission('post:read', testUser);
            expect(result).to.be.true;
            await coll.drop();
        });

        it('should return false for a permission the user does not have', async () => {
            const coll = await setupTestContext();
            const result = await hasPermission('user:manage', testUser);
            expect(result).to.be.false;
            await coll.drop();
        });

        it('should return true if user has at least one of the required permissions', async () => {
            const coll = await setupTestContext();
            const result = await hasPermission(['user:manage', 'post:write'], testUser);
            expect(result).to.be.true;
            await coll.drop();
        });

        it('should return false if user has none of the required permissions', async () => {
            const coll = await setupTestContext();
            const result = await hasPermission(['user:manage', 'post:delete'], testUser);
            expect(result).to.be.false;
            await coll.drop();
        });
    });

    describe('hasPermission() with environment context', () => {
        let user, coll;
        let permRead, permWrite;
        let envProdId, envStagingId;

        beforeAll(async () => {
            // --- Setup ---
            coll = await setupTestContext();
            user = currentTestUser; // Récupère l'utilisateur du contexte

            // 1. Créer les permissions
            const perms = await coll.insertMany([
                { _model: 'permission', name: 'env:read', _user: user.username },
                { _model: 'permission', name: 'env:write', _user: user.username }
            ]);
            permRead = perms.insertedIds[0];
            permWrite = perms.insertedIds[1];

            // 2. Créer les environnements
            const envs = await coll.insertMany([
                { _model: 'env', name: 'prod', _user: user.username },
                { _model: 'env', name: 'staging', _user: user.username }
            ]);
            envProdId = envs.insertedIds[0].toString();
            envStagingId = envs.insertedIds[1].toString();

            // 3. Créer un rôle de base et l'assigner à l'utilisateur
            const role = await coll.insertOne({
                _model: 'role',
                name: 'EnvTester',
                permissions: [permRead.toString()],
                _user: user.username
            });
            await coll.updateOne(
                { _id: user._id },
                { $set: { roles: [role.insertedId.toString()] } }
            );
            // Mettre à jour l'objet utilisateur en mémoire
            user.roles = [role.insertedId.toString()];
            user.permissions = ['env:read'];
        });

        afterAll(async () => {
            await coll.drop();
        });

        afterEach(async () => {
            // Nettoyer les exceptions de permission après chaque test
            await coll.deleteMany({ _model: 'userPermission', user: user._id });
        });

        it('should grant permission if exception is global (no env)', async () => {
            await coll.insertOne({
                _model: 'userPermission', user: user._id, permission: permWrite, isGranted: true
            });
            // L'utilisateur doit avoir la permission dans n'importe quel environnement
            expect(await hasPermission(['env:write'], user, envProdId)).toBe(true);
            expect(await hasPermission(['env:write'], user, envStagingId)).toBe(true);
            expect(await hasPermission(['env:write'], user, null)).toBe(true); // Environnement par défaut
        });

        it('should grant permission only in the specified environment', async () => {
            await coll.insertOne({
                _model: 'userPermission', user: user._id, permission: permWrite, isGranted: true, env: envProdId
            });
            // L'utilisateur ne doit avoir la permission qu'en 'prod'
            expect(await hasPermission(['env:write'], user, envProdId)).toBe(true);
            expect(await hasPermission(['env:write'], user, envStagingId)).toBe(false);
            expect(await hasPermission(['env:write'], user, null)).toBe(false);
        });

        it('should revoke a base permission globally if exception has no env', async () => {
            await coll.insertOne({
                _model: 'userPermission', user: user._id, permission: permRead, isGranted: false
            });
            // La permission de lecture (du rôle) doit être révoquée partout
            expect(await hasPermission(['env:read'], user, envProdId)).toBe(false);
            expect(await hasPermission(['env:read'], user, envStagingId)).toBe(false);
            expect(await hasPermission(['env:read'], user, null)).toBe(false);
        });

        it('should revoke a base permission only in the specified environment', async () => {
            await coll.insertOne({
                _model: 'userPermission', user: user._id, permission: permRead, isGranted: false, env: envStagingId
            });
            // La permission de lecture ne doit être révoquée qu'en 'staging'
            expect(await hasPermission(['env:read'], user, envProdId)).toBe(true);
            expect(await hasPermission(['env:read'], user, envStagingId)).toBe(false);
            expect(await hasPermission(['env:read'], user, null)).toBe(true);
        });

        it('should prioritize specific env revocation over a global grant', async () => {
            await coll.insertMany([
                // On accorde 'env:write' partout
                { _model: 'userPermission', user: user._id, permission: permWrite, isGranted: true },
                // Mais on le révoque spécifiquement pour 'staging'
                { _model: 'userPermission', user: user._id, permission: permWrite, isGranted: false, env: envStagingId }
            ]);

            expect(await hasPermission(['env:write'], user, envProdId)).toBe(true);
            expect(await hasPermission(['env:write'], user, envStagingId)).toBe(false);
            expect(await hasPermission(['env:write'], user, null)).toBe(true);
        });
    });
});