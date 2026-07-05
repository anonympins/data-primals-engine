# Custom API Endpoints

While `data-primals-engine` provides a full REST API for CRUD operations on your models, you may sometimes need to create API endpoints with specific business logic.

Custom API endpoints allow you to extend the engine's native API in a secure and controlled manner.

---

## Why Create a Custom API Endpoint?

- To execute complex logic that goes beyond simple CRUD operations (e.g., `POST /api/orders/{id}/processPayment`).

- To aggregate data from multiple models into a single response.

- To integrate with external services.

## Creation and Configuration

Custom API endpoints can be created directly from the administration interface. During creation, you configure the following:

- **HTTP Route**: The URL path (e.g., `/my-custom-action`).

- **HTTP Method**: `GET`, `POST`, `PUT`, `DELETE`, etc.

- **Permissions**: Which role is authorized to call this API point.

- **Execution Code**: You write your logic in **JavaScript (Node.js)** directly in a secure (sandbox) environment.

## Secure Execution Environment

The code you write for a custom API point runs in an isolated environment. You have controlled access to engine features (such as `searchData`, `insertData`) and certain Node.js libraries, which ensures that your custom code cannot compromise the security or stability of the main application.