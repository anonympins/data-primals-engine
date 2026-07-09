# Workflows and Automations

Workflows are one of the most powerful features of `data-primals-engine`. They allow you to automate complex business processes without writing code, by responding to data events or time-based schedules.

---

## Common Use Cases

- Send a welcome email when a new user signs up.

- Update inventory when an order is marked as "completed".

- Generate a PDF report every night at midnight.

- Call an external API when data is modified.

## Trigger Types

A workflow is always initiated by a trigger. There are two main types:

### 1. Data-Driven Triggers (Data Events)

These workflows are triggered automatically when an operation is performed on data:
- **After Create**: Triggers after a new record is created.

- **After Update**: Triggers after a record is modified.

- **Before Delete**: Triggers just before a record is deleted.

### 2. Scheduled Triggers (Schedules)

These workflows run at specific times, using **cron** syntax. This is ideal for recurring tasks such as reports, database cleanups, or synchronizations.