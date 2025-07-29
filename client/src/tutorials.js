// Fichier : src/tutorials.js

export const tutorialsConfig = [
    {
        id: 'contact-management-basics',
        name: 'Gestion des contacts : Les bases',
        description: 'Apprenez les opérations fondamentales : créer et supprimer un contact.',
        icon: 'FaUserPlus',
        stages: [
            {
                stage: 1,
                tourName: 'tour-create-contact', // Nom du tour guidé à lancer
                name: 'Créez votre premier contact',
                description: 'Ajoutez un nouveau contact avec le prénom "Richard".',
                completionCondition: { model: 'contact', limit: 1, filter: { "firstName": "Richard" } }
            },
            {
                stage: 2,
                tourName: 'tour-delete-contact',
                name: 'Effacez vos traces',
                description: 'Maintenant, supprimez le contact "Richard" que vous venez de créer.',
                // La condition pour valider une suppression est de vérifier que le nombre d'éléments correspondants est 0.
                completionCondition: { model: 'contact', limit: 0, filter: { "firstName": "Richard" } }
            }
        ],
        rewards: {
            xpBonus: 150,
            achievement: 'CONTACT_MANAGER_NOVICE',
            notification: { title: 'Gestionnaire de contacts', message: 'Vous maîtrisez les bases de la gestion de contacts !' }
        }
    },
    {
        id: 'advanced-permissions',
        name: 'Permissions & rôles',
        description: 'Maîtrisez la gestion des droits du bout des doigts !',
        icon: 'FaUserShield',
        stages: [
            {
                stage: 1,
                tourName: 'tour-set-permissions',
                name: 'Gestion des droits utilisateurs',
                description: 'Trouvez l\'utilisateur "userTuto" et donnez-lui le droit "visitor".',
                completionCondition: {model: 'user', limit: 1, filter: {"username": "userTuto", "roles": { "$find": {"$eq":["$$this.name","visitor"]}}}}
            },
            {
                stage: 2,
                tourName: 'tour-create-role',
                name: 'Créer un nouveau rôle',
                description: 'Créez un rôle personnalisé nommé "Modérateur".',
                // Condition : un document dans le modèle 'role' avec le nom 'Modérateur' doit exister.
                // (On suppose ici l'existence d'un modèle 'role' pour gérer les rôles).
                completionCondition: { model: 'role', limit: 1, filter: { "name": "moderator" } }
            },
            {
                stage: 3,
                tourName: 'tour-assign-permission-to-role',
                name: 'Ajouter une permission au rôle',
                description: 'Modifiez le rôle "moderator" pour lui ajouter la permission "API_EDIT_DATA_content".',
                // Condition : le rôle 'Modérateur' doit avoir une permission nommée 'delete_contact'.
                // (On suppose que le modèle 'role' a un champ 'permissions' qui est un tableau de relations).
                completionCondition: { model: 'role', limit: 1, filter: { "name": "moderator", "permissions": { "$find": { "$eq": ["$$this.name", "API_EDIT_DATA_content"] } } } }
            },
            {
                stage: 4,
                tourName: 'tour-assign-role-to-user',
                name: 'Promouvoir un utilisateur',
                description: 'Maintenant, assignez votre rôle "moderator" à l\'utilisateur "userTuto".',
                // Condition : l'utilisateur 'userTuto' doit maintenant aussi avoir le rôle 'Modérateur'.
                completionCondition: { model: 'user', limit: 1, filter: { "username": "userTuto", "roles": { "$find": { "$eq": ["$$this.name", "moderator"] } } } }
            }
        ],
        rewards: {
            xpBonus: 500,
            achievement: 'PERMISSION_ARCHITECT',
            notification: { title: 'Architecte des Permissions', message: 'Vous savez maintenant comment finement gérer les accès !' }
        }
    },
    {
        id: 'requests',
        name: 'Suivi d\'Activité',
        description: 'Découvrez les succès liés à l\'activité.',
        icon: 'FaUserShield',
        stages: [
            {
                stage: 1,
                tourName: null, // Pas de tour guidé, l'action peut se faire n'importe où
                name: 'Première requête',
                description: 'Effectuez des actions pour générer 50 requêtes système pour débloquer votre premier succès d\'activité.',
                completionCondition: {model: 'request', limit: 50, filter: {}}
            },
            {
                stage: 2,
                tourName: null,
                name: 'Activité soutenue',
                description: 'Continuez votre activité et atteignez 250 requêtes pour le prochain palier.',
                completionCondition: {model: 'request', limit: 250, filter: {}}
            },
            {
                stage: 3,
                tourName: null,
                name: 'Expert en requêtes',
                description: 'Impressionnant ! Atteignez 1000 requêtes pour prouver votre maîtrise.',
                completionCondition: {model: 'request', limit: 1000, filter: {}}
            }
        ],
        rewards: {
            xpBonus: 1000,
            achievement: 'REQUEST_MASTER',
            notification: { title: 'Maître des Requêtes', message: 'Votre activité sur le réseau est remarquable !' }
        }
    }
];