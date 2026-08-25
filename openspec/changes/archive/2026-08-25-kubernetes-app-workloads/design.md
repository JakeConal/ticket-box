## Context

`docker-compose.yml` currently runs `api` (Spring Boot, JDK 25, Flyway-on-boot), `web` (Next.js standalone), `postgres:17-alpine`, `redis:8-alpine --appendonly yes`, and `nginx` (routing `/api/`, `/actuator/` to api, `/*` to web, port 8088). `charts/mailpit` already establishes the self-authored-Helm-chart convention this project follows, and `k8s/argocd/{jenkins,sonarqube,mailpit}.yaml` establish the one-`Application`-per-namespace ArgoCD pattern. This change adds the missing piece: `charts/ticketbox-app` + its ArgoCD Application, deployed into a new `ticketbox` namespace. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One Helm chart, one namespace, one ArgoCD Application for the whole app stack (api/web/postgres/redis/ingress) — mirrors the existing per-tool pattern.
- Behavior parity with Compose: same routing rules, same Flyway-on-boot migration approach, same Redis persistence mode.
- Local-cluster friendly: everything fits in a single-node minikube/kind, no cloud-managed dependencies assumed.

**Non-Goals:**
- Autoscaling (HPA), PodDisruptionBudgets, NetworkPolicies, resource requests/limits tuning — hardening work, tracked separately (matches the old plan's Phase 4).
- TLS/cert-manager — local cluster uses plain HTTP ingress for now.
- CI pipeline changes (Kaniko builds, image-tag-bump deploy stage) — separate future change; this proposal only adds something for that pipeline to eventually deploy to.
- Automated ArgoCD sync — stays manual, consistent with the other three Applications already in the repo.
- Secret-management tooling (Sealed Secrets/SOPS) — Secrets are created out-of-band with `kubectl create secret`, same as the assumed default for the other namespaces.

## Decisions

**Chart structure**: one chart (`charts/ticketbox-app`) with four workload templates (`api-deployment.yaml`, `web-deployment.yaml`, `postgres-statefulset.yaml`, `redis-statefulset.yaml`) plus `configmap.yaml`, `ingress.yaml`, and per-workload `service.yaml`. Alternative considered: separate charts per workload — rejected, it fragments a single logical release into four Helm releases with no independent-lifecycle benefit at this scale (same rationale mailpit already uses for its single chart).

**Postgres/Redis as StatefulSets, not a managed/operator-based DB**: matches the existing plan's Phase 1 decision and keeps everything running on a bare local cluster without requiring an operator (e.g. Zalando Postgres Operator, Bitnami) or CloudSQL/ElastiCache. Trade-off: no built-in backup/replication — accepted for a local/portfolio deployment; a backup CronJob is Phase 4 hardening, out of scope here.

**No migration Job — Flyway keeps running at api boot**: current compose behavior already validates this pattern works; adding a separate `Job`/`initContainer` would only be justified if migrations needed to run before `api` pods scale beyond 1, which is explicitly out of scope (`replicas: 1`).

**QR keys move from the `storage` bind mount to a dedicated `ticketbox-qr` Secret mounted at `/app/keys`**: keeps a private key out of the general-purpose PVC (which also holds less-sensitive PDFs/CSVs) and out of any container image. The `imports`/`storage` PVC keeps holding only imports/generated artifacts. Alternative considered: leave everything on one PVC — rejected because Secrets get proper at-rest handling (etcd encryption, tighter default access) that a PVC does not.

**`replicas: 1` for api and web**: RWO PVC mounts (`imports`/`storage`, `postgres` data) prevent multi-pod scheduling without additional storage-class work (RWX). Scaling out is explicitly deferred (matches proposal's Impact section and the old plan's original Phase 1 note).

**Ingress via ingress-nginx, replacing the `nginx` container**: assumes an ingress-nginx controller is already installed in the cluster (prerequisite, not part of this change) — the chart only ships the `Ingress` resource, not the controller. Alternative considered: keep a bespoke `nginx` Deployment+ConfigMap inside the chart, replicating `nginx/nginx.conf` — rejected, it duplicates functionality ingress-nginx already provides and every other namespace-per-tool app in this repo will eventually want the same controller.

**Namespace**: new `ticketbox` namespace, not reused from anywhere else — consistent with the project's namespace-per-concern convention already visible in `k8s/argocd/*.yaml` (jenkins, sonarqube, mailpit each get their own).

## Risks / Trade-offs

- **[Risk]** Single-replica `postgres`/`redis` StatefulSets mean a node failure loses the pod until Kubernetes reschedules it (PVC data itself survives if the underlying storage does). → *Mitigation*: acceptable for local/portfolio use; noted as a known limitation, not silently ignored.
- **[Risk]** No resource requests/limits set in this pass — a runaway pod could starve others on a small local node. → *Mitigation*: explicitly deferred to Phase 4 hardening (proposal's Non-Goals), not forgotten.
- **[Risk]** Secrets created manually via `kubectl create secret` are easy to forget or drift from `.env.example` over time. → *Mitigation*: proposal.md documents the exact secret inventory; a follow-up change can script secret creation from `.env.example` if this becomes painful.
- **[Trade-off]** Choosing StatefulSets over an operator/managed DB trades production-readiness for simplicity — acceptable because this is explicitly a local/learning deployment target (per clarify Q&A), not a production one.

## Migration Plan

1. Install/verify ingress-nginx and ArgoCD are present in the target cluster (prerequisite, out of scope to install here).
2. `kubectl create namespace ticketbox`.
3. Create the five required Secrets in `ticketbox` from `.env.example` values (`ticketbox-db`, `ticketbox-jwt`, `ticketbox-payments`, `ticketbox-nvidia`, `ticketbox-qr`).
4. Apply `k8s/argocd/ticketbox-app.yaml`; manually trigger the ArgoCD sync.
5. Verify: all pods Ready; audience browse+purchase flow works through the ingress; organizer login works; API pod restart preserves QR keys/imports/storage (PVC); Redis restart preserves queue/rate-limit state (AOF PVC) — same acceptance criteria the prior migration notes already defined.
6. Rollback: delete the `ticketbox-app` ArgoCD Application (or `helm uninstall`) and keep using `docker-compose.yml` locally — Compose is untouched by this change.

## Open Questions

None — cluster target, chart tooling, GitOps approach, registry, and persistence model were all resolved during exploration (see openspec-explore conversation prior to this proposal).
