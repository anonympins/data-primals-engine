import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { hasPermission, onInit } from '../src/modules/user.js';
import { Config } from '../src/config.js';
import { initEngine, generateUniqueName } from '../src/setenv.js';
import { getCollection, getCollectionForUser } from '../src/modules/mongodb.js';
import { Logger } from '../src/gameObject.js';
import { insertData, deleteData, deleteModels, createModel } from '../src/index.js';

let engine;
let logger;

describe('User Permission System with Filters', () => {
    let collection;
    let testUser, testUserWithRole, systemUser;
    let permNoFilter, permWithSimpleFilter, permWithUserFilter, permWithReqFilter, permOrderEditForManager;
    let roleWithPerms;

    beforeAll(async () => {
        Config.Set("modules", ["mongodb", "data", "file", "bucket", "workflow", "user", "assistant"]);
        engine = await initEngine();
        logger = engine.getComponent(Logger);
        await onInit(engine);
    });

    beforeEach(async () => {
        // Utiliser un utilisateur unique pour l'isolation des tests
        const username = generateUniqueName('perm_test_user');
        testUser = { _id: new ObjectId(), username: username, _user: username, roles: [], _model: 'user' };
        testUserWithRole = { _id: new ObjectId(), username: username, _user: username, roles: [], _model: 'user' }; // roles sera ajouté après la création du rôle
        systemUser = { roles: ['admin', 'product.view'] };

        collection = await getCollectionForUser(testUser);
        await collection.deleteMany({ _user: username });

        // --- Création des données de test ---
        // Créer les modèles nécessaires pour les permissions et les rôles
        await createModel({ name: 'permission', _user: username, fields: [{ name: 'name', type: 'string' }, { name: 'filter', type: 'code' }] });
        await createModel({ name: 'role', _user: username, fields: [{ name: 'name', type: 'string' }, { name: 'permissions', type: 'relation', relation: 'permission', multiple: true }] });
        await createModel({ name: 'userPermission', _user: username, fields: [{ name: 'user', type: 'relation', relation: 'user' }, { name: 'permission', type: 'relation', relation: 'permission' }, { name: 'isGranted', type: 'boolean' }, { name: 'filter', type: 'code' }] });

        const permResult = await collection.insertMany([
            { _model: 'permission', name: 'product.view', _user: username },
            { _model: 'permission', name: 'order.edit', filter: { status: 'pending' }, _user: username },
            { _model: 'permission', name: 'document.edit', filter: { createdBy: '{user._id}' }, _user: username },
            { _model: 'permission', name: 'login.attempt', filter: { "ip": "{req.ip}" }, _user: username }
        ]);
        permNoFilter = permResult.insertedIds[0];
        permWithSimpleFilter = permResult.insertedIds[1];
        permWithUserFilter = permResult.insertedIds[2];
        permWithReqFilter = permResult.insertedIds[3];

        const roleResult = await collection.insertOne({
            _model: 'role',
            name: 'Editor',
            permissions: [permNoFilter.toString(), permWithSimpleFilter.toString()],
            _user: username
        });
        roleWithPerms = roleResult.insertedId;

        // Assigner le rôle à l'utilisateur de test
        testUserWithRole.roles = [roleWithPerms.toString()];
    });

    afterEach(async () => {
        // Nettoyer les données créées
        if (collection) {
            await collection.deleteMany({ _user: testUser.username });
        }
        await deleteModels({ _user: testUser.username });
    });

    it('should return true for a permission without filter granted by a role', async () => {
        const result = await hasPermission('product.view', testUserWithRole);
        expect(result).toBe(true);
    });

    it('should return a simple filter object for a permission with filter granted by a role', async () => {
        const result = await hasPermission('order.edit', testUserWithRole);
        expect(result).toEqual({ status: 'pending' });
    });

    it('should return false if user does not have the permission', async () => {
        const result = await hasPermission('document.edit', testUserWithRole);
        expect(result).toBe(false);
    });

    it('should grant a permission with a filter via userPermission exception', async () => {
        await collection.insertOne({
            _model: 'userPermission',
            user: testUser._id.toString(),
            permission: permWithUserFilter.toString(),
            isGranted: true,
            _user: testUser.username
        });

        const result = await hasPermission('document.edit', testUser);
        expect(result).toEqual({ createdBy: testUser._id.toString() });
    });

    it('should substitute user._id in the filter', async () => {
        await collection.insertOne({
            _model: 'userPermission',
            user: testUserWithRole._id.toString(),
            permission: permWithUserFilter.toString(),
            isGranted: true,
            _user: testUser.username
        });

        const result = await hasPermission('document.edit', testUserWithRole);
        expect(result).toEqual({ createdBy: testUserWithRole._id.toString() });
    });

    it('should substitute request context variables like req.ip', async () => {
        await collection.insertOne({
            _model: 'userPermission',
            user: testUser._id.toString(),
            permission: permWithReqFilter.toString(),
            isGranted: true,
            _user: testUser.username
        });

        const mockReq = {
            ip: '192.168.1.100',
            query: { from: 'test' },
            body: { name: 'test-body' },
            params: { id: '123' }
        };

        const result = await hasPermission('login.attempt', testUser, null, mockReq);
        expect(result).toEqual({ ip: '192.168.1.100' });
    });

    it('should revoke a permission from a role via userPermission exception', async () => {
        let result = await hasPermission('order.edit', testUserWithRole);
        expect(result).toEqual({ status: 'pending' });

        await collection.insertOne({
            _model: 'userPermission',
            user: testUserWithRole._id.toString(),
            permission: permWithSimpleFilter.toString(),
            isGranted: false,
            _user: testUser.username
        });

        result = await hasPermission('order.edit', testUserWithRole);
        expect(result).toBe(false);
    });

    it('should override a role filter with a userPermission filter', async () => {
        const permResult = await collection.insertOne({
            _model: 'permission',
            name: 'order.edit',
            filter: { manager_id: '{user._id}' },
            _user: testUser.username
        });
        permOrderEditForManager = permResult.insertedId;

        await collection.insertOne({
            _model: 'userPermission',
            user: testUserWithRole._id.toString(),
            permission: permOrderEditForManager.toString(),
            isGranted: true,
            _user: testUser.username
        });

        const result = await hasPermission('order.edit', testUserWithRole);

        expect(result).toEqual({ manager_id: testUserWithRole._id.toString() });
    });

    it('should use the filter from userPermission when overriding a permission', async () => {
        // Le rôle donne 'order.edit' avec le filtre { status: 'pending' }
        let result = await hasPermission('order.edit', testUserWithRole);
        expect(result).toEqual({ status: 'pending' });

        // On ajoute une exception qui accorde la même permission mais avec un filtre différent
        await collection.insertOne({
            _model: 'userPermission',
            user: testUserWithRole._id.toString(),
            permission: permWithSimpleFilter.toString(), // La permission 'order.edit'
            isGranted: true,
            filter: { "assignedTo": "{user._id}" }, // Le nouveau filtre
            _user: testUser.username
        });

        // La fonction doit maintenant retourner le filtre de l'exception
        result = await hasPermission('order.edit', testUserWithRole);
        expect(result).toEqual({ assignedTo: testUserWithRole._id.toString() });
    });

    it('should fallback to base permission filter if userPermission has no filter', async () => {
        // On accorde 'document.edit' (qui a un filtre { createdBy: '{user._id}' })
        // via une exception qui n'a PAS de filtre personnalisé.
        await collection.insertOne({
            _model: 'userPermission',
            user: testUser._id.toString(),
            permission: permWithUserFilter.toString(), // La permission 'document.edit'
            isGranted: true,
            // Pas de champ 'filter' ici
            _user: testUser.username
        });

        // La fonction doit retourner le filtre de la permission de base.
        const result = await hasPermission('document.edit', testUser);
        expect(result).toEqual({ createdBy: testUser._id.toString() });
    });

    it('should handle non-local users correctly', async () => {
        let result = await hasPermission('product.view', systemUser);
        expect(result).toBe(true);

        result = await hasPermission('order.edit', systemUser);
        expect(result).toBe(false);
    });

    it('should return false and log an error if an exception occurs', async ({skip}) => {
        // Pour simuler une erreur, on peut essayer de requêter avec un utilisateur invalide
        // ou mocker une fonction interne pour qu'elle échoue.
        const getCollectionForUserSpy = vi.spyOn(await import('../src/modules/mongodb.js'), 'getCollectionForUser');
        getCollectionForUserSpy.mockRejectedValueOnce(new Error("DB connection failed"));
        const errorSpy = vi.spyOn(logger, 'error');

        const result = await hasPermission('product.view', testUserWithRole);

        expect(result).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith("Erreur lors de la vérification des permissions :", expect.any(Error));

        getCollectionForUserSpy.mockRestore();
        errorSpy.mockRestore();
    });
});