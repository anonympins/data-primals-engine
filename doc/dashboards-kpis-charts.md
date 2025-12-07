# Dashboards, KPIs, and Charts: Track Your Key Metrics

The `data-primals-engine` provides robust features for visualizing and tracking your application's performance and key metrics through customizable Dashboards and Key Performance Indicators (KPIs).

## Dashboards

A **Dashboard** serves as a personalized overview, allowing users to arrange and display various KPIs and charts relevant to their needs.

### Key Fields of the `dashboard` Model:

-   **`name`** (string, required): The customizable display name of the dashboard.
-   **`description`** (string, optional): Provides additional context for the dashboard.
-   **`layout`** (code - JSON, required): A JSON structure describing the organization of KPIs and charts. This defines how elements are arranged (e.g., in columns).
    -   **Example Layout**: `"{ \"type\": \"columns\", \"columns\": [ [\"kpi_id_1\"], [\"kpi_id_2\", \"kpi_id_3\"] ] }"`
-   **`settings`** (code - JSON, optional): JSON settings for the dashboard, such as a `defaultTimeRange` (e.g., 'last_7_days') or a `refreshInterval` in seconds.
-   **`isDefault`** (boolean, default: `false`): If `true`, this dashboard is displayed by default for the user.

## Key Performance Indicators (KPIs)

**KPIs** are quantifiable measures used to evaluate the success of an organization, employee, etc., in meeting objectives. In `data-primals-engine`, KPIs are highly configurable to extract meaningful insights from your data.

### Key Fields of the `kpi` Model:

-   **`name`** (string, required): The display name of the KPI (e.g., "Total Revenue", "Active Users").
-   **`description`** (string, optional): Additional information about the KPI.
-   **`targetModel`** (string, required): The name of the data model on which to calculate the KPI (e.g., `order`, `user`).
-   **`aggregationType`** (enum, required): The type of calculation to perform:
    -   `count`: Count the number of documents.
    -   `sum`: Sum a numeric field.
    -   `avg`: Calculate the average of a numeric field.
    -   `min`: Find the minimum value of a numeric field.
    -   `max`: Find the maximum value of a numeric field.
-   **`aggregationField`** (string, optional): The name of the numeric field to apply the aggregation to (e.g., `totalAmount`). Not required for `count` type.
-   **`matchFormula`** (code - JSON, optional): A MongoDB `$match` JSON filter to apply before aggregation (e.g., `{ "status": "delivered" }`). This allows you to filter the data used for the KPI calculation.
-   **`showTotal`** (boolean): Whether to display a grand total alongside the KPI.
-   **`showPercentTotal`** (boolean): Whether to display the KPI value as a percentage of a total.
-   **`totalMatchFormula`** (code - JSON, optional): A MongoDB `$match` JSON filter for calculating the total when `showPercentTotal` is enabled.
-   **`unit`** (string, optional): The unit to display with the KPI value (e.g., "€", "$", "users").
-   **`icon`** (string, optional): An icon name (e.g., `FaUsers`, `FaShoppingCart`) to visually represent the KPI.
-   **`order`** (number, optional): The display order of the KPI on a dashboard.
-   **`color`** (string, optional): A color associated with the KPI for visual distinction.

## Charts

While the `kpi` model focuses on single aggregated values, the engine also supports the integration of charts to visualize data trends and distributions over time or across categories. These are typically rendered based on underlying KPI data or direct queries, offering a richer analytical experience.

By combining Dashboards, configurable KPIs, and charting capabilities, `data-primals-engine` empowers users to effectively monitor and understand their key business metrics.

**Next: Users**