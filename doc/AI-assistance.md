# AI Assistance: Leverage Artificial Intelligence

`data-primals-engine` includes a powerful, built-in AI assistant named **Prior**. This assistant is designed to understand natural language queries, allowing you to interact with your data, generate insights, and perform actions without writing complex code or API requests.

## Enabling the AI Assistant

To use the AI assistant, you must first provide API keys for one or more supported AI providers. The engine natively supports providers like **OpenAI, Google (Gemini), DeepSeek, and Anthropic**.

You can configure your keys in two ways:

1.  **Environment Variables**: Set the appropriate variable in your `.env` file. This is the recommended approach for production.
    ```env
    # Choose one or more providers
    OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
    GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxx
    DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
    ```

2.  **`env` Model**: For user-specific keys, you can store them in the `env` model within the application. The assistant will automatically look for a key belonging to the current user.

Once a key is configured, the AI assistant chat interface becomes available in the UI.

## Core Capabilities

The assistant, "Prior," can perform a wide range of actions based on your natural language commands.

### 1. Data Querying and Visualization

You can ask the assistant to find, filter, and display your data. It can present the results in various formats.

-   **Simple Search**:
    > "Show me the latest 5 orders from French customers."

-   **Chart Generation**: Create charts on the fly.
    > "Create a bar chart of user sign-ups per month for the last year."

-   **Custom HTML Views**: Generate sophisticated, styled views of your data using Handlebars templates.
    > "Build a dashboard of my active projects with their status and due dates, using a modern dark theme."

### 2. Data Modification (with Confirmation)

The assistant can create, update, or delete data, but it will **always ask for your confirmation** before executing a modifying action. This provides a critical safety layer.

-   **Create Data**:
    > "Create a new task to 'Follow up with Client X' due tomorrow."

-   **Update Data**:
    > "Update the status of all tickets in the 'Support' category to 'resolved'."

-   **Delete Data**:
    > "Delete all draft products created before last month."

When you issue such a command, the assistant will respond with a summary of the action it intends to perform and a "Confirm" button. The action is only executed after you click it.

### 3. Answering Questions

The assistant can answer questions about the data it has access to.

> "What was our total revenue in the last quarter?"

## How It Works: The Reasoning Loop

When you send a message, the assistant follows a strict reasoning process:

1.  **Analyze Intent**: It first analyzes your request to understand what you want to do.
2.  **Search Models (Internal Step)**: Its first action is always to call the `search_models` tool internally. This gives it the exact structure, field names, and types for the relevant data models. This step is crucial for preventing errors and "hallucinations."
3.  **Formulate Action**: Based on your intent and the model structures it found, it formulates a final action, such as `search`, `generateChart`, or a `post` request.
4.  **Execute or Confirm**:
    -   If it's a read-only action (like `search` or `generateChart`), it executes it and displays the result.
    -   If it's a write action (like `post` or `delete`), it presents the action to you for confirmation.

## AI in Workflows: The `GenerateAIContent` Action

Beyond the chat interface, you can leverage AI directly within your automation **Workflows**. The `GenerateAIContent` action allows you to call an AI model as a step in a workflow.

This is perfect for tasks like:
-   Summarizing a new support ticket.
-   Generating a product description when a new product is added.
-   Classifying incoming data based on its content.
-   Translating text.

**Example `workflowAction`:**
```json
{
    "name": "Summarize Ticket",
    "type": "GenerateAIContent",
    "aiProvider": "OpenAI",
    "aiModel": "gpt-4-turbo",
    "prompt": "Summarize the following support ticket in one sentence: {triggerData.description}"
}
```

This integration of AI both as an interactive assistant and as an automation component makes `data-primals-engine` a powerful platform for building intelligent applications.