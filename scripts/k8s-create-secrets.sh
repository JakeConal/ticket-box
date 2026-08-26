#!/usr/bin/env bash
# Creates the TicketBox application secrets in the "ticketbox" namespace from
# the local .env file and the QR keypair in ./storage.
#
# Usage (from the repo root, inside WSL):
#   bash scripts/k8s-create-secrets.sh
#
# The script reads values from .env at runtime; it contains no secrets itself.
# It is idempotent (uses --dry-run=client | kubectl apply).
set -euo pipefail

NS="ticketbox"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found in the current directory. Run from the repo root." >&2
  exit 1
fi

# Load .env values into the environment without exporting them globally.
# Strip Windows CRLF line endings first, since .env may be edited on Windows.
set -a
# shellcheck disable=SC1090
source <(tr -d '\r' < .env)
set +a

apply() {
  kubectl apply -f -
}

echo "Creating secrets in namespace ${NS}..."

kubectl create secret generic ticketbox-db -n "${NS}" \
  --from-literal=POSTGRES_DB="${POSTGRES_DB}" \
  --from-literal=POSTGRES_USER="${POSTGRES_USER}" \
  --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  --from-literal=SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL}" \
  --from-literal=SPRING_DATASOURCE_USERNAME="${SPRING_DATASOURCE_USERNAME}" \
  --from-literal=SPRING_DATASOURCE_PASSWORD="${SPRING_DATASOURCE_PASSWORD}" \
  --dry-run=client -o yaml | apply

kubectl create secret generic ticketbox-jwt -n "${NS}" \
  --from-literal=AUTH_JWT_SECRET="${AUTH_JWT_SECRET}" \
  --from-literal=QUEUE_JWT_SECRET="${QUEUE_JWT_SECRET}" \
  --dry-run=client -o yaml | apply

kubectl create secret generic ticketbox-payments -n "${NS}" \
  --from-literal=VNPAY_TMN_CODE="${VNPAY_TMN_CODE}" \
  --from-literal=VNPAY_HASH_SECRET="${VNPAY_HASH_SECRET}" \
  --from-literal=VNPAY_PAY_URL="${VNPAY_PAY_URL}" \
  --from-literal=VNPAY_RETURN_URL="${VNPAY_RETURN_URL}" \
  --from-literal=VNPAY_IPN_URL="${VNPAY_IPN_URL}" \
  --from-literal=MOMO_PARTNER_CODE="${MOMO_PARTNER_CODE}" \
  --from-literal=MOMO_ACCESS_KEY="${MOMO_ACCESS_KEY}" \
  --from-literal=MOMO_SECRET_KEY="${MOMO_SECRET_KEY}" \
  --from-literal=MOMO_ENDPOINT="${MOMO_ENDPOINT}" \
  --from-literal=MOMO_QUERY_ENDPOINT="${MOMO_QUERY_ENDPOINT}" \
  --from-literal=MOMO_RETURN_URL="${MOMO_RETURN_URL}" \
  --from-literal=MOMO_IPN_URL="${MOMO_IPN_URL}" \
  --dry-run=client -o yaml | apply

kubectl create secret generic ticketbox-nvidia -n "${NS}" \
  --from-literal=NVIDIA_API_KEY="${NVIDIA_API_KEY}" \
  --dry-run=client -o yaml | apply

if [[ -f storage/qr-private.pem && -f storage/qr-public.pem ]]; then
  kubectl create secret generic ticketbox-qr -n "${NS}" \
    --from-file=qr-private.pem=storage/qr-private.pem \
    --from-file=qr-public.pem=storage/qr-public.pem \
    --dry-run=client -o yaml | apply
else
  echo "WARN: storage/qr-*.pem not found; skipping ticketbox-qr secret." >&2
fi

echo "Done. Secrets present:"
kubectl get secrets -n "${NS}"
