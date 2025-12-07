# Data Models: Structuring Your Information

Data Models are the fundamental building blocks in `data-primals-engine`, defining how your application's data is structured and stored. They are essentially blueprints for collections of documents, enabling you to organize and manage diverse types of information.

## What is a Data Model?

In `data-primals-engine`, a data model is a flexible definition of a data entity. Unlike traditional relational databases, models here are schema-less (thanks to MongoDB), meaning you can evolve their structure over time without rigid migration processes. Each model corresponds to a collection in your MongoDB database.

## Defining a Model

Models can be defined either through the platform's user interface or by providing a JSON schema. Key attributes of a model include:

-   **`name`** (string, unique): The technical name of the model (e.g., `product`, `user`, `order`). This is used for API interactions and internal references.
-   **`description`** (string): A brief explanation of the model's purpose.
-   **`icon`** (string): An icon (e.g., a Font Awesome class) to visually represent the model in the UI.
-   **`tags`** (array of strings): Keywords for categorization and filtering.
-   **`locked`** (boolean): Indicates if the model is a system model and cannot be modified or deleted via the standard UI (e.g., `user`, `permission`).
-   **`fields`** (array of objects): The core of the model, defining its attributes.

## Fields: The Attributes of a Model

Each field within a model defines a specific piece of data. Fields have various properties to control their type, behavior, and validation:

-   **`name`** (string, unique within model): The name of the attribute (e.g., `title`, `price`, `email`).
-   **`type`** (string, required): The data type of the field. Common types include:
    -   `string`, `string_t` (translatable string)
    -   `number`
    -   `boolean`
    -   `datetime`, `date`
    -   `email`, `url`, `phone`, `password`
    -   `richtext`, `richtext_t` (translatable rich text)
    -   `enum` (predefined list of values)
    -   `file` (for file uploads)
    -   `relation` (to link to another model)
    -   `array` (for lists of values or sub-documents)
    -   `code` (for storing code snippets, e.g., JSON, JavaScript)
-   **`required`** (boolean): If `true`, the field must have a value.
-   **`unique`** (boolean): If `true`, the field's value must be unique across all documents in the collection.
-   **`default`**: A default value for the field.
-   **`min`, `max`**: Minimum and maximum values for `number` fields, or length for `string` fields.
-   **`relation`** (string, for `relation` type): The name of the model this field relates to.
-   **`multiple`** (boolean, for `relation` type): If `true`, the field can relate to multiple documents in the target model.
-   **`hint`** (string): A helpful description displayed in the UI.

## Example: The `product` Model

The `product` model, defined in `defaultModels.js`, illustrates how fields are used to structure information about a product:

```javascript
product: {
    name: 'product',
    "icon": "FaShoppingBag",
    "description": "",
    "tags": ["ecommerce", "products"],
    fields: [
        { name: 'name', type: 'string_t', required: true },
        { name: 'image', type: 'array', itemsType: 'file', mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] },
        { name: 'description', type: 'richtext_t' },
        { name: 'price', type: 'number', required: true },
        { name: 'currency', type: 'relation', relation: 'currency', required: true },
        { name: 'billingFrequency', type: 'enum', items: ['none', 'monthly', 'yearly'] },
        { name: 'slug', type: 'string', required: true, unique: true },
        { name: 'brand', type: 'relation', relation: 'brand' },
        { name: 'category', type: 'relation', relation: 'taxonomy' },
        { name: 'seoTitle', type: 'string_t' },
        { name: 'seoDescription', type: 'string_t' }
    ]
},
```

This example shows how a `product` can have a translatable `name`, multiple `image` files, a `price` with a `currency` relation, and be linked to a `brand` and `category` (taxonomy).

By defining models and their fields, you create a robust and adaptable data foundation for your `data-primals-engine` application.

**Next: Data Management**