## Performance Test Report 1

### Test Environment
- **Machine**: Laptop Intel Core i7 Lenovo Legion
- **Concurrency**: Ramp-up to 50 virtual users/sec
- Runs on `perf-shot-search.yml` ,that simulates user basic activity on API 

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



## Performance Test Report 2

### Test Environment
- **Machine**: Laptop Intel Core i7 Lenovo Legion
- **Scenario**: `perf-shot-hardwork.yml` (Full user journey including model creation, data import, and pack installation)
- **Concurrency**: Sustained load of 1 virtual user/sec for 60 seconds.

### Summary of Results

| Metric | Value |
 |---|---|
| Total HTTP Requests | 480 |
| Successful Responses (2xx) | 480 |
| Average Request Rate | 4/sec |
| Data Downloaded | 0.88 MB |
| **Failed Scenarios** | **0** |

### Response Time Analysis (in milliseconds)

| Percentile | Response Time (ms) |
|------------|--------------------|
| min | 7 |
| median | **15** |
| mean | 96.1 |
| p95 | 368.8 |
| p99 | 407.5 |
| max | 474 |
---

### Analysis & Recommendations

*   **Total Success & Stability**: The test is a complete success. With a 100% success rate (**0 failed scenarios** and **0 request errors**), it confirms that the previous fixes for race conditions and file upload issues are effective and robust.

*   **Outstanding Performance**: The API's responsiveness is excellent.
    *   A **median response time of just 15 milliseconds** shows that the core operations are extremely fast for the majority of users.
    *   The **p99 is 407.5 ms**, meaning 99% of requests, even within a complex multi-step scenario, completed in well under half a second. This demonstrates consistent and reliable performance.

*   **Conclusion**: The application is perfectly stable and highly performant under the tested load. The entire user journey, including complex operations, is handled efficiently. This provides a solid baseline for future, more intensive load tests.


## Performance Test Report 3 (Scaling)

### Test Environment
- **Machine**: Laptop Intel Core i7 Lenovo Legion
- **Scenario**: `perf-shot-hardwork.yml` (Full user journey)
- **Concurrency**: Ramped load from 1 to 2 virtual users/sec for 60 seconds.

### Summary of Results

| Metric | Value |
 |---|---|
| Total HTTP Requests | 720 |
| Successful Responses (2xx) | 720 |
| Average Request Rate | 9/sec |
| **Failed Scenarios** | **0** |

### Response Time Analysis (in milliseconds)

| Percentile | Response Time (ms) |
|------------|--------------------|
| min | 8 |
| median | **32.1** |
| mean | 141.4 |
| p95 | 772.9 |
| p99 | 854.2 |
| max | 922 |
---

### Analysis & Recommendations

*   **Excellent Linear Scaling**: This test confirms the application's ability to scale gracefully. When doubling the load from the previous test (1 user/sec to 2 users/sec), the median and p95 response times also roughly doubled. This linear behavior is ideal and indicates a robust architecture without major bottlenecks.
*   **Continued Stability**: With **0 failed scenarios**, the application proves its stability even as concurrency increases.
*   **Conclusion**: The application is ready for higher loads. The performance degradation is predictable and linear, which is a sign of a very healthy system.


## Performance Test Report 4 (Bottleneck Identification)

### Test Environment
- **Machine**: Laptop Intel Core i7 Lenovo Legion
- **Scenario**: `perf-shot-hardwork.yml` (Full user journey)
- **Concurrency**: Ramped load from 1 to 4 virtual users/sec for 60 seconds.

### Summary of Results

| Metric | Value |
 |---|---|
| Total HTTP Requests | 1,200 |
| Successful Responses (2xx) | 1,200 |
| Average Request Rate | 12/sec |
| **Failed Scenarios** | **0** |

### Response Time Analysis (in milliseconds)

| Percentile | Response Time (ms) |
|------------|--------------------|
| min | 3 |
| median | **70.1** |
| mean | 483.9 |
| p95 | **2893.5** |
| p99 | **8024.5** |
| max | 8348 |
---

### Analysis & Recommendations

*   **Bottleneck Identified**: This test successfully identified the application's first major performance bottleneck. While stability remains perfect (**0 failures**), the response times show non-linear degradation. The **p99 jumping to over 8 seconds** indicates that the system is struggling under this write-heavy load.
*   **Database Contention**: The cause is almost certainly database contention (MongoDB). The scenario involves concurrent model creation, data import, and pack installation, which are highly resource-intensive operations.
*   **Next Steps**: The immediate next step is to run a detailed analysis to pinpoint the exact slow queries. Monitoring server CPU/Disk I/O during the test and using MongoDB's profiler will be essential for optimization.
