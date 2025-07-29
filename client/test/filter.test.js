import { describe, it, expect } from 'vitest';
import { buildExpr, buildRootFromExpr } from '../../src/filter.js';

// Fonction utilitaire pour tester la réversibilité (conversion aller-retour)
const testReversibility = (description, builderNode) => {
    it(description, () => {
        // 1. Convertit la structure du constructeur en requête MongoDB
        const mongoQuery = buildExpr(builderNode);

        // 2. Reconvertit la requête MongoDB en structure de constructeur
        const reversedNode = buildRootFromExpr(mongoQuery);

        // 3. Vérifie que la structure inversée est identique à l'originale
        expect(reversedNode).toEqual(builderNode);
    });
};

describe('RuildExpr et buildRootFromExpr', () => {

    describe('Requêtes de base', () => {
        testReversibility('devrait inverser correctement une requête d\'égalité simple', {
            $and: [{ path: ['name'], op: '$eq', value: 'John' }],
        });

        testReversibility('devrait inverser correctement une requête de comparaison numérique ($gt)', {
            $and: [{ path: ['age'], op: '$gt', value: 30 }],
        });

        testReversibility('devrait inverser correctly une requête de comparaison sur un tableau ($in)', {
            $and: [{ path: ['tags'], op: '$in', value: ['tech', 'dev'] }],
        });
    });

    describe('Opérateurs Logiques', () => {
        testReversibility('devrait inverser correctement une requête $and simple', {
            $and: [
                { path: ['status'], op: '$eq', value: 'active' },
                { path: ['age'], op: '$lt', value: 40 },
            ],
        });

        testReversibility('devrait inverser correctement une requête $or simple', {
            $or: [
                { path: ['category'], op: '$eq', value: 'A' },
                { path: ['category'], op: '$eq', value: 'B' },
            ],
        });

        testReversibility('devrait inverser correctement une requête logique imbriquée', {
            $and: [
                {
                    $or: [
                        { path: ['a'], op: '$eq', value: 1 },
                        { path: ['b'], op: '$eq', value: 2 },
                    ],
                },
                { path: ['c'], op: '$eq', value: 3 },
            ],
        });
    });

    describe('Opérateurs Spéciaux', () => {
        testReversibility('devrait inverser correctement une requête $exists: true', {
            $and: [{ path: ['optionalField'], op: '$exists', value: true }],
        });

        testReversibility('devrait inverser correctement une requête $exists: false', {
            $and: [{ path: ['optionalField'], op: '$exists', value: false }],
        });

        testReversibility('devrait inverser correctly une requête $regex', {
            $and: [{ path: ['name'], op: '$regex', value: '^John' }],
        });
    });

    describe('Requêtes sur les Relations ($find)', () => {
        testReversibility('devrait inverser correctement une requête sur un champ lié', {
            $and: [{ path: ['user', 'name'], op: '$eq', value: 'test' }],
        });

        testReversibility('devrait inverser correctement une requête complexe sur un champ lié', {
            $and: [
                { path: ['company', 'address', 'city'], op: '$eq', value: 'Paris' },
            ],
        });
    });

    describe('Réversibilité avec Transformations (Problèmes connus)', () => {
        // NOTE : Les tests suivants sont conçus pour échouer avec l'implémentation actuelle.
        // La fonction `buildTransformExpr` gère mal les opérateurs unaires (comme $year)
        // en ajoutant systématiquement le chemin du champ, et la logique de `reverseTransformExpr`
        // ne peut pas séparer de manière fiable le chemin du champ des arguments constants lors de l'inversion.

        it('devrait inverser une transformation unaire ($year) avec un opérateur', () => {
            const builderNode = {
                $and: [{
                    path: ['createdAt'],
                    transform: { op: '$year', args: [] }, // Opérateur unaire, sans argument supplémentaire
                    op: '$eq',
                    value: 2024,
                }],
            };
            const mongoQuery = buildExpr(builderNode);
            const reversedNode = buildRootFromExpr(mongoQuery);
            expect(reversedNode).toEqual(builderNode);
        });

        it('devrait inverser une transformation avec arguments ($add) et un opérateur', () => {
            const builderNode = {
                $and: [{
                    path: ['price'],
                    transform: { op: '$add', args: [10] }, // Opérateur binaire avec un argument constant
                    op: '$gt',
                    value: 100,
                }],
            };
            const mongoQuery = buildExpr(builderNode);
            const reversedNode = buildRootFromExpr(mongoQuery);
            expect(reversedNode).toEqual(builderNode);
        });

        it('devrait inverser une transformation pure (sans opérateur)', () => {
            const builderNode = {
                $and: [{
                    path: ['name'],
                    transform: { op: '$toString', args: [] },
                    // Pas d'opérateur `op` ou de `value` ici
                }],
            };
            const mongoQuery = buildExpr(builderNode);
            const reversedNode = buildRootFromExpr(mongoQuery);
            expect(reversedNode).toEqual(builderNode);
        });
    });

    testReversibility('devrait gérer $multiply avec plusieurs arguments', {
        $and: [{
            path: ['price'],
            transform: { op: '$multiply', args: [1.2, 0.9] }, // 20% de TVA puis 10% de réduction
            op: '$gt',
            value: 100
        }]
    });

    testReversibility('devrait gérer $subtract avec un argument', {
        $and: [{
            path: ['age'],
            transform: { op: '$subtract', args: [5] }, // âge - 5
            op: '$gt',
            value: 18
        }]
    });

    testReversibility('devrait gérer $mod avec un argument', {
        $and: [{
            path: ['count'],
            transform: { op: '$mod', args: [2] }, // count % 2
            op: '$eq',
            value: 0
        }]
    });

    describe('Fonctions de date', () => {
        testReversibility('devrait gérer $month avec un opérateur', {
            $and: [{
                path: ['birthDate'],
                transform: { op: '$month', args: [] },
                op: '$eq',
                value: 12 // Décembre
            }]
        });

        testReversibility('devrait gérer $hour avec un opérateur', {
            $and: [{
                path: ['loginTime'],
                transform: { op: '$hour', args: [] },
                op: '$gt',
                value: 9 // Après 9h
            }]
        });
    });

    describe('Conversions imbriquées corrigées', () => {
        testReversibility('devrait gérer $toString de $year avec égalité', {
            $and: [{
                path: ['createdAt'],
                transform: {
                    op: '$toString',
                    args: [{ op: '$year', args: [] }]
                },
                op: '$eq',
                value: "2024"
            }]
        });

        testReversibility('devrait gérer $toInt de $add avec comparaison', {
            $and: [{
                path: ['price'],
                transform: {
                    op: '$toInt',
                    args: [{ op: '$add', args: [10, 5] }]
                },
                op: '$lt',
                value: 100
            }]
        });

        testReversibility('devrait gérer une triple imbrication ($toString de $year de $add)', {
            $and: [{
                path: ['dateField'],
                transform: {
                    op: '$toString',
                    args: [{
                        op: '$year',
                        args: [{
                            op: '$add',
                            args: [1000*60*60*24*7] // Ajoute 7 jours
                        }]
                    }]
                },
                op: '$eq',
                value: "2024"
            }]
        });
    });

    describe('Cas limites', () => {
        it('devrait gérer un chemin vide', () => {
            const builderNode = { $and: [{ path: [], op: '$eq', value: 'test' }] };
            const mongoQuery = buildExpr(builderNode);
            expect(mongoQuery).toEqual({});
        });

        it('devrait gérer une valeur null', () => {
            const builderNode = { $and: [{ path: ['field'], op: '$eq', value: null }] };
            const mongoQuery = buildExpr(builderNode);
            const reversedNode = buildRootFromExpr(mongoQuery);
            expect(reversedNode).toEqual(builderNode);
        });

        it('devrait gérer une valeur undefined', () => {
            const builderNode = { $and: [{ path: ['field'], op: '$eq', value: undefined }] };
            const mongoQuery = buildExpr(builderNode);
            const reversedNode = buildRootFromExpr(mongoQuery);
            expect(reversedNode.$and[0].value).toBeUndefined();
        });
    });

    describe('Opérateurs logiques complexes', () => {
        testReversibility('devrait gérer une combinaison $and/$or imbriquée', {
            $and: [
                { path: ['status'], op: '$eq', value: 'active' },
                {
                    $or: [
                        { path: ['age'], op: '$lt', value: 30 },
                        { path: ['premium'], op: '$eq', value: true }
                    ]
                }
            ]
        });

        testReversibility('devrait gérer une condition avec transformation dans un $or', {
            $or: [
                { path: ['price'], transform: { op: '$multiply', args: [0.9] }, op: '$lt', value: 50 },
                { path: ['category'], op: '$eq', value: 'SPECIAL' }
            ]
        });
    });

    describe('Relations multiples', () => {
        testReversibility('devrait gérer plusieurs niveaux de relations', {
            $and: [{
                path: ['company', 'department', 'manager', 'name'],
                op: '$eq',
                value: 'John Smith'
            }]
        });

        testReversibility('devrait gérer une transformation sur une relation', {
            $and: [{
                path: ['orders', 'total'],
                transform: { op: '$multiply', args: [1.2] }, // Ajoute 20% de TVA
                op: '$gt',
                value: 1000
            }]
        });
    });

    describe('Opérateurs divers', () => {
        testReversibility('devrait gérer $concat avec plusieurs arguments', {
            $and: [{
                path: ['firstName'],
                transform: { op: '$concat', args: [' ', 'lastName'] }, // Concatène firstName + ' ' + lastName
                op: '$eq',
                value: 'John Doe'
            }]
        });

        testReversibility('devrait gérer $sqrt avec un opérateur', {
            $and: [{
                path: ['area'],
                transform: { op: '$sqrt', args: [] }, // Racine carrée de l'aire
                op: '$gt',
                value: 10
            }]
        });
    });
});