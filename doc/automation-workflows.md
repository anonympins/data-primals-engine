# Automation with Workflows: Create Automated Processes

The `data-primals-engine` features a powerful **Workflow** system that enables you to define and automate complex business processes. Workflows are sequences of steps and actions that can be triggered by various events or on a schedule, allowing for sophisticated automation directly within your backend.

## Core Workflow Models

The workflow system is composed of several interconnected data models:

### 1. `workflow`

The `workflow` model is the top-level definition of an automated process. It outlines the overall flow and its starting point.

-   **`name`** (string, required): A unique, descriptive name for the workflow (e.g., "Order Validation", "Low Stock Notification").
-   **`description`** (richtext, optional): A detailed explanation of the workflow's purpose.
-   **`startStep`** (relation to `workflowStep`, optional): The first step to execute when the workflow is initiated.

### 2. `workflowTrigger`

A `workflowTrigger` defines an event or schedule that initiates a workflow.

-   **`workflow`** (relation to `workflow`, required): The workflow that this trigger belongs to.
-   **`name`** (string, required, unique): A descriptive name for the trigger (e.g., "New Order Created", "Stock < 5", "Monday 9 AM Report").
-   **`type`** (enum, required): How the workflow is initiated:
    -   `manual`: Triggered by a data event.
    -   `scheduled`: Triggered by a cron schedule.
-   **`onEvent`** (enum, for `manual` type): The data event that triggers the workflow: `DataAdded`, `DataEdited`, `DataDeleted`, `ModelAdded`, `ModelEdited`, `ModelDeleted`.
-   **`targetModel`** (string, for `manual` type): The name of the model targeted by the `onEvent`.
-   **`dataFilter`** (code - JSON, optional, for `manual` type): Optional MongoDB filter conditions checked against the `triggerData` before executing the workflow.
-   **`cronExpression`** (string, for `scheduled` type): A cron expression (e.g., `'0 9 * * 1'` for Monday 9 AM) to schedule the workflow.
-   **`isActive`** (boolean): Whether the trigger is currently active.
-   **`env`** (code - JSON, optional): Environment variables (JSON key/value pairs) specific to this trigger.

### 3. `workflowStep`

A `workflowStep` represents a single stage within a workflow process. It can contain conditions, actions, and define the next steps based on success or failure.

-   **`workflow`** (relation to `workflow`, required): The workflow this step belongs to.
-   **`name`** (string, optional): A descriptive name for the step (e.g., "Check Inventory", "Send Confirmation Email").
-   **`conditions`** (code - JSON, optional): Optional conditions (MongoDB filter syntax) that must be met before the step's actions are executed. These can reference `contextData`.
-   **`actions`** (multiple relation to `workflowAction`, required): The main operations performed by this step.
-   **`onSuccessStep`** (relation to `workflowStep`, optional): The next step to execute if this step's conditions are met and actions succeed.
-   **`onFailureStep`** (relation to `workflowStep`, optional): The next step if conditions fail or any action within this step fails.
-   **`isTerminal`** (boolean, default: `false`): Indicates if this step marks the end of a workflow path.

### 4. `workflowAction`

A `workflowAction` defines a specific operation to be performed by a `workflowStep`. This is where the actual work of the workflow happens.

-   **`name`** (string, required): Name of the action (e.g., "Update Order Status", "Send Email", "Call Payment API").
-   **`type`** (enum, required): The type of operation to perform:
    -   `UpdateData`: Modify existing data in a `targetModel`.
    -   `CreateData`: Add new data to a `targetModel`.
    -   `DeleteData`: Remove data from a `targetModel`.
    -   `ExecuteScript`: Run custom JavaScript code.
    -   `HttpRequest`: Make an HTTP request to an external service.
    -   `SendEmail`: Send an email.
    -   `Wait`: Pause the workflow for a specified duration.
    -   `GenerateAIContent`: Generate content using an AI model (e.g., OpenAI, Google Gemini).
    -   `ExecuteServiceFunction`: Call a function from a registered internal service (e.g., 'stripe').
-   **`targetModel`** (string, for data operations): The model to target.
-   **`targetSelector`** (code - JSON, for `UpdateData`/`DeleteData`): Expression to filter the target document(s).
-   **`fieldsToUpdate`** (code - JSON, for `UpdateData`): Key-value pairs of fields to update.
-   **`dataToCreate`** (code - JSON, for `CreateData`): Object template for the new document.
-   **`script`** (code - JavaScript, for `ExecuteScript`): The JavaScript code to execute.
-   **`url`, `method`, `headers`, `body`** (for `HttpRequest`): Details for the HTTP request.
-   **`emailRecipients`, `emailSubject`, `emailContent`** (for `SendEmail`): Email details.
-   **`duration`, `durationUnit`** (for `Wait`): How long to pause.
-   **`aiProvider`, `aiModel`, `prompt`** (for `GenerateAIContent`): AI model and prompt details.
-   **`serviceName`, `functionName`, `args`** (for `ExecuteServiceFunction`): Service call details.

## Workflow Execution (`workflowRun`)

Each time a workflow is triggered, a `workflowRun` document is created to track its execution.

-   **`workflow`** (relation to `workflow`): The workflow definition that was executed.
-   **`contextData`** (code - JSON): A snapshot of the data or event that triggered this run, and any data generated during execution.
-   **`status`** (enum): The current status (`pending`, `running`, `completed`, `failed`, `waiting`, `cancelled`).
-   **`history`** (array of objects): Detailed execution history of each step and action.
-   **`startedAt`, `completedAt`**: Timestamps for the run.
-   **`error`**: Error message if the workflow run failed.

## Example Workflow Scenario

Consider a workflow to "Send a Welcome Email to New Users":

1.  **`workflow`**: "New User Onboarding"
2.  **`workflowTrigger`**:
    -   `name`: "On New User Added"
    -   `type`: `manual`
    -   `onEvent`: `DataAdded`
    -   `targetModel`: `user`
3.  **`workflowStep`**: "Send Welcome Email"
    -   `workflow`: "New User Onboarding"
    -   `actions`: [ID of "Send Welcome Email Action"]
    -   `onSuccessStep`: (optional) "Create Onboarding Task"
4.  **`workflowAction`**: "Send Welcome Email Action"
    -   `type`: `SendEmail`
    -   `emailRecipients`: `{triggerData.contact.email}`
    -   `emailSubject`: "Welcome to Our Platform, {triggerData.contact.firstName}!"
    -   `emailContent`: "Hello {triggerData.contact.firstName}, welcome aboard..."

This powerful system allows you to automate virtually any process, from simple notifications to complex data transformations and integrations with external services.