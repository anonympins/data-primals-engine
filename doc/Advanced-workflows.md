# Advanced Workflows: Custom Logic with Scripts

While the standard workflow actions in `data-primals-engine` cover many common use cases, the `ExecuteScript` action provides ultimate flexibility by allowing you to run custom server-side JavaScript code as part of any workflow. This enables complex data transformations, conditional logic, and dynamic interactions that go beyond pre-defined actions.

## The `ExecuteScript` Action

The `ExecuteScript` action type within a `workflowAction` document lets you write and execute a JavaScript snippet in a secure, sandboxed environment.

### Key Features:

-   **Full JavaScript Support**: Write modern JavaScript (async/await) to implement your logic.
-   **Access to Workflow Context**: Your script can read from and write to the `contextData` object, allowing you to pass data between workflow steps.
-   **Database Interaction**: Use a sandboxed `db` object to perform CRUD operations.
-   **Error Handling**: Throwing an error in your script will fail the current workflow step and can trigger the `onFailureStep`.

### Action Configuration

When creating a `workflowAction` of type `ExecuteScript`, the most important field is `script`:

-   **`script`** (code - JavaScript): The JavaScript code to be executed.

**Example `workflowAction` document:**
```json
{
    "name": "Calculate Order Discount",
    "type": "ExecuteScript",
    "script": "const orderTotal = contextData.triggerData.totalAmount;\nif (orderTotal > 100) {\n  contextData.discountAmount = orderTotal * 0.1;\n  contextData.needsManagerApproval = false;\n} else if (orderTotal > 500) {\n  contextData.discountAmount = orderTotal * 0.2;\n  contextData.needsManagerApproval = true;\n}\nreturn contextData;"
}
```

## The Execution Environment

Your script runs in an `async` function and has access to several globally-injected objects:

-   **`contextData`** (object): This is the heart of your workflow's state. It contains:
    -   `triggerData`: The data from the event that initiated the workflow (e.g., the newly created document in a `DataAdded` trigger).
    -   Any data added by previous steps.
    -   Your script can read from and write to `contextData`. The returned object from your script will become the new `contextData` for subsequent steps.

-   **`db`** (object): A secure API to interact with the database. All methods are `async` and must be `await`-ed. They automatically respect the permissions of the user who triggered the workflow.
    -   `await db.create(modelName, dataObject)`
    -   `await db.find(modelName, filter)`
    -   `await db.findOne(modelName, filter)`
    -   `await db.update(modelName, filter, updateObject)`
    -   `await db.delete(modelName, filter)`

-   **`logger`** (object): A safe logging utility to help with debugging.
    -   `logger.info(...)`
    -   `logger.warn(...)`
    -   `logger.error(...)`

-   **`env`** (object): Provides access to user-defined variables stored in the `env` model.
    -   `await env.get(variableName)`
    -   `await env.getAll()`

## Example: Conditional Logic and Data Creation

Imagine a workflow triggered when a `ticket` is created. If the ticket priority is "high", we want to create a new `task` for a manager.

1.  **Trigger**: `onEvent: DataAdded`, `targetModel: ticket`.
2.  **Step 1**: "Check Priority and Create Task"
    -   **Action**: `ExecuteScript`
    -   **Script**:
        ```javascript
        // Check if the priority is high
        if (contextData.triggerData.priority !== 'high') {
            logger.info('Ticket priority is not high, skipping task creation.');
            return contextData; // Exit script
        }

        // Find the manager's user ID (assuming a 'manager' role exists)
        const manager = await db.findOne('user', { role: { $find: { name: 'manager' } } });

        if (manager) {
            // Create a new task and assign it to the manager
            await db.create('task', {
                title: `High-priority ticket: ${contextData.triggerData.subject}`,
                assignedTo: manager._id,
                relatedTicket: contextData.triggerData._id,
                status: 'todo'
            });
            logger.info(`Task created for manager ${manager.username}.`);
        } else {
            logger.warn('No manager found to assign the task to.');
        }

        return contextData; // Always return the context
        ```

By leveraging the `ExecuteScript` action, you can build sophisticated, stateful, and dynamic workflows that precisely match your application's business rules.