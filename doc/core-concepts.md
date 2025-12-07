# Core Concepts: Data Modeling Fundamentals

The `data-primals-engine` is built around a flexible and powerful data modeling system that allows you to define and manage your application's data structures without complex migrations. This section introduces the fundamental concepts of data modeling within the engine.

## Dynamic and Schema-less Nature

At its core, `data-primals-engine` leverages **MongoDB**, a NoSQL database. This provides inherent flexibility, allowing for a schema-less approach. You can define and update your data models either through a user interface or by providing JSON definitions, and the system adapts dynamically without requiring traditional database migrations. This significantly accelerates development and iteration cycles.

## Models

A **Model** is the blueprint for a collection of data. It defines the structure and characteristics of the documents you store. For example, a `User` model would define what properties a user object has (e.g., `username`, `email`, `roles`).

Models are defined by a `name`, an optional `description`, an `icon`, and a list of `fields`. The engine comes with a set of default models for common entities like `user`, `product`, `workflow`, and more.

## Fields

**Fields** are the individual attributes that make up a model. Each field has a `name`, a `type`, and various optional properties that define its behavior and constraints.

Common field types include:
-   `string`: For text data.
-   `number`: For numerical data.
-   `boolean`: For true/false values.
-   `datetime`: For date and time values.
-   `relation`: To establish relationships between different models (e.g., a `product` model having a `category` field that relates to a `taxonomy` model).
-   `enum`: For fields with a predefined set of allowed values.
-   `file`: For handling file uploads (e.g., `profilePicture` in the `user` model).
-   `code`: For storing code snippets (e.g., `script` in an `endpoint` model).

Fields can also have properties like `required`, `unique`, `min`, `max`, `default` values, and `hint` for user guidance.

This dynamic and field-based approach to data modeling provides the flexibility needed for rapidly building complex data-driven applications.

**Next: Data Models**