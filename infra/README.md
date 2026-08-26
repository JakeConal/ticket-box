# TicketBox Infrastructure

This Compose stack runs local infrastructure for local SMTP and future
observability. It is intentionally separate from the application runtime
stack in `docker-compose.yml`.

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
