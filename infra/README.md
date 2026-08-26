# TicketBox Infrastructure

This Compose stack runs local infrastructure for local SMTP. It is
intentionally separate from the application runtime stack in
`docker-compose.yml`.

CI (build, test, SonarCloud analysis, image publish) now runs on GitHub
Actions — see `.github/workflows/`. This stack no longer runs Jenkins or a
self-hosted SonarQube instance.

## Start the Infrastructure Stack

From the repository root inside WSL:

```bash
cp .env.infra.example .env.infra
docker compose --env-file .env.infra -f docker-compose.infra.yml up -d --build
```

Mailpit will be available at:

```text
http://localhost:8025
```

Check startup health with:

```bash
docker compose --env-file .env.infra -f docker-compose.infra.yml ps
```

## Stop the Infrastructure Stack

```bash
docker compose --env-file .env.infra -f docker-compose.infra.yml down
```

## App Stack

Use a stable app project name when deploying the app stack:

```bash
docker compose -p ticketbox up -d --build
```

That keeps application containers and volumes separate from the infrastructure
stack.

## Monitoring (Prometheus + Grafana)

Cluster and api observability runs as a separate Helm chart in the
`monitoring` namespace, not in this Compose stack — see
`charts/monitoring/`.

Deploy (from WSL, with minikube running):

```bash
kubectl create namespace monitoring
helm upgrade --install monitoring charts/monitoring -n monitoring
```

Or via ArgoCD: `kubectl apply -f k8s/argocd/monitoring.yaml`, then sync the
`monitoring` Application.

Reach Grafana:

```bash
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

Then open `http://localhost:3000` (default login `admin`/`admin`). The
Prometheus data source and a "TicketBox Overview" starter dashboard (pod
restarts, resource usage, api request rate/latency) are pre-provisioned —
no manual setup needed.

Reach Prometheus directly:

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

Then open `http://localhost:9090/targets` to see scrape target health.

Tear down:

```bash
helm uninstall monitoring -n monitoring
kubectl delete namespace monitoring
```

The `monitoring` namespace is fully isolated — tearing it down does not
affect `ticketbox` or `mailpit` pods.
