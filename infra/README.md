# TicketBox Infrastructure

This Compose stack runs local infrastructure for CI/CD, code quality, local
SMTP, and future observability.
It is intentionally separate from the application runtime stack in
`docker-compose.yml`.

## Host Requirements

SonarQube uses Elasticsearch and requires higher Linux kernel limits. Set them
in the WSL distribution before starting the stack:

```bash
sudo sysctl -w vm.max_map_count=524288
sudo sysctl -w fs.file-max=131072
```

To keep the values after WSL restarts, add them to `/etc/sysctl.conf`.

## Start the Infrastructure Stack

From the repository root inside WSL:

```bash
cp .env.infra.example .env.infra
# Set a unique SONARQUBE_DB_PASSWORD in .env.infra before continuing.
docker compose --env-file .env.infra -f docker-compose.infra.yml up -d --build
```

Jenkins will be available at:

```text
http://localhost:8081
```

Mailpit will be available at:

```text
http://localhost:8025
```

SonarQube will be available at:

```text
http://localhost:9000
```

On first login, use `admin` / `admin` and change the administrator password
immediately. SonarQube stores its database, search indexes, extensions, and
logs in named Docker volumes.

Check startup health with:

```bash
docker compose --env-file .env.infra -f docker-compose.infra.yml ps
docker logs ticketbox-sonarqube
```

## Expose Jenkins Through Ngrok

Use ngrok when you need GitHub webhooks to reach local Jenkins.

Create the local infrastructure env file:

```bash
cp .env.infra.example .env.infra
```

Paste your ngrok auth token into `.env.infra`:

```dotenv
NGROK_AUTHTOKEN=<token-from-ngrok>
```

Start Jenkins, Mailpit, and ngrok together:

```bash
docker compose --env-file .env.infra -f docker-compose.infra.yml --profile tunnel up -d --build
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

## Stop the Infrastructure Stack

```bash
docker compose --env-file .env.infra -f docker-compose.infra.yml down
```

Jenkins and SonarQube data remain in named Docker volumes. Do not add
`--volumes` unless permanent deletion of that data is intended.

## Docker Access

The Jenkins container mounts `/var/run/docker.sock`, so Jenkins can run Docker
and Docker Compose commands against the WSL Docker Engine.

Use a stable app project name when deploying the app stack:

```bash
docker compose -p ticketbox up -d --build
```

That keeps application containers and volumes separate from the infrastructure
stack.
