## Why

TicketBox has no monitoring today: `api`'s actuator only exposes `health,info`, and there is no Prometheus/Grafana anywhere in the stack. `infra/README.md` already reserves space for "future observability" but nothing fills it. Without dashboards, diagnosing cluster or app behavior during local development means reading pod logs by hand — there is no at-a-glance view of pod health, resource usage, or api request behavior.

## What Changes

- Add a hand-rolled `charts/monitoring` Helm chart deploying Prometheus, Grafana, and kube-state-metrics into a new `monitoring` namespace, matching the project's existing per-concern namespace pattern (`ticketbox`, `mailpit`, `argocd`).
- Prometheus scrapes via a static target list (Service DNS names) — no `ServiceMonitor`/`PodMonitor` CRDs, no `kubernetes_sd_configs` discovery. Targets: `api` (new `/actuator/prometheus` endpoint), `kube-state-metrics`, and the kubelet's built-in cAdvisor endpoint for node/container resource metrics (no `node-exporter` DaemonSet needed on a single-node cluster).
- Grafana's Prometheus datasource and starter dashboards are provisioned via ConfigMap (versioned YAML/JSON in the chart), not manual UI configuration.
- Add `micrometer-registry-prometheus` to `api/build.gradle` and expose `prometheus` alongside the existing `health,info` actuator endpoints in `application.yml`. This is auto-instrumentation only (HTTP request latency/count/status, JVM memory/GC, Tomcat thread pool, HikariCP connection pool) — no custom `@Timed`/gauge annotations or business-metric instrumentation.
- Add an ArgoCD `Application` manifest (`k8s/argocd/monitoring.yaml`) for the new chart, following the same manual-sync pattern as `ticketbox-app.yaml` and `mailpit`'s ArgoCD wiring.

**Out of scope for this change** (explicitly deferred, not silently dropped):
- `ticketbox-web` gets no Prometheus endpoint — no `prom-client` added, no Node.js metrics. Web is only visible indirectly via kube-state-metrics' pod-level view (restarts, resource usage).
- No alerting (Alertmanager, Discord/email/webhook notifications). Dashboards only.
- No custom app-level business metrics (queue depth, circuit-breaker state, purchase-flow latency).
- No `node-exporter` DaemonSet.
- Not designed to survive past a local dev session — this is ephemeral, tied to minikube being up, same as the rest of the stack.

## Capabilities

### New Capabilities
- `monitoring`: Prometheus scraping cluster and api metrics, Grafana dashboards provisioned via ConfigMap, deployed as a hand-rolled Helm chart into a dedicated `monitoring` namespace.

### Modified Capabilities
(none — `api`'s actuator gaining a new endpoint is additive implementation detail, not a change to any existing spec's behavior)

## Impact

- **New**: `charts/monitoring/` (Chart.yaml, templates for Prometheus Deployment/ConfigMap/Service, Grafana Deployment/ConfigMap/Service, kube-state-metrics Deployment + ClusterRole/ClusterRoleBinding), `k8s/argocd/monitoring.yaml`.
- **Changed**: `api/build.gradle` (new dependency), `api/src/main/resources/application.yml` (`management.endpoints.web.exposure.include` gains `prometheus`).
- **Cluster**: new `monitoring` namespace; `kube-state-metrics` requires a `ClusterRole` (cluster-scoped read access to pod/deployment/replicaset state across namespaces) — unavoidable even with static Prometheus scrape targets, since this is inherent to what kube-state-metrics does, not a discovery-mechanism choice.
- **No changes** to `ticketbox`, `mailpit`, or `argocd` namespace workloads themselves — api's new endpoint is additive and does not change existing readiness/liveness probe behavior (`/actuator/health` stays as-is).
