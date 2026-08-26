# ticketbox-app

Helm chart for the TicketBox application stack (api, web, postgres, redis,
ingress). Installed into the `ticketbox` namespace.
See `openspec/changes/kubernetes-app-workloads/` for the proposal/design.

## Prerequisites

- ingress-nginx controller installed in the cluster
- ArgoCD installed (for GitOps deploy) — or `helm install` directly for
  manual installs

## Required Secrets (create out-of-band, not managed by this chart)

Values below mirror `.env.example`; replace placeholders with real values
before creating.

```bash
kubectl create namespace ticketbox

kubectl create secret generic ticketbox-db -n ticketbox \
  --from-literal=POSTGRES_USER=ticketbox \
  --from-literal=POSTGRES_PASSWORD=ticketbox

kubectl create secret generic ticketbox-jwt -n ticketbox \
  --from-literal=AUTH_JWT_SECRET=replace-with-a-long-random-auth-secret \
  --from-literal=QUEUE_JWT_SECRET=replace-with-a-long-random-queue-secret

kubectl create secret generic ticketbox-payments -n ticketbox \
  --from-literal=VNPAY_TMN_CODE= \
  --from-literal=VNPAY_HASH_SECRET= \
  --from-literal=MOMO_PARTNER_CODE= \
  --from-literal=MOMO_ACCESS_KEY= \
  --from-literal=MOMO_SECRET_KEY=

kubectl create secret generic ticketbox-nvidia -n ticketbox \
  --from-literal=NVIDIA_API_KEY=

kubectl create secret generic ticketbox-qr -n ticketbox \
  --from-file=qr-private.pem=./keys/qr-private.pem \
  --from-file=qr-public.pem=./keys/qr-public.pem
```

## Install

```bash
helm upgrade --install ticketbox-app charts/ticketbox-app -n ticketbox
```

Or via ArgoCD (manual sync):

```bash
kubectl apply -f k8s/argocd/ticketbox-app.yaml
```
