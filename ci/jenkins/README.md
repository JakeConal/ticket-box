# Jenkins Module Pipelines

Create one Jenkins Multibranch Pipeline job per module and point each job at
the matching pipeline file:

| Module | Pipeline script path |
| --- | --- |
| API | `ci/jenkins/Jenkinsfile.api` |
| Web | `ci/jenkins/Jenkinsfile.web` |
| Checker | `ci/jenkins/Jenkinsfile.checker` |

Each pipeline includes test, SonarQube analysis, and build stages.
Successful non-PR branch builds also publish Docker images.

Each module pipeline checks the changed file list before running expensive
steps. If a pull request or branch update does not touch that module, the job
publishes a successful skipped status and does not run test, build, or image
publish stages.

Local CI image tags include the branch name and Jenkins build number. This lets
branch, pull request head, and pull request merge builds run concurrently
without overwriting the same local Docker tag.

## Requirements

Jenkins must be able to run Docker commands. The infrastructure stack in
`docker-compose.infra.yml` mounts the WSL Docker socket into Jenkins for this.

Start the infrastructure stack, including SonarQube, by following
`infra/README.md`. The pipelines run the pinned official SonarScanner image on
the `ticketbox-infra` Docker network, so no scanner installation or Jenkins
SonarQube plugin is required.

Create a Jenkins credential for Docker Hub:

```text
Kind: Username with password
ID: dockerhub-ticketbox
Username: your Docker Hub username
Password: a Docker Hub access token
```

Each Jenkinsfile exposes these parameters:

```text
DOCKER_IMAGE_NAMESPACE: jakecoop17
DOCKER_CREDENTIALS_ID: dockerhub-ticketbox
```

Create a Jenkins credential for GitHub status publishing:

```text
Kind: Username with password
ID: github-ticketbox
Username: your GitHub username
Password: a GitHub personal access token
```

The GitHub token needs:

```text
Contents: Read-only
Metadata: Read-only
Pull requests: Read-only
Commit statuses: Read and write
```

Create a SonarQube user token under:

```text
User menu -> My Account -> Security -> Generate Tokens
```

Store it in Jenkins as:

```text
Kind: Secret text
ID: sonarqube-ticketbox
Secret: the generated SonarQube token
```

The token owner must have permission to execute analysis and create the three
projects on their first scan. The pipelines create/use these project keys:

```text
ticketbox-api
ticketbox-web
ticketbox-checker
```

Analysis waits up to five minutes for the SonarQube quality gate and fails the
pipeline when the gate fails. API analysis also imports the JaCoCo XML report
produced by its test container.

SonarQube Community Build supports only main-branch analysis. The pipelines
therefore scan same-repository pull requests as isolated projects, using keys
such as `ticketbox-api-pr-4`, so a PR cannot overwrite the main project.
These scans enforce the quality gate against the complete PR snapshot; they do
not provide native changed-code analysis or GitHub PR decoration. Fork pull
requests remain excluded so untrusted code cannot access the SonarQube token.
Delete obsolete `*-pr-*` projects from SonarQube after their pull requests are
closed. Native pull request analysis and automatic cleanup require a SonarQube
edition that supports multibranch analysis.

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

## Module Change Filters

The API pipeline runs when these paths change:

```text
api/**
ci/docker/ticketbox-api-test.compose.yml
ci/jenkins/Jenkinsfile.api
```

The web pipeline runs when these paths change:

```text
ticketbox-web/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
ci/docker/ticketbox-web.Dockerfile
ci/jenkins/Jenkinsfile.web
```

The checker pipeline runs when these paths change:

```text
ticketbox-checker/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
ci/docker/ticketbox-checker.Dockerfile
ci/jenkins/Jenkinsfile.checker
```

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

## Published GitHub Checks

Each module pipeline publishes an explicit GitHub commit status:

```text
jenkins/ticketbox-api
jenkins/ticketbox-web
jenkins/ticketbox-checker
```

After each context appears on a pull request once, add those three checks to
the GitHub branch protection rule.
