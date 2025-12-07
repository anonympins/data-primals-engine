# Custom API Endpoints: Create Dynamic HTTP Routes

The `data-primals-engine` allows you to extend its API by defining **Custom API Endpoints**. These endpoints are dynamic HTTP routes that execute server-side JavaScript code directly from the backend, providing immense flexibility for custom logic and integrations.

## The `endpoint` Model

Custom API Endpoints are managed through the built-in `endpoint` data model. Each document in this model represents a unique API route.

### Key Fields of the `endpoint` Model:

-   **`name`** (string, required): A human-readable name for the endpoint.
-   **`path`** (string, required, unique): The URL path segment that comes after `/api/actions/`. For example, if `path` is `send-welcome-email`, the full endpoint URL would be `/api/actions/send-welcome-email`.
-   **`method`** (enum, required): The HTTP method (GET, POST, PUT, PATCH, DELETE) that this endpoint responds to.
-   **`code`** (code, required): The JavaScript script that will be executed when this endpoint is called. This script has access to various utilities and the request context.
-   **`isActive`** (boolean, default: `true`): If checked, the endpoint is active and can be called.
-   **`isPublic`** (boolean, default: `false`): If checked, this endpoint will be accessible without authentication. Use with caution.

### Script Execution Environment

The JavaScript `code` field provides a powerful environment for your custom logic:

-   **`db`**: An object providing methods for interacting with the database (e.g., `db.find`, `db.create`, `db.update`, `db.delete`).
-   **`logger`**: A logging utility (e.g., `logger.info`, `logger.error`).
-   **`env`**: Access to environment variables defined in the `env` model.
-   **`request`**: The incoming HTTP request object, containing `body`, `query`, `params`, and `headers`.
-   **`user`**: The authenticated user object (if `isPublic` is false).

The script's return value will be sent as the JSON response to the client.

### Example `endpoint` Definition (from `defaultModels.js`):

```javascript
// The default code for a new endpoint
logger.info('Custom endpoint executed with body:', request.body);
return { success: true, message: 'Endpoint executed!', received: request.body };
```

This feature allows developers to build highly customized backend logic directly within the `data-primals-engine`, making it a versatile tool for various application needs.

**Next: Data Models**