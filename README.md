# data-primals-engine
[![Node.js CI](https://github.com/anonympins/data-primals-engine/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/anonympins/data-primals-engine/actions/workflows/node.js.yml)
![](https://img.shields.io/npm/dw/data-primals-engine)
![](https://img.shields.io/github/v/release/anonympins/data-primals-engine)
![](https://img.shields.io/github/license/anonympins/data-primals-engine)

**data-primals-engine** is a powerful and flexible **Node.js** backend framework designed to accelerate the development of complex data-driven applications. Built on **Express.js** and **MongoDB**, it provides a solid foundation so you can focus on what makes your application unique.

---

<p align="center">
  <a href="https://data.primals.net/prez1.jpg" target="_blank"><img alt="Light" src="https://data.primals.net/prez1.jpg" width="35%"></a>
  <a href="https://data.primals.net/prez6.jpg" target="_blank"><img alt="Light" src="https://data.primals.net/prez6.jpg" width="35%"></a>
  <a href="https://data.primals.net/api-docs" target="_blank"><img alt="Dark" src="https://data.primals.net/prez5.jpg" width="25%"></a>
</p>

---

## 🚀 Key Features

- **Visual Data Modeling**: Define and update schemas via a UI or JSON, without migrations.
- **Automation Workflows**: Trigger complex actions based on data events (create, update) or schedules (cron).
- **Dynamic & Extensible API**: Create custom API endpoints directly from the UI in a secure environment.
- **Advanced Data Management**: Benefit from complex queries, aggregations, automatic change auditing, and a permission system (RBAC).
- **AI Integration**: Native support for OpenAI, DeepSeek, and Google Gemini models via LangChain.
- **Complete Ecosystem**: Includes file management (S3), internationalization (i18n), encrypted backups, and starter packs.

For a detailed exploration of each feature, check out the wiki pages:

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** ≥ 20
- **MongoDB** (local or remote)

### 2. Installation

```bash
git clone https://github.com/anonympins/data-primals-engine.git
cd data-primals-engine
npm install
```

### 3. Configuration

Create a `.env` file in the project root to configure the connection to your database :

```env
MONGO_DB_URL=mongodb://127.0.0.1:27017/my_database
JWT_SECRET=a_long_and_random_secret
```

To discover all available environment variables (AWS, SMTP, AI, etc.), consult the **configuration documentation**.

### 4. Launch

```bash
# Development mode with automatic reloading
npm run devserver

# Production mode
npm run server
```

By default, the application is available at `http://localhost:7633`.

---


## 🧭 Explore the Platform
Discover the core features to get started building and managing your data.
Link to the official documentation: https://data.primals.net/en/documentation/

- 🧠 [Core Concepts](./wiki/Concepts.md): Explore the fundamentals of data modeling
- 🔌 [Custom API Endpoints](./wiki/Custom-Endpoints.md): Create dynamic HTTP routes directly from the backend
- 🏗️ [Data Models](https://data.primals.net/en/documentation/create-models): Structure your information.
- 🗃️ [Data Management](https://data.primals.net/en/documentation/manage-data): Create, read, update, and delete your entries.
- 📊 [Views (Table, Kanban)](Views): Visualize your data in different ways. *(Page to be created)*
- 📈 [Dashboards, KPIs, and Charts](https://data.primals.net/en/documentation/dashboards): Track your key metrics.
- 👥 [Users](https://data.primals.net/en/documentation/users): Manage access to the platform.
- 🔐 [Roles and Permissions](https://data.primals.net/en/documentation/roles-permissions): Define who can see and do what.
- ⚙️ [Automation with Workflows](https://data.primals.net/en/documentation/automation-workflows): Create automated processes.
- 🎁 [Pack Gallery](Packs-gallery): Discover ready-to-use configurations. *(Page to be created)*
- 🤖 [AI Assistance](AI-assistance): Leverage artificial intelligence. *(Page to be created)*

## 🔌 Integrate with your tools
Connect the platform to your external applications and services via our API.

- 📡 [API Requests](https://data.primals.net/en/documentation/api): The basics for interacting with the REST API.
- 🚀 [Advanced Requests](https://data.primals.net/en/documentation/advanced-requests): Filters, sorts, projections, and more.
- 📦 [Bulk Operations](https://data.primals.net/en/documentation/bulk-operations): Perform operations on large volumes of data.

## 🧩 Extend Capabilities
Go further by developing your own features and business logic.

- ⚡ [Event System](Event-system): React to events in real time. *(Page to create)*
- 🧠 [Advanced Workflows](Advanced-workflows): Create complex logic with custom scripts. *(Page to create)*
- 📦 [Modules](Modules): Package and share your developments. *(Page to create)*
- ❤️ [Contribute to the project (CONTRIBUTING.md)](https://github.com/anonympins/data-primals-engine/blob/main/CONTRIBUTING.md): Join the developer community.

## 💻 For Developers
Essential tools for a seamless development experience.

- 📖 [Explore the API with Swagger](https://data.primals.net/api-docs/): Test API access points directly from your browser.
- 📮 [Postman Collection](https://data.primals.net/doc/API.postman_collection.json): Import our collection to start querying in just a few clicks.

## 🤝 Contribution

Contributions are welcome! Check out the open issues to get started.

---

## 📄 License
Distributed under the **MIT License**. See the `LICENSE` file.