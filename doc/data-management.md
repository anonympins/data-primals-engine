# Data Management: Create, Read, Update, and Delete Entries

The `data-primals-engine` provides a powerful and flexible REST API for performing standard CRUD (Create, Read, Update, Delete) operations on all defined data models. These generic endpoints are the primary way to interact with your data programmatically.

## Authentication

All data management operations require authentication. You must provide a valid `_user` query parameter (your username) and a `Bearer` token in the `Authorization` header for most operations.

## API Endpoints Overview

The following endpoints are available for generic data management:

### 1. Create Data: `POST /api/data`

This endpoint allows you to create one or more new documents within a specified model. It's optimized for both single and bulk insertions.

-   **Method**: `POST`
-   **Summary**: Create one or more documents.
-   **Security**: `BearerAuth`
-   **Parameters**:
    -   `_user` (query, required): Your username for authentication.
    -   `model` (body, required): The name of the model in which to create the documents (e.g., 'user', 'product').
    -   `data` (body, required): The data to insert. Can be a single object or an array of objects for bulk creation.
-   **Example (Single Document)**:
    ```json
    {
      "model": "product",
      "data": {
        "name": "New Product",
        "price": 99.99,
        "currency": { "$find": { "code": "USD" } }
      }
    }
    ```
    > **💡 Best Practice**: For `relation` fields, use the `$find` operator instead of a hardcoded `_id`. This makes your code more readable and resilient to changes.

-   **Example (Bulk Creation)**:
    ```json
    {
      "model": "product",
      "data": [
        { "name": "Laptop", "price": 1200, "currency": { "$find": { "code": "USD" } } },
        { "name": "Mouse", "price": 25, "currency": { "$find": { "code": "USD" } } }
      ]
    }
    ```
-   **Responses**: `201` (Document(s) successfully created), `400` (Invalid data), `401` (Unauthorized).

### 2. Search Data: `POST /api/data/search`

This endpoint allows you to search and retrieve documents from a specified model. It supports powerful filtering, sorting, pagination, and relation population.

-   **Method**: `POST`
-   **Summary**: Search among data
-   **Security**: `BearerAuth`
-   **Parameters**:
    -   `_user` (query, required): Your username for authentication.
    -   `model` (body, required): The name of the data model (e.g., 'user', 'product').
    -   `filter` (body, optional): MongoDB filter JSON object for the search.
    -   `sort` (body, optional): Sort object (e.g., `{ "createdAt": -1 }`).
    -   `limit` (query, optional, default: 1000): Maximum number of documents to return.
    -   `offset` (query, optional, default: 0): Number of documents to skip (for pagination).
    -   `depth` (query, optional, default: 1): Population depth for 'relation' type fields.
-   **Example Request Body**:
    ```json
    {
      "model": "product",
      "filter": {
        "price": { "$gt": 50 },
        "category": { "$find": { "name": "Electronics" } }
      }
    }
    ```
-   **Responses**: `200` (Success with returned data), `401` (Unauthorized).

### 3. Update Data: `PUT /api/data/{id}` or `PUT /api/data` (Bulk)

You can update a single document by its ID or perform bulk updates using a filter.

-   **Method**: `PUT`
-   **Summary**: Update a document (by ID) or Bulk update documents
-   **Security**: `BearerAuth`
-   **Parameters**:
    -   `_user` (query, required): Your username for authentication.
    -   `id` (path, required for single update): The unique identifier (`_id`) of the document to update.
    -   `model` (body, required): The name of the data model.
    -   `data` (body, required): The data to edit. For bulk updates, this object will contain the fields to update.
    -   `filter` (body, optional, for bulk update): MongoDB filter JSON object to select documents for bulk update.
-   **Example Request Body (Single Update)**:
    ```json
    {
      "model": "product",
      "data": {
        "price": 120.00,
        "status": "published"
      }
    }
    ```
-   **Responses**: `200` (Document successfully updated), `400` (Invalid data), `401` (Unauthorized), `404` (Document not found).

### 4. Delete Data: `DELETE /api/data`

This endpoint allows you to permanently delete one or more documents.

-   **Method**: `DELETE`
-   **Summary**: Delete one or more document(s)
-   **Security**: `BearerAuth`
-   **Parameters**:
    -   `_user` (query, required): Your username for authentication.
    -   `model` (body, required): The name of the data model.
    -   `ids` (body, optional): An array of identifiers of the documents to delete.
    -   `filter` (body, optional): The MongoDB JSON filter to apply for bulk deletion.
-   **Example Request Body (Bulk Delete)**:
    ```json
    {
      "model": "product",
      "filter": {
        "stock": 0
      }
    }
    ```
-   **Responses**: `200` (Document successfully deleted), `401` (Unauthorized), `404` (Document not found).

These generic CRUD endpoints provide a consistent and powerful way to interact with all your data models within the `data-primals-engine`.

**[Next: Dashboards, KPI, and charts](dashboards-kpis-charts)**