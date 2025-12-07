# Roles and Permissions: Define Who Can See and Do What

The `data-primals-engine` implements a robust Role-Based Access Control (RBAC) system to manage user authorizations. This system relies on two core models: `role` and `permission`, allowing for granular control over what users can access and perform within the platform.

## Permissions

A **Permission** defines a specific action or access right within the system. Permissions can be very broad (e.g., "admin.full_access") or highly specific (e.g., "product.edit").

### Key Fields of the `permission` Model:

-   **`name`** (string, required): A unique identifier for the permission (e.g., `model.create`, `product.read`, `user.delete`).
-   **`description`** (richtext, optional): A detailed explanation of what the permission grants.
-   **`filter`** (code - JSON, optional): A JSON filter that restricts the scope of this permission. This is a powerful feature for implementing granular access control. For example, a `product.edit` permission could have a filter `{ "owner": "{_user}" }` to allow a user to only edit products they own. The target model is typically deduced from the permission name (e.g., `product.edit` implies the `product` model).

## Roles

A **Role** is a collection of permissions. Instead of assigning individual permissions to each user, you assign roles, which simplifies management. A user can have multiple roles.

### Key Fields of the `role` Model:

-   **`name`** (string, required, unique): The name of the role (e.g., `Administrator`, `Editor`, `Viewer`).
-   **`permissions`** (multiple relation to `permission` model): A list of `permission` documents associated with this role. Any user assigned this role will inherit all its permissions.

## How RBAC Works

1.  **Define Permissions**: Create specific `permission` documents for every action or resource you want to control. Use the `filter` field for fine-grained control.
2.  **Create Roles**: Group relevant permissions into `role` documents.
3.  **Assign Roles to Users**: Assign one or more `role` documents to each `user` document.

When a user attempts an action (e.g., accessing an API endpoint or modifying a data entry), the system checks if the user's assigned roles grant them the necessary permissions. If a permission has a `filter`, that filter is applied to the data access query, ensuring the user only interacts with allowed subsets of data.

### User Permissions (Exceptions)

The `userPermission` model allows for exceptions to the standard role-based permissions. This model can grant or revoke specific permissions for an individual user, either permanently or temporarily.

-   **`user`** (relation to `user` model): The user for whom the exception applies.
-   **`permission`** (relation to `permission` model): The specific permission being granted or revoked.
-   **`isGranted`** (boolean, required): `true` to grant the permission, `false` to explicitly revoke it.
-   **`expiresAt`** (datetime, optional): If set, the exception is temporary.

This comprehensive RBAC system ensures that your `data-primals-engine` application remains secure and that users only have access to the functionalities and data they are authorized to use.

**Next: Automation with Workflows**