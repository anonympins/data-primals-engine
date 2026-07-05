# Event System: Extending Core Functionality

The `data-primals-engine` is built on a powerful event-driven architecture. The `Event` system allows you to hook into core operations, enabling you to extend and customize the engine's behavior without modifying its source code. This is the primary mechanism for creating custom modules and advanced middleware.

## Listening to Events

You can register a callback function that will be executed whenever a specific event is triggered. This is done using the `Event.Listen()` method.

### Syntax

```javascript
Event.Listen(eventName, callback, scope, type);
```

-   **`eventName`** (string): The name of the event to listen to (e.g., `"OnDataAdded"`).
-   **`callback`** (function): The function to execute when the event fires. The arguments it receives depend on the event.
-   **`scope`** (string): Must be `"event"`.
-   **`type`** (string): Determines the callback signature.
    -   `"user"`: The callback receives arguments relevant to a user action (e.g., `(data)`).
    -   `"system"`: The callback receives the full `engine` instance as its first argument, followed by other arguments (e.g., `(engine, data)`).

### Example: Logging New Data

```javascript
import { Event } from 'data-primals-engine';

Event.Listen(
    "OnDataAdded",
    (engine, insertedDocs) => {
        const logger = engine.getComponent('Logger');
        logger.info(`New documents were added:`, insertedDocs);
    },
    "event",
    "system"
);
```

## Triggering Custom Events

You can also define and trigger your own custom events. This is useful for making your own modules extensible.

```javascript
import { Event } from 'data-primals-engine';

async function myCustomFunction(data) {
    // ... some logic ...

    // Trigger a custom event and pass data to listeners
    const results = await Event.Trigger("OnMyCustomEvent", "event", "user", data);

    // ... do something with results from listeners ...
}
```

When multiple listeners are registered for an event, their return values are merged:
-   **strings** are concatenated.
-   **numbers** are added.
-   **booleans** are logical AND-ed.
-   **arrays** are concatenated.
-   **objects** are merged (spread operator).

## Core Events Table

Here is a list of the most important events you can listen to:

| Event            | Description                                                             | Scope  | Triggered by             | Arguments (Payload)                                                  |
|:-----------------|:------------------------------------------------------------------------|:-------|:-------------------------|:---------------------------------------------------------------------|
| `OnServerStart`    | Triggered once the HTTP server is started and listening.                | System | `engine.start()`           | `engine`                                                               |
| `OnModelsLoaded`   | Triggered after the initial models are loaded at startup.               | System | `setupInitialModels()`     | `engine`, `dbModels`                                                     |
| `OnModelEdited`    | Triggered after a model definition has been modified.                   | System | `editModel()`              | `newModel`                                                             |
| `OnDataAdded`      | Triggered after new data has been inserted.                             | System | `insertData()`             | `engine`, `insertedDocs`                                                 |
| `OnDataEdited`     | Triggered after data has been edited.                                   | System | `editData()` / `patchData()` | `engine`, `{modelName, before, after}`                                   |
| `OnDataDeleted`    | Triggered just after data is actually deleted.                          | System | `deleteData()`             | `engine`, `{model, filter}`                                              |
| `OnDataSearched`   | Triggered after a data search.                                          | System | `searchData()`             | `engine`, `{data, count}`                                                |
| `OnDataInsert`     | Triggered just before data insertion. Allows modifying the data.        | System | internal                 | `data`                                                                 |
| `OnDataValidate`   | Triggered to override validation checks.                                | System | internal                 | `value`, `field`, `data`                                                   |
| `OnChatAction`     | Triggered when an AI assistant decides on an action.                    | User   | `handleChatRequest`        | `action`, `params`, `parsedResponse`, `command`, `llmOptions`, `user`, `reqParams` |
| `OnSystemPrompt`   | Triggered to override the AI assistant's system prompt.                 | User   | `handleChatRequest`        | `user`                                                                 |