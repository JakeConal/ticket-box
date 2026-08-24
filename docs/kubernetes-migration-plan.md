# TicketBox Kubernetes Migration Plan

Move the application runtime stack and the CI/CD infrastructure stack from
Docker Compose to Kubernetes.

## Current State (verified from repository)

### Application stack — docker-compose.yml

| Service | Image / build | Notes |
| --- | --- | --- |
| api | build ./api (Spring Boot, Gradle, JDK 25) | Env-driven config, Flyway migrations at startup, bind mounts ./imports and ./storage (QR keypair, artist PDFs, VIP CSVs) |
| web | build ticketbox-web/Dockerfile (Next.js 15 standalone) | Talks to API via API_INTERNAL_BASE_URL=http://api:8080 |
| postgres | postgres:17-alpine | Named volume postgres-data |
| redis | redis:8-alpine, --appendonly yes | Named volume redis-data; backs queues and rate limiting |
| nginx | nginx:1.29-alpine | Routes /api/ and /actuator/ to api, everything else to web; public port 8088 |

### Infrastructure stack — docker-compose.infra.yml

| Service | Notes |
| --- | --- |
| jenkins | Custom image (infra/jenkins/Dockerfile) with Docker CLI + compose plugin; mounts /var/run/docker.sock; volume jenkins-home |
| sonarqube | Community build + dedicated Postgres 17; volumes for data/extensions/logs |
| mailpit | Dev SMTP + web UI, attached to both ticketbox and ticketbox-infra networks |
| ngrok | Optional tunnel profile exposing Jenkins for GitHub webhooks |

### CI — ci/jenkins/*

Three Multibranch Pipeline jobs (api, web, checker), each with:

1. Module-scoped change filtering (skip builds when the module is untouched).
2. Test stage — API tests run through a CI-only compose file with a Redis
   sidecar; web/checker test inside Docker builds.
3. SonarQube analysis — pinned scanner image on the ticketbox-infra network,
   quality gate enforced, PRs scanned as isolated *-pr-* projects.
4. Image build and publish — Docker Hub tags <branch>-<short-sha>, plus
   latest on main; PR builds never push.
5. GitHub commit statuses (jenkins/ticketbox-*) for branch protection.

There is currently **no CD step**: images are published but deployment is
manual. There are no existing k8s/, helm/, or charts/ directories.

## Goals

- Run the full application stack (api, web, postgres, redis, ingress) on
  Kubernetes with parity to the compose behavior.
- Run the CI infrastructure (Jenkins, SonarQube, Mailpit) on Kubernetes.
- Extend the existing Jenkins pipelines with an automated deploy stage for
  main (turn CI into CI/CD).
- Keep Docker Compose as the fast **local development** path; Kubernetes
  becomes the shared/staging/production path.

## Non-goals (for now)

- Migrating the Expo checker app anywhere (it is a mobile client; it only
  needs a stable API base URL).
- Replacing Jenkins with another CI provider.
- Multi-region or service mesh.

## Key Decisions (assumed defaults — confirm before Phase 1)

| Decision | Assumed default | Alternative |
| --- | --- | --- |
| Cluster | Local first: Docker Desktop Kubernetes or kind in WSL; later a managed cluster (GKE/EKS/AKS) | Any CNI-compatible cluster |
| Manifest tooling | One Helm chart/release per namespace: charts/ticketbox-app locally; upstream charts (jenkins, sonarqube) with committed values; small local chart for mailpit | Kustomize + plain manifests |
| Namespaces | One per concern: ticketbox (app), jenkins, sonarqube, mailpit, argocd | Single ticketbox-infra namespace for all tools |
| Ingress | ingress-nginx controller replaces the nginx container | Cloud load balancer + Gateway API |
| Jenkins builds | Kaniko (no Docker daemon needed in-cluster) replaces the docker.sock mount | BuildKit, or keep Jenkins on a VM with Docker |
| CD | ArgoCD GitOps: Jenkins publishes images and bumps the image tag in the repo; ArgoCD syncs the cluster | Jenkins running helm upgrade directly |
| Postgres/Redis | In-cluster StatefulSets for dev/staging; managed services for production | Cloud SQL/ElastiCache from day one |
| Secrets | Plain Kubernetes Secrets created out-of-band initially; Sealed Secrets or SOPS later | External Secrets Operator |
| Shared file storage | api pinned to replicas: 1 with RWO PVCs for imports/storage | RWX storage class (NFS/EFS/Filestore) if scaling out |

## Target Architecture

Namespaces:

- ticketbox (application)
  - Ingress (ingress-nginx class)
    - /api/*, /actuator/*  -> Service api:8080
    - /*                   -> Service web:3000
  - Deployment api (probes on /actuator/health)
  - Deployment web
  - StatefulSet postgres (PVC, Flyway runs from api at startup)
  - StatefulSet redis (PVC, appendonly yes)
  - ConfigMap ticketbox-config (non-sensitive env)
  - Secrets: db, jwt, payments, nvidia, qr-keys (file secret)
- jenkins
  - Jenkins (helm chart, PVC jenkins-home, Kaniko builder pods)
  - ngrok (optional Deployment, replaces tunnel compose profile)
- sonarqube
  - SonarQube (helm chart + postgres)
- mailpit
  - Mailpit (dev/staging SMTP + web UI; serves the app across namespaces)
- argocd
  - ArgoCD (installed in Phase 0; one Application per namespace above)

One namespace per infra tool keeps RBAC, resource quotas, and ArgoCD sync
scopes isolated: each Application manages exactly one namespace, and a
problem in one tool cannot cascade into the others. The price is explicit
cross-namespace DNS (<service>.<namespace>.svc.cluster.local), which the
ConfigMaps below already standardize.

## Phase 0 — Prerequisites and Decisions

1. Confirm the decisions table above (cluster, chart layout, build strategy).
2. Provision the cluster; verify kubectl access from the dev machine.
3. Install cluster add-ons: ingress-nginx, metrics-server (HPA prerequisite).
4. Create namespaces: ticketbox (app), jenkins, sonarqube, mailpit. One
   namespace per infra tool keeps RBAC, quotas, and ArgoCD sync scopes
   isolated; the argocd namespace is created at install time (step 6).
5. Create a Docker Hub pull secret in ticketbox
   (kubectl create secret docker-registry dockerhub-ticketbox ...).
6. Install ArgoCD (argocd namespace) and create one Application per tool,
   each managing exactly one namespace: ticketbox-app ->
   charts/ticketbox-app, plus jenkins, sonarqube, and mailpit. Manual sync
   first; automated sync is enabled in Phase 3 once the deploy flow is
   proven.
7. Define the secret inventory (from .env.example):
   - ticketbox-db: Postgres user/password, Spring datasource URL/creds.
   - ticketbox-jwt: AUTH_JWT_SECRET, QUEUE_JWT_SECRET.
   - ticketbox-payments: VNPay + MoMo credentials and callback URLs.
   - ticketbox-nvidia: NVIDIA API key.
   - ticketbox-qr: QR private/public PEM pair as file data.
8. Decide QR key placement. Today the keys live inside the bind-mounted
   ./storage volume. On Kubernetes, mount the ticketbox-qr secret to a
   dedicated path (e.g. /app/keys) and set QR_PRIVATE_KEY_PATH /
   QR_PUBLIC_KEY_PATH accordingly, keeping the storage PVC for PDFs only.

## Phase 1 — Application Workloads (charts/ticketbox-app)

1. Scaffold the chart: Chart.yaml, values.yaml (image tags, replicas,
   resources, ingress host), templates.
2. Postgres StatefulSet + headless Service + PVC; keep db/user/dbname
   identical to compose (ticketbox/ticketbox); readiness via pg_isready.
3. Redis StatefulSet + PVC; keep --appendonly yes; readiness via
   redis-cli ping. Queue tokens and rate-limit state live here, so
   persistence matters across restarts.
4. api Deployment:
   - env from ConfigMap + Secrets (mirror compose variables);
   - readiness/liveness probes on /actuator/health (already proxied today,
     so the endpoint is known-good);
   - PVC mounts at /app/imports and /app/storage;
   - QR keys mounted from secret at /app/keys;
   - replicas: 1 initially (shared storage + Flyway first-run simplicity);
   - Flyway migrations continue to run at boot — no separate Job needed.
5. web Deployment + Service; env API_INTERNAL_BASE_URL=http://api:8080,
   NEXT_PUBLIC_API_BASE_URL=/api (baked at build time — keep /api).
6. Ingress replicating nginx/nginx.conf:
   - /api/ and /actuator/ -> api:8080, / -> web:3000;
   - keep WebSocket upgrade headers (nginx.conf sets them today).
7. Verification (acceptance criteria):
   - kubectl get pods all healthy in ticketbox;
   - audience browse + purchase flow works through the ingress;
   - organizer admin login works (organizer@ticketbox.vn / password);
   - checker sync works against the ingress URL;
   - API pod restart preserves QR keys, imports, and artist PDFs (PVC);
   - Redis restart preserves queue/rate-limit state (AOF PVC).

## Phase 2 — Infrastructure Workloads (jenkins, sonarqube, mailpit namespaces)

1. Jenkins via the official Helm chart (jenkins/jenkins) into the jenkins
   namespace:
   - PVC-backed home (replaces jenkins-home volume);
   - controller image keeps the current plugin set; no docker.sock mount;
   - agent pods run builds; Docker-build steps move to Kaniko (Phase 3).
2. SonarQube via the official Helm chart into the sonarqube namespace:
   - chart-managed Postgres subchart or a second StatefulSet;
   - the chart''s init container handles vm.max_map_count (today this is a
     manual WSL sysctl step — it disappears);
   - recreate the three projects/tokens; SONAR_HOST_URL changes from
     http://sonarqube:9000 to the cross-namespace service URL
     (http://<release>-sonarqube.sonarqube.svc.cluster.local:9000);
   - scanner pods (Phase 3) run in the jenkins namespace and reach
     SonarQube across namespaces.
3. Mailpit Deployment + Service in the mailpit namespace (dev/staging),
   mirroring the compose infra stack. It serves the app, so SMTP_HOST
   changes from mailpit:1025 to mailpit.mailpit.svc.cluster.local:1025 in
   the api ConfigMap; the web UI is exposed through the ingress like the
   other infra tools.
4. ngrok (optional): small Deployment + secret for the authtoken in the
   jenkins namespace, pointing at the Jenkins Service — replaces the compose
   tunnel profile. Skip entirely once the cluster has real DNS/ingress for
   webhooks.
5. Verification:
   - Jenkins UI reachable, GitHub webhook received (test push);
   - SonarQube UI reachable, scanner pod can push analysis;
   - Mailpit UI reachable; mail sent by the api pod is captured.

## Phase 3 — Pipeline Rework (CI -> CD)

1. Replace daemon-dependent build steps:
   - API test compose file -> Kubernetes Pod (or Jenkins agent) running Gradle
     tests with a Redis sidecar container;
   - docker build / docker push -> Kaniko executor with Docker Hub
     credentials mounted; image tags stay <branch>-<short-sha> + latest.
2. Replace the --volumes-from ticketbox-jenkins SonarScanner trick: run the
   scanner as a container in the build pod with the workspace shared via an
   emptyDir/PVC.
3. Add a Deploy stage to Jenkinsfile.api and Jenkinsfile.web, main-branch
   only, after Publish Image. The stage does not touch the cluster; it bumps
   the image tag in charts/ticketbox-app/values.yaml (api.image.tag /
   web.image.tag = <branch>-<short-sha>) and pushes the commit:
   - Jenkins credential: a GitHub deploy key or PAT scoped to this repo only
     (least privilege — no kubeconfig or cluster token needed);
   - ArgoCD detects the change (poll interval or webhook) and syncs
     ticketbox-app; rollout health is visible in the ArgoCD UI;
   - rollback = git revert of the tag bump; ArgoCD converges the cluster.
4. Keep everything else unchanged: change filters, PR isolation for
   SonarQube, no-push-on-PR, GitHub status contexts.
5. Checker pipeline gets no deploy stage (mobile app), only the build
   mechanics change.
6. Verification:
   - PR build: tests + sonar + GitHub status, no push, no deploy;
   - main build: image published, tag bump committed, ArgoCD syncs within
     its poll interval, smoke test passes against the ingress.

## Phase 4 — Hardening and Operations

- Resource requests/limits on all workloads (JVM heap sizing for api and
  SonarQube).
- HPA for api and web; PodDisruptionBudgets; anti-affinity as needed.
- NetworkPolicies (per-namespace makes these easy to scope): ingress ->
  api/web, api -> postgres/redis and mailpit.mailpit, jenkins build pods ->
  sonarqube and Docker Hub, ingress -> infra tool UIs.
- Postgres backup CronJob (pg_dump to object storage); Redis AOF already
  persisted; document restore runbook.
- cert-manager + TLS on the ingress; retire ngrok once DNS is real.
- Observability: Prometheus + Grafana in a dedicated monitoring namespace
  (the infra README already reserves this slot); api exposes actuator
  metrics.
- ArgoCD hardening: automated sync + self-heal for ticketbox-app once the
  flow is trusted, sync windows for production, notifications on sync
  failure.
- Consider managed Postgres/Redis before production traffic.

## Migration and Rollback Strategy

- Compose and Kubernetes run in parallel during migration; nothing is removed
  until each phase''s acceptance criteria pass.
- Compose remains the sanctioned local-dev workflow (run-app.ps1); the
  checker''s EXPO_PUBLIC_API_BASE_URL simply points at the ingress URL when
  testing against the cluster.
- Rollback at any phase = keep using compose; the compose files stay in the
  repo and are not deleted by this migration.

## Risks and Watch Items

| Risk | Mitigation |
| --- | --- |
| Jenkins docker.sock pattern cannot move to Kubernetes as-is | Phase 3 Kaniko rework is the largest single change; prototype it first on the web pipeline (simplest Dockerfile) |
| imports/storage need shared access if api scales out | Keep replicas: 1 + RWO until an RWX storage class exists |
| QR private key currently sits in the general storage volume | Move to a dedicated Secret mount (Phase 0 decision) before go-live |
| In-cluster Postgres/Redis data loss on node failure | PVCs + backup CronJob; move to managed services for production |
| SonarQube Community edition constraints (main-branch only, PR isolation) carry over unchanged | Keep the existing *-pr-* project scheme; no regression expected |
| NEXT_PUBLIC_API_BASE_URL is baked at image build time | Keep the relative /api value so one image works in every environment |
| Deploy depends on a commit from Jenkins (tag bump) | Idempotent bump step + ArgoCD sync status check in the pipeline; failed syncs are visible in ArgoCD and via git history |
| More namespaces mean more cross-namespace wiring | Standardize on <service>.<namespace>.svc.cluster.local names in ConfigMaps; NetworkPolicies (Phase 4) codify the allowed paths |

## Ordered Work Breakdown

1. Phase 0: confirm decisions, cluster + add-ons, namespaces, pull secret,
   ArgoCD install, secret inventory.
2. Phase 1: charts/ticketbox-app -> deploy -> parity verification.
3. Phase 2: Jenkins (jenkins ns), SonarQube (sonarqube ns), Mailpit
   (mailpit ns), optional ngrok.
4. Phase 3: Jenkinsfile rework (Kaniko + pod-based tests + ArgoCD deploy
   stage).
5. Phase 4: hardening, backups, observability, TLS.
6. Docs: update README.md, infra/README.md, ci/jenkins/README.md;
   document compose as local-dev-only.

