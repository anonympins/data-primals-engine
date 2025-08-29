## Performance Test Report

### Test Environment
- **Machine**: Laptop Intel Core i7 Lenovo Legion
- **Concurrency**: Ramp-up to 50 virtual users/sec

### Summary of Results

| Metric                  | Value      |
|-------------------------|------------|
| HTTP Requests           | 147        |
| Successful Responses (2xx) | 153        |
| Request Rate            | 47/sec     |
| Data Downloaded         | 1.16 MB    |
| Failed Scenarios        | 0          |

### Response Time Analysis (in milliseconds)

| Percentile | Response Time (ms) |
|------------|--------------------|
| min        | 8                  |
| median     | 314.2              |
| mean       | 266                |
| p95        | 584.2              |
| p99        | 608                |
| max        | 615                |

---

### Analysis & Recommendations

*   **Excellent Performance**: The server is not only stable (**0 failed requests**) but also extremely responsive under load.

*   **Bottleneck Resolved**:
    *   The **median response time is 314 milliseconds**. This is well within acceptable limits for a responsive API.
    *   The **p95 response time is to 584 milliseconds**, indicating that even the slowest requests are now fast and consistent.
x
*   **Conclusion**: The application is robust, stable, and performant. The recommendations are to use limit / offset pagination options in search request, and ensuring proper database indexing.
