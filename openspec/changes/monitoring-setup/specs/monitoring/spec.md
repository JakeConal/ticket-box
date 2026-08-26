## Purpose

Provides operators with at-a-glance visibility into cluster resource usage, pod health, and api request behavior during local development, without requiring manual log inspection to diagnose what is happening in the running stack.

## ADDED Requirements

### Requirement: Prometheus scrapes cluster and api metrics
Prometheus SHALL run in the cluster and continuously scrape metrics from the api service, from a cluster-state metrics source, and from node/container resource metrics, making all three available for querying.

#### Scenario: api metrics are scraped
- **WHEN** Prometheus performs a scrape cycle
- **THEN** the api service's exposed metrics (request counts, latencies, JVM/process stats) are present in Prometheus's queryable data

#### Scenario: Cluster state metrics are scraped
- **WHEN** Prometheus performs a scrape cycle
- **THEN** pod and deployment state (including restart counts and replica status) across the `ticketbox`, `mailpit`, and `monitoring` namespaces is present in Prometheus's queryable data

#### Scenario: Node and container resource metrics are scraped
- **WHEN** Prometheus performs a scrape cycle
- **THEN** node and per-container CPU and memory usage is present in Prometheus's queryable data

### Requirement: Grafana provides pre-configured dashboards
Grafana SHALL be deployed with its Prometheus data source and at least one dashboard already configured, so an operator sees usable panels immediately after the stack comes up, without manual setup through the UI.

#### Scenario: Grafana starts with a working data source
- **WHEN** Grafana starts for the first time
- **THEN** it can query Prometheus without any manual data source configuration

#### Scenario: Dashboards are available on first login
- **WHEN** an operator logs into Grafana after the stack starts
- **THEN** at least one dashboard showing cluster pod/resource health is already present and rendering data

### Requirement: Monitoring workloads are isolated in their own namespace
The monitoring stack SHALL run in a dedicated namespace separate from application workloads, so it can be deployed, upgraded, or removed independently of the `ticketbox` and `mailpit` application stacks.

#### Scenario: Monitoring namespace is independent
- **WHEN** the monitoring stack is deployed or removed
- **THEN** no workloads in the `ticketbox` or `mailpit` namespaces are affected or require a restart

### Requirement: Api exposes Prometheus-compatible metrics without changing existing health checks
The api service SHALL expose a Prometheus-scrapeable metrics endpoint in addition to its existing health and info endpoints, without changing the behavior of its existing readiness or liveness checks.

#### Scenario: Metrics endpoint is reachable
- **WHEN** a Prometheus-compatible client requests the api's metrics endpoint
- **THEN** it receives a valid Prometheus exposition-format response containing HTTP request and JVM metrics

#### Scenario: Existing health checks are unaffected
- **WHEN** the api's readiness or liveness probe is evaluated after this change
- **THEN** it behaves identically to its behavior before this change
