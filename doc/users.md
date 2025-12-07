# Users: Manage Access to the Platform

The `data-primals-engine` includes a robust user management system, allowing you to control access to your data and functionalities. The core of this system is the `user` model, which stores all necessary information about platform users.

## The `user` Model

The `user` model is a fundamental, system-locked model that defines the attributes of each user account.

### Key Fields of the `user` Model:

-   **`username`** (string, required, unique): The unique identifier for the user, used for login.
-   **`password`** (password): The user's hashed password.
-   **`gender`** (enum): Optional field for gender, with options like `male`, `female`, `other`, `prefer_not_to_say`.
-   **`contact`** (relation to `contact` model): Links to a `contact` document, which can store detailed personal information like `firstName`, `lastName`, `email`, and `phone`.
-   **`roles`** (multiple relation to `role` model): Assigns one or more roles to the user, determining their permissions within the system.
-   **`lang`** (relation to `lang` model): Specifies the preferred language for the user interface and content.
-   **`profilePicture`** (file): Allows users to upload a profile image (supports JPEG and PNG).
-   **`tokens`** (multiple relation to `token` model): Stores authentication tokens associated with the user.

### User Authentication

The engine provides mechanisms for user authentication, typically involving username/password credentials to issue JWT (JSON Web Tokens). These tokens are then used to secure API requests, ensuring that only authorized users can access or modify data.

### User-Specific Data

Each document created within the `data-primals-engine` is associated with a user via the `_user` field. This ensures data isolation and allows for granular access control, where users primarily interact with data they own or have been granted access to.

Effective user management is crucial for maintaining security and organizing access within your `data-primals-engine` application.

**Next: Roles and Permissions**