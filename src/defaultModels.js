// Définition des structures de modèles
export const defaultModels = {
    permission: {
        "name": "permission",
        "icon": "FaKey",
        "description": "",
        "fields": [
            {
                "name": "name",
                "type": "string_t",
                color: '#757BCC'
            },
            {
                "name": "description",
                "type": "richtext"
            }
        ]
    },
    role: {
        name: 'role',
        "icon": "FaUserTag",
        "description": "",
        fields: [
            { name: 'name', type: 'string_t', required: true, unique: true, color: '#363636' },
            { name: 'permissions', type: 'relation', multiple: true, relation: 'permission' }
        ]
    },
    user: {
        name: 'user',
        "description": "",
        "icon": "FaUser",
        locked: true,
        fields: [
            { name: 'username', type: 'string', required: true, unique: true, color: '#3C7D08' },
            { name: 'password', type: 'password' },
            {
                "name": "gender",
                "type": "enum",
                "items": ["male", "female", "other", "prefer_not_to_say"]
            },
            { name: 'contact', type: 'relation', relation: 'contact' },
            { name: 'roles', type: 'relation', multiple: true, relation: 'role' },
            { name: 'lang', type: 'relation', relation: 'lang', color: '#4CACCD'  },
            {
                "name": "profilePicture",
                "type": "file",
                "mimeTypes": ["image/jpeg", "image/png"]
            },
            { name: 'tokens', type: 'relation', multiple: true, relation: 'token' }
        ]
    },
    userPermission: {
        "icon": "FaUserCheck",
        "name": "userPermission",
        "description": "Gère les exceptions aux permissions des rôles pour un utilisateur (ajouts ou retraits, permanents ou temporaires).",
        "fields": [
            {
                "name": "user",
                "type": "relation",
                "relation": "user",
                "required": true,
                "index": true
            },
            {
                "name": "permission",
                "type": "relation",
                "relation": "permission",
                "required": true,
                "index": true
            },
            {
                "name": "isGranted",
                "type": "boolean",
                "required": true,
                "hint": "True pour accorder la permission, False pour la révoquer explicitement."
            },
            {
                "name": "expiresAt",
                "type": "datetime",
                "required": false,
                "index": true,
                "hint": "Si défini, l'exception (l'octroi ou la révocation) est temporaire."
            }
        ]
    },
    token: {
        name: 'token',
        "icon": "FaKey",
        "description": "",
        fields: [
            { name: 'name', type: 'string' },
            { name: 'value', type: 'password' },
            { name: 'lastRefresh', type: 'datetime' }
        ]
    },
    translation: {
        name: 'translation',
        "icon": "FaLanguage",
        locked: true,
        "description": "",
        fields: [
            { name: 'lang', type: 'relation', 'relation': 'lang', required: true, color: '#4CACCD' },
            { name: 'key', type: 'string', maxlength: 200, required: true },
            { name: 'value', type: 'string' }
        ]
    },
    lang: {
        name: 'lang',
        "icon": "FaGlobe",
        locked: true,
        "description": "",
        fields: [
            { name: 'name', unique: true, type: 'string_t', maxlength: 200, color: '#4CACCD' },
            { name: 'code', type: 'string', maxlength: 5 }
        ]
    },
    currency: {
        name: 'currency',
        "icon": "FaMoneyBill",
        "description": "",
        locked: true,
        fields: [
            { name: 'symbol', type: 'string', required: true, color: '#E0E0E0', maxlength: 20, asMain: true },
            { name: 'code', type: 'string', required: true, unique: true, maxlength: 3, asMain: true },
            { name: 'name', type: 'string_t', required: true, color: '#AE6FA3' },
            { name: 'exchangeRate', type: 'number', required: false },
            { name: 'default', type: 'boolean', default: false }
        ]
    },
    channel: {
        name: 'channel',
        "icon": "FaComments",
        "description": "",
        fields: [
            { name: 'name', type: 'string_t', required: true, unique: true }, // Nom du canal (ex: "email", "SMS")
            { name: 'description', type: 'string_t' },
            { name: 'type', type: 'enum', items: ['web', 'mobile', 'email', 'sms', 'push'], required: true } // Type de canal
        ]
    },
    message: {
        name: 'message',
        "icon": "FaEnvelope",
        "description": "",
        locked: true,
        fields: [
            { name: 'sender', type: 'relation', relation: 'user' }, // Utilisateur émetteur (si applicable, sinon système)
            { name: 'recipient', type: 'relation', relation: 'user' }, // Utilisateur destinataire
            { name: 'lang', type: 'relation', relation: 'lang' }, // Utilisateur destinataire
            { name: 'subject', type: 'string' }, // Sujet de la notification (ex: titre de l'email)
            { name: 'content', type: 'richtext', required: true }, // Contenu du message (localisable)
            { name: 'channels', type: 'relation', multiple: true, relation: 'channel' }, // Canaux de diffusion (email, SMS, forum, etc.)
            { name: 'status', type: 'enum', items: ['pending', 'sent', 'read', 'failed'] },
            { name: 'sentAt', type: 'datetime' },
            { name: 'readAt', type: 'datetime' },
            { name: 'type', type: 'string' }, // Type de notification (ex: "commande.miseAJour", "messageForum")
            { name: 'priority', type: 'enum', items: ['low', 'medium', 'high']}
        ]
    },
    alert: {
        name: "alert",
        "icon": "FaBell",
        description: "Définit les règles pour les alertes et les insights automatiques.",
        fields: [
            { name: "name", type: "string", required: true, asMain: true },
            { name: "targetModel", type: "model", required: true },
            { name: "description", type: "string_t", multiline: true },
            {
                name: "triggerCondition",
                type: "code",
                language: "json",
                conditionBuilder: true,
                targetModel: '$targetModel',
                required: true,
                hint: "La condition qui, si elle est remplie, déclenchera l'alerte."
            },
            {
                name: "frequency",
                type: "cronSchedule",
                required: true,
                cronMask: [false, true, true, true, true, true],
                hint: "À quelle fréquence vérifier si la condition est remplie."
            },
            { name: "isActive", type: "boolean", default: true },
            {
                name: "sendEmail",
                type: "boolean",
                default: false,
                hint: "Cochez pour envoyer également une notification par e-mail."
            },
            {
                name: "lastNotifiedAt",
                type: "datetime",
                required: false, // Important: ce champ est géré par le système
                hint: "Timestamp de la dernière notification envoyée pour cette alerte."
            },
            {
                name: "message",
                type: "richtext_t",
                required: false,
                hint: "Message personnalisé pour l'e-mail. Si vide, un message par défaut sera utilisé. Vous pouvez utiliser les variables {count}, {alert.name}....",
                condition: { $eq: ["$sendEmail", true] }
            }
        ]
    },
    env: {
        name: "env",
        "icon": "FaCog",
        description: "Définit les variables d'environnement qui seront accessibles dans vos scripts et webhooks.",
        fields: [
            { name: "name", type: "string", required: true, unique: true, asMain: true },
            { name: "value", type: "string", anonymized: true, hiddenable: true }
        ]
    },
    webpage: {
        name: 'webpage',
        "icon": "FaFileAlt",
        locked: true,
        "description": "",
        fields: [
            { name: 'title', type: 'string_t', required: true, color: '#659DE6' },
            { name: 'path', type: 'string', required: true, unique: true, color: '#DEDEDE' },
            { name: 'html', type: 'richtext' },
            { name: 'published', type: 'boolean', default: false },
            { name: 'inSitemap', type: 'boolean', default: true },
            { name: 'description', type: 'string' },
            { name: 'keywords', type: 'relation', relation: 'taxonomy', multiple: true },
            { name: 'image', type: 'url' },
            { name: 'category', type: 'relation', relation: 'taxonomy' }
        ]
    },
    content: {
        name: 'content',
        "icon": "FaFileAlt",
        "description": "",
        fields: [
            { name: 'lang', type: 'relation', relation: 'lang' },
            { name: 'title', type: 'string_t', required: true },
            { name: 'slug', type: 'string' },
            { name: 'html', type: 'richtext_t' },
            { name: 'image', type: 'file', mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] },
            { name: 'published', type: 'boolean' },
            { name: 'publishedAt', type: 'datetime' },
            { name: 'author', type: 'relation', relation: 'user' },
            { name: 'category', type: 'relation', relation: 'taxonomy', "relationFilter": {
                "path": [
                    "type"
                ],
                "op": "$eq",
                "value": "category"
            } },
            { name: 'keywords', type: 'relation', relation: 'taxonomy', multiple: true, "relationFilter": {
                "path": [
                    "type"
                ],
                "op": "$eq",
                "value": "keyword"
            } },
            { name: 'order', type: 'number', step: 1, default: 0 },
            { name: 'inSitemap', type: 'boolean', default: false }
        ]
    },
    resource: {
        name: 'resource',
        "icon": "FaBoxOpen",
        "description": "",
        fields: [
            { name: "source", type: "url"},
            { name: "file", type: "file"}
        ]
    },
    taxonomy: {
        name: 'taxonomy',
        "icon": "FaTags",
        "description": "",
        fields: [
            { name: 'name', type: 'string_t', required: true, color: '#71A314' },
            { name: 'parent', type: 'relation', relation: 'taxonomy', color: '#233607' }, // Relation vers la taxonomie parente
            { name: 'type', type: 'enum', items: ['keyword', 'category'], color: '#BFBFBF' },
            { name: 'identifier', type: 'string' },
            { name: 'order', type: 'number', step: 1, default: 0 },
            { name: 'description', type: 'richtext' }
        ]
    },
    contact: {
        locked: true,
        name: 'contact',
        "icon": "FaAddressBook",
        "description": "",
        fields: [
            { name: 'legalName', type: 'string', asMain: true, color: '#D9D9D9' },
            { name: 'firstName', type: 'string', asMain: true},
            { name: 'lastName', type: 'string', asMain: true },
            { name: 'email', type: 'email', color: '#F4ECE2' },
            { name: 'phone', type: 'phone', color: '#B4A693' },
            { name: 'location', type: 'relation', relation: 'location' }
        ]
    },

    location: {
        "name": "location",
        "icon": "FaMapMarkerAlt",
        locked: true,
        "description": "",
        "fields": [
            {
                "name": "address_1",
                "type": "string",
                asMain: true,
                color: '#D6D6D6'
            },
            {
                "name": "address_2",
                "type": "string"
            },
            {
                "name": "address_3",
                "type": "string"
            },
            {
                "name": "address_4",
                "type": "string"
            },
            {
                "name": "city",
                "type": "string",
                asMain: true,
                color: '#E63345'
            },
            {
                "name": "postalCode",
                "type": "string",
                asMain: true,
                color: '#8B1D1D'
            },
            {
                "name": "region",
                "type": "string"
            },
            {
                "name": "country",
                "type": "string",
                color: "#4F80BF",
                asMain: true
            },
            {
                "name": "latitude",
                "type": "number",
                "unit": "°"
            },
            {
                "name": "longitude",
                "type": "number",
                "unit": "°"
            }
        ]
    },

    brand: {
        name: 'brand',
        "icon": "FaTrademark",
        "description": "",
        fields: [
            { name: 'name', type: 'string', required: true },
            { name: 'logo', type: 'file' },
            { name: 'company', type: 'relation', relation: 'contact' }
        ]
    },

    product: {
        name: 'product',
        "icon": "FaShoppingBag",
        "description": "",
        fields: [
            { name: 'name', type: 'string_t', required: true },
            { name: 'image', type: 'array', itemsType: 'file', mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] },
            { name: 'description', type: 'richtext_t' },
            { name: 'price', type: 'number', required: true },
            { name: 'currency', type: 'relation', relation: 'currency', required: true },
            { name: 'billingFrequency', type: 'enum', items: ['aucune', 'au mois', 'à l\'année'] },
            { name: 'slug', type: 'string', required: true, unique: true },
            { name: 'brand', type: 'relation', relation: 'brand' },
            { name: 'category', type: 'relation', relation: 'taxonomy' },
            { name: 'seoTitle', type: 'string_t' },
            { name: 'seoDescription', type: 'string_t' }
        ]
    },
    productVariant: {
        name: 'productVariant',
        "icon": "FaBox",
        "description": "",
        fields: [
            { name: 'product', type: 'relation', relation: 'product', required: true },
            { name: 'size', type: 'string' },
            { name: 'color', type: 'color' },
            { name: 'sku', type: 'string', unique: true },
            { name: 'price', type: 'number', required: true },
            { name: 'currency', type: 'relation', relation: 'currency', required: true },
            { name: 'stock', type: 'number', default: 0 },
            { name: 'description', type: 'richtext' },
            { name: 'image', type: 'url' }
        ]
    },
    cart: {
        name: 'cart',
        "icon": "FaShoppingCart",
        "description": "",
        fields: [
            { name: 'user', type: 'relation', relation: 'user', required: true },
            { name: 'items', type: 'relation', relation: 'cartItem', multiple: true },
            { name: 'creationDate', type: 'datetime', required: true },
            { name: 'lastUpdate', type: 'datetime', required: true },
            { name: 'active', type: 'boolean', default: true }
        ]
    },
    cartItem: {
        name: 'cartItem',
        "icon": "FaShoppingBasket",
        "description": "",
        fields: [
            { name: 'product', type: 'relation', relation: 'product', required: true },
            { name: 'quantity', type: 'number', required: true, min: 1, step: 1 },
            { name: 'variant', type: 'relation', relation: 'productVariant' } // Optionnel, si vous avez des variantes
        ]
    },
    discount: {
        name: "discount",
        "icon": "FaTicketAlt",
        locked: true,
        "description": "",
        fields: [
            { "name": "code", "type": "string", "required": true, "unique": true },
            { "name": "productSelection", "type": "relation", "relation": "product", "required": false, multiple: true },
            { "name": "description", "type": "richtext" },
            { "name": "percentAmount", "type": "number", "unit": "%", default: null, min: 0 },
            { "name": "fixedAmount", "type": "number", default: null, min: 0 },
            { "name": "minAmount", "type": "number", "unit": "€", default: null, min: 0 }, // Montant minimum pour la promotion
            { "name": "minProductQuantity", "type": "number", min: 0 }, // Montant minimum pour la promotion
            { "name": "freeProductQuantity", "type": "number", default: null, min: 0 }, // Quantité de produits offerts
            { "name": "startDate", "type": "datetime" },
            { "name": "endDate", "type": "datetime" }
        ]
    },
    order: {
        name: "order",
        "icon": "FaClipboardList",
        locked: true,
        "description": "",
        fields: [
            { "name": "orderId", "type": "string", "required": true, "unique": true },
            { "name": "orderDate", "type": "datetime" },
            { "name": "status", "type": "enum", items: ["pending", "processing", "shipped", "delivered", "cancelled"] },
            { "name": "products", "type": "relation", "relation": "cartItem", "required": true, multiple: true },
            { "name": "customer", "type": "relation", relation: 'user' }, // Relation vers le modèle 'user'
            { "name": "totalAmount", "type": "number", "required": true },
            { "name": "paymentIntentId", "type": "string", "hint": "Stripe Payment Intent ID for this order." },
            { "name": "currency", "type": "relation", "relation": "currency" },
            { "name": "paymentMethod", "type": "string" },
            { "name": "shippingAddress", "type": "relation", "relation": "location" },
            { "name": "billingAddress", "type": "relation", "relation": "location" },
            { "name": "shippedDate", "type": "datetime" },
            { "name": "deliveryDate", "type": "datetime" },
            { "name": "discount", "type": "relation", relation: 'discount' } // Relation vers le modèle 'promotion'
        ]
    },
    invoice: {
        name: 'invoice',
        "icon": "FaFileInvoice",
        "description": "",
        fields: [
            { name: 'order', type: 'relation', relation: 'order', required: true },
            { name: 'invoiceId', type: 'string', required: true, unique: true },
            { name: 'invoiceDate', type: 'datetime', required: true },
            { name: 'dueDate', type: 'datetime' },
            { name: 'status', type: 'enum', items: ['paid', 'unpaid', 'partially_paid', 'cancelled'] }
        ]
    },
    userSubscription: {
        name: 'userSubscription',
        "icon": "FaCalendarCheck",
        "description": "",
        locked: true,
        fields: [
            { name: 'user', type: 'relation', relation: 'user', required: true },
            { name: 'product', type: 'relation', relation: 'product', required: true },
            { name: 'startDate', type: 'datetime', required: true },
            { name: 'endDate', type: 'datetime' },
            { name: 'price', type: 'number', required: true },
            { name: 'currency', type: 'relation', relation: 'currency', required: true },
            { name: 'paymentMethod', type: 'enum', items: ['bank_card', 'SEPA_mandate', 'cash', 'check', 'other'] },
            { name: 'status', type: 'enum', items: ['active', 'inactive', 'cancelled', 'expired', 'pending'] },
            { name: 'billingCycleAnchor', type: 'datetime' },
            { name: 'nextBillingDate', type: 'datetime' },
            { name: 'lastBillingDate', type: 'datetime' },
            { name: 'cancelReason', type: 'string' },
            { name: 'autoRenew', type: 'boolean', default: false }
        ]
    },
    stock: {
        name: 'stock',
        "icon": "FaWarehouse",
        "description": "",
        fields: [
            { name: 'product', type: 'relation', relation: 'product', required: true },
            { name: 'variant', type: 'relation', relation: 'productVariant' }, // Optionnel
            { name: 'warehouse', type: 'relation', relation: 'warehouse', required: true },
            { name: 'available', type: 'number', default: 0 },
            { name: 'reserved', type: 'number', default: 0 } // Quantité réservée (pour les commandes en cours)
        ]
    },
    stockAlert: {
        name: 'stockAlert',
        "icon": "FaExclamationTriangle",
        "description": "",
        fields: [
            { name: 'user', type: 'relation', relation: 'user', required: true },
            { name: 'stock', type: 'relation', relation: 'stock', required: true },
            { name: 'threshold', type: 'number', required: true, min: 0 }
        ]
        // how to implement unique fields on COMBINATION of multiple columns ?
    },
    shipment: {
        name: 'shipment',
        "icon": "FaTruck",
        "description": "",
        fields: [
            { name: 'order', type: 'relation', relation: 'order', required: true },
            { name: 'trackingNumber', type: 'string' },
            { name: 'carrier', type: 'string' },
            { name: 'status', type: 'enum', items: ['pending', 'in_transit', 'delivered', 'issue'] },
            { name: 'estimatedDeliveryDate', type: 'datetime' },
            { name: 'actualDeliveryDate', type: 'datetime' }
        ]
    },
    warehouse: {
        name: 'warehouse',
        "description": "",
        "icon": "FaWarehouse",
        fields: [
            { name: 'name', type: 'string_t', required: true },
            { name: 'location', type: 'relation', relation: 'location' },
            { name: 'capacity', type: 'number' }
        ]
    },
    'return': {
        name: "return",
        "description": "",
        "icon": "FaUndo",
        fields: [
            { "name": "order", "type": "relation", "relation": "order", "required": true },
            { "name": "user", "type": "relation", relation: "user" },
            { "name": "reason", "type": "string", maxlength: 2048, required: true },
            { "name": "channel", "type": "relation", relation: 'channel' },
            { "name": "status", "type": "enum", items: ["pending", "approved", "refunded", "refused"] },
            { name: 'amount', type: 'number', min: 0 },
            { name: 'currency', type: 'relation', relation: 'currency' },
            { name: 'refundDate', type: 'datetime' }
        ]
    },
    returnItem: {
        name: 'returnItem',
        "icon": "FaBoxOpen",
        "description": "",
        fields: [
            { name: 'return', type: 'relation', relation: 'return', required: true },
            { name: 'product', type: 'relation', relation: 'product', required: true },
            { name: 'variant', type: 'relation', relation: 'productVariant' },
            { name: 'quantity', type: 'number', required: true, min: 1 },
            { name: 'condition', type: 'enum', items: ['new', 'very_good', 'good', 'degraded', 'damaged', 'unusable'] }
        ]
    },
    ticket: {
        name: 'ticket',
        "icon": "FaTicketAlt",
        "description": "",
        locked: true,
        fields: [
            { name: 'user', type: 'relation', relation: 'user', required: true },
            { name: 'order', type: 'relation', relation: 'order' },
            { name: 'channel', type: 'relation', relation: 'channel' },
            { name: 'parent', type: 'relation', relation: 'ticket' },
            { name: 'subject', type: 'string', required: true },
            { name: 'message', type: 'richtext', required: true },
            { name: 'status', type: 'enum', items: ['opened', 'in_progress', 'closed'] },
            { name: 'priority', type: 'enum', items: ['low', 'medium', 'high', 'urgent'] },
            { name: 'assignedTo', type: 'relation', relation: 'user' },
            { name: 'createdAt', type: 'datetime', required: true }
        ]
    },
    review: {
        name: "review",
        "icon": "FaStar",
        "description": "",
        fields: [
            { "name": "user", "type": "relation", relation: "user" },
            { "name": "product", "type": "relation", relation: 'product' },
            { "name": "productVariant", "type": "relation", relation: 'productVariant' },
            { "name": "comment", "type": "richtext", maxlength: 2048, required: true },
            { "name": "score", "type": "number" },
            { "name": "publishedAt", "type": "datetime", required: true }
        ]
    },
    device: {
        name: "device",
        "icon": "FaMobile",
        "description": "",
        fields: [
            { "name": "location", "type": "relation", relation: 'location' },
            { "name": "lastLocationUpdate", "type": "datetime" }
        ]
    },
    // Modèle pour l'exercice comptable et l'entreprise
    accountingExercise: {
        name: 'accountingExercise',
        "icon": "FaBook",
        description: "Représente un exercice comptable pour une entreprise donnée.",
        fields: [
            { name: 'name', type: 'string_t', 'required': true, unique: true, hint: "Intitulé de l'exercice comptable" },
            { name: 'companyContact', type: 'relation', relation: 'contact', 'required': true, hint: "Désignation de l'entreprise" },
            { name: 'companyIdentifier', type: 'string', asMain: true, hint: "SIRET de l'entreprise", unique: true },
            { name: 'startDate', type: 'date', required: true, asMain: true, hint: "Date de début de l'exercice" },
            { name: 'endDate', type: 'date', required: true, asMain: true, hint: "Date de clôture de l'exercice" }
        ]
    },

    // Modèle pour définir la structure des lignes comptables (le "plan")
    accountingLineItem: {
        name: 'accountingLineItem',
        "icon": "FaListAlt",
        description: "Définit une ligne/catégorie dans un document comptable.",
        locked: true, // Probablement géré par l'application, pas par l'utilisateur final
        fields: [
            { name: 'accountingExercise', type: 'relation', required: true, unique: true, relation: "accountingExercise" },
            { name: 'code', type: 'string', required: true, unique: true, hint: "Code unique de la ligne (ex: AA, FB, HA)" },
            { name: 'label', type: 'string_t', required: true, hint: "Libellé de la ligne (ex: Frais d'établissement)" },
            {
                name: 'documentType', type: 'enum', required: true,
                items: ['bilan_actif', 'bilan_passif', 'compte_resultat', 'immobilisations', 'amortissements', 'provisions', 'creances_dettes',
                    'deficits',
                    'plus_moins_values',
                    'effectifs_valeur_ajoutee',
                    'capital_social',
                    'filiales_participations',
                    'resultat_fiscal']
            },
            { name: 'section', type: 'string_t', required: true, hint: "Section principale (ex: ACTIF IMMOBILISÉ)" },
            { name: 'subSection', type: 'string_t', hint: "Sous-section (ex: IMMOBILISATIONS INCORPORELLES)" },
            { name: 'order', type: 'number', hint: "Ordre d'affichage dans la section/sous-section" },
            { name: 'calculationFormula', type: 'string', hint: "Formule de calcul (si applicable)" },
            {
                name: 'values', type: 'array', itemsType: 'number', required: true,
                hint: "Valeurs de la ligne comptable"
            },
            { name: 'notes', type: 'richtext', hint: "Notes ou renvois (ex: (1), (3))" }
        ]
    },
    accountingEntry: {
        "name": "accountingEntry",
        "icon": "FaPenAlt",
        "description": "",
        "fields": [
            {
                "name": "exercise",
                "type": "relation",
                "relation": "accountingExercise",
                "required": true
            },
            {
                "name": "label",
                "type": "string",
                "required": true,
                "asMain": true,
                "maxlength": 255
            },
            {
                "name": "entryDate",
                "type": "date",
                "required": true
            },
            {
                "name": "amount",
                "type": "number",
                "default": 0
            },
            {
                "name": "currency",
                "type": "relation",
                "relation": "currency",
                "required": true
            },
            {
                "name": "referenceNumber",
                "type": "string",
                "maxlength": 100
            },
            {
                "name": "notes",
                "type": "richtext"
            },
            {
                "name": "status",
                "type": "enum",
                "items": ["draft", "validated", "cancelled"],
                "default": "brouillon"
            },
            {
                "name": "createdBy",
                "type": "relation",
                "relation": "user"
            },
            {
                "name": "validatedBy",
                "type": "relation",
                "relation": "user"
            },
            {
                "name": "validationDate",
                "type": "datetime"
            },
            {
                "name": "attachments",
                "type": "array",
                "itemsType": "file"
            }
        ]
    },
    employee: {
        "name": "employee",
        "icon": "FaUserTie",
        "description": "",
        "fields": [
            {
                "name": "employeeId",
                "type": "string",
                "required": true,
                "unique": true
            },
            {
                "name": "personalInfo",
                "type": "relation",
                "relation": "user",
                "required": true
            },
            {
                "name": "jobTitle",
                "type": "string",
                "required": true
            },
            {
                "name": "department",
                "type": "string"
            },
            {
                "name": "manager",
                "type": "relation",
                "relation": "employee"
            },
            {
                "name": "workLocation",
                "type": "relation",
                "relation": "location"
            },
            {
                "name": "employmentType",
                "type": "enum",
                "items": ["full_time", "part_time", "contractor", "intern", "temporary"]
            },
            {
                "name": "emergencyContact",
                "type": "relation",
                "relation": "contact"
            },
            {
                "name": "homeAddress",
                "type": "relation",
                "relation": "location"
            },
            {
                "name": "dateOfBirth",
                "type": "date"
            },
            {
                "name": "nationality",
                "type": "string"
            },
            {
                "name": "nationalId",
                "type": "string"
            },
            {
                "name": "socialSecurityNumber",
                "type": "string"
            },
            {
                "name": "taxId",
                "type": "string"
            },
            {
                "name": "startDate",
                "type": "date",
                "required": true
            },
            {
                "name": "endDate",
                "type": "date"
            },
            {
                "name": "contractType",
                "type": "string"
            },
            {
                "name": "salary",
                "type": "number"
            },
            {
                "name": "salaryCurrency",
                "type": "relation",
                "relation": "currency"
            },
            {
                "name": "payFrequency",
                "type": "enum",
                "items": ["weekly", "bi_weekly", "monthly"]
            },
            {
                "name": "bankAccountNumber",
                "type": "string"
            },
            {
                "name": "bankName",
                "type": "string"
            },
            {
                "name": "iban",
                "type": "string"
            },
            {
                "name": "swiftBic",
                "type": "string"
            },
            {
                "name": "workPermitNumber",
                "type": "string"
            },
            {
                "name": "workPermitExpiry",
                "type": "date"
            },
            {
                "name": "visaType",
                "type": "string"
            },
            {
                "name": "visaExpiry",
                "type": "date"
            },
            {
                "name": "skills",
                "type": "array",
                "itemsType": "string"
            },
            {
                "name": "notes",
                "type": "richtext"
            }
        ]
    },
    workflow: {
        name: 'workflow',
        "icon": "FaProjectDiagram",
        description: "Defines an automated process.",
        fields: [
            { name: 'name', type: 'string_t', required: true, hint: "Unique name for the workflow (e.g., 'Order Validation', 'Low Stock Notification')." },
            { name: 'description', type: 'richtext', hint: "Detailed explanation of the workflow's purpose." },
            { name: 'startStep', type: 'relation', relation: 'workflowStep', required: false, hint: "The first step to execute when the workflow starts." }
        ]
    },
    workflowTrigger: {
        name: 'workflowTrigger',
        "icon": "FaPlay",
        description: "Represents an event that can initiate a workflow.",
        fields: [
            { name: 'workflow', type: 'relation', relation: 'workflow', required: true, hint: "The workflow this step belongs to." },
            { name: 'name', type: 'string_t', required: true, unique: true, hint: "Descriptive name for the trigger (e.g., 'New Order Created', 'Stock < 5', 'Monday 9 AM Report')." },
            {
                name: 'type',
                type: 'enum',
                items: ['manual', 'scheduled'],
                required: true
            },
            {
                name: 'onEvent',
                type: 'enum',
                items: ['DataAdded', 'DataEdited', 'DataDeleted', 'ModelAdded', 'ModelEdited', 'ModelDeleted'],
                condition: { $eq: ["$type", "manual"] }
            },
            { name: 'targetModel', type: 'model', condition: { // Condition pour afficher le champ
                $and: [
                    {$eq: ["$type", "manual"]},
                    {
                        $or: [
                            { path: "onEvent", op: "$eq", value: "DataAdded" },
                            { path: "onEvent", op: "$eq", value: "DataEdited" },
                            { path: "onEvent", op: "$eq", value: "DataDeleted" }
                        ]
                    }
                ]
            }},
            { name: 'dataFilter', type: 'code',  language: 'json', targetModel: '$targetModel', conditionBuilder: true, hint: "Optional conditions checked before executing the step's action.",
                condition: { // Condition pour afficher le champ
                    $and: [
                        {$eq: ["$type", "manual"]},
                        {
                            $or: [
                                { path: "onEvent", op: "$eq", value: "DataAdded" },
                                { path: "onEvent", op: "$eq", value: "DataEdited" },
                                { path: "onEvent", op: "$eq", value: "DataDeleted" }
                            ]
                        }
                    ]
                }
            },
            { name: 'env', type: 'code', language: 'json', hint: "Environment variables (JSON key/value pairs)",default: {} },
            { name: 'isActive', type: 'boolean' },
            { name: 'cronExpression', type: 'cronSchedule', cronMask:[false, true, true, true, true, true], hint: "Cron expression for scheduling (e.g., '0 9 * * 1' for Monday 9 AM) (used by Scheduled type).",
                condition:
                    {$eq: ["$type", "scheduled"]}}
        ]
    },
    workflowStep: {
        name: 'workflowStep',
        "icon": "FaStepForward",
        description: "A single step within a workflow process.",
        fields: [
            { name: 'workflow', type: 'relation', relation: 'workflow', required: true, hint: "The workflow this step belongs to." },
            { name: 'name', type: 'string_t', hint: "Optional descriptive name for the step (e.g., 'Check Inventory', 'Send Confirmation Email')." },
            { name: 'conditions', type: 'code', language: 'json', conditionBuilder: true, hint: "Optional conditions checked before executing the step's action." },
            { name: 'actions', type: 'relation', relation: 'workflowAction', multiple: true, required: true, hint: "The main actions performed by this step." },
            { name: 'onSuccessStep', type: 'relation', relation: 'workflowStep', hint: "Optional: The next step if this step's action succeeds." },
            { name: 'onFailureStep', type: 'relation', relation: 'workflowStep', hint: "Optional: The next step if conditions fail or the action fails." },
            { name: 'isTerminal', type: 'boolean', default: false, hint: "Indicates if this step marks the end of a workflow path." }
        ]
    },
    workflowAction: {
        name: 'workflowAction',
        "icon": "FaCogs",
        description: "Defines a specific operation to be performed by a workflow step.",
        fields: [
            { name: 'name', type: 'string_t', required: true, hint: "Name of the action (e.g., 'Update Order Status', 'Send Email', 'Call Payment API')." },
            {
                name: 'type',
                type: 'enum',
                required: true,
                items: ['UpdateData', 'CreateData', 'DeleteData', 'ExecuteScript', 'HttpRequest', 'SendEmail', 'Wait', 'GenerateAIContent', 'ExecuteServiceFunction'],
                hint: "The type of operation to perform."
            },
            // For UpdateData / CreateData / DeleteData
            { name: 'targetModel', condition: {
                $or: [
                    {$eq: ["$type", "CreateData"]},
                    {$eq: ["$type", "UpdateData"]},
                    {$eq: ["$type", "DeleteData"]}
                ]
            }, type: 'model', hint: "Model to target" },

            // For UpdateData / DeleteData
            { name: 'targetSelector', targetModel: "$targetModel", conditionBuilder: true, condition: {
                $or: [
                    {$eq: ["$type", "UpdateData"]},
                    {$eq: ["$type", "DeleteData"]}
                ]
            }, type: 'code', language: 'json', hint: "Expression to filter to the target document(s)." },

            // For UpdateData
            { name: 'fieldsToUpdate', condition: {$eq: ["$type", "UpdateData"]}, type: 'code', language: 'json', default: {}, hint: "Key-value pairs of fields to update (e.g., { status: 'Validé', lastUpdated: '{now}' })" },

            // For CreateData
            { name: 'dataToCreate', condition: {$eq: ["$type", "CreateData"]}, type: 'code', language: 'json', default: {}, hint: "Object template for the new document to create" },

            // For HttpRequest
            { name: 'url', condition: {$eq: ["$type", "HttpRequest"]}, type: 'string', hint: "The URL to call." },
            { name: 'method', condition: {$eq: ["$type", "HttpRequest"]}, type: 'enum', items: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'POST', hint: "HTTP method." },
            { name: 'headers', condition: {$eq: ["$type", "HttpRequest"]}, type: 'code', language: 'json',default: {},  hint: "HTTP headers as key-value pairs." },
            { name: 'body', condition: {$eq: ["$type", "HttpRequest"]}, type: 'code', language: 'json',default: {},  hint: "Request body, can include variables." },

            // For SendEmail
            {
                name: 'emailRecipients',
                type: 'array',
                itemsType: 'string',
                condition: { $eq: ["$type", "SendEmail"] },
                hint: "Destinataire(s) de l'e-mail. Peut être une adresse, plusieurs adresses séparées par des virgules, ou une variable comme {triggerData.client.email}."
            },
            {
                name: 'emailSubject',
                type: 'string',
                condition: { $eq: ["$type", "SendEmail"] },
                hint: "Sujet de l'e-mail. Peut contenir des variables."
            },
            {
                name: 'emailContent',
                type: 'richtext',
                condition: { $eq: ["$type", "SendEmail"] },
                hint: "Contenu de l'e-mail. Peut contenir des variables et du HTML."
            },

            // For Wait
            { name: 'duration', condition: {$eq: ["$type", "Wait"]}, type: 'number', hint: "Duration to wait." },
            { name: 'durationUnit', condition:{$eq: ["$type", "Wait"]}, type: 'enum', items: ['milliseconds', 'seconds', 'minutes', 'hours', 'days'], default: 'seconds', hint: "Unit for the duration." },

            // For GenerateAIContents
            {
                name: 'aiProvider',
                condition: { $eq: ["$type", "GenerateAIContent"] },
                type: 'enum',
                items: ['OpenAI', 'GoogleGemini'], // Extensible avec d'autres fournisseurs
                hint: "Le fournisseur de LLM à utiliser."
            },
            {
                name: 'aiModel',
                condition: { $eq: ["$type", "GenerateAIContent"] },
                type: 'string',
                default: 'gpt-4o-mini', // Un défaut raisonnable
                hint: "Le modèle spécifique à utiliser (ex: gpt-4o-mini, gemini-1.5-pro-latest)."
            },
            {
                name: 'prompt',
                condition: { $eq: ["$type", "GenerateAIContent"] },
                type: 'richtext', // richtext est bien pour les longs prompts
                hint: "Le modèle de prompt. Utilise des variables comme {triggerData.field} ou {context.variable}."
            },

            // For ExecuteScript
            { name: 'script', condition: {$eq: ["$type", "ExecuteScript"]}, type: 'code', language: 'javascript', hint: "The script to execute." },

            // For ExecuteServiceFunction
            { name: 'serviceName', condition: {$eq: ["$type", "ExecuteServiceFunction"]}, type: 'string', hint: "The name of the registered service to call (e.g., 'stripe')." },
            { name: 'functionName', condition: {$eq: ["$type", "ExecuteServiceFunction"]}, type: 'string', hint: "The name of the function to execute within the service." },
            { name: 'args', condition: {$eq: ["$type", "ExecuteServiceFunction"]}, type: 'code', language: 'json', default: [], hint: "An array of arguments to pass to the function. Can include variables." }

        ]
    },

    workflowRun: {
        name: 'workflowRun',
        "icon": "FaRunning",
        description: "Tracks a specific execution instance of a workflow.",
        fields: [
            { name: 'workflow', type: 'relation', relation: 'workflow', required: true, hint: "The workflow definition that was executed." },
            { name: 'contextData', type: 'code', language: 'json',default: {},  hint: "Snapshot of the data or event that triggered this run." },
            {
                name: 'status',
                type: 'enum',
                required: true,
                items: ['pending', 'running', 'completed', 'failed', 'waiting', 'cancelled'],
                default: 'pending',
                hint: "The current status of the workflow execution."
            },
            { name: 'stepExecutionsCount', type: 'object' },
            { name: 'currentStep', type: 'relation', relation: 'workflowStep', hint: "The step currently being executed or waited on." },
            { name: 'owner', type: 'relation', relation: 'user', required: false },
            { name: 'startedAt', type: 'datetime', required: true, hint: "Timestamp when the workflow run began." },
            { name: 'completedAt', type: 'datetime', hint: "Timestamp when the workflow run finished (successfully or failed)." },
            { name: 'log', type: 'string', maxlength: 4096, hint: "Error message if the workflow run failed." }
        ]
    },
    dashboard:{
        name: 'dashboard', // Nom technique du modèle
        "icon": "FaTachometerAlt",
        description: "Configuration d'un tableau de bord personnalisé par l'utilisateur.", // Description du modèle
        locked: false, // Indique si le modèle peut être modifié par l'utilisateur (false = modifiable)
        fields: [
            {
                name: 'name', // Nom du tableau de bord
                type: 'string', // Type texte simple
                required: true, // Ce champ est obligatoire
                hint: "Nom affiché et personnalisable du tableau de bord."
            },
            {
                name: 'description', // Description optionnelle
                type: 'string', // Type texte simple (pourrait être 'richtext' si besoin de mise en forme)
                hint: "Description facultative pour donner plus de contexte au tableau de bord."
            },
            {
                name: 'layout', // Configuration de la disposition des éléments
                type: 'code', // Utilisation du type 'code' pour stocker une structure JSON flexible
                language: 'json', // Précise que le contenu est du JSON
                required: true, // La disposition est essentielle
                default: { "type": "columns", "columns": [] }, // Valeur par défaut : une disposition en colonnes vide, stockée comme chaîne JSON
                hint: "Structure JSON décrivant l'organisation des KPIs. Exemple : { \"type\": \"columns\", \"columns\": [ [\"kpi_id_1\"], [\"kpi_id_2\", \"kpi_id_3\"] ] }."
            },
            {
                name: 'refreshInterval',
                type: 'number',
                delay: true, // Sera interprété par le front-end comme un champ de durée
                unit: 's',
                min: 0,
                hint: "Intervalle de rafraîchissement automatique en secondes. Laisser vide ou à 0 pour désactiver."
            },
            {
                name: 'isDefault', // Indicateur pour le tableau de bord par défaut
                type: 'boolean', // Type booléen (vrai/faux)
                default: false, // Par défaut, un nouveau tableau de bord n'est pas celui par défaut
                hint: "Si 'true', ce tableau de bord est affiché par défaut pour l'utilisateur."
            }
        ]
    },
    'request': {
        name: 'request',
        "icon": "FaExchangeAlt",
        description: "Journal des requêtes reçues par l'API.",
        locked: true, // Géré par le système, non modifiable directement par l'utilisateur via l'UI standard
        fields: [
            {
                name: 'timestamp',
                type: 'datetime',
                required: true,
                hint: "Date et heure exactes de la réception de la requête."
            },
            {
                name: 'method',
                type: 'enum',
                items: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
                required: true,
                hint: "Méthode HTTP utilisée (GET, POST, etc.)."
            },
            {
                name: 'url',
                type: 'string',
                required: true,
                multiline: false,
                maxlength: 2048, // Limite raisonnable pour une URL
                hint: "URL complète de la requête, incluant les query parameters."
            },
            {
                name: 'status',
                type: 'number',
                step: 100,
                default: 200,
                required: true,
                hint: "Code de statut HTTP retourné par le serveur (ex: 200, 404, 500)."
            },
            {
                name: 'latencyMs',
                type: 'number',
                required: true,
                color: '#e8c965',
                unit: 'ms',
                hint: "Temps de traitement de la requête par le serveur, en millisecondes."
            },
            {
                name: 'ip',
                type: 'string',
                hint: "Adresse IP du client ayant effectué la requête."
            },
            /*{
                name: 'requestHeaders',
                type: 'code',
                language: 'json',
                required: false,
                hint: "En-têtes HTTP de la requête (stockés sous forme de chaîne JSON). Peut être volumineux."
            },*/
            {
                name: 'requestBody', // Optionnel, peut être sensible/volumineux
                type: 'code',
                language: 'json', // Ou 'text' si ce n'est pas toujours du JSON
                required: false,
                hint: "Corps de la requête (stocké sous forme de chaîne JSON/texte). Attention: peut contenir des données sensibles et être volumineux."
            },
            {
                name: 'responseBody', // Optionnel, peut être volumineux
                type: 'code',
                language: 'json', // Ou 'text'
                required: false,
                "condition": {
                    "path": [
                        "status"
                    ],
                    "op": "$gte",
                    "value": "400"
                },
                hint: "Corps de la réponse (stocké sous forme de chaîne JSON/texte). Attention: peut être volumineux."
            },
            {
                name: 'error',
                type: 'string',
                maxlength: 4096, // Espace pour les messages d'erreur détaillés
                required: false,
                hint: "Message d'erreur si la requête a échoué côté serveur (ex: statut 500)."
            }
        ]
    },

    kpi : {
        name: 'kpi',
        "icon": "FaChartLine",
        description: "Configuration d'un Indicateur Clé de Performance (KPI)",
        fields: [
            { name: 'name', type: 'string_t', required: true, hint: "Nom affiché du KPI (ex: Chiffre d'affaires total)" },
            { name: 'description', type: 'string_t', hint: "Informations complémentaires sur le KPI" },
            { name: 'targetModel', type: 'model', required: true, hint: "Nom du modèle sur lequel calculer le KPI (ex: order)" },
            {
                name: 'aggregationType',
                type: 'enum',
                required: true,
                items: ['count', 'sum', 'avg', 'min', 'max'], // Types d'agrégation courants
                hint: "Type de calcul à effectuer"
            },
            {
                name: 'aggregationField',
                type: 'string',
                hint: "Nom du champ numérique sur lequel appliquer l'agrégation (ex: totalAmount). Non requis pour 'count'."
            },
            {
                name: 'matchFormula',
                type: 'code', // Utiliser l'éditeur de code pour le JSON
                language: 'json',
                default: {}, // Valeur par défaut: aucun filtre
                hint: "Filtre JSON (MongoDB $match) à appliquer avant l'agrégation (ex: { \"status\": \"delivered\" })"
            },
            {
                "name": "showTotal",
                "hint": "Afficher le total",
                "type": "boolean"
            },
            {
                "name": "showPercentTotal",
                "hint": "Afficher le total en %",
                "type": "boolean"
            },
            {
                "name": "totalMatchFormula",
                "hint": "Formule pour le total (calcul %)",
                "type": "code",
                "language": "json",
                "required": false,
                "default": "{}",
                condition: { "$or": [
                    {$eq: ["$showTotal", true]},
                    {$eq: ["$showPercentTotal", true]}
                ]}
            },
            {
                name: 'unit', // Optionnel: Unité à afficher avec la valeur
                type: 'string',
                hint: "Unité à afficher (ex: €, $, utilisateurs)"
            },
            {
                name: 'icon', // Optionnel: Icône à afficher
                type: 'string', // Ou un type 'icon' si tu en as un
                hint: "Nom de l'icône (ex: FaUsers, FaShoppingCart)"
            },
            // Optionnel: Ajouter des champs pour le style, l'ordre d'affichage, etc.
            { name: 'order', type: 'number', hint: "Ordre d'affichage sur un tableau de bord" },
            { name: 'color', type: 'color', hint: "Couleur associée au KPI" }
        ]
    },
    imageGallery: {
        name: 'imageGallery',
        "icon": "FaImages",
        description: "Représente une galerie d'images avec un titre et une description.",
        locked: false, // Les utilisateurs peuvent créer/gérer leurs galeries
        fields: [
            {
                name: 'name',
                type: 'string_t', // Titre traduisible
                required: true,
                asMain: true, // Champ principal pour l'affichage
                color: '#4CAF50', // Couleur indicative
                hint: "Le nom ou titre de la galerie d'images."
            },
            {
                name: 'images',
                type: 'array',
                itemsType: 'file', // Type des éléments du tableau
                required: false, // Permet de créer une galerie vide initialement
                mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], // Types d'images autorisés
                hint: "Les fichiers images de cette galerie."
            },
            {
                name: 'description',
                type: 'richtext', // Description riche
                hint: "Description de la galerie (optionnel)."
            },
            {
                name: 'tags',
                type: 'relation',
                relation: 'taxonomy', // Relation vers le modèle 'taxonomy'
                multiple: true, // Peut avoir plusieurs tags
                hint: "Tags ou catégories pour organiser les galeries (optionnel)."
            },
            {
                name: 'createdAt',
                type: 'datetime',
                // Ce champ pourrait être rempli automatiquement par le système lors de la création
                hint: "Date de création de la galerie (généralement géré par le système)."
            }
        ]
    },
    budget: {
        name: 'budget',
        "icon": "FaMoneyCheck",
        description: "Un budget permet de lister vos transactions personnelles.",
        fields: [
            {
                name: 'name',
                type: 'string_t',
                asMain: true,
                hint: "Nom ou description de la transaction (ex: Courses, Salaire Janvier)."
            },
            {
                name: 'amount',
                type: 'number',
                step: 1,
                asMain: true,
                required: true,
                hint: "Montant de la transaction. Positif pour un revenu, négatif pour une dépense."
            },
            {
                name: 'currency',
                type: 'relation',
                relation: 'currency',
                asMain: true,
                required: true,
                hint: "Devise de la transaction."
            },
            {
                name: 'transactionDate',
                type: 'datetime',
                required: true,
                asMain: true,
                hint: "Date à laquelle la transaction a eu lieu."
            },
            {
                name: 'description',
                type: 'richtext', // Pour des notes plus détaillées
                hint: "Notes ou détails supplémentaires sur la transaction."
            },
            {
                name: 'paymentMethod',
                type: 'string', // Ou enum si vous avez une liste fixe
                hint: "Méthode de paiement utilisée (ex: Carte de crédit, Espèces, Virement)."
            },
            {
                name: 'category',
                type: 'relation',
                relation: 'taxonomy', // Utiliser le modèle 'taxonomy' pour les catégories
                // Vous pourriez vouloir filtrer les taxonomies de type 'budget_category'
                hint: "Catégorie de la transaction (ex: Alimentation, Logement, Transport)."
            },
            {
                name: 'isRecurring',
                type: 'boolean',
                default: false,
                hint: "Indique si cette transaction est récurrente."
            },
            {
                name: 'recurringFrequency',
                type: 'enum',
                items: ['daily', 'weekly', 'monthly', 'yearly'],
                condition: {$eq: ["$isRecurring", true]}
            },
            {name: 'recurringEndDate', type: 'date', condition: {$eq: ["$isRecurring", true]}},
            {
                name: 'attachments',
                type: 'array',
                itemsType: 'file', // Pour joindre des reçus, factures, etc.
                hint: "Pièces jointes (reçus, factures)."
            }
        ]
    },
    event: {
        "name": "event",
        "icon": "FaCalendar",
        "description": "A model for managing events, conferences, meetups, and gatherings.",
        "fields": [
            {
                "name": "title",
                "type": "string",
                "required": true,
                "asMain": true,
                "hint": "The title of the event"
            },
            {
                "name": "description",
                "type": "richtext_t",
                "hint": "A detailed description of the event, including agenda, speakers, and other relevant information."
            },
            {
                "name": "startDate",
                "type": "datetime",
                "required": true,
                "hint": "The starting date and time of the event"
            },
            {
                "name": "endDate",
                "type": "datetime",
                "required": true,
                "hint": "The ending date and time of the event"
            },
            {
                "name": "location",
                "type": "relation",
                "relation": "location",
                "hint": "The venue or location where the event will be held. This could be a physical address or an online meeting link."
            },
            {
                "name": "categories",
                "type": "relation",
                "relation": "taxonomy",
                "multiple": true,
                "hint": "Categories or tags associated with the event (e.g., \"conference\", \"workshop\", \"music\", \"technology\")."
            },
            {
                "name": "organizer",
                "type": "relation",
                "relation": "contact",
                "hint": "The name of the organization or individual hosting the event."
            },
            {
                "name": "isOnline",
                "type": "boolean",
                "default": false,
                "hint": "Whether the event is online or in-person."
            },
            {
                "name": "eventUrl",
                "type": "url",
                "hint": "A link to the official event webpage or registration page."
            },
            {
                "name": "imageUrl",
                "type": "file",
                "hint": "URL of the event image or banner."
            },
            {
                "name": "status",
                "type": "enum",
                "items": [
                    "scheduled",
                    "ongoing",
                    "completed",
                    "cancelled",
                    "postponed"
                ],
                "hint": "The current status of the event."
            },
            {
                "name": "capacity",
                "type": "number",
                "hint": "The maximum number of attendees allowed for the event."
            },
            {
                "name": "price",
                "type": "number",
                "hint": "The price of admission, if applicable."
            },
            {
                "name": "currency",
                "type": "relation",
                "relation": "currency",
                "hint": "The currency for the price (e.g., USD, EUR)."
            },
            {
                "name": "registrationDeadline",
                "type": "datetime",
                "hint": "The date by which attendees must register for the event."
            },
            {
                "name": "attendees",
                "type": "relation",
                "relation": "contact",
                "multiple": true,
                "hint": "A relation to the contacts attending the event"
            },
            {
                "name": "sponsors",
                "type": "relation",
                "relation": "contact",
                "multiple": true,
                "hint": "List of sponsors or partners involved in the event."
            }
        ]
    },
    endpoint: {
        name: "endpoint",
        "icon": "FaCode",
        description: "Defines custom API endpoints that execute a server-side script.",
        fields: [
            {
                name: "name",
                type: "string",
                required: true,
                asMain: true,
                hint: "A human-readable name to identify the endpoint."
            },
            {
                name: "isActive",
                type: "boolean",
                default: true,
                hint: "If checked, the endpoint is active and can be called."
            },
            {
                name: "path",
                type: "string",
                required: true,
                hint: "The URL path after /api/actions/ (e.g., 'send-welcome-email'). Do not include '/'.",
                placeholder: "my-custom-action"
            },
            {
                name: "method",
                type: "enum",
                items: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                required: true,
                default: "POST",
                hint: "The HTTP method required to call this endpoint."
            },
            {
                name: 'isPublic',
                type: 'boolean',
                default: false,
                hint: "Si coché, ce point d'accès sera accessible sans authentification."
            },
            {
                name: "code",
                type: "code",
                language: "javascript",
                required: true,
                hint: "The script to execute. Must return a value or an object that will be the JSON response.",
                default: `// The script can access 'db', 'logger', 'env'.
// request.body, request.query, request.params, request.headers available
// The returned value will be the API's JSON response.

logger.info('Custom endpoint executed with body:', request.body);

return { success: true, message: 'Endpoint executed!', received: request.body };
`
            }
        ]
    }
};
