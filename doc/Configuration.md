# Environment Variables Configuration

`data-primals-engine` can be configured using environment variables, typically stored in a `.env` file at the root of your project. This file provides a comprehensive list of all available variables.
 
---

## 🚀 Core Application

| Variable | Description | Default |
 |:---|:---|:---|
| **`PORT`** | The port on which the HTTP server will listen. | `7633` |
| **`HOST`** | The hostname of the server. Used for generating absolute URLs. | `localhost` |
| **`JWT_SECRET`** | **(Required)** A long, random, and secret string used to sign JSON Web Tokens (JWT). This is critical for security. | - |
| **`COOKIES_SECRET`** | A secret string used to sign session cookies. If not set, a default value is used, but it's recommended to set your own. | (internal default) |
| **`NODE_ENV`** | The application environment. Set to `production` for production deployments to optimize performance and security. | `development` |
 
---

## 🗃️ Database (MongoDB)

| Variable | Description | Default |
 |:---|:---|:---|
| **`MONGO_DB_URL`** | **(Required)** The full connection string for your MongoDB instance. | `mongodb://127.0.0.1:27017/my_database` |
| **`TLS`** | Set to `true` to enable a TLS/SSL connection to MongoDB. | `false` |
| **`CA_CERT`** | Path to the CA certificate file for TLS connections. | - |
| **`CERT`** | Path to the client certificate file for mTLS connections. | - |
| **`CERT_KEY`** | Path to the client certificate key file for mTLS connections. | - |
 
---

## 🧠 AI Providers (LangChain)

Provide an API key for at least one of the following providers to enable AI features.

| Variable | Description |
 |:---|:---|
| **`OPENAI_API_KEY`** | Your API key for OpenAI (GPT models). |
| **`GOOGLE_API_KEY`** | Your API key for Google AI (Gemini models). |
| **`ANTHROPIC_API_KEY`** | Your API key for Anthropic (Claude models). |
| **`DEEPSEEK_API_KEY`** | Your API key for DeepSeek. |
 
---

## ☁️ File Storage (AWS S3)

These variables configure the engine to use an AWS S3 bucket for file storage instead of the local filesystem.

| Variable | Description | Default |
 |:---|:---|:---|
| **`AWS_ACCESS_KEY_ID`** | Your AWS access key ID. | - |
| **`AWS_SECRET_ACCESS_KEY`** | Your AWS secret access key. | - |
| **`AWS_REGION`** | The AWS region where your bucket is located (e.g., `eu-west-3`). | `eu-north-1` |
| **`AWS_BUCKET_NAME`** | The name of your S3 bucket. | `bucket-primals` |
 
---

## ✉️ Email (SMTP)

Configuration for sending emails (e.g., for notifications, password resets).

| Variable | Description | Default |
 |:---|:---|:---|
| **`SMTP_HOST`** | The hostname of your SMTP server. | `smtp.mydomain.tld` |
| **`SMTP_PORT`** | The port of your SMTP server. | `587` |
| **`SMTP_USER`** | The username for SMTP authentication. | `user` |
| **`SMTP_PASS`** | The password for SMTP authentication. | `password` |
| **`SMTP_FROM`** | The "From" address for outgoing emails (e.g., `"My App" <noreply@myapp.com>`). | `Support - data@primals.net <data@primals.net>` |
 
---

## 🌐 Clustering & Replication

These variables are used to configure a multi-node cluster for high availability and scalability.

| Variable | Description | Default |
 |:---|:---|:---|
| **`PEERS_ENDPOINT`** | The URL of a JSON endpoint that lists all peer nodes in the cluster. | - |
| **`PEER_DOMAIN`** | The public domain of the current node instance (e.g., `node1.myapp.com`). Used for self-identification within the cluster. | - |
| **`INTERNAL_CLUSTER_TOKEN`** | A shared secret token used for secure communication between nodes for internal operations like replication. | - |
 
---

## 🔐 Single Sign-On (SSO)

| Variable | Description |
 |:---|:---|
| **`GOOGLE_CLIENT_ID`** | Your Google OAuth 2.0 Client ID. |
| **`GOOGLE_CLIENT_SECRET`** | Your Google OAuth 2.0 Client Secret. |
| **`MICROSOFT_CLIENT_ID`** | Your Microsoft Entra (Azure AD) Application (client) ID. |
| **`MICROSOFT_CLIENT_SECRET`** | Your Microsoft Entra (Azure AD) client secret. |
| **`MICROSOFT_TENANT_ID`** | Your Microsoft Entra (Azure AD) Directory (tenant) ID. |
| **`SAML_ENTRY_POINT`** | The SSO URL of your SAML Identity Provider. |
| **`SAML_ISSUER`** | The issuer identifier for your application (Service Provider). |
| **`SAML_CERT`** | The public certificate of your SAML Identity Provider. |
| **`SAML_DECRYPTION_KEY`** | The private key to decrypt SAML assertions. |