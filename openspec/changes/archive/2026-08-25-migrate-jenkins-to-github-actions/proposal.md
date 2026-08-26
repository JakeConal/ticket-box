## Why

Jenkins CI today runs three near-identical pipelines (api/web/checker) built on hand-rolled machinery — manual git-diff path filtering, a custom GitHub status curl call, `docker.sock`-mounted builds, and a workaround for SonarQube Community's lack of native PR analysis (isolated `*-pr-<id>` project keys). None of this has a clean path onto Kubernetes (the earlier `kubernetes-app-workloads` migration already deferred it, flagging Kaniko as "the largest single change"), and every piece of custom logic has a native, zero-maintenance equivalent in GitHub Actions. Migrating removes the docker.sock/Kaniko problem entirely (GitHub-hosted runners have Docker natively) and replaces the SonarQube Community PR-isolation hack with SonarCloud's built-in PR decoration.

## What Changes

- Add three GitHub Actions workflows (`.github/workflows/ci-api.yml`, `ci-web.yml`, `ci-checker.yml`), one per module, mirroring the current Jenkinsfile split.
- Each workflow triggers on `push`/`pull_request` with native `paths:` filters, replacing the current `changedFilesForBuild()`/`hasRelevantChanges()` custom diff logic.
- Tests run natively on GitHub-hosted runners (not inside a Docker build stage): `actions/setup-java` + `gradle test` for api, `actions/setup-node` + `pnpm test`/`tsc --noEmit` for web, `actions/setup-node` + `npm test` for checker. The api workflow uses a native Actions `services:` Redis container, replacing `ci/docker/ticketbox-api-test.compose.yml`.
- Replace self-hosted SonarQube analysis with SonarCloud (`sonarsource/sonarqube-scan-action`), using the existing per-module `sonar-project.properties` files plus a new `sonar.organization` key. SonarCloud's native PR decoration replaces the current `*-pr-<id>` isolated-project-key workaround.
- Docker is used only for the final image build/push step (`docker/build-push-action`), publishing to the same `docker.io/<namespace>/ticketbox-<module>` repositories with the same `<branch>-<shortsha>` + `latest`-on-main tagging scheme.
- GitHub commit status reporting is handled natively by Actions checks; the custom `publishGithubStatus()` curl function is removed.
- Strip the now-unused `test` build stage from `api/Dockerfile`, `ticketbox-web/Dockerfile`, and `ticketbox-checker/Dockerfile` (tests no longer run inside Docker).
- **BREAKING (infra removal)**: Retire Jenkins and self-hosted SonarQube entirely:
  - Remove `ci/jenkins/` (Jenkinsfile.api, Jenkinsfile.web, Jenkinsfile.checker, README.md)
  - Remove `infra/jenkins/Dockerfile`
  - Remove the `jenkins`, `sonarqube`, `sonarqube-db`, and `ngrok` services (plus their volumes) from `docker-compose.infra.yml` — `ngrok` existed only to tunnel Jenkins webhooks and has no purpose without it; `mailpit` is unrelated and stays
  - Remove `charts/jenkins-values.yaml`, `charts/sonarqube-values.yaml`, `k8s/argocd/jenkins.yaml`, `k8s/argocd/sonarqube.yaml` (Kubernetes scaffolding from the earlier migration, now moot)
  - Update `infra/README.md` to drop the Jenkins/ngrok sections
  - The per-module `sonar-project.properties` files (`api/`, `ticketbox-web/`, `ticketbox-checker/`) are kept as-is — SonarCloud reads them directly

## Capabilities

### New Capabilities
- `github-actions-ci`: Automated build/test/analyze/publish pipeline for the api, web, and checker modules, running on GitHub Actions with path-filtered triggers, native test execution, SonarCloud analysis, and Docker Hub image publishing.

### Modified Capabilities
<!-- No existing specs describe CI/CD or infrastructure behavior; this is purely additive/removal at the tooling layer. -->

## Impact

- **New files**: `.github/workflows/ci-api.yml`, `.github/workflows/ci-web.yml`, `.github/workflows/ci-checker.yml`.
- **Modified files**: `api/Dockerfile`, `ticketbox-web/Dockerfile`, `ticketbox-checker/Dockerfile` (drop `test` stage); `docker-compose.infra.yml` (drop jenkins/sonarqube/sonarqube-db/ngrok services + volumes); `infra/README.md` (drop Jenkins/ngrok sections); `api/sonar-project.properties`, `ticketbox-web/sonar-project.properties`, `ticketbox-checker/sonar-project.properties` (add `sonar.organization`).
- **Removed files**: `ci/jenkins/**`, `infra/jenkins/Dockerfile`, `charts/jenkins-values.yaml`, `charts/sonarqube-values.yaml`, `k8s/argocd/jenkins.yaml`, `k8s/argocd/sonarqube.yaml`.
- **New external dependencies**: SonarCloud (replaces self-hosted SonarQube); GitHub Actions secrets for Docker Hub credentials and a SonarCloud token (replacing the Jenkins credential store entries `dockerhub-ticketbox`, `github-ticketbox`, `sonarqube-ticketbox`).
- **No changes** to application code (`api/src`, `ticketbox-web/src`, `ticketbox-checker/`) or to `docker-compose.yml` (the application runtime stack) — this only changes how CI builds, tests, and publishes.
- **Depends on**: a GitHub organization/account on SonarCloud with the three projects created (or auto-provisioned on first scan) and a Docker Hub account/namespace — both external to this repo, treated as a setup prerequisite, not built by this change.
