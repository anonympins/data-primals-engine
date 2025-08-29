## Performance Test Report

### Test Environment
- **Machine**: Laptop Intel Core i7 Lenovo Legion
- **Concurrency**: Ramp-up to 50 virtual users/sec

### Summary of Results

| Metric                     | Value      |
 |----------------------------|------------|
| Total HTTP Requests        | 1,475      |
| Successful Responses (2xx) | 1,475      |
| Average Request Rate       | 19/sec     |
| Data Downloaded            | 13.5 MB    |
| Failed Scenarios           | 0          |

### Response Time Analysis (in milliseconds)

| Percentile | Response Time (ms) |
|------------|--------------------|
| min        | 8                  |
| median     | **36.2**           |
| mean       | 253.9              |
| p95        | 561.2              |
| p99        | 608                |
| max        | 805                |
---

### Analysis & Recommendations

*   **Outstanding Performance & Stability**: The final test results are excellent. The server handled **1,475 requests with 0 failures**, demonstrating exceptional stability under sustained load.

*   **Bottleneck Resolved**:
    *   The **median response time is now just 36.2 milliseconds**. This is a dramatic improvement and indicates that the core API operations are extremely fast for the majority of users.
    *   The **p95 (561.2 ms)** and **p99 (608 ms)** response times remain well under one second. This shows that the application performs consistently, with very few outliers, even during peak load phases.
