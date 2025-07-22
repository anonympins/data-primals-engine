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
git clone https://your-repo/data-primals-engine.git
cd data-primals-engine
npm install
```

Create a `.env` file:
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
curl -X POST http://localhost:7633/api/model?_user=demouser \
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
curl -X PUT http://localhost:7633/api/model/60d0fe4f5311236168a109ca?_user=demouser \
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
curl -X DELETE "http://localhost:7633/api/model?_user=demouser&name=newModel" \
     -H "Authorization: Bearer demotoken"
```

### 🗂️ Data Management

#### Create a document
```bash
curl -X POST http://localhost:7633/api/data?_user=demouser \
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
curl -X POST http://localhost:7633/api/data/search?_user=demouser \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "filter": { "price": { "$gt": 50 } }
         }'
```

#### Update a document by ID
```bash
curl -X PUT http://localhost:7633/api/data/64a31c123ef59d4c8d55aa99?_user=demouser \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "data": { "price": 109.99 }
         }'
```

#### Bulk update
```bash
curl -X PUT http://localhost:7633/api/data?_user=demouser \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "model": "product",
           "data": { "stock": 999 }
         }'
```

#### Delete documents
```bash
curl -X DELETE http://localhost:7633/api/data?_user=demouser \
     -H "Authorization: Bearer demotoken" \
     -H "Content-Type: application/json" \
     -d '{
           "ids": ["64a31c123ef59d4c8d55aa99"]
         }'
```

---

## 📁 Project Structure
```
data-primals-engine/
├── src/
│   ├── engine.js
│   ├── modules/
│   ├── providers/
│   ├── constants.js
│   ├── defaultModels.js
├── config/
│   ├── models/
│   └── packs/
└── server.js
```

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
