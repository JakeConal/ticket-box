# TicketBox Infrastructure

This Compose stack runs local infrastructure for CI/CD, local SMTP, and future
observability.
It is intentionally separate from the application runtime stack in
`docker-compose.yml`.

## Start Jenkins

From the repository root inside WSL:

```bash
docker compose -f docker-compose.infra.yml up -d --build
```

Jenkins will be available at:

```text
http://localhost:8081
```

Mailpit will be available at:

```text
http://localhost:8025
```

## Stop Jenkins

```bash
docker compose -f docker-compose.infra.yml down
```

Jenkins data is stored in the `ticketbox-infra_jenkins-home` Docker volume.

## Docker Access

The Jenkins container mounts `/var/run/docker.sock`, so Jenkins can run Docker
and Docker Compose commands against the WSL Docker Engine.

Use a stable app project name when deploying the app stack:

```bash
docker compose -p ticketbox up -d --build
```

That keeps application containers and volumes separate from the infrastructure
stack.
