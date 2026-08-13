# TicketBox Infrastructure

This Compose stack runs local infrastructure for CI/CD, local SMTP, and future
observability.
It is intentionally separate from the application runtime stack in
`docker-compose.yml`.

## Start Jenkins

From the repository root inside WSL:

```bash
cp .env.infras.example .env.infras
docker compose --env-file .env.infras -f docker-compose.infra.yml up -d --build
```

Jenkins will be available at:

```text
http://localhost:8081
```

Mailpit will be available at:

```text
http://localhost:8025
```

## Expose Jenkins Through Ngrok

Use ngrok when you need GitHub webhooks to reach local Jenkins.

Create the local infrastructure env file:

```bash
cp .env.infras.example .env.infras
```

Paste your ngrok auth token into `.env.infras`:

```dotenv
NGROK_AUTHTOKEN=<token-from-ngrok>
```

Start Jenkins, Mailpit, and ngrok together:

```bash
docker compose --env-file .env.infras -f docker-compose.infra.yml --profile tunnel up -d --build
```

Ngrok tunnels Jenkins through the internal Docker service URL:

```text
http://jenkins:8080
```

Read the public forwarding URL:

```bash
docker logs ticketbox-ngrok
```

Or open the local ngrok inspector:

```text
http://localhost:4040
```

Ngrok will show a public HTTPS forwarding URL, for example:

```text
https://example.ngrok-free.app
```

Set this URL in Jenkins:

```text
Manage Jenkins -> System -> Jenkins URL
```

Use the HTTPS forwarding URL with a trailing slash:

```text
https://example.ngrok-free.app/
```

Configure the GitHub webhook:

```text
Payload URL: https://example.ngrok-free.app/github-webhook/
Content type: application/json
Events: Pushes and pull requests
```

Free ngrok URLs may change when the tunnel restarts. Update the Jenkins URL and
GitHub webhook whenever the forwarding URL changes.

## Stop Jenkins

```bash
docker compose --env-file .env.infras -f docker-compose.infra.yml down
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
