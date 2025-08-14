import {getModels} from "./modules/data/index.js";


/*
Website Starter Pack

- contenu de page : /
    /contact
    /blog
    /events
    /products
    /services
    /store
    /contact
    /support
    /about
    /faq
    /privacy
    /terms
    /sitemap
    /
 */
export const getAllPacks = async () => {

    let dbModels = await getModels();

    const getPerms = (models = []) => {
        const sub = dbModels.filter(m => models.includes(m.name));
        const perms = ['API_ADMIN', 'API_ADD_DATA', 'API_EDIT_DATA', 'API_DELETE_DATA', 'API_SEARCH_DATA', 'API_GET_PACKS', 'API_INSTALL_PACK', 'API_DEANONYMIZED',
            ...sub.map(m => `API_ADD_DATA_${m.name}`),
            ...sub.map(m => `API_ADD_DATA_NOT_${m.name}`),
            ...sub.map(m => `API_EDIT_DATA_${m.name}`),
            ...sub.map(m => `API_EDIT_DATA_NOT_${m.name}`),
            ...sub.map(m => `API_SEARCH_DATA_${m.name}`),
            ...sub.map(m => `API_SEARCH_DATA_NOT_${m.name}`),
            ...sub.map(m => `API_DELETE_DATA_${m.name}`),
            ...sub.map(m => `API_DELETE_DATA_NOT_${m.name}`),
            ...sub.map(m => `API_DEANONYMIZED_${m.name}`)];
        return perms;
    }

    const envSmtp = [
        { "name": "SMTP_HOST", "value": "smtp.example.com", "description": "SMTP server host for sending emails." },
        { "name": "SMTP_PORT", "value": "587", "description": "SMTP server port." },
        { "name": "SMTP_USER", "value": "user@example.com", "description": "Username for SMTP authentication." },
        { "name": "SMTP_PASS", "value": "your_smtp_password", "description": "Password for SMTP authentication." },
        { "name": "SMTP_FROM", "value": "\"My Store\" <noreply@example.com>", "description": "The 'From' address for outgoing emails." }
    ];

    const categories = [ 'News', 'Blog', 'Products', 'Services', 'Store', 'Events', 'Forums', 'Contact', 'Support'];
    const tags = [ 'info', 'incident', 'maintenance', 'feature', 'hint', 'bugfix', 'question'];

    const roles = [{name:'administrator', perms: ['API_ADMIN']},
        {name: 'editor', perms: ['API_EDIT_DATA', 'API_ADD_DATA', 'API_SEARCH_DATA', 'API_DELETE_DATA', 'API_DEANONYMIZED']},
        {name: 'moderator', perms: ['API_EDIT_DATA_content', 'API_ADD_DATA_content', 'API_SEARCH_DATA_webpage','API_SEARCH_DATA_content', 'API_SEARCH_DATA_lang', 'API_SEARCH_DATA_currency', 'API_SEARCH_DATA_taxonomy', 'API_DELETE_DATA_content']},
        {name: 'visitor', perms: ['API_SEARCH_DATA_webpage','API_SEARCH_DATA_content', 'API_SEARCH_DATA_lang', 'API_SEARCH_DATA_currency', 'API_SEARCH_DATA_taxonomy']}];

    return [
        {
            "name": "Marketing & Campaigning",
            "description": "Launch powerful, personalized, and scalable email campaigns. This pack uses dynamic audiences and a robust workflow to send emails in chunks, ensuring high performance. Depends on the 'Customer Relationship Management (CRM)' pack.",
            "tags": ["marketing", "email", "campaign", "workflow"],
            "models": ["env", "contact", "workflow", "workflowStep", "workflowAction", "workflowRun", "workflowTrigger",
                {
                    "name": "campaign",
                    "description": "Defines an email marketing campaign.",
                    "fields": [
                        { "name": "name", "type": "string", "required": true, "asMain": true },
                        { "name": "subject", "type": "string", "required": true },
                        { "name": "content", "type": "richtext", "required": true },
                        { "name": "status", "type": "enum", "items": ["draft", "scheduled", "in_progress", "finished", "cancelled"], "default": "draft" },
                        { "name": "audience", "type": "relation", "relation": "audience" },
                        { "name": "processedRecipients", "type": "array", "itemsType": "string", "hint": "List of processed contact IDs." }
                    ]
                },
                {
                    "name": "audience",
                    "description": "Defines a dynamic segment of contacts based on a filter.",
                    "fields": [
                        { "name": "name", "type": "string", "required": true, "asMain": true },
                        { "name": "description", "type": "string" },
                        { "name": "filter", "type": "code", "language": "json", "required": true, "conditionBuilder": true, "hint": "A MongoDB filter to select contacts. E.g., { \"tags\": \"newsletter\" }" }
                    ]
                }
            ],
            "data":{
                "all": {
                    "audience": [
                        {
                            "name": "Example Audience for Campaigning",
                            "description": "An example audience targeting specific contacts from the CRM pack.",
                            "filter": { "$or": [{ "$eq": ["$email", "alice.martin@innovatech.com"] }, { "$eq": ["$email", "bob.durand@globalexports.com"] }] }
                        }
                    ],
                    "campaign": [
                        {
                            "name": "Q3 Product Launch",
                            "subject": "🚀 Discover Our New Products!",
                            "content": "<h1>Hello {recipient.firstName},</h1><p>We are excited to introduce our latest product line. We think you'll love it!</p><p>Best regards,<br>The Team</p>",
                            "status": "draft",
                            "audience": { "$link": { "name": "Example Audience for Campaigning", "_model": "audience" } }
                        }
                    ],
                    "workflow": [{
                        "name": "Campaign Emailing Workflow",
                        "description": "A scalable workflow that sends campaign emails in chunks by dynamically querying contacts from an audience.",
                        "startStep": { "$link": { "name": "Start Campaign Processing", "_model": "workflowStep" } }
                    }],

                    "workflowAction": [
                        {
                            "name": "Set Campaign to 'in_progress'",
                            "type": "UpdateData",
                            "targetModel": "campaign",
                            "targetSelector": { "_id": "{triggerData._id}" },
                            "fieldsToUpdate": { "status": "in_progress" }
                        },
                        {
                            "name": "Get Next Recipient Chunk",
                            "type": "ExecuteScript",
                            "script": `
const chunkSize = 10; // Process 10 recipients per run
const campaign = context.triggerData;
const audience = await db.findOne("audience",{"_id": campaign.audience});

if (!audience || !audience.filter) {
logger.error('Campaign audience or audience filter is not defined.');
return { chunk: [], message: 'Campaign audience or audience filter is not defined.'}; // Returning an empty chunk will stop the workflow.
}

const processedIds = campaign.processedRecipients || [];

const query = {
    '$and': [
        audience.filter,
        { '$not':{ '$in': ["$_id", processedIds] } }
    ]
};

logger.info('Finding next chunk with filter:', JSON.stringify(query));

const searchResult = await db.find('contact', query, { limit: chunkSize });
const chunk = searchResult.data || [];

logger.info(\`Found \${chunk.length} recipients for the next chunk.\`);

return { chunk }; // This chunk is passed to the next action via context.result
`
                        },
                        {
                            "name": "Send Email to Chunk",
                            "type": "SendEmail",
                            "emailRecipients": ["{context.result.chunk}"],
                            "emailSubject": "{triggerData.subject}",
                            "emailContent": "{triggerData.content}"
                        },
                        {
                            "name": "Update Processed Recipients",
                            "type": "ExecuteScript",
                            "script": `
const campaignId = context.triggerData._id;
const emailResult = context.emailResult; 

if (!emailResult || !Array.isArray(emailResult.sent) || emailResult.sent.length === 0) {
    logger.info('No recipients were successfully sent an email in this chunk.');
    // Return the original chunk from the first script to allow the condition to check it
    return { processedChunk: context.result.chunk };
}

const processedIds = emailResult.sent.map(recipient => recipient._id.toString());

logger.info(\`Updating campaign \${campaignId} with \${processedIds.length} new processed IDs.\`);

await db.update(
    'campaign',
    { _id: campaignId },
    { 'processedRecipients': [...campaign.processedRecipients, ...processedIds] }
);

// Return the original chunk for the condition check step
return { processedChunk: context.result.chunk };
`
                        },
                        {
                            "name": "Set Campaign to 'finished'",
                            "type": "UpdateData",
                            "targetModel": "campaign",
                            "targetSelector": { "_id": "{triggerData._id}" },
                            "fieldsToUpdate": { "status": "finished" }
                        }
                    ],
                    "workflowStep": [
                        {
                            "name": "Start Campaign Processing",
                            "workflow": { "$link": { "name": "Campaign Emailing Workflow", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Set Campaign to 'in_progress'", "_model": "workflowAction" } },
                            "onSuccessStep": { "$link": { "name": "Process Recipient Chunk", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Process Recipient Chunk",
                            "workflow": { "$link": { "name": "Campaign Emailing Workflow", "_model": "workflow" } },
                            "actions":
                                { "$link": { "$or": [
                                    {"$eq": ["$name", "Get Next Recipient Chunk"]},
                                    {"$eq": ["$name", "Send Email to Chunk"]},
                                    {"$eq": ["$name", "Update Processed Recipients"]}
                                ],"_model": "workflowAction"}},
                            "onSuccessStep": { "$link": { "name": "Check if Campaign is Complete", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Check if Campaign is Complete",
                            "workflow": { "$link": { "name": "Campaign Emailing Workflow", "_model": "workflow" } },
                            "conditions": { "$gt": [{ "$size": {$ifNull:["{context.result.processedChunk}", []]} }, 0] },
                            "onSuccessStep": { "$link": { "name": "Process Recipient Chunk", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Finish Campaign", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Finish Campaign",
                            "workflow": { "$link": { "name": "Campaign Emailing Workflow", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Set Campaign to 'finished'", "_model": "workflowAction" } },
                            "isTerminal": true
                        }
                    ],
                    "workflowTrigger": [{
                        "name": "On Campaign Scheduled",
                        "workflow": { "$link": { "name": "Campaign Emailing Workflow", "_model": "workflow" } },
                        "type": "manual",
                        "onEvent": "DataEdited",
                        "targetModel": "campaign",
                        "dataFilter": { "$eq": ["$status", "scheduled"] },
                        "isActive": true
                    }],
                    "env": envSmtp
                }
            }
        },
        /*
        {
            "name": "Social Media Publisher",
            "description": "Automate your social media presence. This pack provides a workflow to automatically post new blog articles to Twitter and LinkedIn. Requires the 'Website Starter Pack'.",
            "tags": ["social media", "marketing", "automation", "workflow"],
            "dependencies": ["Website Starter Pack"],
            "models": ["workflow", "workflowStep", "workflowAction", "workflowTrigger", "env"],
            "data": {
                "all": {
                    "workflow": [{
                        "name": "Publish New Blog Post to Socials",
                        "description": "Automatically posts a link to a new blog post on Twitter and LinkedIn.",
                        "startStep": {"$link": {"name": "Post on Social Networks", "_model": "workflowStep"}}
                    }],
                    "workflowAction": [
                        {
                            "name": "Post to Twitter",
                            "type": "PostToSocialMedia",
                            "provider": "Twitter",
                            "content": "📰 New blog post published: {triggerData.title}! Check it out here: https://your-website.com/blog/{triggerData.slug}"
                        },
                        {
                            "name": "Post to LinkedIn",
                            "type": "PostToSocialMedia",
                            "provider": "LinkedIn",
                            "content": "We've just published a new article: '{triggerData.title}'.\n\n{triggerData.summary}\n\nRead the full post on our blog: https://your-website.com/blog/{triggerData.slug}\n#YourIndustry #BlogPost"
                        }
                    ],
                    "workflowStep": [{
                        "name": "Post on Social Networks",
                        "workflow": {"$link": {"name": "Publish New Blog Post to Socials", "_model": "workflow"}},
                        "actions": {
                            "$link": {
                                "$or": [
                                    {"$eq": ["$name", "Post to Twitter"]},
                                    {"$eq": ["$name", "Post to LinkedIn"]}
                                ],
                                "_model": "workflowAction"
                            }
                        },
                        "isTerminal": true
                    }],
                    "workflowTrigger": [{
                        "name": "On New Blog Post Added",
                        "workflow": {"$link": {"name": "Publish New Blog Post to Socials", "_model": "workflow"}},
                        "type": "manual",
                        "onEvent": "DataAdded",
                        "targetModel": "content",
                        "dataFilter": {"category": {"$find": {"name": "Blog"}}},
                        "isActive": true
                    }],
                    "env": [
                        {"name": "TWITTER_API_KEY", "value": "your_key_here"},
                        {"name": "TWITTER_API_SECRET", "value": "your_secret_here"},
                        {"name": "LINKEDIN_ACCESS_TOKEN", "value": "your_token_here"}
                    ]
                }
            }
        },*/
        {
            "name": "E-commerce Starter Kit",
            "description": "Launch your online store in just a few clicks. This pack includes templates for products, orders, and customers, as well as sample data, KPIs, alerts and an order fulfillment workflow (with sending email).",
            "tags": ["e-commerce", "business", "store"],
            "models": ["env", "taxonomy", "product", "productVariant", "brand", "currency", "order", "shipment", "review", "cart", "cartItem", "discount", "workflow", "workflowStep", "workflowAction","workflowRun", "workflowTrigger", "translation", "lang", "kpi", "dashboard", "alert", "return"],
            "data": {
                "all": {
                    "env":envSmtp,
                    "taxonomy": [
                        { "name": "E-commerce", "type": "category" },
                        { "name": "Clothes", "type": "category", "parent": { "$find": { "name": "E-commerce" } } },
                        { "name": "Electronics", "type": "category", "parent": { "$find": { "name": "E-commerce" } } }
                    ],
                    "brand": [
                        { "name": "Brand A" },
                        { "name": "Brand B" }
                    ],
                    "currency": [
                        { "name": "Euro", "code": "EUR", "symbol": "€", "default": true },
                        { "name": "US Dollar", "code": "USD", "symbol": "$" }
                    ],
                    "product": [
                        {
                            "name": "T-shirt",
                            "slug": "t-shirt-coton-bio",
                            "seoTitle": "ORGANIC_COTTON_TSHIRT_TITLE",
                            "seoDescription": "ORGANIC_COTTON_TSHIRT_DESC",
                            "price": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "brand": { "$find": { "name": "Brand A" } },
                            "category": { "$find": { "name": "Clothes" } }
                        }
                    ],
                    "productVariant": [
                        {
                            "product": { "$find": { "name": "T-shirt" } },
                            "size": "S",
                            "color": "#FF0000",
                            "sku": "TSHIRT-S-RED",
                            "price": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "stock": 50
                        },
                        {
                            "product": { "$find": { "name": "T-shirt" } },
                            "size": "M",
                            "color": "#FF0000",
                            "sku": "TSHIRT-M-RED",
                            "price": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "stock": 40
                        },
                        {
                            "product": { "$find": { "name": "T-shirt" } },
                            "size": "L",
                            "color": "#FF0000",
                            "sku": "TSHIRT-L-RED",
                            "price": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "stock": 30
                        },
                        {
                            "product": { "$find": { "name": "T-shirt" } },
                            "size": "M",
                            "color": "#0000FF",
                            "sku": "TSHIRT-M-BLUE",
                            "price": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "stock": 45
                        },
                        {
                            "product": { "$find": { "name": "T-shirt" } },
                            "size": "L",
                            "color": "#0000FF",
                            "sku": "TSHIRT-L-BLUE",
                            "price": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "stock": 25
                        }
                    ],
                    "dashboard":  [{
                        name: "Business Overview",
                        description: "Displays the total revenue, total orders, and average order value of the store.",
                        layout: [{
                            "name": "Store Overview",
                            "kpis": ["Total Orders", "Average Order Value", "Total Revenue"],
                            "chartConfigs": [],
                            "flexViews": []
                        }],
                        settings: {
                            "defaultTimeRange": "last_7_days",
                            "refreshInterval": null
                        }
                    }],
                    "order": [
                        {
                            "orderId": "ORDER-0001",
                            "orderDate": "2023-10-27T10:00:00Z",
                            "status": "pending",
                            "products": { "$find": { "name": "T-shirt" } },
                            "customer": null,
                            "totalAmount": 25,
                            "currency": { "$find": { "code": "EUR" } },
                            "paymentMethod": "Credit Card",
                            "shippingAddress": null,
                            "billingAddress": null,
                            "shippedDate": null,
                            "deliveryDate": null,
                            "discount": null
                        }
                    ],
                    "kpi": [
                        {
                            "name": "Total Revenue",
                            "targetModel": "order",
                            "aggregationType": "sum",
                            "aggregationField": "totalAmount",
                            "unit": "€",
                            "icon": "FaMoneyBillWave"
                        },
                        {
                            "name": "Total Orders",
                            "targetModel": "order",
                            "aggregationType": "count",
                            "icon": "FaShoppingCart"
                        },
                        {
                            "name": "Average Order Value",
                            "targetModel": "order",
                            "aggregationType": "avg",
                            "aggregationField": "totalAmount",
                            "unit": "€",
                            "icon": "FaBalanceScale"
                        }
                    ],
                    "alert": [
                        {
                            "name": "Low Stock Warning",
                            "targetModel": "productVariant",
                            "description": "Checks every hour if any product variant stock is below 5.",
                            "triggerCondition": {
                                "$lt": ["$stock", 5]
                            },
                            "frequency": "0 * * * *",
                            "notificationChannel": "in_app",
                            "isActive": true
                        },
                        {
                            "name": "New Negative Review",
                            "targetModel": "review",
                            "description": "Checks every 15 minutes for new reviews with a score lower than 3.",
                            "triggerCondition": {
                                "$lt": ["$score", 3]
                            },
                            "frequency": "*/15 * * * *",
                            "notificationChannel": "in_app",
                            "isActive": true
                        },
                        {
                            "name": "High-Value Order Alert",
                            "targetModel": "order",
                            "description": "Checks every 10 minutes for new orders with a total amount greater than 500.",
                            "triggerCondition": {
                                "$gt": ["$totalAmount", 500]
                            },
                            "frequency": "*/10 * * * *",
                            "notificationChannel": "in_app",
                            "isActive": true
                        },
                        {
                            "name": "New Return Request",
                            "targetModel": "return",
                            "description": "Checks every 30 minutes for new return requests with 'pending' status.",
                            "triggerCondition": {
                                "$eq": ["$status", "en attente"]
                            },
                            "frequency": "*/30 * * * *",
                            "notificationChannel": "in_app",
                            "isActive": true
                        }
                    ],
                    "workflow": [{
                        "name": "Order Fulfillment",
                        "startStep": { "$link": { "name": "Validate Order", "_model": "workflowStep" } }
                    },{
                        "name": "Data purging",
                        "startStep": { "$link": { "name": "Purge execution", "_model": "workflowStep" } }
                    },{
                        "name": "Shipment Notification",
                        "description": "Notifies the customer when their order has been shipped.",
                        "startStep": { "$link": { "name": "Send Shipment Email Step", "_model": "workflowStep" } }
                    }],
                    "workflowAction": [
                        { "name": "Update order status to 'processing'", "type": "UpdateData", "targetModel": "order", "targetSelector": { "_id": { $toObjectId: "{triggerData._id}" }}, "fieldsToUpdate": { "status": "processing" } },
                        { "name": "Create Shipment Record", "type": "CreateData",
                            "targetModel": "shipment",
                            "dataToCreate": { "order": "{triggerData._id}", "status": "preparing" } },
                        { "name": "Update order status to 'shipped'", "type": "UpdateData", "targetModel": "order", "targetSelector": { "_id": { $toObjectId: "{triggerData._id}" }}, "fieldsToUpdate": { "status": "shipped" } },
                        {
                            name: 'Delete queries older than 30 days',
                            type: 'DeleteData',
                            targetModel: 'request',
                            targetSelector: {
                                "$lt": ["$timestamp", {"$subtract": ["$$NOW", 1000*3600*24*365*5] } ]
                            }
                        },
                        {
                            "name": "Send Shipping Notification Email",
                            "type": "SendEmail",
                            // C'est ici que la magie opère !
                            "emailRecipients": ["{triggerData.order.customer.contact.email}"],
                            "emailSubject": "Your order #{triggerData.order.orderId} has been shipped!",
                            "emailContent": "Hello {triggerData.order.customer.contact.firstName},<br><br>Good news! Your order #{triggerData.order.orderId} is on its way. You can track it using this number: <strong>{triggerData.trackingNumber}</strong>.<br><br>Thank you for your purchase!"
                        }
                    ],
                    "workflowStep": [
                        {
                            "name": "Validate Order",
                            "workflow": { "$link": { "name": "Order Fulfillment", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Update order status to 'processing'", "_model": "workflowAction" } },
                            "onSuccessStep": { "$link": { "name": "Prepare Shipment", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Prepare Shipment",
                            "workflow": { "$link": { "name": "Order Fulfillment", "_model": "workflow" }},
                            "actions": { "$link": { "name": "Create Shipment Record", "_model": "workflowAction" } },
                            "onSuccessStep": { "$link": { "name": "Ship Order", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Send Shipment Email Step",
                            "workflow": { "$link": { "name": "Shipment Notification", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Send Shipping Notification Email", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Ship Order",
                            "workflow": { "$link": { "name": "Order Fulfillment", "_model": "workflow" }},
                            "actions": {
                                "$link": {
                                    "$or": [
                                        { "$eq": ["$name", "Update order status to 'shipped'"]},
                                        { "$eq": ["$name", "Send Shipping Confirmation"]}
                                    ],
                                    "_model": "workflowAction"
                                }
                            },
                            "isTerminal": true
                        },
                        {
                            name: "Purge execution",
                            "workflow": { "$link": { "name": "Data purging", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Delete queries older than 30 days", "_model": "workflowAction" } },
                            isTerminal: true
                        }
                    ],
                    "workflowTrigger": [{
                        "name": "On New Shipment Created",
                        "workflow": { "$link": { "name": "Shipment Notification", "_model": "workflow" } },
                        "type": "manual", // Déclenché par un événement
                        "onEvent": "DataAdded",
                        "targetModel": "shipment",
                        "isActive": true
                    },{
                        name: 'Daily data purge',
                        type: 'scheduled',
                        workflow: { "$link": { "name": "Data purging", "_model": "workflow" } },
                        cronExpression: '0 2 * * *', // Tous les jours à 2h00 du matin
                        isActive: true
                    }]
                },
                "fr":{
                    "lang": [{
                        "name": "Français",
                        "code": "fr"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Send Shipping Confirmation", "value": "Envoyer la confirmation d'expédition" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ORGANIC_COTTON_TSHIRT_TITLE", "value": "T-shirt en Coton Bio - Confort et Style" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ORGANIC_COTTON_TSHIRT_DESC", "value":"Découvrez notre t-shirt unisexe 100 % coton biologique. Idéal pour un style décontracté et durable." },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Order Fulfillment", "value": "Traitement de la commande" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "New order created", "value": "Nouvelle commande créée" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Validate Order", "value": "Valider la commande" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Prepare Shipment", "value": "Préparer l'expédition" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ship Order", "value": "Expédier la commande" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Update order status to 'processing'", "value": "Mettre le statut à 'en cours de traitement'" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Create Shipment Record", "value": "Créer l'enregistrement d'expédition" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Update order status to 'shipped'", "value": "Mettre le statut à 'expédiée'" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Total Revenue", "value": "Chiffre d'affaires total" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Total Orders", "value": "Nombre de commandes" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Average Order Value", "value": "Panier moyen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Low Stock Warning", "value": "Alerte de stock bas" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "New Negative Review", "value": "Nouvel avis négatif" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "High-Value Order Alert", "value": "Alerte de commande de grande valeur" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "New Return Request", "value": "Nouvelle demande de retour" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Delete queries older than 30 days", "value": "Supprimer les requêtes de plus de 30 jours" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Data purging", "value": "Purge des données" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Daily data purge", "value": "Purge des données quotidienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Purge execution", "value": "Exécution de la purge des données" }
                    ]
                }
            }
        },
        {
            "name": "Website Starter Pack",
            "description": "All you need to create a new website with models, default categories, user permissions, KPIs, and a content review workflow. Multiple languages available.",
            "tags": ["website", "i18n", "workflow"],
            "models": ["content", "webpage", "translation", "message", "channel", "taxonomy", "lang", "user", "role", "permission", "kpi", "workflow", "workflowStep", "workflowAction", "workflowTrigger"],
            "data": {
                "all": {
                    "taxonomy": [{
                        name: 'Website',
                        description: 'Website main category',
                        parent: null
                    },...categories.map(c =>(
                        {
                            name: c,
                            type: 'category',
                            parent: {
                                "$find": {
                                    "name": "Website"
                                }
                            }
                        })), ...tags.map(t =>({
                        name: t,
                        type: 'keyword'
                    }))],
                    "permission": getPerms(['website', 'taxonomy', 'lang', 'user', 'role', 'permission']).map(m => {
                        return {
                            name: m,
                            description: ''
                        }
                    }),
                    "role": roles.map(m => {
                        return {
                            name: m.name,
                            permissions: {
                                "$link": {
                                    "$in": ["$name", m.perms],
                                    "_model": "permission"
                                }
                            }
                        }
                    }),
                    "channel": [
                        { "name": "Visitor alerts", "type": "web", "description": "Visitor main channel informations" },
                        { "name": "Newsletter", "type": "email", "description": "Newsletter channel" }
                    ]
                },
                "fr": {
                    "lang": [{
                        "name": "Français",
                        "code": "fr"
                    }],
                    "translation": [
                        { "lang": { "$link": { "$eq": ["$code", "fr"]}, "_model": "lang"}, "key": "Visitor alerts", "value": "Alertes visiteurs" }
                    ]
                }
            }
        },
        {
            "name": "Customer Relationship Management (CRM)",
            "description": "Manage your contacts, track your business opportunities and centralize your interactions so you never miss a sale again.",
            "tags": ["crm", "sales", "contacts"],
            "models": [
                "contact",
                {
                    "name": "deal",
                    "description": "Représente une opportunité commerciale avec un contact ou une entreprise.",
                    "fields": [
                        { "name": "name", "type": "string", "required": true, "asMain": true },
                        { "name": "company", "type": "relation", "relation": "contact", "relationFilter": { "$ne": {"$type":["$legalName", "missing"] }}},
                        { "name": "contact", "type": "relation", "relation": "contact" },
                        { "name": "amount", "type": "number"},
                        { "name": "status", "type": "enum", "items": ["Nouveau", "Qualifié", "Proposition", "Gagné", "Perdu"], "default": "Nouveau" },
                        { "name": "closingDate", "type": "date" }
                    ]
                },
                {
                    "name": "interaction",
                    "description": "Représente une interaction (appel, email, rdv) avec un contact ou une entreprise.",
                    "fields": [
                        { "name": "type", "type": "enum", "items": ["Appel", "Email", "Rendez-vous"], "required": true },
                        { "name": "subject", "type": "string", "required": true, "asMain": true },
                        { "name": "date", "type": "datetime", "required": true, "default": "now" },
                        { "name": "notes", "type": "richtext" },
                        { "name": "deal", "type": "relation", "relation": "deal" },
                        { "name": "contact", "type": "relation", "relation": "contact" }
                    ]
                },
                {
                    "name": "task",
                    "description": "Tâche à réaliser, souvent liée à une opportunité commerciale.",
                    "fields": [
                        { "name": "title", "type": "string", "required": true, "asMain": true },
                        { "name": "dueDate", "type": "datetime" },
                        { "name": "status", "type": "enum", "items": ["À faire", "En cours", "Terminé"], "default": "À faire" },
                        { "name": "relatedDeal", "type": "relation", "relation": "deal" },
                        { "name": "assignedTo", "type": "relation", "relation": "user" },
                        { "name": "description", "type": "richtext" }
                    ]
                },
                "workflow",
                "workflowStep",
                "workflowAction",
                "workflowTrigger",
                "kpi",
                "dashboard",
                "translation",
                "lang"
            ],
            "data": {
                "all": {
                    "contact": [
                        { "legalName": "Innovatech Solutions" },
                        { "legalName": "Global Exports" },
                        { "firstName": "Alice", "lastName": "Martin", "email": "alice.martin@innovatech.com" },
                        { "firstName": "Bob", "lastName": "Durand", "email": "bob.durand@globalexports.com" }
                    ],
                    "deal": [
                        { "name": "Opportunité Innovatech - Nouveau site web", "company": { "$link": { "legalName": "Innovatech Solutions", "_model": "contact" } }, "contact": { "$link": { "email": "alice.martin@innovatech.com","_model": "contact" } }, "amount": 15000, "status": "Nouveau", "closingDate": new Date(new Date().setDate(new Date().getDate() + 30)).toISOString() },
                        { "name": "Opportunité Global Exports - Plateforme logistique", "company": { "$link": { "legalName": "Global Exports", "_model": "contact" } }, "contact": { "$link": { "email": "bob.durand@globalexports.com","_model": "contact" } }, "amount": 50000, "status": "Qualifié", "closingDate": new Date(new Date().setDate(new Date().getDate() + 60)).toISOString() },
                        { "name": "Projet interne - Proposition", "amount": 20000, "status": "Proposition", "closingDate": new Date(new Date().setDate(new Date().getDate() + 45)).toISOString() },
                        { "name": "Ancienne opportunité - Gagnée", "amount": 10000, "status": "Gagné", "closingDate": new Date(new Date().setDate(new Date().getDate() - 15)).toISOString() },
                        { "name": "Ancienne opportunité - Perdue", "amount": 5000, "status": "Perdu", "closingDate": new Date(new Date().setDate(new Date().getDate() - 20)).toISOString() }
                    ],
                    "interaction": [
                        { "type": "Appel", "subject": "Premier contact avec Innovatech", "deal": { "$link": { "name": "Opportunité Innovatech - Nouveau site web","_model": "deal" } }, "contact": { "$link": { "email": "alice.martin@innovatech.com","_model": "contact" } }, "date": new Date(new Date().setDate(new Date().getDate() - 10)).toISOString() },
                        { "type": "Rendez-vous", "subject": "Présentation de la proposition à Global Exports", "deal": { "$link": { "name": "Opportunité Global Exports - Plateforme logistique","_model": "deal" } }, "date": new Date(new Date().setDate(new Date().getDate() - 5)).toISOString() }
                    ],
                    "task": [
                        { "title": "Envoyer la proposition à Innovatech", "dueDate": new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(), "status": "À faire", "relatedDeal": { "$find": { "name": "Opportunité Innovatech - Nouveau site web" } } }
                    ],
                    "kpi": [
                        { "name": "Taux de conversion", "targetModel": "deal", "aggregationType": "percent", "matchFormula": { "$eq": ["$status", "Gagné"] }, "totalMatchFormula": { "$in": ["$status", ["Gagné", "Perdu"]] }, "unit": "%", "icon": "FaChartLine" },
                        { "name": "Taille moyenne des contrats", "targetModel": "deal", "aggregationType": "avg", "aggregationField": "amount", "matchFormula": { "$eq": ["$status", "Gagné"] }, "unit": "€", "icon": "FaFileInvoiceDollar" },
                        { "name": "Pipeline de vente (valeur)", "targetModel": "deal", "aggregationType": "sum", "aggregationField": "amount", "matchFormula": { "$in": ["$status", ["Nouveau", "Qualifié", "Proposition"]] }, "icon": "FaLightbulb"}
                    ],
                    "dashboard": [{
                        "name": "Tableau de bord commercial", "description": "Vue d'ensemble du pipeline de vente et des performances commerciales.",
                        "layout": [
                            { "name": "Indicateurs clés", "kpis": ["Taux de conversion", "Taille moyenne des contrats", "Pipeline de vente (valeur)", "Opportunités nouvelles"] },
                            { "name": "Pipeline des ventes", "chartConfigs": [ { "title": "Opportunités par étape", "model": "deal", "type": "bar", "xAxis": "status", "yAxis": { "field": "_id", "aggregation": "count" } } ] }
                        ]
                    }],
                    "workflow": [{ "name": "Suivi post-rendez-vous", "startStep": { "$link": { "name": "Création de la tâche", "_model": "workflowStep" } }}],
                    "workflowAction": [{ "name": "Créer une tâche de suivi", "type": "CreateData", "targetModel": "task", "dataToCreate": { "title": "Faire le suivi du rendez-vous: {triggerData.subject}", "dueDate": "{$add: [\"$$NOW\", 2 * 24 * 60 * 60 * 1000]}", "status": "À faire", "relatedDeal": "{triggerData.deal}" } }],
                    "workflowStep": [{ "name": "Création de la tâche", "workflow": { "$link": { "name": "Suivi post-rendez-vous", "_model": "workflow" } }, "actions": { "$link": { "name": "Créer une tâche de suivi", "_model":"workflowAction" } }, "isTerminal": true }],
                    "workflowTrigger": [{ "name": "Après un rendez-vous client", "type": "manual", "workflow": { "$link": { "name": "Suivi post-rendez-vous", "_model": "workflow" } }, "onEvent": "DataAdded", "targetModel": "interaction", "dataFilter": { "$eq": ["$type", "Rendez-vous"] }, "isActive": true }]
                },
                "fr": {
                    "lang": [{ "name": "Français", "code": "fr" }],
                    "translation": [
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Taux de conversion", "value": "Taux de conversion" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Taille moyenne des contrats" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Pipeline de vente (valeur)" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Opportunités nouvelles" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Tableau de bord commercial" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Indicateurs clés" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Pipeline des ventes" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Opportunités par étape" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Suivi post-rendez-vous" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Créer une tâche de suivi" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Création de la tâche", "value": "Création de la tâche" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Après un rendez-vous client" },

                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "model_task", "value": "Tâches" },

                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_task_title", "value": "Titre de la tâche" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Date d'échéance" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_task_status", "value": "Statut" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Opportunité liée" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Assignée à" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_task_description", "value": "Description" },

                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_deal_name", "value": "Nom de l'opportunité" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_deal_company", "value": "Entreprise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_deal_contact", "value": "Contact" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_deal_amount", "value": "Montant" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_deal_status", "value": "Statut" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Date de clôture prévisionnelle" },

                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_interaction_type", "value": "Type d'interaction" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Sujet" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_interaction_date", "value": "Date" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Notes" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Opportunité liée" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Contact lié" },

                        { "lang":  { "$link": { "code": "fr", "_model": "lang" } }, "key": "model_description_task", "value": "Tâche à réaliser, souvent liée à une opportunité commerciale." },

                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "model_deal", "value": "Opportunités" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "model_description_deal", "value": "Représente une opportunité commerciale avec un contact ou une entreprise." },

                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "model_interaction", "value": "Interactions" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "model_description_interaction", "value": "Représente une interaction (appel, email, rdv) avec un contact ou une entreprise." }
                    ]
                },
                "en": {
                    "translation": [
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Conversion Rate", "value": "Conversion Rate" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Average Contract Size", "value": "Average Contract Size" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Sales Pipeline (Value)", "value": "Sales Pipeline (Value)" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "New Opportunities", "value": "New Opportunities" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Sales Dashboard", "value": "Sales Dashboard" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Key Indicators", "value": "Key Indicators" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Sales Pipeline", "value": "Sales Pipeline" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Opportunities by Stage", "value": "Opportunities by Stage" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Post-Meeting Follow-Up", "value": "Post-Meeting Follow-Up" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Create a follow-up task", "value": "Create a follow-up task" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Task creation", "value": "Task creation" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "After a client appointment", "value": "After a client appointment" },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "model_task", "value": "Tasks" },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_task_title", "value": "Task title" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Due Date" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_task_status", "value": "Status" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Related opportunity" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Assigned to" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_task_description", "value": "Description" },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_deal_name", "value": "Opportunity name" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_deal_company", "value": "Company" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_deal_contact", "value": "Contact" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_deal_amount", "value": "Amount" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_deal_status", "value": "Status" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Predicted closing date" },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_interaction_type", "value": "Interaction type" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Subject" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_interaction_date", "value": "Date" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Notes" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Linked Opportunity" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Linked Contact" },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "model_description_task", "value": "Task to be completed, often linked to a business opportunity." },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "model_deal", "value": "Opportunities" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "model_description_deal", "value": "Represents a business opportunity with a contact or company." },

                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "model_interaction", "value": "Interactions" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "model_description_interaction", "value": "Represents an interaction (call, email, meeting) with a contact or company." }
                    ]
                },
                "it": {
                    "lang": [{ "name": "Italiano", "code": "it" }],
                    "translation": [
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Taux de conversion", "value": "Tasso di conversione" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Dimensione media dei contratti" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Pipeline di vendita (valore)" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Nuove opportunità" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Dashboard commerciale" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Indicatori chiave" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Pipeline di vendita" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Opportunità per fase" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Follow-up post-incontro" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Crea un'attività di follow-up" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Création de la tâche", "value": "Creazione dell'attività" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Dopo un appuntamento con il cliente" },

                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "model_task", "value": "Attività" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_task_title", "value": "Titolo dell'attività" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Scadenza" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_task_status", "value": "Stato" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Opportunità correlata" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Assegnato a" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_task_description", "value": "Descrizione" },

                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_deal_name", "value": "Nome opportunità" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_deal_company", "value": "Azienda" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_deal_contact", "value": "Contatto" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_deal_amount", "value": "Importo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_deal_status", "value": "Stato" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Data di chiusura prevista" },

                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_interaction_type", "value": "Tipo di interazione" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Oggetto" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_interaction_date", "value": "Data" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Note" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Opportunità collegata" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Contatto collegato" },

                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "model_description_task", "value": "Attività da completare, spesso collegata a un'opportunità commerciale." },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "model_deal", "value": "Opportunità" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "model_description_deal", "value": "Rappresenta un'opportunità commerciale con un contatto o un'azienda." },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "model_interaction", "value": "Interazioni" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "model_description_interaction", "value": "Rappresenta un'interazione (chiamata, email, riunione) con un contatto o un'azienda." }
                    ]
                },

                "el": {
                    "lang": [{ "name": "Ελληνικά", "code": "el" }],
                    "translation": [
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Taux de conversion", "value": "Ποσοστό μετατροπής" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Μέσο μέγεθος συμβάσεων" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Διαδικασία πωλήσεων (αξία)" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Νέες ευκαιρίες" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Πίνακας ελέγχου πωλήσεων" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Βασικοί δείκτες" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Διαδικασία πωλήσεων" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Ευκαιρίες ανά στάδιο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Μετα-συνάντηση παρακολούθηση" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Δημιουργία εργασίας παρακολούθησης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Création de la tâche", "value": "Δημιουργία εργασίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Μετά από συνάντηση πελάτη" },

                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "model_task", "value": "Εργασίες" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_task_title", "value": "Τίτλος εργασίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Προθεσμία" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_task_status", "value": "Κατάσταση" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Σχετική ευκαιρία" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Ανατέθηκε σε" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_task_description", "value": "Περιγραφή" },

                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_deal_name", "value": "Όνομα ευκαιρίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_deal_company", "value": "Εταιρεία" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_deal_contact", "value": "Επαφή" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_deal_amount", "value": "Ποσό" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_deal_status", "value": "Κατάσταση" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Εκτιμώμενη ημερομηνία κλεισίματος" },

                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_interaction_type", "value": "Τύπος αλληλεπίδρασης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Θέμα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_interaction_date", "value": "Ημερομηνία" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Σημειώσεις" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Συνδεδεμένη ευκαιρία" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Συνδεδεμένη επαφή" },

                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "model_description_task", "value": "Εργασία που πρέπει να ολοκληρωθεί, συχνά συνδεδεμένη με μια ευκαιρία επιχείρησης." },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "model_deal", "value": "Ευκαιρίες" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "model_description_deal", "value": "Αντιπροσωπεύει μια ευκαιρία επιχείρησης με μια επαφή ή εταιρεία." },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "model_interaction", "value": "Αλληλεπιδράσεις" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "model_description_interaction", "value": "Αντιπροσωπεύει μια αλληλεπίδραση (κλήση, email, συνάντηση) με μια επαφή ή εταιρεία." }
                    ]
                },

                "pt": {
                    "lang": [{ "name": "Português", "code": "pt" }],
                    "translation": [
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Taux de conversion", "value": "Taxa de conversão" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Tamanho médio dos contratos" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Pipeline de vendas (valor)" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Novas oportunidades" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Painel de vendas" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Indicadores-chave" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Pipeline de vendas" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Oportunidades por estágio" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Acompanhamento pós-reunião" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Criar tarefa de acompanhamento" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Création de la tâche", "value": "Criação da tarefa" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Após reunião com cliente" },

                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "model_task", "value": "Tarefas" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_task_title", "value": "Título da tarefa" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Data de vencimento" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_task_status", "value": "Status" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Oportunidade relacionada" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Atribuído a" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_task_description", "value": "Descrição" },

                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_deal_name", "value": "Nome da oportunidade" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_deal_company", "value": "Empresa" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_deal_contact", "value": "Contato" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_deal_amount", "value": "Valor" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_deal_status", "value": "Status" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Data prevista de fechamento" },

                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_interaction_type", "value": "Tipo de interação" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Assunto" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_interaction_date", "value": "Data" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Notas" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Oportunidade vinculada" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Contato vinculado" },

                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "model_description_task", "value": "Tarefa a ser concluída, frequentemente vinculada a uma oportunidade de negócios." },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "model_deal", "value": "Oportunidades" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "model_description_deal", "value": "Representa uma oportunidade de negócios com um contato ou empresa." },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "model_interaction", "value": "Interações" },
                        { "lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "model_description_interaction", "value": "Representa uma interação (chamada, e-mail, reunião) com um contato ou empresa." }
                    ]
                },

                "ru": {
                    "lang": [{ "name": "Русский", "code": "ru" }],
                    "translation": [
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Taux de conversion", "value": "Коэффициент конверсии" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Средний размер контрактов" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Воронка продаж (стоимость)" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Новые возможности" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Панель продаж" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Ключевые показатели" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Воронка продаж" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Возможности по этапам" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Пост-встречное сопровождение" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Создать задачу сопровождения" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Création de la tâche", "value": "Создание задачи" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "После встречи с клиентом" },

                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "model_task", "value": "Задачи" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_task_title", "value": "Название задачи" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Срок выполнения" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_task_status", "value": "Статус" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Связанная возможность" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Назначено" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_task_description", "value": "Описание" },

                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_deal_name", "value": "Название возможности" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_deal_company", "value": "Компания" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_deal_contact", "value": "Контакт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_deal_amount", "value": "Сумма" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_deal_status", "value": "Статус" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Предполагаемая дата закрытия" },

                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_interaction_type", "value": "Тип взаимодействия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Тема" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_interaction_date", "value": "Дата" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Заметки" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Связанная возможность" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Связанный контакт" },

                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "model_description_task", "value": "Задача для выполнения, часто связанная с бизнес-возможностью." },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "model_deal", "value": "Возможности" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "model_description_deal", "value": "Представляет бизнес-возможность с контактом или компанией." },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "model_interaction", "value": "Взаимодействия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "model_description_interaction", "value": "Представляет взаимодействие (звонок, email, встреча) с контактом или компанией." }
                    ]
                },

                "es": {
                    "lang": [{ "name": "Español", "code": "es" }],
                    "translation": [
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Taux de conversion", "value": "Tasa de conversión" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Tamaño promedio de contratos" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Embudo de ventas (valor)" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Oportunidades nuevas" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Tablero de ventas" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Indicadores clave" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Embudo de ventas" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Oportunidades por etapa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Seguimiento post-reunión" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Crear tarea de seguimiento" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Création de la tâche", "value": "Creación de tarea" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Después de reunión con cliente" },

                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "model_task", "value": "Tareas" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_task_title", "value": "Título de tarea" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Fecha de vencimiento" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_task_status", "value": "Estado" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Oportunidad relacionada" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Asignado a" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_task_description", "value": "Descripción" },

                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_deal_name", "value": "Nombre de oportunidad" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_deal_company", "value": "Empresa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_deal_contact", "value": "Contacto" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_deal_amount", "value": "Monto" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_deal_status", "value": "Estado" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Fecha estimada de cierre" },

                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_interaction_type", "value": "Tipo de interacción" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Asunto" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_interaction_date", "value": "Fecha" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Notas" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Oportunidad vinculada" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Contacto vinculado" },

                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "model_description_task", "value": "Tarea por completar, frecuentemente vinculada a una oportunidad comercial." },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "model_deal", "value": "Oportunidades" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "model_description_deal", "value": "Representa una oportunidad comercial con un contacto o empresa." },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "model_interaction", "value": "Interacciones" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "model_description_interaction", "value": "Representa una interacción (llamada, email, reunión) con un contacto o empresa." }
                    ]
                },

                "de": {
                    "lang": [{ "name": "Deutsch", "code": "de" }],
                    "translation": [
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Taux de conversion", "value": "Konversionsrate" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Durchschnittliche Vertragsgröße" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Verkaufspipeline (Wert)" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Neue Möglichkeiten" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Vertriebs-Dashboard" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Indicateurs clés", "value": "KPI" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Verkaufspipeline" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Möglichkeiten nach Phase" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Nachbereitung Termin" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Follow-up-Aufgabe erstellen" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Création de la tâche", "value": "Aufgabenerstellung" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Nach Kundentermin" },

                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "model_task", "value": "Aufgaben" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_task_title", "value": "Aufgabentitel" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Fälligkeitsdatum" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_task_status", "value": "Status" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Zugehörige Möglichkeit" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Zugewiesen an" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_task_description", "value": "Beschreibung" },

                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_deal_name", "value": "Möglichkeitsname" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_deal_company", "value": "Firma" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_deal_contact", "value": "Kontakt" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_deal_amount", "value": "Betrag" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_deal_status", "value": "Status" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Voraussichtliches Abschlussdatum" },

                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_interaction_type", "value": "Interaktionstyp" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Betreff" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_interaction_date", "value": "Datum" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Notizen" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Verknüpfte Möglichkeit" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Verknüpfter Kontakt" },

                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "model_description_task", "value": "Zu erledigende Aufgabe, oft mit einer Geschäftsmöglichkeit verknüpft." },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "model_deal", "value": "Möglichkeiten" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "model_description_deal", "value": "Stellt eine Geschäftsmöglichkeit mit einem Kontakt oder Unternehmen dar." },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "model_interaction", "value": "Interaktionen" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "model_description_interaction", "value": "Stellt eine Interaktion (Anruf, E-Mail, Meeting) mit einem Kontakt oder Unternehmen dar." }
                    ]
                },

                "sv": {
                    "lang": [{ "name": "Svenska", "code": "sv" }],
                    "translation": [
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Taux de conversion", "value": "Konverteringsgrad" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Genomsnittlig kontraktsstorlek" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Försäljningspipeline (värde)" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Nya möjligheter" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Försäljningspanel" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Nyckeltal" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Försäljningspipeline" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Möjligheter per fas" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Uppföljning efter möte" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Skapa uppföljningsuppgift" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Création de la tâche", "value": "Uppgiftsskapande" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Efter kundmöte" },

                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "model_task", "value": "Uppgifter" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_task_title", "value": "Uppgiftsrubrik" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Förfallodatum" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_task_status", "value": "Status" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Relaterad möjlighet" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Tilldelad till" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_task_description", "value": "Beskrivning" },

                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_deal_name", "value": "Möjlighetsnamn" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_deal_company", "value": "Företag" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_deal_contact", "value": "Kontakt" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_deal_amount", "value": "Belopp" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_deal_status", "value": "Status" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Beräknat avslutsdatum" },

                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_interaction_type", "value": "Interaktionstyp" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Ämne" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_interaction_date", "value": "Datum" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Anteckningar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Länkad möjlighet" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Länkad kontakt" },

                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "model_description_task", "value": "Uppgift att slutföra, ofta kopplad till en affärsmöjlighet." },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "model_deal", "value": "Möjligheter" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "model_description_deal", "value": "Representerar en affärsmöjlighet med en kontakt eller ett företag." },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "model_interaction", "value": "Interaktioner" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "model_description_interaction", "value": "Representerar en interaktion (samtal, e-post, möte) med en kontakt eller ett företag." }
                    ]
                },

                "cs": {
                    "lang": [{ "name": "Čeština", "code": "cs" }],
                    "translation": [
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Taux de conversion", "value": "Konverzní poměr" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "Průměrná velikost smluv" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "Prodejní pipeline (hodnota)" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "Nové příležitosti" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "Prodejní dashboard" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Indicateurs clés", "value": "Klíčové ukazatele" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "Prodejní pipeline" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Opportunités par étape", "value": "Příležitosti podle fáze" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "Následná péče po schůzce" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "Vytvořit následný úkol" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Création de la tâche", "value": "Vytvoření úkolu" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "Po schůzce s klientem" },

                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "model_task", "value": "Úkoly" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_task_title", "value": "Název úkolu" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_task_dueDate", "value": "Termín splnění" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_task_status", "value": "Stav" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "Související příležitost" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "Přiřazeno" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_task_description", "value": "Popis" },

                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_deal_name", "value": "Název příležitosti" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_deal_company", "value": "Společnost" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_deal_contact", "value": "Kontakt" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_deal_amount", "value": "Částka" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_deal_status", "value": "Stav" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "Předpokládané datum uzavření" },

                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_interaction_type", "value": "Typ interakce" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_interaction_subject", "value": "Předmět" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_interaction_date", "value": "Datum" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_interaction_notes", "value": "Poznámky" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_interaction_deal", "value": "Propojená příležitost" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "field_interaction_contact", "value": "Propojený kontakt" },

                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "model_description_task", "value": "Úkol k dokončení, často spojený s obchodní příležitostí." },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "model_deal", "value": "Příležitosti" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "model_description_deal", "value": "Představuje obchodní příležitost s kontaktem nebo společností." },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "model_interaction", "value": "Interakce" },
                        { "lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "model_description_interaction", "value": "Představuje interakci (volání, e-mail, schůzka) s kontaktem nebo společností." }
                    ]
                },

                "ar": {
                    "lang": [{ "name": "العربية", "code": "ar" }],
                    "translation": [
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Taux de conversion", "value": "معدل التحويل" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "متوسط حجم العقود" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "خط أنابيب المبيعات (قيمة)" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "فرص جديدة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "لوحة تحكم المبيعات" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Indicateurs clés", "value": "المؤشرات الرئيسية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "خط أنابيب المبيعات" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Opportunités par étape", "value": "الفرص حسب المرحلة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "المتابعة بعد الاجتماع" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "إنشاء مهمة متابعة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Création de la tâche", "value": "إنشاء المهمة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "بعد اجتماع العميل" },

                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "model_task", "value": "المهام" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_task_title", "value": "عنوان المهمة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_task_dueDate", "value": "تاريخ الاستحقاق" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_task_status", "value": "الحالة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "الصفقة المرتبطة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "مخصص ل" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_task_description", "value": "الوصف" },

                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_deal_name", "value": "اسم الصفقة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_deal_company", "value": "الشركة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_deal_contact", "value": "جهة الاتصال" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_deal_amount", "value": "المبلغ" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_deal_status", "value": "الحالة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "تاريخ الإغلاق المتوقع" },

                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_interaction_type", "value": "نوع التفاعل" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_interaction_subject", "value": "الموضوع" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_interaction_date", "value": "التاريخ" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_interaction_notes", "value": "ملاحظات" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_interaction_deal", "value": "الصفقة المرتبطة" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "field_interaction_contact", "value": "جهة الاتصال المرتبطة" },

                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "model_description_task", "value": "مهمة يجب إكمالها، غالبًا ما تكون مرتبطة بفرصة عمل." },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "model_deal", "value": "الصفقات" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "model_description_deal", "value": "تمثل فرصة عمل مع جهة اتصال أو شركة." },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "model_interaction", "value": "التفاعلات" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "model_description_interaction", "value": "تمثل تفاعلًا (مكالمة، بريد إلكتروني، اجتماع) مع جهة اتصال أو شركة." }
                    ]
                },

                "fa": {
                    "lang": [{ "name": "فارسی", "code": "fa" }],
                    "translation": [
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Taux de conversion", "value": "نرخ تبدیل" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Taille moyenne des contrats", "value": "میانگین اندازه قراردادها" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Pipeline de vente (valeur)", "value": "خط لوله فروش (ارزش)" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Opportunités nouvelles", "value": "فرصت‌های جدید" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Tableau de bord commercial", "value": "داشبورد فروش" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Indicateurs clés", "value": "شاخص‌های کلیدی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Pipeline des ventes", "value": "خط لوله فروش" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Opportunités par étape", "value": "فرصت‌ها بر اساس مرحله" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Suivi post-rendez-vous", "value": "پیگیری پس از جلسه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Créer une tâche de suivi", "value": "ایجاد وظیفه پیگیری" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Création de la tâche", "value": "ایجاد وظیفه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Après un rendez-vous client", "value": "پس از جلسه با مشتری" },

                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "model_task", "value": "وظایف" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_task_title", "value": "عنوان وظیفه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_task_dueDate", "value": "تاریخ سررسید" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_task_status", "value": "وضعیت" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_task_relatedDeal", "value": "فرصت مرتبط" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_task_assignedTo", "value": "واگذار شده به" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_task_description", "value": "توضیحات" },

                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_deal_name", "value": "نام فرصت" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_deal_company", "value": "شرکت" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_deal_contact", "value": "مخاطب" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_deal_amount", "value": "مبلغ" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_deal_status", "value": "وضعیت" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_deal_closingDate", "value": "تاریخ پیش‌بینی شده بسته شدن" },

                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_interaction_type", "value": "نوع تعامل" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_interaction_subject", "value": "موضوع" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_interaction_date", "value": "تاریخ" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_interaction_notes", "value": "یادداشت‌ها" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_interaction_deal", "value": "فرصت مرتبط" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "field_interaction_contact", "value": "مخاطب مرتبط" },

                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "model_description_task", "value": "وظیفه‌ای که باید تکمیل شود، اغلب به یک فرصت تجاری مرتبط است." },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "model_deal", "value": "فرصت‌ها" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "model_description_deal", "value": "نمایانگر یک فرصت تجاری با یک مخاطب یا شرکت است." },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "model_interaction", "value": "تعاملات" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "model_description_interaction", "value": "نمایانگر یک تعامل (تماس، ایمیل، جلسه) با یک مخاطب یا شرکت است." }
                    ]
                }
            }
        },
        {
            "name": "AI Content Generation - Starter Pack",
            "description": "AI Content Generation Starter Pack : Generate SEO description for products using the OpenAI API or Google API",
            "models": ["workflow", "workflowAction", "workflowStep", "workflowTrigger", "env"],
            "data": {
                "all": {
                    "workflow": [{
                        "name": "Generate product description",
                        "startStep": { "$link": { "name": "Generate SEO description for products", "_model": "workflowStep" } }
                    }],
                    "workflowAction": [
                        {
                            "name": "Generate SEO Description from Product (OpenAI API)",
                            "type": "GenerateAIContent",
                            "aiProvider": "OpenAI",
                            "aiModel": "gpt-4o-mini",
                            "prompt": "Write a short, SEO-optimized product description (approximately 30-40 words) for the following product: '{triggerData.name}'. The description should be engaging and highlight the product. Return only the description text, without an introduction or conclusion."
                        },
                        {
                            "name": "Generate SEO Description from Product (Google API)",
                            "type": "GenerateAIContent",
                            "aiProvider": "Google",
                            "aiModel": "gemini-2.0-flash",
                            "prompt": "Write a short, SEO-optimized product description (approximately 30-40 words) for the following product: '{triggerData.name}'. The description should be engaging and highlight the product. Return only the description text, without an introduction or conclusion."
                        },
                        {
                            "name": "Update Product with AI Description",
                            "type": "UpdateData",
                            "targetModel": "product",
                            "targetSelector": {"$eq": ["$name", "{triggerData.name}"]},
                            "fieldsToUpdate": {"seoDescription": "{context.aiContent}"}
                        }
                    ],
                    "workflowStep": [
                        {
                            "name": "Generate SEO description for products",
                            "workflow": {"$find": {"name": "Generate product description"}},
                            "actions": {
                                "$find": {
                                    $or: [
                                        {"$eq": ["$name", "Generate SEO Description from Product (OpenAI API)"]},
                                        {"$eq": ["$name", "Update Product with AI Description"]}
                                    ]
                                }
                            },
                            "isTerminal": true
                        }
                    ],
                    "workflowTrigger": [{
                        "name": "On new product added",
                        "workflow": {"$find": {"$eq": ["$name", "Generate product description"]}},
                        "type": "manual",
                        "onEvent": "DataAdded",
                        "targetModel": "product",
                        "dataFilter": { "$or": [{"$eq": [{ "$type": "$seoDescription"}, "missing"]}, {"$eq": ["$seoDescription", ""]}]},
                        "isActive": true
                    }],
                    "env": [{
                        name: "OPENAI_API_KEY",
                        value: "demo"
                    },{
                        name: "GOOGLE_API_KEY",
                        value: "demo"
                    },{
                        name: "DEEPSEEK_API_KEY",
                        value: "demo"
                    }]
                }
            }
        },

        {
            "name": "Multilingual starter pack",
            "description": "All you need to start with a translated website, or to start multilingual systems.",
            "tags": ["i18n"],
            "models": ["translation", "lang"],
            "data": {
                "all": {
                    "lang": [
                        {
                            "name": "Français",
                            "code": "fr"
                        },
                        {
                            "name": "English",
                            "code": "en"
                        },
                        {
                            "name": "Español",
                            "code": "es"
                        },
                        {
                            "name": "Deutsch",
                            "code": "de"
                        },
                        {
                            "name": "中文 (普通话)",
                            "code": "zh"
                        },
                        {
                            "name": "العربية",
                            "code": "ar"
                        },
                        {
                            "name": "हिन्दी",
                            "code": "hi"
                        },
                        {
                            "name": "Português",
                            "code": "pt"
                        },
                        {
                            "name": "Русский",
                            "code": "ru"
                        },
                        {
                            "name": "日本語",
                            "code": "ja"
                        },
                        {
                            "name": "Italiano",
                            "code": "it"
                        },
                        {
                            "name": "Nederlands",
                            "code": "nl"
                        },
                        {
                            "name": "Svenska",
                            "code": "sv"
                        },
                        {
                            "name": "Suomi",
                            "code": "fi"
                        },
                        {
                            "name": "Dansk",
                            "code": "da"
                        },
                        {
                            "name": "Norsk",
                            "code": "no"
                        },
                        {
                            "name": "Polski",
                            "code": "pl"
                        },
                        {
                            "name": "Ελληνικά",
                            "code": "el"
                        },
                        {
                            "name": "Türkçe",
                            "code": "tr"
                        },
                        {
                            "name": "Magyar",
                            "code": "hu"
                        },
                        {
                            "name": "Čeština",
                            "code": "cs"
                        },
                        {
                            "name": "Română",
                            "code": "ro"
                        },
                        {
                            "name": "Українська",
                            "code": "uk"
                        },
                        {
                            "name": "Català",
                            "code": "ca"
                        },
                        {
                            "name": "Euskara",
                            "code": "eu"
                        },
                        {
                            "name": "Gaeilge",
                            "code": "ga"
                        },
                        {
                            "name": "Íslenska",
                            "code": "is"
                        },
                        {
                            "name": "한국어",
                            "code": "ko"
                        },
                        {
                            "name": "Tiếng Việt",
                            "code": "vi"
                        },
                        {
                            "name": "ไทย",
                            "code": "th"
                        },
                        {
                            "name": "Bahasa Indonesia",
                            "code": "id"
                        },
                        {
                            "name": "Bahasa Melayu",
                            "code": "ms"
                        },
                        {
                            "name": "தமிழ்",
                            "code": "ta"
                        },
                        {
                            "name": "తెలుగు",
                            "code": "te"
                        },
                        {
                            "name": "বাংলা",
                            "code": "bn"
                        },
                        {
                            "name": "ਪੰਜਾਬੀ",
                            "code": "pa"
                        },
                        {
                            "name": "اردو",
                            "code": "ur"
                        },
                        {
                            "name": "فارسی",
                            "code": "fa"
                        },
                        {
                            "name": "עברית",
                            "code": "he"
                        },
                        {
                            "name": "ಕನ್ನಡ",
                            "code": "kn"
                        },
                        {
                            "name": "မြန်မာဘာသာ",
                            "code": "my"
                        },
                        {
                            "name": "ភាសាខ្មែរ",
                            "code": "km"
                        },
                        {
                            "name": "Kiswahili",
                            "code": "sw"
                        },
                        {
                            "name": "Hausa",
                            "code": "ha"
                        },
                        {
                            "name": "Yorùbá",
                            "code": "yo"
                        },
                        {
                            "name": "isiZulu",
                            "code": "zu"
                        },
                        {
                            "name": "Afrikaans",
                            "code": "af"
                        },
                        {
                            "name": "አማርኛ",
                            "code": "am"
                        },
                        {
                            "name": "Soomaali",
                            "code": "so"
                        },
                        {
                            "name": "Malagasy",
                            "code": "mg"
                        },
                        {
                            "name": "Runa Simi",
                            "code": "qu"
                        },
                        {
                            "name": "Aymar aru",
                            "code": "ay"
                        },
                        {
                            "name": "Māori",
                            "code": "mi"
                        },
                        {
                            "name": "ʻŌlelo Hawaiʻi",
                            "code": "haw"
                        },
                        {
                            "name": "ᐃᓄᒃᑎᑐᑦ",
                            "code": "iu"
                        },
                        {
                            "name": "Sámegiella",
                            "code": "se"
                        },
                        {
                            "name": "Brezhoneg",
                            "code": "br"
                        },
                        {
                            "name": "Occitan",
                            "code": "oc"
                        },
                        {
                            "name": "Latina",
                            "code": "la"
                        },
                        {
                            "name": "Ἑλληνική",
                            "code": "grc"
                        },
                        {
                            "name": "संस्कृतम्",
                            "code": "sa"
                        },
                        {
                            "name": "ܐܪܡܝܐ",
                            "code": "arc"
                        },
                        {
                            "name": "Norrǿna",
                            "code": "non"
                        },
                        {
                            "name": "Esperanto",
                            "code": "eo"
                        }
                    ]
                },
                "fr": {
                    "translation": [
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Français", "value": "Français"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "English", "value": "Anglais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Español", "value": "Espagnol"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Deutsch", "value": "Allemand"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Chinois Mandarin"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "العربية", "value": "Arabe"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Português", "value": "Portugais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Русский", "value": "Russe"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "日本語", "value": "Japonais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Italiano", "value": "Italien"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Nederlands", "value": "Néerlandais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Svenska", "value": "Suédois"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Suomi", "value": "Finnois"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dansk", "value": "Danois"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Norsk", "value": "Norvégien"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Polski", "value": "Polonais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ελληνικά", "value": "Grec"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Türkçe", "value": "Turc"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Magyar", "value": "Hongrois"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Čeština", "value": "Tchèque"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Română", "value": "Roumain"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Українська", "value": "Ukrainien"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Català", "value": "Catalan"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Euskara", "value": "Basque"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Gaeilge", "value": "Gaélique (Irlandais)"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Íslenska", "value": "Islandais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "한국어", "value": "Coréen"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamien"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ไทย", "value": "Thaï"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonésien"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malais"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamoul"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugu"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "বাংলা", "value": "Bengali"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Pendjabi"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "اردو", "value": "Ourdou"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "فارسی", "value": "Persan (Farsi)"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "עברית", "value": "Hébreu"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Kannada"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Birman"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmer"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Kiswahili", "value": "Swahili"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Hausa", "value": "Hausa"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Yorùbá", "value": "Yoruba"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "isiZulu", "value": "Zoulou"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaans"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "አማርኛ", "value": "Amharique"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Soomaali", "value": "Somali"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Malagasy", "value": "Malagasy"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Runa Simi", "value": "Quechua"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Aymar aru", "value": "Aymara"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Māori", "value": "Maori"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Hawaïen"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Brezhoneg", "value": "Breton"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Occitan", "value": "Occitan"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Latina", "value": "Latin"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Grec ancien"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sanskrit"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Araméen"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Norrǿna", "value": "Vieux norrois"},
                        {"lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Esperanto", "value": "Espéranto"}
                    ]
                },
                "en": {
                    "translation": [
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Français", "value": "French"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "English", "value": "English"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Español", "value": "Spanish"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Deutsch", "value": "German"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Mandarin Chinese"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "العربية", "value": "Arabic"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Português", "value": "Portuguese"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Русский", "value": "Russian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "日本語", "value": "Japanese"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Italiano", "value": "Italian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Nederlands", "value": "Dutch"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Svenska", "value": "Swedish"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Suomi", "value": "Finnish"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dansk", "value": "Danish"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Norsk", "value": "Norwegian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Polski", "value": "Polish"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Ελληνικά", "value": "Greek"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Türkçe", "value": "Turkish"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Magyar", "value": "Hungarian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Čeština", "value": "Czech"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Română", "value": "Romanian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Українська", "value": "Ukrainian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Català", "value": "Catalan"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Euskara", "value": "Basque"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Gaeilge", "value": "Irish Gaelic"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Íslenska", "value": "Icelandic"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "한국어", "value": "Korean"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamese"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ไทย", "value": "Thai"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonesian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malay"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamil"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugu"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "বাংলা", "value": "Bengali"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Punjabi"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "فارسی", "value": "Persian (Farsi)"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "עברית", "value": "Hebrew"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Kannada"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Burmese"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmer"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Kiswahili", "value": "Swahili"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Hausa", "value": "Hausa"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Yorùbá", "value": "Yoruba"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "isiZulu", "value": "Zulu"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaans"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "አማርኛ", "value": "Amharic"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Soomaali", "value": "Somali"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Malagasy", "value": "Malagasy"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Runa Simi", "value": "Quechua"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Aymar aru", "value": "Aymara"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Māori", "value": "Maori"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Hawaiian"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Brezhoneg", "value": "Breton"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Occitan", "value": "Occitan"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Latina", "value": "Latin"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Ancient Greek"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sanskrit"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Aramaic"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Norrǿna", "value": "Old Norse"},
                        {"lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]
                },
                "es": {
                    "translation": [
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Français", "value": "Francés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "English", "value": "Inglés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Español", "value": "Español"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Deutsch", "value": "Alemán"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Chino Mandarín"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "العربية", "value": "Árabe"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Português", "value": "Portugués"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Русский", "value": "Ruso"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "日本語", "value": "Japonés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Italiano", "value": "Italiano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Nederlands", "value": "Neerlandés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Svenska", "value": "Sueco"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Suomi", "value": "Finés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dansk", "value": "Danés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Norsk", "value": "Noruego"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Polski", "value": "Polaco"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Ελληνικά", "value": "Griego"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Türkçe", "value": "Turco"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Magyar", "value": "Húngaro"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Čeština", "value": "Checo"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Română", "value": "Rumano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Українська", "value": "Ucraniano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Català", "value": "Catalán"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Euskara", "value": "Vasco"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Gaeilge", "value": "Gaélico Irlandés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Íslenska", "value": "Islandés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "한국어", "value": "Coreano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamita"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ไทย", "value": "Tailandés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonesio"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malayo"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamil"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugu"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "বাংলা", "value": "Bengalí"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Panyabí"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "فارسی", "value": "Persa (Farsi)"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "עברית", "value": "Hebreo"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Canarés"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Birmano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Jemer"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Kiswahili", "value": "Suajili"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Hausa", "value": "Hausa"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Yorùbá", "value": "Yoruba"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "isiZulu", "value": "Zulú"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikáans"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "አማርኛ", "value": "Amárico"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Soomaali", "value": "Somalí"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Malagasy", "value": "Malgache"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Runa Simi", "value": "Quechua"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Aymar aru", "value": "Aimara"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Māori", "value": "Maorí"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Hawaiano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Brezhoneg", "value": "Bretón"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Occitan", "value": "Occitano"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Latina", "value": "Latín"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Griego Antiguo"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sánscrito"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Arameo"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Norrǿna", "value": "Nórdico Antiguo"},
                        {"lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]
                },
                "ar": {
                    "translation": [
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Français", "value": "الفرنسية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "English", "value": "English"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Español", "value": "الإسبانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Deutsch", "value": "الألمانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "中文 (普通话)", "value": "الصينية الماندرين"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "العربية", "value": "العربية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "हिन्दी", "value": "الهندية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Português", "value": "البرتغالية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Русский", "value": "الروسية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "日本語", "value": "اليابانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Italiano", "value": "الإيطالية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Nederlands", "value": "الهولندية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Svenska", "value": "السويدية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Suomi", "value": "الفنلندية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dansk", "value": "الدنماركية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Norsk", "value": "النرويجية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Polski", "value": "البولندية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Ελληνικά", "value": "اليونانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Türkçe", "value": "التركية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Magyar", "value": "المجرية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Čeština", "value": "التشيكية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Română", "value": "الرومانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Українська", "value": "الأوكرانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Català", "value": "الكاتالانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Euskara", "value": "الباسكية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Gaeilge", "value": "الأيرلندية الغيلية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Íslenska", "value": "الأيسلندية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "한국어", "value": "الكورية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Tiếng Việt", "value": "الفيتنامية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ไทย", "value": "التايلاندية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "الإندونيسية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "الملايو"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "தமிழ்", "value": "التاميلية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "తెలుగు", "value": "التيلوغوية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "বাংলা", "value": "البنغالية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "البنجابية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "اردو", "value": "الأردية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "فارسی", "value": "الفارسية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "עברית", "value": "العبرية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "الكانادا"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "البورمية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "الخميرية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Kiswahili", "value": "السواحيلية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Hausa", "value": "الهوسا"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Yorùbá", "value": "اليوربا"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "isiZulu", "value": "الزولو"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Afrikaans", "value": "الأفريقانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "አማርኛ", "value": "الأمهرية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Soomaali", "value": "الصومالية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Malagasy", "value": "المالاغاسية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Runa Simi", "value": "الكويتشوا"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Aymar aru", "value": "الأيمارا"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Māori", "value": "الماورية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "الهوائية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "الإينكتيتوت"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Sámegiella", "value": "السامية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Brezhoneg", "value": "البريتانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Occitan", "value": "الأوكسيتانية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Latina", "value": "اللاتينية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Ἑλληνική", "value": "اليونانية القديمة"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "संस्कृतम्", "value": "السنسكريتية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "الآرامية"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Norrǿna", "value": "النوردية القديمة"},
                        {"lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Esperanto", "value": "الإسبرانتو"}
                    ]
                },
                "pt": {
                    "translation": [
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Français", "value": "Francês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "English", "value": "Inglês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Español", "value": "Espanhol"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Deutsch", "value": "Alemão"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Chinês Mandarim"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "العربية", "value": "Árabe"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Português", "value": "Português"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Русский", "value": "Russo"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "日本語", "value": "Japonês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Italiano", "value": "Italiano"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Nederlands", "value": "Holandês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Svenska", "value": "Sueco"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Suomi", "value": "Finlandês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Dansk", "value": "Dinamarquês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Norsk", "value": "Norueguês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Polski", "value": "Polaco"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Ελληνικά", "value": "Grego"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Türkçe", "value": "Turco"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Magyar", "value": "Húngaro"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Čeština", "value": "Tcheco"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Română", "value": "Romeno"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Українська", "value": "Ucraniano"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Català", "value": "Catalão"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Euskara", "value": "Basco"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Gaeilge", "value": "Irlandês Gaélico"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Íslenska", "value": "Islandês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "한국어", "value": "Coreano"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamita"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ไทย", "value": "Tailandês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonésio"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malaio"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "தமிழ்", "value": "Tâmil"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugo"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "বাংলা", "value": "Bengali"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Punjabi"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "فارسی", "value": "Persa"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "עברית", "value": "Hebraico"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Canarim"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Birmanês"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmer"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Kiswahili", "value": "Suaíli"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Hausa", "value": "Hauçá"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Yorùbá", "value": "Iorubá"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "isiZulu", "value": "Zulu"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaans"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "አማርኛ", "value": "Amárico"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Soomaali", "value": "Somali"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Malagasy", "value": "Malgaxe"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Runa Simi", "value": "Quíchua"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Aymar aru", "value": "Aimará"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Māori", "value": "Maori"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Havaiano"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Brezhoneg", "value": "Bretão"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Occitan", "value": "Occitano"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Latina", "value": "Latim"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Grego Antigo"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sânscrito"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Aramaico"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Norrǿna", "value": "Nórdico Antigo"},
                        {"lang": { "$link": { "code": "pt", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]

                },
                "de": {
                    "translation": [
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Français", "value": "Französisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "English", "value": "Englisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Español", "value": "Spanisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Deutsch", "value": "Deutsch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Chinesisch (Mandarin)"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "العربية", "value": "Arabisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Português", "value": "Portugiesisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Русский", "value": "Russisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "日本語", "value": "Japanisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Italiano", "value": "Italienisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Nederlands", "value": "Niederländisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Svenska", "value": "Schwedisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Suomi", "value": "Finnisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dansk", "value": "Dänisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Norsk", "value": "Norwegisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Polski", "value": "Polnisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Ελληνικά", "value": "Griechisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Türkçe", "value": "Türkisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Magyar", "value": "Ungarisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Čeština", "value": "Tschechisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Română", "value": "Rumänisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Українська", "value": "Ukrainisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Català", "value": "Katalanisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Euskara", "value": "Baskisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Gaeilge", "value": "Irisch-Gälisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Íslenska", "value": "Isländisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "한국어", "value": "Koreanisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamesisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ไทย", "value": "Thailändisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonesisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malaiisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamil"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugu"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "বাংলা", "value": "Bengalisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Punjabi"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "فارسی", "value": "Persisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "עברית", "value": "Hebräisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Kannada"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Birmanisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmer"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Kiswahili", "value": "Swahili"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Hausa", "value": "Haussa"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Yorùbá", "value": "Yoruba"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "isiZulu", "value": "Zulu"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaans"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "አማርኛ", "value": "Amharisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Soomaali", "value": "Somali"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Malagasy", "value": "Madagassisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Runa Simi", "value": "Quechua"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Aymar aru", "value": "Aymara"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Māori", "value": "Maori"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Hawaiianisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Brezhoneg", "value": "Bretonisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Occitan", "value": "Okzitanisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Latina", "value": "Latein"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Altgriechisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sanskrit"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Aramäisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Norrǿna", "value": "Altnordisch"},
                        {"lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]
                },
                "cs": {
                    "translation": [
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Français", "value": "Francouzština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "English", "value": "Angličtina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Español", "value": "Španělština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Deutsch", "value": "Němčina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Čínština (Mandarin)"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "العربية", "value": "Arabština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Português", "value": "Portugalština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Русский", "value": "Ruština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "日本語", "value": "Japonština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Italiano", "value": "Italština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Nederlands", "value": "Nizozemština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Svenska", "value": "Švédština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Suomi", "value": "Finština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Dansk", "value": "Dánština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Norsk", "value": "Norština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Polski", "value": "Polština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Ελληνικά", "value": "Řečtina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Türkçe", "value": "Turečtina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Magyar", "value": "Maďarština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Čeština", "value": "Čeština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Română", "value": "Rumunština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Українська", "value": "Ukrajinština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Català", "value": "Katalánština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Euskara", "value": "Baskičtina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Gaeilge", "value": "Irská Gaelština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Íslenska", "value": "Islandština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "한국어", "value": "Korejština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ไทย", "value": "Thajština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonéština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malajština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamilština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "বাংলা", "value": "Bengálština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Pandžábština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "فارسی", "value": "Perština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "עברית", "value": "Hebrejština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Kannadština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Barmština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmerština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Kiswahili", "value": "Svahilština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Hausa", "value": "Hauština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Yorùbá", "value": "Jorubština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "isiZulu", "value": "Zuluština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaánština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "አማርኛ", "value": "Amharština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Soomaali", "value": "Somálština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Malagasy", "value": "Malgaština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Runa Simi", "value": "Kečuánština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Aymar aru", "value": "Aymarština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Māori", "value": "Maorština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Havajština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Sámegiella", "value": "Sámština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Brezhoneg", "value": "Bretónština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Occitan", "value": "Ocitánština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Latina", "value": "Latina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Starořečtina"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sanskrit"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Aramejština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Norrǿna", "value": "Staroseverština"},
                        {"lang": { "$link": { "code": "cs", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]
                },
                "it": {
                    "translation": [
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Français", "value": "Francese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "English", "value": "Inglese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Español", "value": "Spagnolo"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Deutsch", "value": "Tedesco"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Cinese (Mandarino)"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "العربية", "value": "Arabo"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Português", "value": "Portoghese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Русский", "value": "Russo"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "日本語", "value": "Giapponese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Italiano", "value": "Italiano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Nederlands", "value": "Olandese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Svenska", "value": "Svedese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Suomi", "value": "Finlandese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dansk", "value": "Danese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Norsk", "value": "Norvegese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Polski", "value": "Polacco"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Ελληνικά", "value": "Greco"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Türkçe", "value": "Turco"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Magyar", "value": "Ungherese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Čeština", "value": "Ceco"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Română", "value": "Rumeno"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Українська", "value": "Ucraino"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Català", "value": "Catalano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Euskara", "value": "Basco"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Gaeilge", "value": "Gaelico irlandese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Íslenska", "value": "Islandese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "한국어", "value": "Coreano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamita"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ไทย", "value": "Thailandese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonesiano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malaio"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamil"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugu"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "বাংলা", "value": "Bengalese"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Punjabi"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "فارسی", "value": "Persiano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "עברית", "value": "Ebraico"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Kannada"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Birmano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmer"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Kiswahili", "value": "Swahili"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Hausa", "value": "Hausa"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Yorùbá", "value": "Yoruba"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "isiZulu", "value": "Zulu"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaans"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "አማርኛ", "value": "Amarico"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Soomaali", "value": "Somalo"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Malagasy", "value": "Malgascio"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Runa Simi", "value": "Quechua"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Aymar aru", "value": "Aymara"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Māori", "value": "Maori"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Hawaiano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Brezhoneg", "value": "Bretone"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Occitan", "value": "Occitano"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Latina", "value": "Latino"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Greco antico"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sanscrito"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Aramaico"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Norrǿna", "value": "Norreno"},
                        {"lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]
                },
                "el": {
                    "translation": [
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Français", "value": "Γαλλικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "English", "value": "Αγγλικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Español", "value": "Ισπανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Deutsch", "value": "Γερμανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Κινεζικά (Μανδαρινικά)"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "العربية", "value": "Αραβικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "हिन्दी", "value": "Χίντι"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Português", "value": "Πορτογαλικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Русский", "value": "Ρωσικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "日本語", "value": "Ιαπωνικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Italiano", "value": "Ιταλικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Nederlands", "value": "Ολλανδικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Svenska", "value": "Σουηδικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Suomi", "value": "Φινλανδικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dansk", "value": "Δανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Norsk", "value": "Νορβηγικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Polski", "value": "Πολωνικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Ελληνικά", "value": "Ελληνικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Türkçe", "value": "Τουρκικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Magyar", "value": "Ουγγρικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Čeština", "value": "Τσεχικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Română", "value": "Ρουμανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Українська", "value": "Ουκρανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Català", "value": "Καταλανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Euskara", "value": "Βασκικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Gaeilge", "value": "Ιρλανδικά Γαελικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Íslenska", "value": "Ισλανδικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "한국어", "value": "Κορεατικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Βιετναμικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ไทย", "value": "Ταϊλανδικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Ινδονησιακά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Μαλαισιανά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "தமிழ்", "value": "Ταμίλ"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "తెలుగు", "value": "Τελούγκου"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "বাংলা", "value": "Βεγγαλικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Παντζάμπι"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "اردو", "value": "Ουρντού"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "فارسی", "value": "Περσικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "עברית", "value": "Εβραϊκά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Καννάδα"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Βιρμανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Χμερ"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Kiswahili", "value": "Σουαχίλι"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Hausa", "value": "Χάουσα"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Yorùbá", "value": "Γιορούμπα"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "isiZulu", "value": "Ζουλού"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Afrikaans", "value": "Αφρικάανς"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "አማርኛ", "value": "Αμχαρικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Soomaali", "value": "Σομαλικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Malagasy", "value": "Μαλγασικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Runa Simi", "value": "Κέτσουα"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Aymar aru", "value": "Αϊμάρα"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Māori", "value": "Μαορί"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Χαβανέζικα"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Ινουκτιτούτ"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Sámegiella", "value": "Σάμι"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Brezhoneg", "value": "Βρετονικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Occitan", "value": "Οξιτανικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Latina", "value": "Λατινικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Αρχαία Ελληνικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Σανσκριτικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Αραμαϊκά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Norrǿna", "value": "Παλαιά Νορβηγικά"},
                        {"lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Esperanto", "value": "Εσπεράντο"}
                    ]
                },
                "ru": {
                    "translation": [
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Français", "value": "Французский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "English", "value": "Английский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Español", "value": "Испанский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Deutsch", "value": "Немецкий"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Китайский (мандаринский)"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "العربية", "value": "Арабский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "हिन्दी", "value": "Хинди"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Português", "value": "Португальский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Русский", "value": "Русский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "日本語", "value": "Японский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Italiano", "value": "Итальянский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Nederlands", "value": "Нидерландский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Svenska", "value": "Шведский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Suomi", "value": "Финский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dansk", "value": "Датский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Norsk", "value": "Норвежский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Polski", "value": "Польский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Ελληνικά", "value": "Греческий"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Türkçe", "value": "Турецкий"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Magyar", "value": "Венгерский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Čeština", "value": "Чешский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Română", "value": "Румынский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Українська", "value": "Украинский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Català", "value": "Каталанский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Euskara", "value": "Баскский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Gaeilge", "value": "Ирландский гельский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Íslenska", "value": "Исландский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "한국어", "value": "Корейский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Вьетнамский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ไทย", "value": "Тайский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Индонезийский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Малайский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "தமிழ்", "value": "Тамильский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "తెలుగు", "value": "Телугу"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "বাংলা", "value": "Бенгальский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Панджаби"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "اردو", "value": "Урду"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "فارسی", "value": "Персидский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "עברית", "value": "Иврит"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Каннада"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Бирманский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Кхмерский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Kiswahili", "value": "Суахили"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Hausa", "value": "Хауса"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Yorùbá", "value": "Йоруба"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "isiZulu", "value": "Зулу"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Afrikaans", "value": "Африкаанс"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "አማርኛ", "value": "Амхарский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Soomaali", "value": "Сомалийский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Malagasy", "value": "Малагасийский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Runa Simi", "value": "Кечуа"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Aymar aru", "value": "Аймара"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Māori", "value": "Маори"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Гавайский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Инуктитут"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Sámegiella", "value": "Саамский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Brezhoneg", "value": "Бретонский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Occitan", "value": "Окситанский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Latina", "value": "Латинский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Древнегреческий"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Санскрит"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Арамейский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Norrǿna", "value": "Древнескандинавский"},
                        {"lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Esperanto", "value": "Эсперанто"}
                    ]
                },
                "sv": {
                    "translation": [
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Français", "value": "Finska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "English", "value": "Engelska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Español", "value": "Spanska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Deutsch", "value": "Tyska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "中文 (普通话)", "value": "Kinesiska (Mandarin)"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "العربية", "value": "Arabiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "हिन्दी", "value": "Hindi"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Português", "value": "Portugisiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Русский", "value": "Ryska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "日本語", "value": "Japanska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Italiano", "value": "Italienska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Nederlands", "value": "Nederländska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Svenska", "value": "Svenska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Suomi", "value": "Finska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dansk", "value": "Danska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Norsk", "value": "Norska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Polski", "value": "Polska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Ελληνικά", "value": "Grekiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Türkçe", "value": "Turkiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Magyar", "value": "Ungerska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Čeština", "value": "Tjeckiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Română", "value": "Rumänska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Українська", "value": "Ukrainska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Català", "value": "Katalanska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Euskara", "value": "Baskiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Gaeilge", "value": "Irländsk gaeliska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Íslenska", "value": "Isländska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "한국어", "value": "Koreanska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Tiếng Việt", "value": "Vietnamesiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ไทย", "value": "Thailändska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Bahasa Indonesia", "value": "Indonesiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Bahasa Melayu", "value": "Malajiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "தமிழ்", "value": "Tamil"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "తెలుగు", "value": "Telugu"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "বাংলা", "value": "Bengali"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ਪੰਜਾਬੀ", "value": "Punjabi"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "اردو", "value": "Urdu"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "فارسی", "value": "Persiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "עברית", "value": "Hebreiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ಕನ್ನಡ", "value": "Kannada"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "မြန်မာဘာသာ", "value": "Burmese"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ភាសាខ្មែរ", "value": "Khmer"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Kiswahili", "value": "Swahili"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Hausa", "value": "Hausa"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Yorùbá", "value": "Yoruba"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "isiZulu", "value": "Zulu"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Afrikaans", "value": "Afrikaans"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "አማርኛ", "value": "Amhariska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Soomaali", "value": "Somali"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Malagasy", "value": "Malagassiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Runa Simi", "value": "Quechua"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Aymar aru", "value": "Aymara"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Māori", "value": "Maori"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ʻŌlelo Hawaiʻi", "value": "Hawaiiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ᐃᓄᒃᑎᑐᑦ", "value": "Inuktitut"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Sámegiella", "value": "Sami"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Brezhoneg", "value": "Bretonska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Occitan", "value": "Ockitanska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Latina", "value": "Latin"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Ἑλληνική", "value": "Grekiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "संस्कृतम्", "value": "Sanskrit"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "ܐܪܡܝܐ", "value": "Arameiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Norrǿna", "value": "Fornnordiska"},
                        {"lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Esperanto", "value": "Esperanto"}
                    ]

                }
            }
        },
        {
            "name": "Currencies Database",
            "description": "Database of currencies",
            "tags": ["e-commerce", "currencies", "i18n"],
            "models": ["currency", "translation", "lang"],
            "data": {
                "all": {
                    "currency": [
                        { name:"Lek",code:"ALL", symbol: "L" },
                        { name:"Rouble Biélorusse",code:"BYN", symbol: "Br" },
                        { name:"Mark convertible de Bosnie-Herzégovine",code:"BAM", symbol: "KM" },
                        { name:"Lev bulgare",code:"BGN", symbol: "Лв" },
                        { name:"Couronne Tchèque",code:"CZK", symbol: "Kč" },
                        { name:"Couronne danoise",code:"DKK", symbol: "kr" },
                        { name:"Iari",code:"GEL", symbol: "₾" },
                        { name:"Couronne danoise",code:"DKK", symbol: "Kr" },
                        { name:"Forint",code:"HUF", symbol: "ft" },
                        { name:"Couronne islandaise",code:"ISK", symbol: "kr, Íkr" },
                        { name:"Franc suisse",code:"CHF", symbol: "CHF" },
                        { name:"Leu moldave",code:"MDL", symbol: "L" },
                        { name:"Denar macédonien",code:"MKD", symbol: "Ден" },
                        { name:"Couronne norvégienne",code:"NOK", symbol: "Kr" },
                        { name:"Zloty",code:"PLN", symbol: "Zł" },
                        { name:"Leu roumain",code:"RON", symbol: "lei" },
                        { name:"Rouble russe",code:"RUB", symbol: "₽" },
                        { name:"Dinar serbe",code:"RSD", symbol: "RSD" },
                        { name:"Franc suisse",code:"CHF", symbol: "CHF" },
                        { name:"Livre turque",code:"TRY", symbol: "₺" },
                        { name:"Hryvnia",code:"UAH", symbol: "₴" },
                        { name:"Livre sterling",code:"GBP", symbol: "£" },
                        { name:"Dollar américain",code:"USD", symbol: "$" },
                        { name:"Dollar des caraïbes orientales",code:"XCD", symbol: "$" },
                        { name:"Florin arubais",code:"AWG", symbol: "ƒ" },
                        { name:"Peso argentin",code:"ARS", symbol: "$" },
                        { name:"Dollar bahaméen",code:"BSD", symbol: "B$" },
                        { name:"Dollar barbadien",code:"BBD", symbol: "$" },
                        { name:"Dollar bermudien",code:"BMD", symbol: "$" },
                        { name:"Dollar bélizien",code:"BZD", symbol: "BZ$" },
                        { name:"Boliviano",code:"BOB", symbol: "Bs" },
                        { name:"Real",code:"BRL", symbol: "R$" },
                        { name:"Dollar canadien",code:"CAD", symbol: "CA$" },
                        { name:"Dollar des Îles Caïmans",code:"KYD", symbol: "CI$" },
                        { name:"Peso chilien",code:"CLP", symbol: "$" },
                        { name:"Peso colombien",code:"COP", symbol: "$" },
                        { name:"Colón costaricien",code:"CRC", symbol: "₡" },
                        { name:"Peso cubain",code:"CUP", symbol: "CUC$" },
                        { name:"Florin des Antilles néerlandaise",code:"ANG", symbol: "ƒ" },
                        { name:"Peso dominicain",code:"DOP", symbol: "RD$" },
                        { name:"Livre des Îles Malouines",code:"FKP", symbol: "FK£" },
                        { name:"Quetzal",code:"GTQ", symbol: "Q" },
                        { name:"Dollar guyanais",code:"GYD", symbol: "G$" },
                        { name:"Gourde",code:"HTQ", symbol: "G" },
                        { name:"Lempira",code:"HNL", symbol: "L" },
                        { name:"Dollar jamaïcain",code:"JMD", symbol: "J$" },
                        { name:"Peso mexicain",code:"MXN", symbol: "$" },
                        { name:"Cordoba d’or",code:"NIO", symbol: "C$" },
                        { name:"Balboa",code:"PAB", symbol: "B/." },
                        { name:"Guarani",code:"PYG", symbol: "₲" },
                        { name:"Sol péruvien",code:"PEN", symbol: "S/." },
                        { name:"Florin des Antilles néerlandaise",code:"ANG", symbol: "Ƒ" },
                        { name:"Dollar surinamien",code:"SRD", symbol: "Sr$" },
                        { name:"Dollar de Trinité-et-Tobago",code:"TTD", symbol: "TT$" },
                        { name:"Peso uruguayen",code:"UYU", symbol: "$U" },
                        { name:"Bolivar vénézuélien",code:"VED", symbol: "Bs." },
                        { name:"Afghani",code:"AFN", symbol: "؋" },
                        { name:"Dram",code:"AMD", symbol: "֏, դր" },
                        { name:"Manat azerbaïdjanais",code:"AZN", symbol: "₼" },
                        { name:"Dinar bahreïni",code:"BHD", symbol: ".د.ب" },
                        { name:"Euro",code:"EUR", symbol: "€" },
                        { name:"Lari",code:"GEL", symbol: "ლარი" },
                        { name:"Dinar iraqien",code:"IQD", symbol: "ع.د" },
                        { name:"Rial iranien",code:"IRR", symbol: "﷼" },
                        { name:"Dinar jordanien",code:"JOD", symbol: "ينار" },
                        { name:"Dinar koweïtien",code:"KWD", symbol: "ك" },
                        { name:"Livre libanaise",code:"LBP", symbol: "ل.ل" },
                        { name:"Shekel",code:"ILS", symbol: "₪" },
                        { name:"Livre syrienne",code:"SYP", symbol: "£S" },
                        { name:"Dirham des Émirats arabes unis",code:"AED", symbol: "AED" },
                        { name:"Rial omanais",code:"OMR", symbol: "ر.ع" },
                        { name:"Riyal du Qatar",code:"QAR", symbol: "ر.ق" },
                        { name:"Rial saoudien",code:"SAR", symbol: "SR" },
                        { name:"Rial yéménite",code:"YER", symbol: "﷼" },
                        { name:"Shekel israélien",code:"ILS", symbol: "₪" },
                        { name:"Franc CFA",code:"XAF", symbol: "FCFA" },
                        { name:"Franc CFA",code:"XOF", symbol: "CFA" },
                        { name:"Dinar algérien",code:"DZD", symbol: "دج" },
                        { name:"Kwanza",code:"AOA", symbol: "Kz" },
                        { name:"Pula",code:"BWP", symbol: "P" },
                        { name:"Franc burundais",code:"BIF", symbol: "FBu" },
                        { name:"Escudo cap-verdien",code:"CVE", symbol: "CVE" },
                        { name:"Franc comorien",code:"KMF", symbol: "CF" },
                        { name:"Franc congolais",code:"CDF", symbol: "FC" },
                        { name:"Franc Djibouti",code:"DJF", symbol: "Fdj" },
                        { name:"Livre égyptienne",code:"EGP", symbol: "E£" },
                        { name:"Nakfa érythréen",code:"ERN", symbol: "Nkf" },
                        { name:"Birr",code:"ETB", symbol: "Br" },
                        { name:"Lilangeni",code:"SZL", symbol: "L" },
                        { name:"Dalasi",code:"GMD", symbol: "D" },
                        { name:"Cédi",code:"GHS", symbol: "GH₵" },
                        { name:"Franc guinéen",code:"GNF", symbol: "FG" },
                        { name:"Shilling Kenyan",code:"KES", symbol: "KSh" },
                        { name:"Loti",code:"LSL", symbol: "L" },
                        { name:"Liberian dollar",code:"LRD", symbol: "LD$" },
                        { name:"Dinar libyen",code:"LYD", symbol: "LD" },
                        { name:"Ariary",code:"MGA", symbol: "Ar" },
                        { name:"Kwacha malawien",code:"MWK", symbol: "K" },
                        { name:"Roupie mauricienne",code:"MUR", symbol: "₨" },
                        { name:"Ouguiya",code:"MRU", symbol: "UM" },
                        { name:"Dirham marocain",code:"MAD", symbol: "DH" },
                        { name:"Metical",code:"MZN", symbol: "MT" },
                        { name:"Dollar namibien",code:"NAD", symbol: "N$" },
                        { name:"Naira nigérien",code:"NGN", symbol: "₦" },
                        { name:"Franc rwandais",code:"RWF", symbol: "R₣" },
                        { name:"Dobra",code:"STN", symbol: "Db" },
                        { name:"Roupie seychelloise",code:"SCR", symbol: "SR" },
                        { name:"Leone",code:"SLL", symbol: "Le" },
                        { name:"Shilling somalien",code:"SOS", symbol: "Sh.So." },
                        { name:"Rand",code:"ZAR", symbol: "R" },
                        { name:"Livre soudanaise du sud",code:"SSP", symbol: "SS£" },
                        { name:"Livre soudanaise",code:"SDG", symbol: "SDG" },
                        { name:"Shilling tanzanien",code:"TZS", symbol: "TSh" },
                        { name:"Dinar tunisien",code:"TND", symbol: "د.ت" },
                        { name:"Shilling ougandais",code:"UGX", symbol: "USh" },
                        { name:"Dollar australien",code:"AUD", symbol: "A$" },
                        { name:"Taka bangladais",code:"BDT", symbol: "৳" },
                        { name:"Ngultrum bhoutanais",code:"BTN", symbol: "Nu" },
                        { name:"Dollar de Brunei",code:"BND", symbol: "B$" },
                        { name:"Riel cambodgien",code:"KHR", symbol: "៛" },
                        { name:"Yuan chinois",code:"CNY", symbol: "¥ /元" },
                        { name:"Dollar de Hong-Kong",code:"HKD", symbol: "$ / HK$ / “元”" },
                        { name:"Roupie indonésienne",code:"IDR", symbol: "Rp" },
                        { name:"Roupie indienne",code:"INR", symbol: "₹" },
                        { name:"Yen japonais",code:"JPY", symbol: "¥" },
                        { name:"Tenge kazakhstani",code:"KZT", symbol: "₸" },
                        { name:"Som kirghiz",code:"KGS", symbol: "som" },
                        { name:"Kip laotien",code:"LAK", symbol: "₭" },
                        { name:"Pataca de Macao",code:"MOP", symbol: "MOP$" },
                        { name:"Ringgit malaisien",code:"MYR", symbol: "RM" },
                        { name:"Rufiyaa",code:"MVR", symbol: "MRf" },
                        { name:"Tögrög mongol",code:"MNT", symbol: "₮" },
                        { name:"Kyat myanmarais",code:"MMK", symbol: "K" },
                        { name:"Roupie népalaise",code:"NPR", symbol: "Rs" },
                        { name:"Dollar néo-zélandais",code:"NZD", symbol: "$" },
                        { name:"Won nord-coréen",code:"KPW", symbol: "₩" },
                        { name:"Roupie pakistanaise",code:"PKR", symbol: "Rs" },
                        { name:"Peso philippin",code:"PHP", symbol: "₱" },
                        { name:"Dollar singapourien",code:"SGD", symbol: "S$" },
                        { name:"Won sud-coréen",code:"KRW", symbol: "₩" },
                        { name:"Roupie sri-lankaise",code:"LKR", symbol: "Rs" },
                        { name:"Nouveau dollar taïwanais",code:"TWD", symbol: "NT$" },
                        { name:"Somoni tadjik",code:"TJS", symbol: "TJS" },
                        { name:"Baht thaïlandais",code:"THB", symbol: "฿" },
                        { name:"Nouveau manat turkmène",code:"TMT", symbol: "m" },
                        { name:"Som ouzbek",code:"UZS", symbol: "som" },
                        { name:"Dong vietnamien",code:"VND", symbol: "₫" }
                    ]
                },
                "fr":{
                    "lang": [{
                        "name": "Français",
                        "code": "fr"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Lek", "value": "Lek" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Rouble Biélorusse" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Mark convertible de Bosnie-Herzégovine" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Lev bulgare", "value": "Lev bulgare" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Couronne Tchèque" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Couronne danoise", "value": "Couronne danoise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Iari", "value": "Iari" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Couronne danoise", "value": "Couronne danoise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Forint", "value": "Forint" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Couronne islandaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc suisse", "value": "Franc suisse" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Leu moldave", "value": "Leu moldave" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Denar macédonien", "value": "Denar macédonien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Couronne norvégienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Zloty", "value": "Zloty" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Leu roumain", "value": "Leu roumain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rouble russe", "value": "Rouble russe" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar serbe", "value": "Dinar serbe" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc suisse", "value": "Franc suisse" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre turque", "value": "Livre turque" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Hryvnia", "value": "Hryvnia" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre sterling", "value": "Livre sterling" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar américain", "value": "Dollar américain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Dollar des caraïbes orientales" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Florin arubais", "value": "Florin arubais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso argentin", "value": "Peso argentin" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Dollar bahaméen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Dollar barbadien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Dollar bermudien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Dollar bélizien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Boliviano", "value": "Boliviano" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Real", "value": "Real" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar canadien", "value": "Dollar canadien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Dollar des Îles Caïmans" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso chilien", "value": "Peso chilien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso colombien", "value": "Peso colombien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Colón costaricien", "value": "Colón costaricien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso cubain", "value": "Peso cubain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Florin des Antilles néerlandaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso dominicain", "value": "Peso dominicain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Livre des Îles Malouines" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Quetzal", "value": "Quetzal" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Dollar guyanais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Gourde", "value": "Gourde" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Lempira", "value": "Lempira" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Dollar jamaïcain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso mexicain", "value": "Peso mexicain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Cordoba d’or" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Balboa", "value": "Balboa" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Guarani", "value": "Guarani" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Sol péruvien", "value": "Sol péruvien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Florin des Antilles néerlandaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Dollar surinamien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Dollar de Trinité-et-Tobago" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Peso uruguayen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Bolivar vénézuélien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Afghani", "value": "Afghani" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dram", "value": "Dram" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Manat azerbaïdjanais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Dinar bahreïni" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Euro", "value": "Euro" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Lari", "value": "Lari" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Dinar iraqien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rial iranien", "value": "Rial iranien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Dinar jordanien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Dinar koweïtien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre libanaise", "value": "Livre libanaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Shekel", "value": "Shekel" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre syrienne", "value": "Livre syrienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "Dirham des Émirats arabes unis" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rial omanais", "value": "Rial omanais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Riyal du Qatar" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rial saoudien", "value": "Rial saoudien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rial yéménite", "value": "Rial yéménite" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Shekel israélien", "value": "Shekel israélien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc CFA", "value": "Franc CFA" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc CFA", "value": "Franc CFA" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar algérien", "value": "Dinar algérien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Kwanza", "value": "Kwanza" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Pula", "value": "Pula" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc burundais", "value": "Franc burundais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Escudo cap-verdien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc comorien", "value": "Franc comorien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc congolais", "value": "Franc congolais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Franc Djibouti" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Livre égyptienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Nakfa érythréen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Birr", "value": "Birr" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Lilangeni", "value": "Lilangeni" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dalasi", "value": "Dalasi" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Cédi", "value": "Cédi" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc guinéen", "value": "Franc guinéen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Shilling Kenyan" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Loti", "value": "Loti" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Liberian dollar", "value": "Liberian dollar" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar libyen", "value": "Dinar libyen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ariary", "value": "Ariary" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Kwacha malawien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Roupie mauricienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ouguiya", "value": "Ouguiya" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dirham marocain", "value": "Dirham marocain" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Metical", "value": "Metical" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar namibien", "value": "Dollar namibien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Naira nigérien", "value": "Naira nigérien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Franc rwandais", "value": "Franc rwandais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dobra", "value": "Dobra" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Roupie seychelloise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Leone", "value": "Leone" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Shilling somalien", "value": "Shilling somalien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rand", "value": "Rand" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Livre soudanaise du sud" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Livre soudanaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Shilling tanzanien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Dinar tunisien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Shilling ougandais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar australien", "value": "Dollar australien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Taka bangladais", "value": "Taka bangladais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Ngultrum bhoutanais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Dollar de Brunei" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Riel cambodgien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Yuan chinois", "value": "Yuan chinois" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Dollar de Hong-Kong" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Roupie indonésienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie indienne", "value": "Roupie indienne" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Yen japonais", "value": "Yen japonais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Tenge kazakhstani" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Som kirghiz", "value": "Som kirghiz" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Kip laotien", "value": "Kip laotien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Pataca de Macao" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Ringgit malaisien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Rufiyaa", "value": "Rufiyaa" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Tögrög mongol" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Kyat myanmarais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Roupie népalaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Dollar néo-zélandais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Won nord-coréen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Roupie pakistanaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Peso philippin", "value": "Peso philippin" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Dollar singapourien" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Won sud-coréen" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Roupie sri-lankaise" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Nouveau dollar taïwanais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Somoni tadjik" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Baht thaïlandais" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Nouveau manat turkmène" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Som ouzbek", "value": "Som ouzbek" },
                        { "lang": { "$link": { "code": "fr", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Dong vietnamien" }
                    ]
                },
                "en": {
                    "lang": [{
                        "name": "English",
                        "code": "en"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Lek", "value": "Lek" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Belarusian Ruble" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Bosnia-Herzegovina Convertible Mark" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Lev bulgare", "value": "Bulgarian Lev" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Czech Koruna" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Couronne danoise", "value": "Danish Krone" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Iari", "value": "Georgian Lari" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Forint", "value": "Hungarian Forint" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Icelandic Króna" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc suisse", "value": "Swiss Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Leu moldave", "value": "Moldovan Leu" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Denar macédonien", "value": "Macedonian Denar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Norwegian Krone" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Zloty", "value": "Polish Złoty" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Leu roumain", "value": "Romanian Leu" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rouble russe", "value": "Russian Ruble" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar serbe", "value": "Serbian Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre turque", "value": "Turkish Lira" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Hryvnia", "value": "Ukrainian Hryvnia" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre sterling", "value": "Pound Sterling" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar américain", "value": "US Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "East Caribbean Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Florin arubais", "value": "Aruban Florin" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso argentin", "value": "Argentine Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Bahamian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Barbadian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Bermudian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Belize Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Boliviano", "value": "Bolivian Boliviano" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Real", "value": "Brazilian Real" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar canadien", "value": "Canadian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Cayman Islands Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso chilien", "value": "Chilean Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso colombien", "value": "Colombian Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Colón costaricien", "value": "Costa Rican Colón" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso cubain", "value": "Cuban Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Netherlands Antillean Guilder" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso dominicain", "value": "Dominican Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Falkland Islands Pound" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Quetzal", "value": "Guatemalan Quetzal" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Guyanese Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Gourde", "value": "Haitian Gourde" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Lempira", "value": "Honduran Lempira" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Jamaican Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso mexicain", "value": "Mexican Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Nicaraguan Córdoba" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Balboa", "value": "Panamanian Balboa" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Guarani", "value": "Paraguayan Guaraní" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Sol péruvien", "value": "Peruvian Sol" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Surinamese Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Trinidad and Tobago Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Uruguayan Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Venezuelan Bolívar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Afghani", "value": "Afghan Afghani" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dram", "value": "Armenian Dram" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Azerbaijani Manat" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Bahraini Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Euro", "value": "Euro" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Iraqi Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rial iranien", "value": "Iranian Rial" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Jordanian Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Kuwaiti Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre libanaise", "value": "Lebanese Pound" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Shekel", "value": "Israeli Shekel" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre syrienne", "value": "Syrian Pound" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "UAE Dirham" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rial omanais", "value": "Omani Rial" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Qatari Riyal" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rial saoudien", "value": "Saudi Riyal" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rial yéménite", "value": "Yemeni Rial" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Shekel israélien", "value": "Israeli Shekel" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc CFA", "value": "CFA Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar algérien", "value": "Algerian Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Kwanza", "value": "Angolan Kwanza" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Pula", "value": "Botswana Pula" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc burundais", "value": "Burundian Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Cape Verdean Escudo" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc comorien", "value": "Comorian Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc congolais", "value": "Congolese Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Djiboutian Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Egyptian Pound" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Eritrean Nakfa" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Birr", "value": "Ethiopian Birr" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Lilangeni", "value": "Swazi Lilangeni" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dalasi", "value": "Gambian Dalasi" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Cédi", "value": "Ghanaian Cedi" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc guinéen", "value": "Guinean Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Kenyan Shilling" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Loti", "value": "Lesotho Loti" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Liberian dollar", "value": "Liberian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar libyen", "value": "Libyan Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Ariary", "value": "Malagasy Ariary" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Malawian Kwacha" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Mauritian Rupee" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Ouguiya", "value": "Mauritanian Ouguiya" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dirham marocain", "value": "Moroccan Dirham" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Metical", "value": "Mozambican Metical" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar namibien", "value": "Namibian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Naira nigérien", "value": "Nigerian Naira" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Franc rwandais", "value": "Rwandan Franc" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dobra", "value": "São Tomé and Príncipe Dobra" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Seychellois Rupee" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Leone", "value": "Sierra Leonean Leone" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Shilling somalien", "value": "Somali Shilling" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rand", "value": "South African Rand" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "South Sudanese Pound" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Sudanese Pound" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Tanzanian Shilling" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Tunisian Dinar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Ugandan Shilling" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar australien", "value": "Australian Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Taka bangladais", "value": "Bangladeshi Taka" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Bhutanese Ngultrum" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Brunei Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Cambodian Riel" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Yuan chinois", "value": "Chinese Yuan" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Hong Kong Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Indonesian Rupiah" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie indienne", "value": "Indian Rupee" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Yen japonais", "value": "Japanese Yen" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Kazakhstani Tenge" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Som kirghiz", "value": "Kyrgyzstani Som" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Kip laotien", "value": "Laotian Kip" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Macanese Pataca" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Malaysian Ringgit" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Rufiyaa", "value": "Maldivian Rufiyaa" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Mongolian Tögrög" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Myanmar Kyat" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Nepalese Rupee" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "New Zealand Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Won nord-coréen", "value": "North Korean Won" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Pakistani Rupee" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Peso philippin", "value": "Philippine Peso" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Singapore Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Won sud-coréen", "value": "South Korean Won" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Sri Lankan Rupee" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "New Taiwan Dollar" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Tajikistani Somoni" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Thai Baht" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Turkmenistani Manat" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Som ouzbek", "value": "Uzbekistani Som" },
                        { "lang": { "$link": { "code": "en", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Vietnamese Đồng" }
                    ]
                },
                "es": {
                    "lang": [{
                        "name": "Español",
                        "code": "es"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Lek", "value": "Lek" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Rublo bielorruso" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Marco convertible de Bosnia-Herzegovina" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Lev bulgare", "value": "Lev búlgaro" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Corona checa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Couronne danoise", "value": "Corona danesa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Iari", "value": "Lari georgiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Forint", "value": "Florín húngaro" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Corona islandesa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc suisse", "value": "Franco suizo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Leu moldave", "value": "Leu moldavo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Denar macédonien", "value": "Denar macedonio" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Corona noruega" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Zloty", "value": "Zloty polaco" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Leu roumain", "value": "Leu rumano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rouble russe", "value": "Rublo ruso" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar serbe", "value": "Dinar serbio" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre turque", "value": "Lira turca" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Hryvnia", "value": "Grivna ucraniana" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre sterling", "value": "Libra esterlina" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar américain", "value": "Dólar estadounidense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Dólar del Caribe Oriental" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Florin arubais", "value": "Florín arubeño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso argentin", "value": "Peso argentino" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Dólar bahameño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Dólar barbadense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Dólar bermudeño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Dólar beliceño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Boliviano", "value": "Boliviano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Real", "value": "Real brasileño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar canadien", "value": "Dólar canadiense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Dólar de las Islas Caimán" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso chilien", "value": "Peso chileno" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso colombien", "value": "Peso colombiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Colón costaricien", "value": "Colón costarricense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso cubain", "value": "Peso cubano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Florín de las Antillas Neerlandesas" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso dominicain", "value": "Peso dominicano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Libra malvinense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Quetzal", "value": "Quetzal guatemalteco" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Dólar guyanés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Gourde", "value": "Gourde haitiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Lempira", "value": "Lempira hondureño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Dólar jamaiquino" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso mexicain", "value": "Peso mexicano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Córdoba nicaragüense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Balboa", "value": "Balboa panameño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Guarani", "value": "Guaraní paraguayo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Sol péruvien", "value": "Sol peruano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Dólar surinamés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Dólar de Trinidad y Tobago" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Peso uruguayo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Bolívar venezolano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Afghani", "value": "Afgani" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dram", "value": "Dram armenio" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Manat azerbaiyano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Dinar bahreiní" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Euro", "value": "Euro" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Dinar iraquí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rial iranien", "value": "Rial iraní" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Dinar jordano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Dinar kuwaití" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre libanaise", "value": "Libra libanesa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Shekel", "value": "Shéquel israelí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre syrienne", "value": "Libra siria" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "Dírham de los Emiratos Árabes Unidos" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rial omanais", "value": "Rial omaní" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Riyal qatarí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rial saoudien", "value": "Rial saudí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rial yéménite", "value": "Rial yemení" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Shekel israélien", "value": "Shéquel israelí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc CFA", "value": "Franco CFA" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar algérien", "value": "Dinar argelino" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Kwanza", "value": "Kwanza angoleño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Pula", "value": "Pula botsuano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc burundais", "value": "Franco burundés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Escudo caboverdiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc comorien", "value": "Franco comorense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc congolais", "value": "Franco congoleño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Franco yibutiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Libra egipcia" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Nakfa eritreo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Birr", "value": "Birr etíope" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Lilangeni", "value": "Lilangeni suazi" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dalasi", "value": "Dalasi gambiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Cédi", "value": "Cedi ghanés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc guinéen", "value": "Franco guineano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Chelín keniano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Loti", "value": "Loti lesothense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Liberian dollar", "value": "Dólar liberiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar libyen", "value": "Dinar libio" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Ariary", "value": "Ariary malgache" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Kwacha malauí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Rupia mauriciana" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Ouguiya", "value": "Uguya mauritana" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dirham marocain", "value": "Dírham marroquí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Metical", "value": "Metical mozambiqueño" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar namibien", "value": "Dólar namibio" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Naira nigérien", "value": "Naira nigeriano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Franc rwandais", "value": "Franco ruandés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dobra", "value": "Dobra santotomense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Rupia seychellense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Leone", "value": "Leone sierraleonés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Shilling somalien", "value": "Chelín somalí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rand", "value": "Rand sudafricano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Libra sursudanesa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Libra sudanesa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Chelín tanzano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Dinar tunecino" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Chelín ugandés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar australien", "value": "Dólar australiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Taka bangladais", "value": "Taka bangladesí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Ngultrum butanés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Dólar de Brunéi" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Riel camboyano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Yuan chinois", "value": "Yuan chino" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Dólar de Hong Kong" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Rupia indonesia" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie indienne", "value": "Rupia india" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Yen japonais", "value": "Yen japonés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Tenge kazajo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Som kirghiz", "value": "Som kirguís" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Kip laotien", "value": "Kip laosiano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Pataca de Macao" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Ringgit malayo" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Rufiyaa", "value": "Rufiyaa maldiva" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Tugrik mongol" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Kyat birmano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Rupia nepalí" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Dólar neozelandés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Won norcoreano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Rupia pakistaní" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Peso philippin", "value": "Peso filipino" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Dólar singapurense" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Won surcoreano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Rupia esrilanquesa" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Nuevo dólar taiwanés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Somoni tayiko" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Baht tailandés" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Manat turcomano" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Som ouzbek", "value": "Som uzbeko" },
                        { "lang": { "$link": { "code": "es", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Dong vietnamita" }
                    ]
                },
                "de": {
                    "lang": [{
                        "name": "Deutsch",
                        "code": "de"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Lek", "value": "Lek" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Weißrussischer Rubel" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Konvertible Mark (Bosnien und Herzegowina)" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Lev bulgare", "value": "Bulgarischer Lew" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Tschechische Krone" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Couronne danoise", "value": "Dänische Krone" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Iari", "value": "Georgischer Lari" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Forint", "value": "Ungarischer Forint" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Isländische Krone" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc suisse", "value": "Schweizer Franken" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Leu moldave", "value": "Moldauischer Leu" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Denar macédonien", "value": "Mazedonischer Denar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Norwegische Krone" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Zloty", "value": "Polnischer Złoty" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Leu roumain", "value": "Rumänischer Leu" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rouble russe", "value": "Russischer Rubel" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar serbe", "value": "Serbischer Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre turque", "value": "Türkische Lira" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Hryvnia", "value": "Ukrainische Hrywnja" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre sterling", "value": "Britisches Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar américain", "value": "US-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Ostkaribischer Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Florin arubais", "value": "Aruba-Florin" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso argentin", "value": "Argentinischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Bahama-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Barbados-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Bermuda-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Belize-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Boliviano", "value": "Bolivianischer Boliviano" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Real", "value": "Brasilianischer Real" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar canadien", "value": "Kanadischer Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Kaiman-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso chilien", "value": "Chilenischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso colombien", "value": "Kolumbianischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Colón costaricien", "value": "Costa-Rica-Colón" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso cubain", "value": "Kubanischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Niederländische-Antillen-Gulden" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso dominicain", "value": "Dominikanischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Falkland-Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Quetzal", "value": "Guatemaltekischer Quetzal" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Guyana-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Gourde", "value": "Haitianische Gourde" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Lempira", "value": "Honduranischer Lempira" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Jamaika-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso mexicain", "value": "Mexikanischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Nicaraguanischer Córdoba" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Balboa", "value": "Panamaischer Balboa" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Guarani", "value": "Paraguayischer Guaraní" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Sol péruvien", "value": "Peruanischer Sol" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Suriname-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Trinidad-und-Tobago-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Uruguayischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Venezolanischer Bolívar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Afghani", "value": "Afghani" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dram", "value": "Armenischer Dram" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Aserbaidschan-Manat" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Bahrain-Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Euro", "value": "Euro" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Irakischer Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rial iranien", "value": "Iranischer Rial" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Jordanischer Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Kuwaitischer Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre libanaise", "value": "Libanesisches Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Shekel", "value": "Israelischer Schekel" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre syrienne", "value": "Syrisches Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "VAE-Dirham" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rial omanais", "value": "Omanischer Rial" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Katar-Riyal" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rial saoudien", "value": "Saudi-Riyal" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rial yéménite", "value": "Jemen-Rial" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Shekel israélien", "value": "Israelischer Schekel" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc CFA", "value": "CFA-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar algérien", "value": "Algerischer Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Kwanza", "value": "Angolanischer Kwanza" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Pula", "value": "Botswanischer Pula" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc burundais", "value": "Burundi-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Kap-Verde-Escudo" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc comorien", "value": "Komoren-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc congolais", "value": "Kongo-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Dschibuti-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Ägyptisches Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Eritreischer Nakfa" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Birr", "value": "Äthiopischer Birr" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Lilangeni", "value": "Swasiländischer Lilangeni" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dalasi", "value": "Gambischer Dalasi" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Cédi", "value": "Ghanaischer Cedi" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc guinéen", "value": "Guinea-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Kenia-Schilling" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Loti", "value": "Loti (Lesotho)" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Liberian dollar", "value": "Liberianischer Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar libyen", "value": "Libyscher Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Ariary", "value": "Madagaskar-Ariary" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Malawi-Kwacha" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Mauritius-Rupie" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Ouguiya", "value": "Mauretanischer Ouguiya" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dirham marocain", "value": "Marokkanischer Dirham" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Metical", "value": "Mosambik-Metical" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar namibien", "value": "Namibia-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Naira nigérien", "value": "Nigerianischer Naira" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Franc rwandais", "value": "Ruanda-Franc" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dobra", "value": "São-toméischer Dobra" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Seychellen-Rupie" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Leone", "value": "Sierra-leonischer Leone" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Shilling somalien", "value": "Somalia-Schilling" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rand", "value": "Südafrikanischer Rand" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Südsudanesisches Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Sudanesisches Pfund" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Tansania-Schilling" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Tunesischer Dinar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Uganda-Schilling" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar australien", "value": "Australischer Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Taka bangladais", "value": "Bangladesch-Taka" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Bhutan-Ngultrum" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Brunei-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Kambodschanischer Riel" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Yuan chinois", "value": "Chinesischer Yuan" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Hongkong-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Indonesische Rupiah" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie indienne", "value": "Indische Rupie" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Yen japonais", "value": "Japanischer Yen" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Kasachischer Tenge" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Som kirghiz", "value": "Kirgisischer Som" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Kip laotien", "value": "Laotischer Kip" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Macau-Pataca" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Malaysischer Ringgit" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Rufiyaa", "value": "Malediven-Rufiyaa" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Mongolischer Tögrög" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Myanmar-Kyat" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Nepalesische Rupie" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Neuseeland-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Nordkoreanischer Won" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Pakistanische Rupie" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Peso philippin", "value": "Philippinischer Peso" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Singapur-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Südkoreanischer Won" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Sri-Lanka-Rupie" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Neuer Taiwan-Dollar" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Tadschikischer Somoni" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Thailändischer Baht" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Turkmenistan-Manat" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Som ouzbek", "value": "Usbekischer Soʻm" },
                        { "lang": { "$link": { "code": "de", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Vietnamesischer Đồng" }
                    ]
                },
                "it": {
                    "lang": [{
                        "name": "Italiano",
                        "code": "it"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Lek", "value": "Lek" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Rublo bielorusso" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Marco convertibile (Bosnia ed Erzegovina)" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Lev bulgare", "value": "Lev bulgaro" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Corona ceca" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Couronne danoise", "value": "Corona danese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Iari", "value": "Lari georgiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Forint", "value": "Fiorino ungherese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Corona islandese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc suisse", "value": "Franco svizzero" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Leu moldave", "value": "Leu moldavo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Denar macédonien", "value": "Denar macedone" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Corona norvegese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Zloty", "value": "Złoty polacco" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Leu roumain", "value": "Leu rumeno" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rouble russe", "value": "Rublo russo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar serbe", "value": "Dinaro serbo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre turque", "value": "Lira turca" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Hryvnia", "value": "Grivnia ucraina" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre sterling", "value": "Sterlina britannica" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar américain", "value": "Dollaro statunitense" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Dollaro dei Caraibi orientali" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Florin arubais", "value": "Fiorino di Aruba" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso argentin", "value": "Peso argentino" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Dollaro delle Bahamas" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Dollaro barbadiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Dollaro delle Bermuda" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Dollaro del Belize" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Boliviano", "value": "Boliviano boliviano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Real", "value": "Real brasiliano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar canadien", "value": "Dollaro canadese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Dollaro delle Cayman" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso chilien", "value": "Peso cileno" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso colombien", "value": "Peso colombiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Colón costaricien", "value": "Colón costaricano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso cubain", "value": "Peso cubano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Fiorino delle Antille olandesi" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso dominicain", "value": "Peso dominicano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Sterlina delle Falkland" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Quetzal", "value": "Quetzal guatemalteco" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Dollaro della Guyana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Gourde", "value": "Gourde haitiana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Lempira", "value": "Lempira honduregna" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Dollaro giamaicano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso mexicain", "value": "Peso messicano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Córdoba nicaraguense" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Balboa", "value": "Balboa panamense" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Guarani", "value": "Guaraní paraguaiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Sol péruvien", "value": "Sol peruviano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Dollaro surinamese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Dollaro di Trinidad e Tobago" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Peso uruguaiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Bolívar venezuelano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Afghani", "value": "Afghani" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dram", "value": "Dram armeno" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Manat azero" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Dinaro del Bahrein" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Euro", "value": "Euro" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Dinaro iracheno" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rial iranien", "value": "Rial iraniano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Dinaro giordano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Dinaro kuwaitiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre libanaise", "value": "Lira libanese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Shekel", "value": "Shekel israeliano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre syrienne", "value": "Lira siriana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "Dirham degli Emirati Arabi Uniti" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rial omanais", "value": "Rial omanita" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Riyal qatariano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rial saoudien", "value": "Riyal saudita" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rial yéménite", "value": "Rial yemenita" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Shekel israélien", "value": "Shekel israeliano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc CFA", "value": "Franco CFA" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar algérien", "value": "Dinaro algerino" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Kwanza", "value": "Kwanza angolano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Pula", "value": "Pula del Botswana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc burundais", "value": "Franco del Burundi" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Escudo di Capo Verde" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc comorien", "value": "Franco comoriano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc congolais", "value": "Franco congolese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Franco di Gibuti" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Lira egiziana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Nakfa eritreo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Birr", "value": "Birr etiope" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Lilangeni", "value": "Lilangeni dello Swaziland" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dalasi", "value": "Dalasi gambiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Cédi", "value": "Cedi ghanese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc guinéen", "value": "Franco guineano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Scellino keniota" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Loti", "value": "Loti del Lesotho" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Liberian dollar", "value": "Dollaro liberiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar libyen", "value": "Dinaro libico" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Ariary", "value": "Ariary malgascio" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Kwacha malawiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Rupia mauriziana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Ouguiya", "value": "Ouguiya mauritana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dirham marocain", "value": "Dirham marocchino" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Metical", "value": "Metical mozambicano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar namibien", "value": "Dollaro namibiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Naira nigérien", "value": "Naira nigeriano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Franc rwandais", "value": "Franco ruandese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dobra", "value": "Dobra di São Tomé e Príncipe" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Rupia delle Seychelles" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Leone", "value": "Leone della Sierra Leone" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Shilling somalien", "value": "Scellino somalo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rand", "value": "Rand sudafricano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Sterlina sudsudanese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Sterlina sudanese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Scellino tanzaniano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Dinaro tunisino" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Scellino ugandese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar australien", "value": "Dollaro australiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Taka bangladais", "value": "Taka bengalese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Ngultrum bhutanese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Dollaro del Brunei" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Riel cambogiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Yuan chinois", "value": "Yuan cinese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Dollaro di Hong Kong" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Rupia indonesiana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie indienne", "value": "Rupia indiana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Yen japonais", "value": "Yen giapponese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Tenge kazako" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Som kirghiz", "value": "Som kirghiso" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Kip laotien", "value": "Kip laotiano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Pataca di Macao" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Ringgit malese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Rufiyaa", "value": "Rufiyaa delle Maldive" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Tögrög mongolo" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Kyat birmano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Rupia nepalese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Dollaro neozelandese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Won nordcoreano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Rupia pakistana" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Peso philippin", "value": "Peso filippino" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Dollaro di Singapore" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Won sudcoreano" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Rupia dello Sri Lanka" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Nuovo dollaro taiwanese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Somoni tagiko" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Baht thailandese" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Manat turkmeno" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Som ouzbek", "value": "Soʻm uzbeko" },
                        { "lang": { "$link": { "code": "it", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Đồng vietnamita" }
                    ]
                },
                "ar": {
                    "lang": [{
                        "name": "العربية",
                        "code": "ar"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Lek", "value": "ليك" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "روبل بيلاروسي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "مارك قابل للتحويل (البوسنة والهرسك)" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Lev bulgare", "value": "ليف بلغاري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "كرونة تشيكية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Couronne danoise", "value": "كرونة دنماركية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Iari", "value": "لاري جورجي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Forint", "value": "فورنت مجري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Couronne islandaise", "value": "كرونة آيسلندية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc suisse", "value": "فرنك سويسري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Leu moldave", "value": "ليو مولدوفي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Denar macédonien", "value": "دينار مقدوني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "كرونة نرويجية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Zloty", "value": "زلوتي بولندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Leu roumain", "value": "ليو روماني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rouble russe", "value": "روبل روسي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar serbe", "value": "دينار صربي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre turque", "value": "ليرة تركية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Hryvnia", "value": "هريفنيا أوكرانية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre sterling", "value": "جنيه إسترليني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar américain", "value": "دولار أمريكي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "دولار شرق الكاريبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Florin arubais", "value": "فلورن أروبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso argentin", "value": "بيزو أرجنتيني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "دولار باهامي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar barbadien", "value": "دولار بربادوسي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar bermudien", "value": "دولار برمودي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar bélizien", "value": "دولار بليزي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Boliviano", "value": "بوليفيانو بوليفي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Real", "value": "ريال برازيلي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar canadien", "value": "دولار كندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "دولار جزر كايمان" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso chilien", "value": "بيزو تشيلي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso colombien", "value": "بيزو كولومبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Colón costaricien", "value": "كولون كوستاريكي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso cubain", "value": "بيزو كوبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "جلدر جزر الأنتيل الهولندية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso dominicain", "value": "بيزو دومينيكاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "جنيه جزر فوكلاند" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Quetzal", "value": "كيتزال غواتيمالي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar guyanais", "value": "دولار غياني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Gourde", "value": "جوردة هايتي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Lempira", "value": "لمبيرة هندوراسي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "دولار جامايكي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso mexicain", "value": "بيزو مكسيكي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Cordoba d’or", "value": "كوردوبا نيكاراغوا" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Balboa", "value": "بالبوا بنمي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Guarani", "value": "غواراني باراغواي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Sol péruvien", "value": "سول بيروفي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar surinamien", "value": "دولار سورينامي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "دولار ترينيداد وتوباغو" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso uruguayen", "value": "بيزو أوروغواي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "بوليفار فنزويلي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Afghani", "value": "أفغاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dram", "value": "درام أرميني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "مانات أذربيجاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "دينار بحريني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Euro", "value": "يورو" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar iraqien", "value": "دينار عراقي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rial iranien", "value": "ريال إيراني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar jordanien", "value": "دينار أردني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "دينار كويتي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre libanaise", "value": "ليرة لبنانية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Shekel", "value": "شيكل إسرائيلي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre syrienne", "value": "ليرة سورية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "درهم إماراتي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rial omanais", "value": "ريال عماني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "ريال قطري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rial saoudien", "value": "ريال سعودي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rial yéménite", "value": "ريال يمني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Shekel israélien", "value": "شيكل إسرائيلي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc CFA", "value": "فرنك CFA" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar algérien", "value": "دينار جزائري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Kwanza", "value": "كوانزا أنغولي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Pula", "value": "بولا بتسواني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc burundais", "value": "فرنك بوروندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "إسكودو الرأس الأخضر" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc comorien", "value": "فرنك قمري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc congolais", "value": "فرنك كونغولي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc Djibouti", "value": "فرنك جيبوتي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre égyptienne", "value": "جنيه مصري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "ناكفا إريتري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Birr", "value": "بير إثيوبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Lilangeni", "value": "ليلانغيني سوازي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dalasi", "value": "دالاسي غامبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Cédi", "value": "سيدي غاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc guinéen", "value": "فرنك غيني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "شيلينغ كيني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Loti", "value": "لوتي ليسوتو" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Liberian dollar", "value": "دولار ليبيري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar libyen", "value": "دينار ليبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Ariary", "value": "أرياري مدغشقري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Kwacha malawien", "value": "كواشا ملاوي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "روبية موريشيوسية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Ouguiya", "value": "أوقية موريتانية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dirham marocain", "value": "درهم مغربي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Metical", "value": "متيكال موزمبيقي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar namibien", "value": "دولار ناميبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Naira nigérien", "value": "نيرة نيجيري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Franc rwandais", "value": "فرنك رواندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dobra", "value": "دوبرا ساوتومي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "روبية سيشيلية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Leone", "value": "ليون سيراليوني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Shilling somalien", "value": "شيلينغ صومالي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rand", "value": "راند جنوب أفريقي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "جنيه جنوب سوداني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Livre soudanaise", "value": "جنيه سوداني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "شيلينغ تنزاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dinar tunisien", "value": "دينار تونسي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Shilling ougandais", "value": "شيلينغ أوغندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar australien", "value": "دولار أسترالي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Taka bangladais", "value": "تاكا بنغلاديشي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "نغولتروم بوتاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "دولار بروني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Riel cambodgien", "value": "ريال كمبودي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Yuan chinois", "value": "يوان صيني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "دولار هونغ كونغ" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "روبية إندونيسية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie indienne", "value": "روبية هندية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Yen japonais", "value": "ين ياباني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "تينغ كازاخستاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Som kirghiz", "value": "سوم قيرغيزي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Kip laotien", "value": "كيب لاوسي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Pataca de Macao", "value": "باتاكا ماكاوي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "رينغيت ماليزي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Rufiyaa", "value": "روفية مالديفية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Tögrög mongol", "value": "توجروغ منغولي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "كيات ميانماري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie népalaise", "value": "روبية نيبالية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "دولار نيوزيلندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Won nord-coréen", "value": "وون كوري شمالي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "روبية باكستانية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Peso philippin", "value": "بيزو فلبيني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dollar singapourien", "value": "دولار سنغافوري" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Won sud-coréen", "value": "وون كوري جنوبي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "روبية سريلانكية" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "دولار تايواني جديد" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Somoni tadjik", "value": "سوموني طاجيكي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "باخت تايلاندي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "مانات تركمانستاني" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Som ouzbek", "value": "سوم أوزبكي" },
                        { "lang": { "$link": { "code": "ar", "_model": "lang" } }, "key": "Dong vietnamien", "value": "دونغ فيتنامي" }
                    ]
                },
                "fa": {
                    "lang": [{
                        "name": "فارسی",
                        "code": "fa"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Lek", "value": "لک" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "روبل بلاروسی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "مارک تبدیل‌پذیر (بوسنی و هرزگوین)" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Lev bulgare", "value": "لف بلغاری" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "کرون چک" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Couronne danoise", "value": "کرون دانمارکی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Iari", "value": "لاری گرجی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Forint", "value": "فورینت مجارستانی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Couronne islandaise", "value": "کرون ایسلندی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc suisse", "value": "فرانک سوئیس" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Leu moldave", "value": "لئوی مولداوی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Denar macédonien", "value": "دینار مقدونیه‌ای" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "کرون نروژی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Zloty", "value": "زلوتی لهستانی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Leu roumain", "value": "لئوی رومانیایی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rouble russe", "value": "روبل روسی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar serbe", "value": "دینار صربی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre turque", "value": "لیره ترکیه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Hryvnia", "value": "گریونیا اوکراینی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre sterling", "value": "پوند استرلینگ" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar américain", "value": "دلار آمریکا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "دلار کارائیب شرقی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Florin arubais", "value": "فلورین آروبا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso argentin", "value": "پزوی آرژانتین" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "دلار باهاما" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar barbadien", "value": "دلار باربادوس" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar bermudien", "value": "دلار برمودا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar bélizien", "value": "دلار بلیز" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Boliviano", "value": "بولیویانو بولیوی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Real", "value": "رئال برزیل" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar canadien", "value": "دلار کانادا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "دلار جزایر کیمن" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso chilien", "value": "پزوی شیلی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso colombien", "value": "پزوی کلمبیا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Colón costaricien", "value": "کولون کاستاریکا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso cubain", "value": "پزوی کوبا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "گیلدر آنتیل هلند" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso dominicain", "value": "پزوی دومینیکن" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "پوند جزایر فالکلند" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Quetzal", "value": "کتزال گواتمالا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar guyanais", "value": "دلار گویان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Gourde", "value": "گورد هائیتی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Lempira", "value": "لمپیرا هندوراس" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "دلار جامائیکا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso mexicain", "value": "پزوی مکزیک" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Cordoba d’or", "value": "کوردوبا نیکاراگوئه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Balboa", "value": "بالبوآ پاناما" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Guarani", "value": "گوارانی پاراگوئه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Sol péruvien", "value": "سول پرو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar surinamien", "value": "دلار سورینام" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "دلار ترینیداد و توباگو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso uruguayen", "value": "پزوی اروگوئه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "بولیوار ونزوئلا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Afghani", "value": "افغانی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dram", "value": "درام ارمنی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "منات آذربایجان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "دینار بحرین" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Euro", "value": "یورو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar iraqien", "value": "دینار عراق" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rial iranien", "value": "ریال ایران" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar jordanien", "value": "دینار اردن" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "دینار کویت" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre libanaise", "value": "لیره لبنان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Shekel", "value": "شیکل اسرائیل" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre syrienne", "value": "لیره سوریه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "درهم امارات" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rial omanais", "value": "ریال عمان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "ریال قطر" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rial saoudien", "value": "ریال سعودی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rial yéménite", "value": "ریال یمن" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Shekel israélien", "value": "شیکل اسرائیل" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc CFA", "value": "فرانک سی‌اف‌آ" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar algérien", "value": "دینار الجزایر" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Kwanza", "value": "کوانزا آنگولا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Pula", "value": "پولای بوتسوانا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc burundais", "value": "فرانک بوروندی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "اسکودوی کیپ‌ورد" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc comorien", "value": "فرانک کومور" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc congolais", "value": "فرانک کنگو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc Djibouti", "value": "فرانک جیبوتی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre égyptienne", "value": "پوند مصر" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "ناکفای اریتره" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Birr", "value": "بیر اتیوپی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Lilangeni", "value": "لیلانگنی سوازیلند" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dalasi", "value": "دالاسی گامبیا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Cédi", "value": "سدی غنا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc guinéen", "value": "فرانک گینه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "شیلینگ کنیا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Loti", "value": "لوتی لسوتو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Liberian dollar", "value": "دلار لیبریا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar libyen", "value": "دینار لیبی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Ariary", "value": "آریاری ماداگاسکار" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Kwacha malawien", "value": "کواچای مالاوی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "روپیه موریس" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Ouguiya", "value": "اوگیای موریتانی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dirham marocain", "value": "درهم مراکش" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Metical", "value": "متیکال موزامبیک" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar namibien", "value": "دلار نامیبیا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Naira nigérien", "value": "نایرای نیجریه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Franc rwandais", "value": "فرانک رواندا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dobra", "value": "دوبرای سائوتومه" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "روپیه سیشل" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Leone", "value": "لئون سیرالئون" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Shilling somalien", "value": "شیلینگ سومالی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rand", "value": "رند آفریقای جنوبی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "پوند سودان جنوبی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Livre soudanaise", "value": "پوند سودان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "شیلینگ تانزانیا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dinar tunisien", "value": "دینار تونس" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Shilling ougandais", "value": "شیلینگ اوگاندا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar australien", "value": "دلار استرالیا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Taka bangladais", "value": "تاکای بنگلادش" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "انگولتروم بوتان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "دلار برونئی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Riel cambodgien", "value": "ریل کامبوج" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Yuan chinois", "value": "یوان چین" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "دلار هنگ‌کنگ" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "روپیه اندونزی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie indienne", "value": "روپیه هند" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Yen japonais", "value": "ین ژاپن" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "تنگه قزاقستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Som kirghiz", "value": "سوم قرقیزستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Kip laotien", "value": "کیپ لائوس" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Pataca de Macao", "value": "پاتاکای ماکائو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "رینگیت مالزی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Rufiyaa", "value": "روفیه مالدیو" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Tögrög mongol", "value": "توگروگ مغولستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "کیات میانمار" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie népalaise", "value": "روپیه نپال" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "دلار نیوزیلند" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Won nord-coréen", "value": "وون کره شمالی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "روپیه پاکستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Peso philippin", "value": "پزوی فیلیپین" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dollar singapourien", "value": "دلار سنگاپور" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Won sud-coréen", "value": "وون کره جنوبی" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "روپیه سری‌لانکا" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "دلار جدید تایوان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Somoni tadjik", "value": "سامانی تاجیکستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "بات تایلند" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "منات ترکمنستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Som ouzbek", "value": "سوم ازبکستان" },
                        { "lang": { "$link": { "code": "fa", "_model": "lang" } }, "key": "Dong vietnamien", "value": "دانگ ویتنام" }
                    ]
                },
                "el": {
                    "lang": [{
                        "name": "Ελληνικά",
                        "code": "el"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Lek", "value": "Λεκ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Λευκορωσικό Ρούβλι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Μετατρέψιμο Μάρκο (Βοσνία-Ερζεγοβίνη)" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Lev bulgare", "value": "Βουλγαρικό Λεβ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Τσεχική Κορώνα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Couronne danoise", "value": "Δανική Κορώνα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Iari", "value": "Γεωργιανό Λάρι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Forint", "value": "Ουγγρικό Φιορίνι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Ισλανδική Κορώνα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc suisse", "value": "Ελβετικό Φράγκο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Leu moldave", "value": "Μολδαβικό Λέου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Denar macédonien", "value": "Μακεδονικό Δηνάριο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Νορβηγική Κορώνα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Zloty", "value": "Πολωνική Ζλότι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Leu roumain", "value": "Ρουμανικό Λέου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rouble russe", "value": "Ρωσικό Ρούβλι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar serbe", "value": "Σερβικό Δηνάριο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre turque", "value": "Τουρκική Λίρα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Hryvnia", "value": "Ουκρανική Γρίβνα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre sterling", "value": "Αγγλική Λίρα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar américain", "value": "Αμερικανικό Δολάριο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Δολάριο Ανατολικής Καραϊβικής" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Florin arubais", "value": "Φλορίνι Αρούμπα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso argentin", "value": "Αργεντίνικο Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Δολάριο Μπαχάμες" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Δολάριο Μπαρμπάντος" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Δολάριο Βερμούδων" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Δολάριο Μπελίζ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Boliviano", "value": "Βολιβιανό Μπολιβιάνο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Real", "value": "Βραζιλιάνικο Ρεάλ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar canadien", "value": "Καναδικό Δολάριο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Δολάριο Νήσων Κέιμαν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso chilien", "value": "Χιλιανό Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso colombien", "value": "Κολομβιανό Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Colón costaricien", "value": "Κολόν Κόστα Ρίκα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso cubain", "value": "Κουβανικό Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Γκίλντα Ολλανδικών Αντιλλών" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso dominicain", "value": "Δομινικανό Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Λίρα Νήσων Φώκλαντ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Quetzal", "value": "Γουατεμαλανό Κετσάλ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Δολάριο Γουιάνας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Gourde", "value": "Γκουρντ Αϊτής" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Lempira", "value": "Λεμπίρα Ονδούρας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Δολάριο Τζαμάικα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso mexicain", "value": "Μεξικανικό Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Κόρδοβα Νικαράγουας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Balboa", "value": "Μπαλμπόα Παναμά" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Guarani", "value": "Γκουαρανί Παραγουάης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Sol péruvien", "value": "Περούβιανο Σολ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Δολάριο Σουρινάμ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Δολάριο Τρινιντάντ και Τομπάγκο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Ουρουγουανό Πέσο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Βενεζουελανό Μπολιβάρ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Afghani", "value": "Αφγάνι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dram", "value": "Ντραμ Αρμενίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Μανάτ Αζερμπαϊτζάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Δηνάριο Μπαχρέιν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Euro", "value": "Ευρώ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Δηνάριο Ιράκ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rial iranien", "value": "Ριάλ Ιράν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Δηνάριο Ιορδανίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Δηνάριο Κουβέιτ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre libanaise", "value": "Λίρα Λιβάνου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Shekel", "value": "Σέκελ Ισραήλ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre syrienne", "value": "Λίρα Συρίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "Ντιρχάμ ΗΑΕ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rial omanais", "value": "Ριάλ Ομάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Ριγιάλ Κατάρ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rial saoudien", "value": "Ριγιάλ Σαουδικής Αραβίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rial yéménite", "value": "Ριάλ Υεμένης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Shekel israélien", "value": "Σέκελ Ισραήλ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc CFA", "value": "Φράγκο CFA" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar algérien", "value": "Δηνάριο Αλγερίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Kwanza", "value": "Κουάνζα Ανγκόλας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Pula", "value": "Πούλα Μποτσουάνας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc burundais", "value": "Φράγκο Μπουρούντι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Εσκούδο Πράσινου Ακρωτηρίου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc comorien", "value": "Φράγκο Κομορών" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc congolais", "value": "Φράγκο Κονγκό" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Φράγκο Τζιμπουτί" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Λίρα Αιγύπτου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Νάκφα Ερυθραίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Birr", "value": "Μπιρ Αιθιοπίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Lilangeni", "value": "Λιλανγκένι Εσουατίνι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dalasi", "value": "Νταλάσι Γκάμπιας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Cédi", "value": "Σέντι Γκάνας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc guinéen", "value": "Φράγκο Γουινέας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Σελίνι Κένυας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Loti", "value": "Λότι Λεσότο" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Liberian dollar", "value": "Δολάριο Λιβερίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar libyen", "value": "Δηνάριο Λιβύης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Ariary", "value": "Αριάρι Μαδαγασκάρης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Κουάτσα Μαλάουι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Ρουπία Μαυρικίου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Ouguiya", "value": "Ουγκίγια Μαυριτανίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dirham marocain", "value": "Ντιρχάμ Μαρόκου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Metical", "value": "Μετικάλ Μοζαμβίκης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar namibien", "value": "Δολάριο Ναμίμπιας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Naira nigérien", "value": "Νάιρα Νιγηρίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Franc rwandais", "value": "Φράγκο Ρουάντας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dobra", "value": "Ντόμπρα Σάο Τομέ και Πρίνσιπε" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Ρουπία Σεϋχελλών" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Leone", "value": "Λεόνε Σιέρα Λεόνε" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Shilling somalien", "value": "Σελίνι Σομαλίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rand", "value": "Ραντ Νότιας Αφρικής" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Λίρα Νότιου Σουδάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Λίρα Σουδάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Σελίνι Τανζανίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Δηνάριο Τυνησίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Σελίνι Ουγκάντας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar australien", "value": "Δολάριο Αυστραλίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Taka bangladais", "value": "Τάκα Μπανγκλαντές" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Γκουλντρούμ Μπουτάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Δολάριο Μπρουνέι" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Ριέλ Καμπότζης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Yuan chinois", "value": "Γιουάν Κίνας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Δολάριο Χονγκ Κονγκ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Ρουπία Ινδονησίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie indienne", "value": "Ρουπία Ινδίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Yen japonais", "value": "Γιεν Ιαπωνίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Τένγκε Καζακστάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Som kirghiz", "value": "Σομ Κιργιζίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Kip laotien", "value": "Κιπ Λάος" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Πατάκα Μακάου" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Ρινγκίτ Μαλαισίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Rufiyaa", "value": "Ρουφίγια Μαλδίβων" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Τουγκρίκ Μογγολίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Κιατ Μιανμάρ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Ρουπία Νεπάλ" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Δολάριο Νέας Ζηλανδίας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Γουόν Βόρειας Κορέας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Ρουπία Πακιστάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Peso philippin", "value": "Πέσο Φιλιππίνων" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Δολάριο Σιγκαπούρης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Γουόν Νότιας Κορέας" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Ρουπία Σρι Λάνκα" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Νέο Δολάριο Ταϊβάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Σομόνι Τατζικιστάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Μπατ Ταϊλάνδης" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Μανάτ Τουρκμενιστάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Som ouzbek", "value": "Σομ Ουζμπεκιστάν" },
                        { "lang": { "$link": { "code": "el", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Ντονγκ Βιετνάμ" }
                    ]
                },
                "ru": {
                    "lang": [{
                        "name": "Русский",
                        "code": "ru"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Lek", "value": "Лек" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Белорусский рубль" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Конвертируемая марка (Босния и Герцеговина)" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Lev bulgare", "value": "Болгарский лев" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Чешская крона" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Couronne danoise", "value": "Датская крона" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Iari", "value": "Грузинский лари" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Forint", "value": "Венгерский форинт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Исландская крона" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc suisse", "value": "Швейцарский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Leu moldave", "value": "Молдавский лей" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Denar macédonien", "value": "Македонский денар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Норвежская крона" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Zloty", "value": "Польский злотый" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Leu roumain", "value": "Румынский лей" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rouble russe", "value": "Российский рубль" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar serbe", "value": "Сербский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre turque", "value": "Турецкая лира" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Hryvnia", "value": "Украинская гривна" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre sterling", "value": "Фунт стерлингов" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar américain", "value": "Доллар США" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Восточно-карибский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Florin arubais", "value": "Арубанский флорин" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso argentin", "value": "Аргентинское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Багамский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Барбадосский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Бермудский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Белизский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Boliviano", "value": "Боливийский боливиано" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Real", "value": "Бразильский реал" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar canadien", "value": "Канадский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Доллар Островов Кайман" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso chilien", "value": "Чилийское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso colombien", "value": "Колумбийское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Colón costaricien", "value": "Коста-риканский колон" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso cubain", "value": "Кубинское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Нидерландский антильский гульден" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso dominicain", "value": "Доминиканское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Фунт Фолклендских островов" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Quetzal", "value": "Гватемальский кетсаль" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Гайанский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Gourde", "value": "Гаитянский гурд" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Lempira", "value": "Гондурасская лемпира" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Ямайский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso mexicain", "value": "Мексиканское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Никарагуанская кордоба" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Balboa", "value": "Панамский бальбоа" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Guarani", "value": "Парагвайский гуарани" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Sol péruvien", "value": "Перуанский соль" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Суринамский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Доллар Тринидада и Тобаго" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Уругвайское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Венесуэльский боливар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Afghani", "value": "Афгани" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dram", "value": "Армянский драм" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Азербайджанский манат" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Бахрейнский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Euro", "value": "Евро" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Иракский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rial iranien", "value": "Иранский риал" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Иорданский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Кувейтский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre libanaise", "value": "Ливанский фунт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Shekel", "value": "Израильский шекель" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre syrienne", "value": "Сирийский фунт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "Дирхам ОАЭ" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rial omanais", "value": "Оманский риал" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Катарский риал" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rial saoudien", "value": "Саудовский риял" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rial yéménite", "value": "Йеменский риал" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Shekel israélien", "value": "Израильский шекель" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc CFA", "value": "Франк КФА" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar algérien", "value": "Алжирский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Kwanza", "value": "Ангольская кванза" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Pula", "value": "Ботсванская пула" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc burundais", "value": "Бурундийский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Эскудо Кабо-Верде" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc comorien", "value": "Коморский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc congolais", "value": "Конголезский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Джибутийский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Египетский фунт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Эритрейская накфа" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Birr", "value": "Эфиопский быр" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Lilangeni", "value": "Свазилендский лилангени" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dalasi", "value": "Гамбийский даласи" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Cédi", "value": "Ганский седи" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc guinéen", "value": "Гвинейский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Кенийский шиллинг" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Loti", "value": "Лоти Лесото" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Liberian dollar", "value": "Либерийский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar libyen", "value": "Ливийский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Ariary", "value": "Малагасийский ариари" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Малавийская квача" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Маврикийская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Ouguiya", "value": "Мавританская угия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dirham marocain", "value": "Марокканский дирхам" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Metical", "value": "Мозамбикский метикал" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar namibien", "value": "Намибийский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Naira nigérien", "value": "Нигерийская найра" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Franc rwandais", "value": "Руандийский франк" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dobra", "value": "Добра Сан-Томе и Принсипи" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Сейшельская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Leone", "value": "Сьерра-леонский леоне" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Shilling somalien", "value": "Сомалийский шиллинг" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rand", "value": "Южноафриканский рэнд" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Южносуданский фунт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Суданский фунт" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Танзанийский шиллинг" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Тунисский динар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Угандийский шиллинг" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar australien", "value": "Австралийский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Taka bangladais", "value": "Бангладешская така" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Бутанский нгултрум" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Брунейский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Камбоджийский риель" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Yuan chinois", "value": "Китайский юань" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Гонконгский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Индонезийская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie indienne", "value": "Индийская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Yen japonais", "value": "Японская иена" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Казахстанский тенге" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Som kirghiz", "value": "Киргизский сом" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Kip laotien", "value": "Лаосский кип" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Патака Макао" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Малайзийский ринггит" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Rufiyaa", "value": "Мальдивская руфия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Монгольский тугрик" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Мьянманский кьят" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Непальская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Новозеландский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Северокорейская вона" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Пакистанская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Peso philippin", "value": "Филиппинское песо" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Сингапурский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Южнокорейская вона" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Шри-ланкийская рупия" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Новый тайваньский доллар" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Таджикский сомони" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Тайский бат" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Туркменский манат" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Som ouzbek", "value": "Узбекский сум" },
                        { "lang": { "$link": { "code": "ru", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Вьетнамский донг" }
                    ]
                },
                "sv": {
                    "lang": [{
                        "name": "Svenska",
                        "code": "sv"
                    }],
                    "translation": [
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Lek", "value": "Lek" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rouble Biélorusse", "value": "Vitrysk rubel" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Mark convertible de Bosnie-Herzégovine", "value": "Konvertibel mark (Bosnien och Hercegovina)" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Lev bulgare", "value": "Bulgarisk lev" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Couronne Tchèque", "value": "Tjeckisk krona" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Couronne danoise", "value": "Dansk krona" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Iari", "value": "Iari" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Forint", "value": "Ungersk forint" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Couronne islandaise", "value": "Isländsk krona" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc suisse", "value": "Schweizisk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Leu moldave", "value": "Moldavisk leu" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Denar macédonien", "value": "Makedonisk denar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Couronne norvégienne", "value": "Norsk krona" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Zloty", "value": "Polsk zloty" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Leu roumain", "value": "Rumänsk leu" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rouble russe", "value": "Rysk rubel" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar serbe", "value": "Serbisk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre turque", "value": "Turkisk lira" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Hryvnia", "value": "Ukrainsk hryvnia" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre sterling", "value": "Brittiskt pund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar américain", "value": "Amerikansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar des caraïbes orientales", "value": "Östkaribisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Florin arubais", "value": "Arubansk florin" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso argentin", "value": "Argentinsk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar bahaméen", "value": "Bahamansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar barbadien", "value": "Barbadisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar bermudien", "value": "Bermudisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar bélizien", "value": "Belizisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Boliviano", "value": "Boliviansk boliviano" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Real", "value": "Brasiliansk real" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar canadien", "value": "Kanadensisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar des Îles Caïmans", "value": "Caymansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso chilien", "value": "Chilensk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso colombien", "value": "Colombiansk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Colón costaricien", "value": "Costarikansk colón" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso cubain", "value": "Kubansk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Florin des Antilles néerlandaise", "value": "Nederländsk-antillisk gulden" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso dominicain", "value": "Dominikansk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre des Îles Malouines", "value": "Falklandspund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Quetzal", "value": "Guatemalansk quetzal" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar guyanais", "value": "Guyansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Gourde", "value": "Haitisk gourde" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Lempira", "value": "Honduransk lempira" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar jamaïcain", "value": "Jamaicansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso mexicain", "value": "Mexikansk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Cordoba d’or", "value": "Nicaraguansk córdoba" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Balboa", "value": "Panamansk balboa" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Guarani", "value": "Paraguayansk guarani" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Sol péruvien", "value": "Peruansk sol" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar surinamien", "value": "Surinamesisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar de Trinité-et-Tobago", "value": "Trinidadisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso uruguayen", "value": "Uruguayansk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Bolivar vénézuélien", "value": "Venezuelansk bolívar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Afghani", "value": "Afghansk afghani" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dram", "value": "Armenisk dram" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Manat azerbaïdjanais", "value": "Azerbajdzjansk manat" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar bahreïni", "value": "Bahrainsk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Euro", "value": "Euro" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Lari", "value": "Georgisk lari" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar iraqien", "value": "Irakisk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rial iranien", "value": "Iransk rial" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar jordanien", "value": "Jordansk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar koweïtien", "value": "Kuwaitisk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre libanaise", "value": "Libanesiskt pund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Shekel", "value": "Israelisk shekel" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre syrienne", "value": "Syriskt pund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dirham des Émirats arabes unis", "value": "Emiratisk dirham" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rial omanais", "value": "Omansk rial" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Riyal du Qatar", "value": "Qatarsk rial" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rial saoudien", "value": "Saudisk riyal" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rial yéménite", "value": "Jemenitisk rial" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Shekel israélien", "value": "Israelisk shekel" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc CFA", "value": "CFA-franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar algérien", "value": "Algerisk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Kwanza", "value": "Angolansk kwanza" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Pula", "value": "Botswansk pula" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc burundais", "value": "Burundisk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Escudo cap-verdien", "value": "Kapverdisk escudo" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc comorien", "value": "Komorisk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc congolais", "value": "Kongolesisk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc Djibouti", "value": "Djiboutisk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre égyptienne", "value": "Egyptiskt pund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Nakfa érythréen", "value": "Eritreansk nakfa" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Birr", "value": "Etiopisk birr" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Lilangeni", "value": "Swaziländsk lilangeni" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dalasi", "value": "Gambisk dalasi" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Cédi", "value": "Ghanansk cedi" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc guinéen", "value": "Guineansk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Shilling Kenyan", "value": "Kenyansk shilling" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Loti", "value": "Lesothisk loti" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Liberian dollar", "value": "Liberiansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar libyen", "value": "Libysk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Ariary", "value": "Madagaskisk ariary" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Kwacha malawien", "value": "Malawisk kwacha" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie mauricienne", "value": "Mauritisk rupie" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Ouguiya", "value": "Mauretansk ouguiya" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dirham marocain", "value": "Marockansk dirham" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Metical", "value": "Moçambikisk metical" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar namibien", "value": "Namibisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Naira nigérien", "value": "Nigeriansk naira" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Franc rwandais", "value": "Rwandisk franc" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dobra", "value": "São Toméansk dobra" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie seychelloise", "value": "Seychellisk rupie" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Leone", "value": "Sierraleonsk leone" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Shilling somalien", "value": "Somalisk shilling" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rand", "value": "Sydafrikansk rand" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre soudanaise du sud", "value": "Sydsudanesiskt pund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Livre soudanaise", "value": "Sudanesiskt pund" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Shilling tanzanien", "value": "Tanzanisk shilling" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dinar tunisien", "value": "Tunisisk dinar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Shilling ougandais", "value": "Ugandisk shilling" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar australien", "value": "Australisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Taka bangladais", "value": "Bangladeshisk taka" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Ngultrum bhoutanais", "value": "Bhutanesisk ngultrum" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar de Brunei", "value": "Bruneisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Riel cambodgien", "value": "Kambodjansk riel" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Yuan chinois", "value": "Kinesisk yuan" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar de Hong-Kong", "value": "Hongkong-dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie indonésienne", "value": "Indonesisk rupiah" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie indienne", "value": "Indisk rupie" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Yen japonais", "value": "Japansk yen" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Tenge kazakhstani", "value": "Kazakstansk tenge" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Som kirghiz", "value": "Kirgizisk som" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Kip laotien", "value": "Laotisk kip" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Pataca de Macao", "value": "Macaosk pataca" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Ringgit malaisien", "value": "Malaysisk ringgit" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Rufiyaa", "value": "Maldivisk rufiyaa" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Tögrög mongol", "value": "Mongolisk tögrög" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Kyat myanmarais", "value": "Myanmarisk kyat" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie népalaise", "value": "Nepalesisk rupie" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar néo-zélandais", "value": "Nyzeeländsk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Won nord-coréen", "value": "Nordkoreansk won" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie pakistanaise", "value": "Pakistansk rupie" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Peso philippin", "value": "Filippinsk peso" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dollar singapourien", "value": "Singaporiansk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Won sud-coréen", "value": "Sydkoreansk won" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Roupie sri-lankaise", "value": "Sri Lankesisk rupie" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Nouveau dollar taïwanais", "value": "Taiwanesisk dollar" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Somoni tadjik", "value": "Tadzjikisk somoni" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Baht thaïlandais", "value": "Thailändsk baht" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Nouveau manat turkmène", "value": "Turkmensk manat" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Som ouzbek", "value": "Uzbekisk sum" },
                        { "lang": { "$link": { "code": "sv", "_model": "lang" } }, "key": "Dong vietnamien", "value": "Vietnamesisk dong" }
                    ]
                }

            }
        },
        {
            "name": "Stripe Integration Pro",
            "description": `
This package is a comprehensive solution for integrating Stripe into your application. It not only manages payments, but also automates the entire billing and customer management ecosystem. In summary, this package allows you to:

### 1. Automatically synchronize your Stripe data:
Thanks to webhooks, all important information (customers, subscriptions, products, prices, invoices) is created and updated in real time in your local database. This gives you a reliable source of truth without manual effort.

### 2. Manage the complete subscription lifecycle:
• Creation: When a customer subscribes, the package creates the subscription locally and can send a welcome email.
• Updates: Status changes (e.g., from trial to active) or cancellations are automatically reflected. • Payment failures: If a subscription payment fails, an email is automatically sent to the customer asking them to update their payment information.

### 3. Automate payment and invoice processing:
• Records every successful payment in your database. • Sends receipts by email after a payment. • Manages invoices (creation, payment, failure) and can send them to customers.

### 4. Facilitate the payment process for your users:
• Includes a workflow to create Stripe Checkout sessions, whether for a one-time payment or to start a new subscription.

### 5. Provide an overview of your finances:
• Offers a pre-configured dashboard with essential key performance indicators (KPIs):
• Total revenue • Number of successful payments • Average payment value
• Refund rate
• Displays a graph of payment trends over time.

In short, this pack transforms your application into a robust and automated billing platform, while improving your customers' experience through clear and timely communications.

        ### Webhook Configuration

Ajoutez ces événements supplémentaires pour une synchronisation complète :

* Customer Events:
  - customer.created
  - customer.updated
  - customer.deleted

* Product Events:
  - product.created
  - product.updated
  - product.deleted
  - price.created
  - price.updated
  
  ### Webhook Configuration

To make the integration fully work, you need to configure a webhook in your Stripe Dashboard. This allows Stripe to send real-time notifications (like `payment.succeeded` or `customer.subscription.created`) to your application.

1. **Get Your Webhook URL:** 
Your application's webhook URL is: 
https://<your-domain.com>/api/actions/stripe-webhook
Replace <your-domain.com> with your actual public domain.

2. **Add Endpoint in Stripe:** 
* Go to your Stripe Dashboard. 
* Navigate to **Developers > Webhooks**. 
* Click **+ Add an endpoint**. 
* Paste your URL in the **Endpoint URL** field.

3. **Select Events:** 
Click on **+ Select events** and choose the following events to listen to: 
* invoice.paid
* invoice.payment_failed
* customer.subscription.created 
* customer.subscription.updated 
* customer.subscription.deleted 
* payment_intent.succeeded

4. **Secure Your Webhook:** 
* After creating the endpoint, Stripe will show a **Signing secret**. Click to reveal it. 
* Copy this secret (it starts with \`whsec_...\`). 
* In your application's **\`env\` model**, find the variable named \`STRIPE_WEBHOOK_SECRET\` and paste the key there.

This ensures that your application only processes legitimate requests from Stripe.`,
            "tags": ["payment", "stripe", "e-commerce", "subscription", "billing"],
            "models": [
                "endpoint",
                "dashboard",
                "kpi",
                "workflow",
                "workflowStep",
                "workflowAction",
                "workflowTrigger",
                "env",
                "currency",
                {
                    "name": "StripeCustomer",
                    "description": "Maps local users to Stripe customers with billing details.",
                    "fields": [
                        { "name": "user", "type": "relation", "relation": "user", "required": true, "asMain": true },
                        { "name": "stripeCustomerId", "type": "string", "required": true, "unique": true, "hiddenable": true },
                        { "name": "email", "type": "string", "required": true },
                        { "name": "name", "type": "string" },
                        { "name": "phone", "type": "string" },
                        { "name": "address", "type": "code","language": "json"}/* "fields": [
                            { "name": "line1", "type": "string" },
                            { "name": "line2", "type": "string" },
                            { "name": "city", "type": "string" },
                            { "name": "state", "type": "string" },
                            { "name": "postal_code", "type": "string" },
                            { "name": "country", "type": "string" }
                        ]}*/,
                        { "name": "taxExempt", "type": "enum", "items": ["none", "exempt", "reverse"], "default": "none" },
                        { "name": "defaultPaymentMethod", "type": "string" },
                        { "name": "invoiceSettings", "type": "code", "language": "json"}/* "fields": [
                            { "name": "customFields", "type": "array", "itemsType": "object" },
                            { "name": "footer", "type": "string" }
                        ]}*/,
                        { "name": "metadata", "type": "code", "language": "json" }
                    ]
                },
                {
                    "name": "StripeSubscription",
                    "description": "Tracks all subscription details with Stripe.",
                    "fields": [
                        { "name": "stripeSubscriptionId", "type": "string", "required": true, "unique": true, "asMain": true },
                        { "name": "user", "type": "relation", "relation": "user", "required": true },
                        { "name": "customer", "type": "relation", "relation": "StripeCustomer", "required": true },
                        { "name": "plan", "type": "relation", "relation": "StripePlan", "required": true },
                        { "name": "status", "type": "enum", "items": ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"], "required": true },
                        { "name": "currentPeriodStart", "type": "datetime" },
                        { "name": "currentPeriodEnd", "type": "datetime" },
                        { "name": "cancelAtPeriodEnd", "type": "boolean", "default": false },
                        { "name": "canceledAt", "type": "datetime" },
                        { "name": "daysUntilDue", "type": "number" },
                        { "name": "defaultPaymentMethod", "type": "string" },
                        { "name": "latestInvoice", "type": "relation", "relation": "StripeInvoice" },
                        { "name": "startDate", "type": "datetime" },
                        { "name": "trialEnd", "type": "datetime" },
                        { "name": "metadata", "type": "code", "language": "json" }
                    ]
                },
                {
                    "name": "StripePlan",
                    "description": "Subscription plans with detailed pricing information.",
                    "fields": [
                        { "name": "name", "type": "string", "required": true, "asMain": true },
                        { "name": "description", "type": "richtext" },
                        { "name": "stripeProductId", "type": "string", "required": true, "unique": true },
                        { "name": "stripePriceId", "type": "string", "required": true, "unique": true },
                        { "name": "price", "type": "number", "required": true },
                        { "name": "currency", "type": "relation", "relation": "currency", "required": true },
                        { "name": "interval", "type": "enum", "items": ["day", "week", "month", "year"], "required": true },
                        { "name": "intervalCount", "type": "number", "default": 1 },
                        { "name": "trialPeriodDays", "type": "number" },
                        { "name": "active", "type": "boolean", "default": true },
                        { "name": "metadata", "type": "code", "language": "json" },
                        { "name": "features", "type": "array", "itemsType": "string" }
                    ]
                },
                {
                    "name": "StripePayment",
                    "description": "Detailed payment records with reconciliation data.",
                    "fields": [
                        { "name": "stripePaymentIntentId", "type": "string", "required": true, "unique": true, "asMain": true, "hiddenable": true },
                        { "name": "user", "type": "relation", "relation": "user", "required": true },
                        { "name": "customer", "type": "relation", "relation": "StripeCustomer" },
                        { "name": "subscription", "type": "relation", "relation": "StripeSubscription" },
                        { "name": "invoice", "type": "relation", "relation": "StripeInvoice" },
                        { "name": "amount", "type": "number", "required": true },
                        { "name": "amountReceived", "type": "number" },
                        { "name": "currency", "type": "relation", "relation": "currency", "required": true },
                        { "name": "status", "type": "enum", "items": ["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "canceled", "succeeded"], "required": true },
                        { "name": "paymentMethod", "type": "string" },
                        { "name": "paymentMethodDetails", "type": "code", "language": "json", "anonymized": true },
                        { "name": "receiptEmail", "type": "string" },
                        { "name": "receiptUrl", "type": "string" },
                        { "name": "created", "type": "datetime", "default": "now" },
                        { "name": "metadata", "type": "code", "language": "json" }
                    ]
                },
                {
                    "name": "StripeInvoice",
                    "description": "Complete invoice records from Stripe.",
                    "fields": [
                        { "name": "stripeInvoiceId", "type": "string", "required": true, "unique": true, "asMain": true },
                        { "name": "customer", "type": "relation", "relation": "StripeCustomer", "required": true },
                        { "name": "subscription", "type": "relation", "relation": "StripeSubscription" },
                        { "name": "number", "type": "string" },
                        { "name": "amountDue", "type": "number", "required": true },
                        { "name": "amountPaid", "type": "number" },
                        { "name": "amountRemaining", "type": "number" },
                        { "name": "currency", "type": "relation", "relation": "currency", "required": true },
                        { "name": "status", "type": "enum", "items": ["draft", "open", "paid", "uncollectible", "void"], "required": true },
                        { "name": "periodStart", "type": "datetime" },
                        { "name": "periodEnd", "type": "datetime" },
                        { "name": "dueDate", "type": "datetime" },
                        { "name": "pdfUrl", "type": "string" },
                        { "name": "hostedInvoiceUrl", "type": "string" },
                        { "name": "lines", "type": "code", "language": "json" },
                        { "name": "created", "type": "datetime", "default": "now" },
                        { "name": "metadata", "type": "code", "language": "json" }
                    ]
                },
                {
                    "name": "StripeRefund",
                    "description": "Records of refunds processed through Stripe.",
                    "fields": [
                        { "name": "stripeRefundId", "type": "string", "required": true, "unique": true, "asMain": true },
                        { "name": "payment", "type": "relation", "relation": "StripePayment", "required": true },
                        { "name": "amount", "type": "number", "required": true },
                        { "name": "currency", "type": "relation", "relation": "currency", "required": true },
                        { "name": "reason", "type": "enum", "items": ["duplicate", "fraudulent", "requested_by_customer", "expired_uncaptured_charge"] },
                        { "name": "status", "type": "enum", "items": ["pending", "succeeded", "failed", "canceled"], "required": true },
                        { "name": "receiptNumber", "type": "string" },
                        { "name": "created", "type": "datetime", "default": "now" }
                    ]
                }
            ],
            "data": {
                "all": {
                    "env": [
                        { "name": "STRIPE_SECRET_KEY", "value": "sk_test_YOUR_SECRET_KEY" },
                        { "name": "STRIPE_WEBHOOK_SECRET", "value": "whsec_YOUR_WEBHOOK_SECRET" }
                    ],
                    "endpoint": [
                        {
                            "name": "Stripe Webhook Handler",
                            "path": "stripe-webhook",
                            "method": "POST",
                            "isActive": true,
                            "webhook": {
                                "provider": "stripe",
                                "secretEnvVar": "STRIPE_WEBHOOK_SECRET"
                            },
                            "code": `// The webhook signature has already been verified by the engine.
// The verified event is available in context.webhookEvent.
await workflow.run('Process Stripe Webhook Events', { event: context.webhookEvent });
return { status: 200, body: { received: true } };`
                        }
                    ],
                    "workflow": [
                        {
                            "name": "Process Stripe Webhook Events",
                            "description": "Processes incoming Stripe webhook events and triggers appropriate actions.",
                            "startStep": { "$link": { "name": "Check for Invoice Paid", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Subscription Lifecycle Management",
                            "description": "Handles subscription creation, updates, and cancellations.",
                            "startStep": { "$link": { "name": "Handle Subscription Created", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Payment Reconciliation",
                            "description": "Ensures payments are properly recorded and reconciled with orders.",
                            "startStep": { "$link": { "name": "Handle Payment Succeeded", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Invoice Processing",
                            "description": "Handles invoice generation, payment, and reminders.",
                            "startStep": { "$link": { "name": "Handle Invoice Created", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Create Stripe Checkout Session",
                            "description": "Creates a Stripe Checkout session for a one-time payment or a subscription.",
                            "startStep": { "$link": { "name": "Select Session Type", "_model": "workflowStep" } }
                        }
                    ],
                    "workflowAction": [
                        // Ajout dans la section workflowAction
                        {
                            "name": "Send Payment Failure Email",
                            "description": "Envoie un email au client quand un paiement échoue avec instructions pour mettre à jour sa méthode de paiement.",
                            "type": "SendEmail",
                            "emailRecipients": ["{triggerData.customer.email}"],
                            "emailSubject": "Payment Failed for Your Subscription",
                            "emailContent": `
<h1>Payment Failed</h1>
<p>We couldn't process your payment for invoice #{triggerData.number}.</p>
<p>Amount due: {triggerData.amountDue} {triggerData.currency.symbol}</p>
<p><strong>Please update your payment method:</strong></p>
<a href="{triggerData.hostedInvoiceUrl}" style="background-color: #E53E3E; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
    Update Payment Method
</a>
<p>If you believe this is an error, please contact our support team.</p>
`
                        },
                        {
                            "name": "Send Subscription Welcome",
                            "description": "Envoie un email de bienvenue pour un nouvel abonnement.",
                            "type": "SendEmail",
                            "emailRecipients": ["{triggerData.customer_email}"],
                            "emailSubject": "Welcome to your new subscription!",
                            "emailContent": `
<h1>Thank you for subscribing!</h1>
<p>We're excited to have you on board. Here are the details of your subscription:</p>
<ul>
    <li>Plan: {context.plan.name}</li>
    <li>Amount: {context.plan.price} {context.plan.currency.code}/month</li>
    <li>Next billing date: {context.subscription.currentPeriodEnd}</li>
</ul>
<p>If you have any questions, please don't hesitate to contact our support team.</p>
`
                        },
                        {
                            "name": "Process Invoice Payment",
                            "description": "Traite le paiement d'une facture et met à jour le statut.",
                            "type": "ExecuteScript",
                            "script": `
const invoice = context.triggerData.data.object;

// Trouver l'abonnement associé
const subscription = await db.findOne('StripeSubscription', {
    stripeSubscriptionId: invoice.subscription
});

if (!subscription) {
    logger.warn('Subscription not found for invoice:', invoice.id);
    return { success: false, message: 'Subscription not found' };
}

// Créer/mettre à jour l'enregistrement de facture
const invoiceData = {
    stripeInvoiceId: invoice.id,
    customer: subscription.customer,
    subscription: subscription._id,
    number: invoice.number,
    amountDue: invoice.amount_due / 100,
    amountPaid: invoice.amount_paid / 100,
    amountRemaining: invoice.amount_remaining / 100,
    currency: subscription.plan.currency,
    status: invoice.status,
    periodStart: new Date(invoice.period_start * 1000),
    periodEnd: new Date(invoice.period_end * 1000),
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    pdfUrl: invoice.invoice_pdf,
    hostedInvoiceUrl: invoice.hosted_invoice_url,
    lines: JSON.stringify(invoice.lines.data),
    created: new Date(invoice.created * 1000),
    metadata: invoice.metadata ? JSON.stringify(invoice.metadata) : null
};

await db.upsert('StripeInvoice', 
    { stripeInvoiceId: invoice.id },
    invoiceData
);

// Si la facture est payée, mettre à jour le statut de l'abonnement
if (invoice.status === 'paid') {
    await db.update('StripeSubscription', 
        { _id: subscription._id },
        { 
            status: 'active',
            latestInvoice: invoice.id
        }
    );
}

return { success: true };
`
                        },
                        {
                            "name": "Send Invoice Email",
                            "description": "Envoie la facture par email au client.",
                            "type": "SendEmail",
                            "emailRecipients": ["{triggerData.customer_email}"],
                            "emailSubject": "Your invoice is ready",
                            "emailContent": `
<h1>Your Invoice #{triggerData.number}</h1>
<p>Amount due: {triggerData.amount_due / 100} {triggerData.currency.toUpperCase()}</p>
<p>Due date: {triggerData.due_date ? new Date(triggerData.due_date * 1000).toLocaleDateString() : 'Immediately'}</p>
<p>You can view and pay your invoice <a href="{triggerData.hosted_invoice_url}">here</a>.</p>
<p>Thank you for your business!</p>
`
                        },
                        {
                            "name": "Stripe: Create Customer",
                            "description": "Creates a new customer in Stripe. Expects 'email' and 'name' in the triggerData.",
                            "type": "HttpRequest",
                            "method": "POST",
                            "url": "https://api.stripe.com/v1/customers",
                            "headers": { "Authorization": "Bearer {env.STRIPE_SECRET_KEY}", "Content-Type": "application/x-www-form-urlencoded" },
                            "body": "email={triggerData.email}&name={triggerData.name}&description=Customer for {triggerData.email}&metadata[userId]={triggerData.user._id}"
                        },
                        {
                            "name": "Stripe: Retrieve Payment Intent",
                            "description": "Retrieves a Payment Intent object from Stripe.",
                            "type": "HttpRequest",
                            "method": "GET",
                            "url": "https://api.stripe.com/v1/payment_intents/{triggerData.event.id}",
                            "headers": { "Authorization": "Bearer {env.STRIPE_SECRET_KEY}" }
                        },
                        {
                            "name": "Stripe Service: Verify Webhook",
                            "description": "Uses the native Stripe service to securely verify a webhook signature.",
                            "type": "ExecuteServiceFunction",
                            "serviceName": "stripe",
                            "functionName": "verifyWebhookSignature",
                            "args": ["{triggerData.request.headers}", "{triggerData.request.rawBody}"]
                        },
                        {
                            "name": "Stripe: Create Checkout Session (Payment)",
                            "description": "Creates a Stripe Checkout session for a one-time payment.",
                            "type": "HttpRequest",
                            "method": "POST",
                            "url": "https://api.stripe.com/v1/checkout/sessions",
                            "headers": { "Authorization": "Bearer {env.STRIPE_SECRET_KEY}", "Content-Type": "application/json" },
                            "body": {
                                "payment_method_types": ["card"],
                                "line_items": [{
                                    "price_data": {
                                        "currency": "{triggerData.currencyCode}",
                                        "product_data": { "name": "{triggerData.productName}" },
                                        "unit_amount": "{triggerData.amountInCents}"
                                    },
                                    "quantity": "{triggerData.quantity}"
                                }],
                                "mode": "payment",
                                "success_url": "{triggerData.successUrl}",
                                "cancel_url": "{triggerData.cancelUrl}",
                                "customer_email": "{triggerData.customerEmail}",
                                "metadata": "{triggerData.metadata}"
                            }
                        },
                        {
                            "name": "Stripe: Create Checkout Session (Subscription)",
                            "description": "Creates a Stripe Checkout session for a new subscription.",
                            "type": "HttpRequest",
                            "method": "POST",
                            "url": "https://api.stripe.com/v1/checkout/sessions",
                            "headers": { "Authorization": "Bearer {env.STRIPE_SECRET_KEY}", "Content-Type": "application/json" },
                            "body": {
                                "payment_method_types": ["card"],
                                "line_items": [{ "price": "{triggerData.priceId}", "quantity": 1 }],
                                "mode": "subscription",
                                "success_url": "{triggerData.successUrl}",
                                "cancel_url": "{triggerData.cancelUrl}",
                                "customer": "{triggerData.stripeCustomerId}"
                            }
                        },
                        {
                            "name": "Save Successful Payment to DB",
                            "description": "Saves the details of a successful payment intent to the local database.",
                            "type": "ExecuteScript",
                            "script": `
const intent = context.httpResponse; // The result from "Stripe: Retrieve Payment Intent"

const customer = await db.findOne('StripeCustomer', { stripeCustomerId: intent.customer });
const currency = await db.findOne('currency', { code: intent.currency.toUpperCase() });

await db.create('StripePayment', {
    stripePaymentIntentId: intent.id,
    user: customer?.user,
    customer: customer?._id,
    amount: intent.amount / 100,
    amountReceived: intent.amount_received / 100,
    currency: currency?._id,
    status: intent.status,
    paymentMethod: intent.payment_method,
    receiptEmail: intent.receipt_email,
    created: new Date(intent.created * 1000)
});

return { success: true };
`
                        },
                        {
                            "name": "Send Payment Receipt",
                            "description": "Sends a receipt email for successful payments.",
                            "type": "SendEmail",
                            "emailRecipients": ["{context.httpResponse.receipt_email}"],
                            "emailSubject": "Your Payment Receipt",
                            "emailContent": `
<h1>Thank you for your payment!</h1>
<p>We've received your payment of {context.httpResponse.amount / 100} {context.httpResponse.currency.toUpperCase()}.</p>
<p>Payment ID: {triggerData.payload.id}</p>
<p>You can view your receipt <a href="{triggerData.payload.receipt_url}">here</a>.</p>
<p>If you have any questions, please contact our support team.</p>
`
                        },
                        {
                            "name": "Process Refund",
                            "description": "Handles refund creation and updates order status.",
                            "type": "ExecuteScript",
                            "script": `
const { refund } = context.triggerData.payload;

// Find the original payment
const payment = await db.findOne('StripePayment', {
    stripePaymentIntentId: refund.payment_intent
});

if (!payment) {
    logger.warn('Original payment not found for refund:', refund.id);
    return { success: false, message: 'Original payment not found' };
}

// Create refund record
await db.create('StripeRefund', {
    stripeRefundId: refund.id,
    payment: payment._id,
    amount: refund.amount / 100,
    currency: payment.currency,
    reason: refund.reason,
    status: refund.status,
    receiptNumber: refund.receipt_number,
    created: new Date(refund.created * 1000)
});

// Update order status if linked
if (payment.order) {
    await db.update('order', 
        { _id: payment.order },
        { status: 'refunded', refundId: refund.id }
    );
}

return { success: true };
`
                        },
                        {
                            "name": "Log Unhandled Stripe Event",
                            "description": "Logs the type and ID of a Stripe event that was not handled by any other workflow step.",
                            "type": "ExecuteScript",
                            "script": `
 logger.warn('Unhandled Stripe Event Received: Type=' + context.triggerData.event.type + ', ID=' + context.triggerData.event.id);
 return { success: true, message: 'Event logged as unhandled.' };
 `
                        },
                        {
                            "name": "Sync Stripe Entity to Local DB",
                            "description": "Synchronise une entité Stripe avec la base locale sans utiliser upsert",
                            "type": "ExecuteScript",
                            "script": `
const event = context.triggerData;
const stripeObject = event.data.object;
const objectType = stripeObject.object;

// Helper function to safely get nested properties
const getNested = (obj, path) => {
  return path.split('.').reduce((o, p) => (o && o[p] !== undefined ? o[p] : null), obj);
};

// Helper function to safely stringify objects
const safeStringify = (obj) => {
  try {
    return obj ? JSON.stringify(obj) : null;
  } catch (e) {
    logger.warn('Failed to stringify object:', e);
    return null;
  }
};

let modelName;
let idField;
let dataToUpsert = {};

switch (objectType) {
  case 'customer':
    modelName = 'StripeCustomer';
    idField = 'stripeCustomerId';
    dataToUpsert = {
      stripeCustomerId: stripeObject.id,
      email: stripeObject.email || null,
      name: stripeObject.name || null,
      phone: stripeObject.phone || null,
      address: stripeObject.address ? safeStringify(stripeObject.address) : null,
      taxExempt: stripeObject.tax_exempt || 'none',
      defaultPaymentMethod: getNested(stripeObject, 'invoice_settings.default_payment_method'),
      invoiceSettings: stripeObject.invoice_settings ? safeStringify(stripeObject.invoice_settings) : null,
      metadata: stripeObject.metadata ? safeStringify(stripeObject.metadata) : null
    };
    break;
    
  case 'subscription':
    modelName = 'StripeSubscription';
    idField = 'stripeSubscriptionId';
    dataToUpsert = {
      stripeSubscriptionId: stripeObject.id,
      status: stripeObject.status,
      currentPeriodStart: stripeObject.current_period_start ? new Date(stripeObject.current_period_start * 1000) : null,
      currentPeriodEnd: stripeObject.current_period_end ? new Date(stripeObject.current_period_end * 1000) : null,
      cancelAtPeriodEnd: stripeObject.cancel_at_period_end || false,
      canceledAt: stripeObject.canceled_at ? new Date(stripeObject.canceled_at * 1000) : null,
      daysUntilDue: stripeObject.days_until_due || null,
      defaultPaymentMethod: stripeObject.default_payment_method || null,
      startDate: stripeObject.start_date ? new Date(stripeObject.start_date * 1000) : null,
      trialEnd: stripeObject.trial_end ? new Date(stripeObject.trial_end * 1000) : null,
      metadata: stripeObject.metadata ? safeStringify(stripeObject.metadata) : null
    };
    
    // Handle relations
    if (stripeObject.customer) {
      const customer = await db.findOne('StripeCustomer', { stripeCustomerId: stripeObject.customer });
      if (customer) dataToUpsert.customer = customer._id;
    }
    
    if (stripeObject.items?.data?.[0]?.price?.id) {
      const priceId = stripeObject.items.data[0].price.id;
      const plan = await db.findOne('StripePlan', { stripePriceId: priceId });
      if (plan) dataToUpsert.plan = plan._id;
    }
    break;
    
  case 'product':
    modelName = 'StripePlan';
    idField = 'stripeProductId';
    dataToUpsert = {
      stripeProductId: stripeObject.id,
      name: stripeObject.name || null,
      description: stripeObject.description || null,
      active: stripeObject.active !== false,
      metadata: stripeObject.metadata ? safeStringify(stripeObject.metadata) : null
    };
    break;
    
  case 'price':
    modelName = 'StripePlan';
    idField = 'stripePriceId';
    dataToUpsert = {
      stripePriceId: stripeObject.id,
      price: stripeObject.unit_amount ? stripeObject.unit_amount / 100 : null,
      interval: stripeObject.recurring?.interval || null,
      intervalCount: stripeObject.recurring?.interval_count || 1
    };
    
    if (stripeObject.metadata?.trial_period_days) {
      dataToUpsert.trialPeriodDays = parseInt(stripeObject.metadata.trial_period_days) || null;
    }
    
    if (stripeObject.currency) {
      const currency = await db.findOne('currency', { code: stripeObject.currency.toUpperCase() });
      if (currency) dataToUpsert.currency = currency._id;
    }
    break;
    
  default:
    logger.warn('Unsupported Stripe object type:', objectType);
    return { success: false, message: 'Unsupported Stripe object type: ' + objectType };
}

// Implémentation manuelle de upsert
try {
  const filter = {};
  filter[idField] = stripeObject.id;
  
  // 1. Vérifier si l'entité existe déjà
  const existing = await db.findOne(modelName, filter);
  
  if (existing) {
    // 2. Mise à jour si l'entité existe
    await db.update(modelName, filter, dataToUpsert);
    logger.info(\`Updated \${modelName} with \${idField}: \${stripeObject.id}\`);
  } else {
    // 3. Création si l'entité n'existe pas
    await db.create(modelName, { ...filter, ...dataToUpsert });
    logger.info(\`Created new \${modelName} with \${idField}: \${stripeObject.id}\`);
  }
  
  return { success: true };
} catch (e) {
  logger.error('Failed to sync Stripe entity:', e);
  return { success: false, message: 'Database operation failed: ' + e.message };
}
`
                        }
                    ],
                    "workflowStep": [
                        {
                            "name": "Log Unhandled Event",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Log Unhandled Stripe Event", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        // --- Main Webhook Router Steps ---
                        {
                            "name": "Check for Invoice Paid",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$eq": ["{triggerData.event.type}", "invoice.paid"] },
                            "onSuccessStep": { "$link": { "name": "Handle Paid Invoice", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Check for Invoice Payment Failed", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Check for Invoice Payment Failed",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$eq": ["{triggerData.event.type}", "invoice.payment_failed"] },
                            "onSuccessStep": { "$link": { "name": "Handle Failed Invoice", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Check for Subscription Created", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Check for Subscription Created",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$eq": ["{triggerData.event.type}", "customer.subscription.created"] },
                            "onSuccessStep": { "$link": { "name": "Handle Subscription Created", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Check for Subscription Updated", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Check for Subscription Updated",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$in": ["{triggerData.event.type}", ["customer.subscription.updated", "customer.subscription.deleted"]] },
                            "onSuccessStep": { "$link": { "name": "Handle Subscription Update/Delete", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Check for Payment Succeeded", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Check for Payment Succeeded",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$eq": ["{triggerData.event.type}", "payment_intent.succeeded"] },
                            "onSuccessStep": { "$link": { "name": "Handle Payment Succeeded", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Check for Customer Updated", "_model": "workflowStep" } }
                        },

                        // --- Action-performing Steps ---
                        {
                            "name": "Handle Paid Invoice",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Process Invoice Payment", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Handle Failed Invoice",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Send Payment Failure Email", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Handle Invoice Created",
                            "workflow": { "$link": { "name": "Invoice Processing", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Send Payment Failure Email", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Handle Subscription Created",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": [
                                { "$link": { "name": "Sync Stripe Entity to Local DB", "_model": "workflowAction" } },
                                { "$link": { "name": "Send Subscription Welcome", "_model": "workflowAction" } }
                            ],
                            "onSuccessStep": { "$link": { "name": "Handle Send Welcome Email", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Handle Send Welcome Email",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Send Subscription Welcome", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Handle Subscription Update/Delete",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Sync Stripe Entity to Local DB", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Handle Payment Succeeded",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Save Successful Payment to DB", "_model": "workflowAction" } },
                            "onSuccessStep": { "$link": { "name": "Handle Send Payment Receipt", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Handle Send Payment Receipt",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Send Payment Receipt", "_model": "workflowAction" } },
                            "isTerminal": true
                        },

                        // --- Other Workflows Steps (Checkout, etc.) ---
                        {
                            "name": "Select Session Type",
                            "workflow": { "$link": { "name": "Create Stripe Checkout Session", "_model": "workflow" } },
                            "conditions": { "$eq": ["{triggerData.mode}", "subscription"] },
                            "onSuccessStep": { "$link": { "name": "Create Subscription Checkout Session", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Create Payment Checkout Session", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Create Payment Checkout Session",
                            "workflow": { "$link": { "name": "Create Stripe Checkout Session", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Stripe: Create Checkout Session (Payment)", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Create Subscription Checkout Session",
                            "workflow": { "$link": { "name": "Create Stripe Checkout Session", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Stripe: Create Checkout Session (Subscription)", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Check for Customer Updated",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$in": ["{triggerData.event.type}", ["customer.created", "customer.updated", "customer.deleted"]] },
                            "onSuccessStep": { "$link": { "name": "Handle Customer Update", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Check for Product Updated", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Check for Product Updated",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "conditions": { "$in": ["{triggerData.event.type}", ["product.created", "product.updated", "product.deleted", "price.created", "price.updated"]] },
                            "onSuccessStep": { "$link": { "name": "Handle Product Update", "_model": "workflowStep" } },
                            "onFailureStep": { "$link": { "name": "Log Unhandled Event", "_model": "workflowStep" } }
                        },
                        {
                            "name": "Handle Customer Update",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Sync Stripe Entity to Local DB", "_model": "workflowAction" } },
                            "isTerminal": true
                        },
                        {
                            "name": "Handle Product Update",
                            "workflow": { "$link": { "name": "Process Stripe Webhook Events", "_model": "workflow" } },
                            "actions": { "$link": { "name": "Sync Stripe Entity to Local DB", "_model": "workflowAction" } },
                            "isTerminal": true
                        }
                    ],
                    "dashboard": [
                        {
                            "name": "Stripe Payments Overview",
                            "description": "Key metrics and recent activity for Stripe payments.",
                            "layout": [
                                {
                                    "name": "Payment Metrics",
                                    "kpis": [
                                        "Total Revenue",
                                        "Successful Payments",
                                        "Avg. Payment Value",
                                        "Refund Rate"
                                    ],
                                    "chartConfigs": [
                                        {
                                            "title": "Payments by Day",
                                            "type": "line",
                                            "model": "StripePayment",
                                            "xAxis": { "field": "created", "interval": "day" },
                                            "yAxis": { "field": "amount", "aggregation": "sum" },
                                            "filter": { "status": "succeeded" }
                                        }
                                    ]
                                }/*
                                {
                                    "name": "Recent Activity",
                                    "component": "DataTable",
                                    "config": {
                                        "model": "StripePayment",
                                        "columns": ["created", "amount", "currency", "status", "user"],
                                        "limit": 10,
                                        "sort": { "created": -1 }
                                    }
                                }*/
                            ]
                        }
                    ],
                    "kpi": [
                        {
                            "name": "Total Revenue",
                            "targetModel": "StripePayment",
                            "aggregationType": "sum",
                            "aggregationField": "amount",
                            "filter": { "status": "succeeded" },
                            "unit": "$",
                            "icon": "FaMoneyBillWave"
                        },
                        {
                            "name": "Successful Payments",
                            "targetModel": "StripePayment",
                            "aggregationType": "count",
                            "filter": { "status": "succeeded" },
                            "icon": "FaCreditCard"
                        },
                        {
                            "name": "Avg. Payment Value",
                            "targetModel": "StripePayment",
                            "aggregationType": "avg",
                            "aggregationField": "amount",
                            "filter": { "status": "succeeded" },
                            "unit": "$",
                            "icon": "FaCalculator"
                        },
                        {
                            "name": "Refund Rate",
                            "targetModel": "StripeRefund",
                            "aggregationType": "ratio",
                            "numerator": { "model": "StripeRefund", "aggregation": "count" },
                            "denominator": { "model": "StripePayment", "aggregation": "count" },
                            "unit": "%",
                            "icon": "FaExchangeAlt"
                        }
                    ]
                }
            }
        }
    ];
}