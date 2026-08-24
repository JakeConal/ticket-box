#!/usr/bin/env bash
# Probes the ingress-nginx NodePort with each infra Host header and prints
# the HTTP status code. Usage (inside WSL):
#   bash scripts/probe-ingress.sh
set -euo pipefail

IP=$(minikube ip)
PORT=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.ports[?(@.name=="http")].nodePort}')

# host:path pairs. Jenkins returns 403 on "/" when unauthenticated, so probe
# its /login page instead.
targets=(
  "mailpit.ticketbox.local /"
  "jenkins.ticketbox.local /login"
  "sonarqube.ticketbox.local /"
)

for t in "${targets[@]}"; do
  h="${t%% *}"
  p="${t##* }"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $h" "http://$IP:$PORT$p" --max-time 8 || echo "000")
  echo "$h$p -> $code"
done
