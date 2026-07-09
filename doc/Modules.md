# Modules: Packaging and Extending Features

The `data-primals-engine` is designed to be modular, allowing you to enable, disable, or create new features in a clean and organized way. A **Module** is a self-contained unit of functionality that plugs into the core engine at startup.

This approach keeps the core lightweight while allowing for powerful extensions like SSO authentication, payment gateway integrations, or custom API functionalities.

## How Modules Work

1.  **Discovery**: The engine looks for modules in the `src/modules/` directory.
2.  **Activation**: You specify which modules to activate using the `Config` object.
3.  **Initialization**: For each active module, the engine calls its exported `onInit(engine)` function, passing the main engine instance. This is the module's entry point to interact with the system.

## Enabling an Existing Module

The engine comes with several built-in modules, such as authentication providers. To enable one, you add its name to the `modules` array in your configuration **before** initializing the engine.

**Example: Enabling Google SSO and the Assistant**

```javascript
import { Engine, Config } from 'data-primals-engine';

// Add modules to the list of modules to be loaded
Config.Set("modules", ["auth-google", "assistant"]);

const app = express();
const engine = await Engine.Create({ app });
```

You may also need to install peer dependencies (`npm install passport-google-oauth20`) and set environment variables (`GOOGLE_CLIENT_ID`, etc.) as required by the module.

## Creating a New Module

Creating a module is straightforward. It only requires a JavaScript file in the `src/modules/my-module/` directory that exports an `async` function named `onInit`.

### Step 1: Create the Module File

Create a new file, for example: `src/modules/greeter/greeter.js`

### Step 2: Write the `onInit` Function

In `greeter.js`, write your initialization logic. The `onInit` function gives you access to the entire engine.

```javascript
// src/modules/greeter/greeter.js

export async function onInit(engine) {
    // 1. Get components from the engine
    const logger = engine.getComponent('Logger');
    const Event = engine.getComponent('Event');

    // 2. Register a new API endpoint
    engine.get('/api/greet/:name', (req, res) => {
        const { name } = req.params;
        res.json({ message: `Hello, ${name}! Welcome to our custom module.` });
    });

    // 3. Listen to a core event
    Event.Listen('OnDataAdded', (engine, insertedDocs) => {
        if (insertedDocs?.[0]._model === 'user') {
            logger.info(`A new user has signed up: ${insertedDocs[0].username}`);
        }
    }, 'event', 'system');

    // 4. Log that the module has been loaded
    logger.info("Module 'greeter' loaded successfully.");
}
```

### Step 3: Enable Your New Module

In your main server file, enable your module via the `Config` object.

```javascript
Config.Set("modules", ["greeter"]); // Add your module's folder name

const engine = await Engine.Create({ app });
// When the server starts, you will see "Module 'greeter' loaded successfully." in your logs.
// You can now access http://localhost:7633/api/greet/World
```

Modules are the preferred way to build reusable and maintainable extensions for `data-primals-engine`.

**[Next: Sharding / Replication](sharding-replication)**