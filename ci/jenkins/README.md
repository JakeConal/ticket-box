# Jenkins Module Pipelines

Create one Jenkins Multibranch Pipeline job per module and point each job at
the matching pipeline file:

| Module | Pipeline script path |
| --- | --- |
| API | `ci/jenkins/Jenkinsfile.api` |
| Web | `ci/jenkins/Jenkinsfile.web` |
| Checker | `ci/jenkins/Jenkinsfile.checker` |

Each pipeline includes test and build stages.
Successful non-PR branch builds also publish Docker images.

## Requirements

Jenkins must be able to run Docker commands. The infrastructure stack in
`docker-compose.infra.yml` mounts the WSL Docker socket into Jenkins for this.

Create a Jenkins credential for Docker Hub:

```text
Kind: Username with password
ID: dockerhub-ticketbox
Username: your Docker Hub username
Password: a Docker Hub access token
```

Each Jenkinsfile exposes these parameters:

```text
DOCKER_IMAGE_NAMESPACE: your Docker Hub namespace or organization
DOCKER_CREDENTIALS_ID: dockerhub-ticketbox
```

## Suggested Jenkins Jobs

- `ticketbox-api`
- `ticketbox-web`
- `ticketbox-checker`

Use Multibranch Pipeline, configure the GitHub branch source, then set:

```text
Build Configuration
Mode: by Jenkinsfile
```

Set `Script Path` per job:

```text
ticketbox-api: ci/jenkins/Jenkinsfile.api
ticketbox-web: ci/jenkins/Jenkinsfile.web
ticketbox-checker: ci/jenkins/Jenkinsfile.checker
```

The web and checker Jenkinsfiles use Docker builds for module tests and builds.
The API Jenkinsfile uses a CI-only Compose file so Spring tests can run with a
Redis sidecar. This avoids mounting Jenkins workspaces into sibling containers,
which is unreliable when Jenkins itself is running in Docker.

## Published Images

Branch builds publish immutable branch/SHA tags:

```text
docker.io/<namespace>/ticketbox-api:<branch>-<short-sha>
docker.io/<namespace>/ticketbox-web:<branch>-<short-sha>
docker.io/<namespace>/ticketbox-checker:<branch>-<short-sha>
```

The `main` branch also publishes:

```text
docker.io/<namespace>/ticketbox-api:latest
docker.io/<namespace>/ticketbox-web:latest
docker.io/<namespace>/ticketbox-checker:latest
```

Pull request builds do not push images. This avoids publishing untrusted code
and keeps fork PRs away from Docker registry credentials.
