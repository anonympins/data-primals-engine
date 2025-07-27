# Data Primals Engine

**data-primals-engine** is a powerful and flexible **Node.js** backend framework designed to accelerate development of complex data-driven applications. Built on **Express.js** and **MongoDB**, it offers dynamic data modeling, automation workflows, advanced user management, and more.

> Whether you're building a CRM, e-commerce site, CMS, or SaaS platform, **data-primals-engine** provides the strong foundations so you can focus on what makes your application unique.

---

## 🚀 Key Features

- **Dynamic data modeling**: Define and update schemas using JSON, no migrations required.
- **Robust REST API**: Advanced CRUD operations, filtering, and querying.
- **Modular architecture**: Load or extend modules dynamically.
- **Automation workflows**: Trigger actions on events or schedules.
- **Authentication & authorization**: Role-based access control, pluggable providers.
- **📦 Starter Packs**: CRM, e-commerce, showcase websites, etc.
- **🧠 AI Integration**: Supports OpenAI, Google Gemini via LangChain.
- **🌐 i18n support**: Multilingual interfaces, translated validations.
- **📄 Auto Documentation**: Swagger available at `/api-docs`.

---

## ⚙️ Requirements

- Node.js ≥ 18
- MongoDB (local or remote)
- NPM or Yarn

---

## ⚡ Quick Start

```bash
npm i data-primals-engine
```
or
```bash
git clone https://your-repo/data-primals-engine.git
cd data-primals-engine
npm install
```
Possibly create a `.env` file:
```env
MONGO_DB_URL=mongodb://127.0.0.1:27017
```

Start the server:
```bash
# Development mode
npm run devserver

# Production mode
npm run server
```

By default, the app runs on port **7633**.

---

## 🧠 Concepts

### 1. Models
Define schemas using JSON:
```json
{
  "name": "product",
  "description": "E-commerce product schema",
  "fields": [
    { "name": "name", "type": "string", "required": true },
    { "name": "price", "type": "number", "required": true },
    { "name": "stock", "type": "number", "default": 0 },
    { "name": "category", "type": "relation", "relation": "taxonomy" }
  ]
}
```

### 2. Modules
Activatable features:
- `mongodb`, `data`, `user`, `workflow`, `file`, `assistant`, `swagger`

### 3. Starter Packs
- **E-commerce**: Products, orders, KPIs
- **CRM**: Contacts, leads, interactions
- **Website/blog**: Pages, posts, i18n

### 4. Workflows
Automate business processes:
- **Triggers**: `DataAdded`, `DataUpdated`, `Scheduled`, `Manual`
- **Actions**: `CreateData`, `UpdateData`, `SendEmail`, `ApiCall`

Example:
> When a new order is created, email the customer, update stock, and notify logistics.

---

## 🔌 API Examples (using `curl`)

### 📁 Model Management

#### Create a model
```bash
curl -X POST http://localhost:7633/api/model?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "name": "newModel",
           "description": "A test model.",
           "fields": [
             {"name": "title", "type": "string", "required": true},
             {"name": "price", "type": "number"}
           ]
         }'
```

#### Update a model
```bash
curl -X PUT http://localhost:7633/api/model/60d0fe4f5311236168a109ca?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "name": "updatedModel",
           "description": "Updated description.",
           "fields": [
             {"name": "title", "type": "string", "required": true},
             {"name": "status", "type": "enum", "items": ["active", "inactive"]}
           ]
         }'
```

#### Delete a model
```bash
curl -X DELETE "http://localhost:7633/api/model?_user=demo&name=newModel" \
     -H "Authorization: Bearer demotoken"
```

### 🗂️ Data Management

#### Create a document
```bash
curl -X POST http://localhost:7633/api/data?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "data": {
             "name": "Widget Extraordinaire",
             "price": 99.99,
             "stock": 150,
             "published": true
           }
         }'
```

#### Search documents
```bash
curl -X POST http://localhost:7633/api/data/search?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "filter": { "price": { "$gt": 50 } }
         }'
```

#### Update a document by ID
```bash
curl -X PUT http://localhost:7633/api/data/64a31c123ef59d4c8d55aa99?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "data": { "price": 109.99 }
         }'
```

#### Bulk update
```bash
curl -X PUT http://localhost:7633/api/data?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "data": { "stock": 999 }
         }'
```

#### Delete documents
```bash
curl -X DELETE http://localhost:7633/api/data?_user=demo \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "ids": ["64a31c123ef59d4c8d55aa99"]
         }'
```

## Other operations

Make sure you use the code below to initialize the user : 
```javascript
import { Engine } from 'data-primals-engine/engine';
import { insertData, searchData } from 'data-primals-engine/modules/data';

// Ensure the engine is initialized
const engine = await Engine.Create();
const currentUser = await engine.userProvider.findUserByUsername('demo');
if (!currentUser) {
    throw new Error("Could not retrieve the user. Please check credentials or user provider.");
}
console.log(`Successfully authenticated as ${currentUser.username}`);
```

### insertData(modelName, data, files, user)

> Inserts one or more documents, intelligently handling nested relationships.

```javascript
// Uses the `currentUser` object defined above
const newProduct = { name: 'Super Widget', price: 99.99, status: 'available' };
const result = await insertData('product', newProduct, {}, currentUser);

if (result.success) {
    console.log(`Successfully inserted document with ID: ${result.insertedIds[0]}`);
}
```

### editData(modelName, filter, data, files, user)

> Updates existing data matching the filter.

Example:

```javascript
await editData(
    "userProfile",
    { _id: "507f1f77bcf86cd799439011" },
    { bio: "Updated bio text" },
    null, // No files
    currentUser
);
```

### patchData(modelName, filter, data, files, user)

> Partially updates data (only modifies specified fields).

Example:

```javascript
await patchData(
    "settings",
    { userId: "507f1f77bcf86cd799439011" },
    { theme: "dark" },
    null,
    currentUser
);
```

### deleteData(modelName, ids, filter, user)

>Deletes data with cascading relation cleanup.

Examples:

```javascript
// Delete by IDs
await deleteData("comments", ["61d1f1a9e3f1a9e3f1a9e3f1"], null, user);

// Delete by filter
await deleteData("logs", null, { createdAt: { $lt: "2023-01-01" } }, user);
```

### searchData({user, query})

Powerful search with relation expansion and filtering.

Query Options:

- model: Model name to search
- filter: MongoDB-style filter
- depth: Relation expansion depth (default: 1)
- limit/page: Pagination
- sort: Sorting criteria

Example:
```javascript
const results = await searchData({
    user: currentUser,
    query: {
        model: "blogPost",
        filter: { status: "published" },
        depth: 2, // Expand author and comments
        limit: 10,
        sort: "createdAt:DESC"
    }
});
```

## Import/Export
### importData(options, files, user)
> Imports data from JSON/CSV files.

Supported Formats:

- JSON arrays
- JSON with model-keyed objects
- CSV with headers or field mapping

Example:

```javascript
const result = await importData(
    {
        model: "products",
        hasHeaders: true
    },
    { 
        file: req.files.myFileField // from multipart body  
    },
    currentUser
);
```

### exportData(options, user)
> Exports data to a structured format.

Example:

```javascript
await exportData(
    {
        models: ["products", "categories"],
        depth: 1, // Include relations
        lang: "fr" // Localized data
    },
    currentUser
);
// Returns: { success: true, data: { products: [...], categories: [...] } }
```

## Backup & Restore
### dumpUserData(user)
> Creates an encrypted backup of user data.

Features:

- Automatic encryption
- S3 or local storage
- Retention policies by plan (daily/weekly/monthly)

Example:

```javascript
await dumpUserData(currentUser);
// Backup saved to S3 or ./backups/
```

### loadFromDump(user, options)

> Restores user data from backup.

Options:
- modelsOnly: Restore only model definitions

Example:

```javascript
await loadFromDump(currentUser, { modelsOnly: false });
// Full restore including data
```

## Pack Management

### installPack(logger, packId, user, lang)

> Installs a predefined data pack.

Example:

```javascript
const result = await installPack(logger, "61d1f1a9e3f1a9e3f1a9e3f1", user, "en");
// Returns installation summary
```


---

## 📁 Project Structure
```
data-primals-engine/
├── src/
│   ├── middlewares/
│   ├── migrations/
│   ├── modules/
│   ├── workers/
│   ├── engine.js // The Express engine that serves the API
│   ├── constants.js // The inner-application constants definitions
│   ├── packs.js // The packs that will be loaded and available with installPack() method
│   ├── defaultModels.js // The default models available to import
│   ├── ...
└── server.js
```

## Workflows: Automate Your Business Logic

> Workflows are the automation engine of your application. 

They allow you to define complex business processes that run in response to specific events, without writing custom code. 

This is perfect for tasks like **sending welcome emails**, managing **order fulfillment**, or triggering data synchronization.

A workflow is composed of two main parts: **Triggers** and **Actions**.

> A 'workflowTrigger' is the event that initiates a workflow run.
- **DataAdded**: Fires when a new document is created (e.g., a new user signs up).
- **DataEdited**: Fires when a document is updated (e.g., an order status changes to "shipped").
- **DataDeleted**: Fires when a document is removed.
- **Scheduled**: Runs at a specific time or interval using a Cron expression (e.g., 0 0 * * * for a nightly data cleanup job).
- **Manual**: Triggered on-demand via an API call, allowing you to integrate workflows into any part of your application.

> A 'workflowAction' is the individual steps a workflow executes. You can chain them together to create sophisticated logic.
- **CreateData**: Create a new document in any model.
- **UpdateData**: Modify one or more existing documents that match a filter.
- **SendEmail**: Send a transactional email using dynamic data from the trigger.
- **CallWebhook**: Make an HTTP request (GET, POST, etc.) to an external service or API.
- **ExecuteScript**: Run a custom JavaScript snippet for complex logic, data transformation, or conditional branching.
- **GenerateAIContent**: Use an integrated AI provider (like OpenAI or Gemini) to generate text, summarize content, or make decisions.
- **Wait**: Pause the workflow for a specific duration before continuing to the next step

See the details of the workflow models for more details.

---

## 🤝 Contributing

1. Fork the repo
2. Create your feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add new feature"`
4. Push to your branch: `git push origin feature/your-feature`
5. Open a pull request

Star ⭐ the repo if you find it useful!

---

## 📄 License
Distributed under the **MIT License**. See `LICENSE` file.

---

## 🔼 Back to Top
