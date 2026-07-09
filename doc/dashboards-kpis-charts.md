# Dashboards, KPIs, and Charts: Track Your Key Metrics

The `data-primals-engine` provides robust features for visualizing and tracking your application's performance and key metrics through customizable Dashboards and Key Performance Indicators (KPIs).

## Dashboards

A **Dashboard** serves as a personalized overview, allowing users to arrange and display various KPIs and charts relevant to their needs.

### The `dashboard` Model

| Attribute         | Type                      | Description                                                                                                                                      |
|:------------------|:--------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------|
| **`name`**          | string, required          | The customizable display name of the dashboard.                                                                                                  |
| **`description`**   | string, optional          | Provides additional context for the dashboard.                                                                                                   |
| **`layout`**        | code (JSON), required     | A JSON structure describing the organization of KPIs and charts. Defines how elements are arranged (e.g., in columns).<br/>*Example: `"{ \"type\": \"columns\", \"columns\": [ [\"kpi_id_1\"], [\"kpi_id_2\"] ] }"`* |
| **`settings`**      | code (JSON), optional     | JSON settings for the dashboard, such as a `defaultTimeRange` (e.g., 'last_7_days') or a `refreshInterval` in seconds.                           |
| **`isDefault`**     | boolean, optional         | If `true`, this dashboard is displayed by default for the user.                                                                                  |

## Key Performance Indicators (KPIs)

**KPIs** are quantifiable measures used to evaluate the success of an organization, employee, etc., in meeting objectives. In `data-primals-engine`, KPIs are highly configurable to extract meaningful insights from your data.

### The `kpi` Model

| Attribute              | Type                      | Description                                                                                                                                      |
|:-----------------------|:--------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------|
| **`name`**               | string, required          | The display name of the KPI (e.g., "Total Revenue", "Active Users").                                                                             |
| **`description`**        | string, optional          | Additional information about the KPI.                                                                                                            |
| **`targetModel`**        | string, required          | The name of the data model on which to calculate the KPI (e.g., `order`, `user`).                                                                |
| **`aggregationType`**    | enum, required            | The type of calculation to perform: `count`, `sum`, `avg`, `min`, or `max`.                                                                      |
| **`aggregationField`**   | string, optional          | The name of the numeric field to aggregate (e.g., `totalAmount`). Not required for `count`.                                                      |
| **`matchFormula`**       | code (JSON), optional     | A MongoDB `$match` filter to apply before aggregation (e.g., `{ "status": "delivered" }`).                                                       |
| **`showTotal`**          | boolean, optional         | If `true`, displays a grand total alongside the KPI.                                                                                             |
| **`showPercentTotal`**   | boolean, optional         | If `true`, displays the KPI value as a percentage of a total.                                                                                    |
| **`totalMatchFormula`**  | code (JSON), optional     | A MongoDB `$match` filter for calculating the total when `showPercentTotal` is enabled.                                                          |
| **`unit`**               | string, optional          | The unit to display with the KPI value (e.g., "€", "$", "users").                                                                                |
| **`icon`**               | string, optional          | An icon name (e.g., `FaUsers`, `FaShoppingCart`) to visually represent the KPI.                                                                  |
| **`order`**              | number, optional          | The display order of the KPI on a dashboard.                                                                                                     |
| **`color`**              | string, optional          | A color associated with the KPI for visual distinction.                                                                                          |

## Charts

While the `kpi` model focuses on single aggregated values, the engine also supports the integration of charts to visualize data trends and distributions over time or across categories. These are typically rendered based on underlying KPI data or direct queries, offering a richer analytical experience.

By combining Dashboards, configurable KPIs, and charting capabilities, `data-primals-engine` empowers users to effectively monitor and understand their key business metrics.

**[Next: Users](users)**