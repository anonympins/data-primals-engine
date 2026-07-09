# Users: Manage Access to the Platform

The `data-primals-engine` includes a robust user management system, allowing you to control access to your data and functionalities. The core of this system is the `user` model, which stores all necessary information about platform users.

## The `user` Model

The `user` model is a fundamental, system-locked model that defines the attributes of each user account.

### The `user` Model Fields

| Attribute         | Type                               | Description                                                                                             |
|:------------------|:-----------------------------------|:--------------------------------------------------------------------------------------------------------|
| **`username`**      | string, required, unique           | The unique identifier for the user, used for login.                                                     |
| **`password`**      | password                           | The user's hashed password.                                                                             |
| **`gender`**        | enum                               | Optional field for gender, with options like `male`, `female`, `other`, `prefer_not_to_say`.            |
| **`contact`**       | relation to `contact` model        | Links to a `contact` document for detailed personal information (`firstName`, `lastName`, `email`, etc.). |
| **`roles`**         | multiple relation to `role` model  | Assigns one or more roles to the user, determining their permissions.                                   |
| **`lang`**          | relation to `lang` model           | Specifies the preferred language for the user interface and content.                                    |
| **`profilePicture`**| file                               | Allows users to upload a profile image (supports JPEG and PNG).                                         |
| **`tokens`**        | multiple relation to `token` model | Stores authentication tokens associated with the user.                                                  |

## User Providers: The Authentication Logic

The engine's authentication system is designed to be highly extensible through **User Providers**. A `UserProvider` is a component responsible for the core logic of user management: finding users and validating their credentials. This modular approach allows you to connect `data-primals-engine` to virtually any authentication source.

The engine comes with several built-in providers:
-   **`DefaultUserProvider`**: A simple, in-memory provider primarily for demonstration and testing purposes. It allows for quick setup without a database dependency.
-   **`MongoUserProvider`**: The standard production-ready provider. It uses the `user` collection in your MongoDB database to store user accounts and securely validates passwords using `bcrypt`.
-   **`SSOUserProvider`**: A specialized provider that works with the `Sso` component to handle authentication from external Identity Providers like Google, SAML, or Microsoft Azure AD.

### Extending with a Custom Provider

You can create your own `UserProvider` to integrate with other systems, such as LDAP, a different database, or a custom API. You simply need to create a class that extends the base `UserProvider` and implement its methods (`findUserByUsername`, `validatePassword`, etc.). You can then instruct the engine to use it at startup:

```javascript
// In your main server file
import { Engine } from 'data-primals-engine';
import { MyCustomLdapProvider } from './my-ldap-provider.js';

const engine = await Engine.Create({ app });
engine.setUserProvider(new MyCustomLdapProvider(engine));
```

### User Authentication

The engine provides mechanisms for user authentication, typically involving username/password credentials to issue **JWT (JSON Web Tokens)**. The `UserProvider` is responsible for validating these credentials. Once validated, the issued tokens are used to secure subsequent API requests, ensuring that only authorized users can access or modify data.

### User-Specific Data

Each document created within the `data-primals-engine` is associated with a user via the `_user` field. This ensures data isolation and allows for granular access control, where users primarily interact with data they own or have been granted access to.

Effective user management is crucial for maintaining security and organizing access within your `data-primals-engine` application.

**[Next: Roles and Permissions](roles-permissions)**