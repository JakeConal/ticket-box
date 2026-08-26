## Context

See proposal.md - Why. Relevant constraints from the existing codebase:

- Every existing chart (`charts/ticketbox-app`, `charts/mailpit`) is hand-authored, no vendored charts are used anywhere in this repo. `ci/jenkins`/`sonarqube` infra (now retired) was the one exception, using values-file overrides on a vendored chart.
- `api`'s actuator today exposes only `health,info` (`api/src/main/resources/application.yml`); `/actuator/health` is already load-bearing for k8s readiness/liveness probes (see `charts/ticketbox-app/templates/api-deployment.yaml`).
- The cluster is a single-node minikube instance that stops when the host is idle - this is a local dev tool, not a long-lived environment.
- ArgoCD manages every workload via `Application` manifests with manual sync (`k8s/argocd/ticketbox-app.yaml`, `k8s/argocd/mailpit.yaml`) - each namespace is deployed/removed independently.

## Goals / Non-Goals

**Goals:**
- Cluster and api visibility available within minutes of `helm install` / ArgoCD sync, with zero manual Grafana configuration.
- Follow the project's existing hand-rolled chart convention rather than introducing a new "vendored chart" pattern.
- Keep the change small and reversible: additive to api, isolated namespace, no changes to existing probes or workloads.

**Non-Goals:**
- Not built for portability to other clusters or growth beyond this project's three services (api, kube-state-metrics, kubelet cAdvisor) - the static target list is expected to need manual edits if services are added.
- Not an alerting system - no Alertmanager, no notification channel.
- Not surviving past a local dev session - no persistent storage strategy for Prometheus data beyond what the pod's ephemeral storage provides by default.

## Decisions

### Hand-rolled manifests, not kube-prometheus-stack
Every other chart in this repo is hand-authored (see Context). Adopting `kube-prometheus-stack` would introduce the one vendored-chart pattern this project otherwise avoids, plus `ServiceMonitor`/`PodMonitor` CRDs as a new concept. Given the project's small, stable service count, hand-rolled Prometheus/Grafana manifests are proportionate effort and consistent with `charts/ticketbox-app` and `charts/mailpit`.

**Alternative considered**: `kube-prometheus-stack` Helm chart - rejected for this pass because it breaks the project's one-chart-per-concern hand-rolled convention and adds CRD-based discovery complexity the target scope (3 static scrape sources) doesn't need. Revisit if the service count grows enough that static targets become a maintenance burden.

### Static scrape targets, not kubernetes_sd_configs
Prometheus's `prometheus.yml` lists scrape targets by Service DNS name (`api.ticketbox.svc.cluster.local:8080`, `kube-state-metrics.monitoring.svc.cluster.local:8080`, kubelet cAdvisor) directly in a ConfigMap, rather than using `kubernetes_sd_configs` with annotation-based discovery.

**Alternative considered**: `kubernetes_sd_configs` + relabeling - this is the "classic manual Prometheus" pattern and doesn't require a CRD, but it needs a ClusterRole granting Prometheus itself list/watch/get on pods/services/endpoints across all namespaces, plus relabel_configs logic to filter by annotation. For 3 known, stable targets, that's meaningfully more config for no practical benefit right now.

### No node-exporter DaemonSet
Node/container CPU and memory metrics come from the kubelet's built-in cAdvisor endpoint (`:10250/metrics/cadvisor`), scraped directly. On a single-node cluster this is equivalent signal to what node-exporter would provide for the "cluster health" dashboard goal, without deploying and maintaining an additional DaemonSet.

**Alternative considered**: deploy node-exporter anyway for a more "production-realistic" pattern - rejected as unnecessary scope for a single-node local dev cluster; kubelet's cAdvisor metrics cover the same node/container resource signals this design needs.

### kube-state-metrics is still required, and still needs a ClusterRole
Static scrape targets avoid Prometheus needing broad RBAC, but kube-state-metrics itself is a separate workload that reads pod/deployment/replicaset state from the Kubernetes API across `ticketbox`, `mailpit`, and `monitoring` namespaces - kubelet's cAdvisor doesn't expose this (deployment/replica desired-vs-actual state, restart counts as a first-class metric). This requires a `ClusterRole` (not just a per-namespace `Role`) bound to kube-state-metrics' service account. This is inherent to what kube-state-metrics does, independent of the scrape-discovery decision above.

### Grafana provisioning via ConfigMap, not manual UI setup
Grafana's `datasources` and `dashboards` provisioning directories are populated from ConfigMaps mounted into the pod, using Grafana's file-based provisioning support (reads YAML/JSON on startup, no admin UI clicks or API calls needed). This keeps the dashboard definitions versioned in git alongside the chart, consistent with the project's GitOps/ArgoCD approach to everything else.

**Alternative considered**: manual dashboard creation through the Grafana UI after first login - rejected because it isn't reproducible after a namespace recreate (this environment cycles often, given minikube stops on idle) and isn't versioned.

### api instrumentation: dependency + endpoint exposure only, no custom metrics
Adding `micrometer-registry-prometheus` to `api/build.gradle` activates Spring Boot Actuator's existing auto-instrumentation (already present via `spring-boot-starter-actuator`, which is already a dependency) - HTTP request counts/latencies/status codes, JVM memory/GC, Tomcat thread pool, HikariCP connection pool - all without writing any instrumentation code. Adding `prometheus` to `management.endpoints.web.exposure.include` (alongside the existing `health,info`) exposes it at `/actuator/prometheus`.

`SecurityConfig.java`'s filter chain permits `/actuator/health` and `/actuator/info` but requires authentication for everything else by default - `/actuator/prometheus` needed the same `permitAll()` treatment added to reach it at all (discovered during implementation, not anticipated in the original proposal). This follows the same reasoning already used for `health`/`info`: the endpoint is not exposed externally via ingress, so in-cluster network isolation is the real access boundary, not application-level auth.

**Alternative considered**: also instrument business-level metrics (queue depth via `QueueAdmissionService`, circuit-breaker state via `PaymentGatewayManager`'s Resilience4j integration) - explicitly deferred per proposal.md's Out of Scope; Resilience4j actually ships its own Micrometer binder that would make circuit-breaker state nearly free once this plumbing exists, making it a natural, low-effort follow-up rather than part of this change.

## Risks / Trade-offs

- **[Risk] Static target list requires a manual chart edit if a new service needs scraping (e.g. `web` later, or a fourth backend service).** → Mitigation: acceptable for current scope (Non-Goals explicitly excludes portability beyond 3 known targets); revisit `kubernetes_sd_configs` or CRD-based discovery if the service count grows.
- **[Risk] kube-state-metrics' ClusterRole grants cluster-wide read access to workload state, which is broader than any other service account in this project has needed so far.** → Mitigation: this is a well-known, minimal-privilege pattern for kube-state-metrics specifically (read-only, no write/exec/secrets access); scope the ClusterRole to only the API resources kube-state-metrics documents needing (pods, deployments, replicasets, nodes) rather than a wildcard.
- **[Risk] Prometheus has no persistent volume in this design - metrics are lost on pod restart.** → Mitigation: acceptable given the Non-Goal of surviving past a dev session; if this becomes annoying in practice, adding a PVC is a small, isolated follow-up (mirrors the pattern already used for api's storage/imports PVCs).
- **[Risk] Enabling `/actuator/prometheus` on api technically expands its attack surface (a new unauthenticated HTTP endpoint) if the cluster's ingress ever exposed actuator paths externally.** → Mitigation: `charts/ticketbox-app/templates/ingress.yaml` was found DURING IMPLEMENTATION to already route `/actuator` (prefix match) externally, contradicting this design's original assumption. Fixed by removing the `/actuator` path from the ingress entirely, so `/actuator/prometheus` (and `/actuator/health`, `/actuator/info`) are now only reachable in-cluster via Service DNS, as originally intended - Prometheus continues to scrape it in-cluster without any ingress exposure.

## Migration Plan

1. Add `micrometer-registry-prometheus` to `api/build.gradle`, expose `prometheus` in `application.yml`, verify locally that `/actuator/prometheus` returns metrics without breaking `/actuator/health`.
2. Build `charts/monitoring` (Prometheus, Grafana, kube-state-metrics manifests + ConfigMaps + kube-state-metrics ClusterRole/ClusterRoleBinding).
3. Deploy manually via `helm install` into the `monitoring` namespace on minikube, verify Prometheus scrapes all three targets and Grafana renders the starter dashboard.
4. Add `k8s/argocd/monitoring.yaml`, apply, verify ArgoCD tracks the chart the same way it does `ticketbox-app`.
5. Rollback: `helm uninstall` / delete the ArgoCD Application and the `monitoring` namespace - fully isolated, no impact on `ticketbox`/`mailpit` workloads per the namespace-isolation requirement in specs.
