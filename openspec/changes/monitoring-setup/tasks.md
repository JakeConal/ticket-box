## 1. Api Prometheus Endpoint

- [x] 1.1 Add `micrometer-registry-prometheus` to `api/build.gradle` and verify `./gradlew build` succeeds with the new dependency resolved
- [x] 1.2 Add `prometheus` to `management.endpoints.web.exposure.include` in `api/src/main/resources/application.yml` (alongside existing `health,info`) and verify the api starts locally without error
- [x] 1.3 Verify `/actuator/prometheus` returns a valid Prometheus exposition-format response (curl or browser) containing HTTP request and JVM metrics
- [x] 1.4 Verify `/actuator/health` and `/actuator/info` still respond identically to before this change (no readiness/liveness probe regression)
- [x] 1.5 Confirm the ingress config does not route `/actuator/*` externally, so the new endpoint is only reachable in-cluster

## 2. Monitoring Chart Scaffold

- [x] 2.1 Create `charts/monitoring/Chart.yaml` following the structure of `charts/mailpit/Chart.yaml`
- [x] 2.2 Create `charts/monitoring/values.yaml` with image repository/tag/resources for Prometheus, Grafana, and kube-state-metrics, following the pattern in `charts/ticketbox-app/values.yaml`

## 3. kube-state-metrics

- [x] 3.1 Create `charts/monitoring/templates/kube-state-metrics-clusterrole.yaml` granting read-only access to pods, deployments, and replicasets (only the resources kube-state-metrics documents needing, not a wildcard)
- [x] 3.2 Create `charts/monitoring/templates/kube-state-metrics-clusterrolebinding.yaml` binding the ClusterRole to kube-state-metrics' service account
- [x] 3.3 Create `charts/monitoring/templates/kube-state-metrics-deployment.yaml` and `charts/monitoring/templates/kube-state-metrics-service.yaml`
- [x] 3.4 Deploy in isolation and verify `kubectl exec` into any pod can `curl kube-state-metrics.monitoring.svc.cluster.local:8080/metrics` and see pod/deployment state for `ticketbox` and `mailpit` namespaces

## 4. Prometheus

- [x] 4.1 Create `charts/monitoring/templates/prometheus-configmap.yaml` containing `prometheus.yml` with static scrape targets: `api.ticketbox.svc.cluster.local:8080` (path `/actuator/prometheus`), `kube-state-metrics.monitoring.svc.cluster.local:8080`, and the kubelet cAdvisor endpoint
- [x] 4.2 Create `charts/monitoring/templates/prometheus-deployment.yaml` mounting the ConfigMap, and `charts/monitoring/templates/prometheus-service.yaml`
- [x] 4.3 Deploy and verify via Prometheus's own UI/API (`/targets`) that all three scrape targets show state `up`

## 5. Grafana

- [x] 5.1 Create `charts/monitoring/templates/grafana-datasource-configmap.yaml` provisioning the Prometheus data source via Grafana's file-based provisioning format
- [x] 5.2 Create `charts/monitoring/templates/grafana-dashboard-configmap.yaml` with at least one starter dashboard (pod restarts, resource usage, api request rate/latency panels) as versioned JSON
- [x] 5.3 Create `charts/monitoring/templates/grafana-deployment.yaml` mounting both ConfigMaps into Grafana's provisioning directories, and `charts/monitoring/templates/grafana-service.yaml`
- [x] 5.4 Deploy and verify logging into Grafana shows the Prometheus data source already connected and the starter dashboard already rendering live data, with no manual configuration

## 6. Namespace Isolation Verification

- [x] 6.1 Verify creating and deleting the `monitoring` namespace (or `helm uninstall`) causes no restarts or errors in any `ticketbox` or `mailpit` pod

## 7. ArgoCD Integration

- [x] 7.1 Create `k8s/argocd/monitoring.yaml` as an ArgoCD `Application` pointing at `charts/monitoring`, following the manual-sync pattern in `k8s/argocd/ticketbox-app.yaml`
- [x] 7.2 Apply and verify ArgoCD shows the `monitoring` Application synced and healthy, matching the live-deployed state from tasks 3-5

## 8. Documentation

- [x] 8.1 Update `infra/README.md`'s "future observability" note to describe the now-implemented monitoring stack (namespace, how to reach Grafana, how to deploy/tear down)
