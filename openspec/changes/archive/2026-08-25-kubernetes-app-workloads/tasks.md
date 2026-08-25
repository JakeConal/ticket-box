## 1. Chart Scaffold

- [x] 1.1 Create `charts/ticketbox-app/Chart.yaml` and `values.yaml` (image repo/tag, replicaCount, resources placeholders, ingress host) and verify `helm lint charts/ticketbox-app` passes
- [x] 1.2 Create `charts/ticketbox-app/templates/configmap.yaml` with non-sensitive api/web env vars (mirroring `.env.example` non-secret keys) and verify `helm template charts/ticketbox-app` renders it

## 2. Postgres and Redis (StatefulSets)

- [x] 2.1 Add `postgres-statefulset.yaml` + headless `postgres-service.yaml` + PVC template, db/user/dbname matching compose (`ticketbox`/`ticketbox`), readiness probe via `pg_isready`, and verify `helm template` renders a valid StatefulSet
- [x] 2.2 Add `redis-statefulset.yaml` + `redis-service.yaml` + PVC template with `--appendonly yes`, readiness probe via `redis-cli ping`, and verify `helm template` renders a valid StatefulSet

## 3. API Workload

- [x] 3.1 Add `api-deployment.yaml` + `api-service.yaml`: env from ConfigMap + Secrets (`ticketbox-db`, `ticketbox-jwt`, `ticketbox-payments`, `ticketbox-nvidia`), readiness/liveness probes on `/actuator/health`, `replicas: 1`
- [x] 3.2 Add PVC template for `/app/imports` and `/app/storage` and mount it on the api Deployment; verify `helm template` shows both mount paths
- [x] 3.3 Mount the `ticketbox-qr` Secret at `/app/keys` on the api Deployment and set `QR_PRIVATE_KEY_PATH`/`QR_PUBLIC_KEY_PATH` env vars to that path

## 4. Web Workload

- [x] 4.1 Add `web-deployment.yaml` + `web-service.yaml` with `API_INTERNAL_BASE_URL=http://api:8080`, `replicas: 1`, and verify `helm template` renders correctly

## 5. Ingress

- [x] 5.1 Add `ingress.yaml` routing `/api/*` and `/actuator/*` to the api Service (port 8080) and `/*` to the web Service (port 3000), with WebSocket upgrade annotations, and verify `helm template` produces one Ingress with both path rules

## 6. Namespace, Secrets, ArgoCD

- [x] 6.1 Document the exact `kubectl create secret` commands for `ticketbox-db`, `ticketbox-jwt`, `ticketbox-payments`, `ticketbox-nvidia`, `ticketbox-qr` (values sourced from `.env.example`) in a README or comment near the chart, matching the existing `charts/mailpit`/`charts/jenkins-values.yaml` documentation style
- [x] 6.2 Add `k8s/argocd/ticketbox-app.yaml` (Application, manual sync, `CreateNamespace=false`, destination namespace `ticketbox`) matching the style of `k8s/argocd/mailpit.yaml`

## 7. Verification

- [x] 7.1 `kubectl create namespace ticketbox`, create the five Secrets from task 6.1, apply `k8s/argocd/ticketbox-app.yaml`, trigger sync, and verify all pods reach Ready (`kubectl get pods -n ticketbox`)
- [x] 7.2 Verify the audience browse + purchase flow and organizer admin login work through the ingress URL
- [x] 7.3 Verify checker sync works against the ingress URL
- [x] 7.4 Delete the api pod and verify QR keys, imports, and artist PDFs are still present after the replacement pod starts (PVC persistence)
- [x] 7.5 Delete the redis pod and verify queue/rate-limit state is preserved after the replacement pod starts (AOF PVC persistence)
