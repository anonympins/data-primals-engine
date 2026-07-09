# Data Packs: Discover and Install Ready-to-Use Configurations

**Packs** are pre-built configurations that allow you to quickly set up your `data-primals-engine` application with ready-to-use models, data, workflows, and more. They are designed to bootstrap common use cases like a CRM, an e-commerce backoffice, or a project management tool, saving you significant development time.

The **Pack Gallery** is the centralized place within the UI where you can discover, preview, and install these packs.

## What is a Pack?

A pack is a JSON object that can contain basically :

-   **`models`**: A list of model definitions (schemas) to be created.
-   **`data`**: Sample or initial data for the models in the pack. Data can be generic or language-specific.
-   **`workflows`**: Pre-configured automation workflows, including triggers, steps, and actions.
-   **`dashboards`** and **`kpis`**: Ready-to-use dashboards and KPIs for monitoring.
- ...

## Installing a Pack

You can  define a pack on-the-fly and install it. This is useful for migrating configurations between environments or for programmatic setup.

The `installPack` function accepts an array containing the pack's JSON definition.

```javascript
import { installPack } from 'data-primals-engine';

const myCustomPack = [
    {
        "name": "Simple Blog Pack",
        "description": "A basic setup for a blog with posts and categories.",
        "tags": ["blog", "cms"],
        "models": [
            {
                "name": "post",
                "fields": [
                    { "name": "title", "type": "string_t", "required": true },
                    { "name": "content", "type": "richtext_t" },
                    { "name": "status", "type": "enum", "items": ["draft", "published"] }
                ]
            }
        ],
        "data": {
            "all": { // Data for all languages
                "post": [
                    { "title": { "key": "first_post_title", "value": "My First Post" }, "status": "draft" }
                ]
            }
        }
    }
];

const summary = await installPack(myCustomPack, currentUser, "en");
console.log(summary);
```

By using packs, you can dramatically accelerate your project setup and ensure consistency across different instances of your application.


**[Next: AI assistance](AI-assistance)**