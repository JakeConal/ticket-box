# Capability: k8s-app-deployment

## Purpose

Deploys the ticketbox application (api, web, postgres, redis) to a Kubernetes cluster with behavior parity to the existing Docker Compose stack, so the app can run and be reached without Compose.

## Requirements

### Requirement: Application stack deploys as a Helm release
The `charts/ticketbox-app` Helm chart SHALL deploy the `api`, `web`, `postgres`, and `redis` workloads plus supporting Service/ConfigMap/Ingress objects into a single `ticketbox` namespace as one Helm release.

#### Scenario: Fresh install
- **WHEN** the chart is installed (or synced via ArgoCD) into an empty `ticketbox` namespace with the required Secrets already present
- **THEN** `api`, `web`, `postgres`, and `redis` workloads all reach Ready state without manual intervention beyond secret creation

#### Scenario: Missing required secret
- **WHEN** the chart is installed but one of the required Secrets (`ticketbox-db`, `ticketbox-jwt`, `ticketbox-payments`, `ticketbox-nvidia`, `ticketbox-qr`) does not exist in the namespace
- **THEN** the dependent pod SHALL fail to start (ImagePull/CreateContainerConfigError or CrashLoopBackOff) rather than starting with missing configuration, making the gap visible via `kubectl get pods`

### Requirement: Ingress routes traffic matching current nginx behavior
A single Ingress resource SHALL route `/api/*` and `/actuator/*` to the `api` Service on port 8080, and all other paths to the `web` Service on port 3000, preserving WebSocket upgrade headers.

#### Scenario: API request routed to api service
- **WHEN** a client requests `GET /api/concerts` through the ingress
- **THEN** the request is forwarded to the `api` Service and the response is returned unmodified

#### Scenario: Non-API request routed to web service
- **WHEN** a client requests `GET /concerts/123` through the ingress
- **THEN** the request is forwarded to the `web` Service

### Requirement: Postgres and Redis persist state across pod restarts
`postgres` and `redis` SHALL run as StatefulSets each backed by a PersistentVolumeClaim, so that database rows and Redis AOF data survive pod rescheduling or restart.

#### Scenario: Postgres pod restarts
- **WHEN** the `postgres` pod is deleted and Kubernetes recreates it
- **THEN** previously created concerts, tickets, and orders are still present after the new pod becomes Ready

#### Scenario: Redis pod restarts
- **WHEN** the `redis` pod is deleted and Kubernetes recreates it
- **THEN** queue tokens and rate-limit counters written before the restart are still present after the new pod becomes Ready (AOF persistence)

### Requirement: API database migrations run automatically on startup
The `api` Deployment SHALL run its Flyway migrations at container startup, matching current Compose behavior, without a separate migration Job.

#### Scenario: New schema version deployed
- **WHEN** the `api` image contains new Flyway migration scripts and the Deployment rolls out
- **THEN** the new `api` pod applies pending migrations against `postgres` before it reports ready on `/actuator/health`

### Requirement: QR signing keys are provided via a dedicated Secret mount
The QR keypair used to sign/verify ticket QR codes SHALL be mounted into the `api` pod from the `ticketbox-qr` Secret at a dedicated path, separate from the `imports`/`storage` PVC.

#### Scenario: API pod starts with QR secret mounted
- **WHEN** the `api` pod starts with the `ticketbox-qr` Secret mounted at the configured keys path
- **THEN** the api process can sign and verify ticket QR codes using the mounted keys, and `QR_PRIVATE_KEY_PATH`/`QR_PUBLIC_KEY_PATH` point at that mount

### Requirement: Imports and generated artifacts persist independently of pod lifecycle
Artist PDFs, VIP CSV imports, and other generated files under `/app/imports` and `/app/storage` SHALL persist on a PersistentVolumeClaim mounted into the `api` pod, independent of the QR key secret mount.

#### Scenario: API pod restarts after files were generated
- **WHEN** the `api` pod has previously generated an artist PDF or accepted a VIP CSV import, and the pod is then restarted
- **THEN** the previously generated/imported file is still present and servable after restart

### Requirement: API and web run with a fixed replica count of 1
`api` and `web` Deployments SHALL default to `replicas: 1` in `values.yaml`, consistent with the RWO PVC and shared-storage assumptions of this chart version.

#### Scenario: Chart installed with default values
- **WHEN** the chart is installed without overriding `replicaCount`
- **THEN** exactly one `api` pod and one `web` pod are running
