## 1. SonarCloud Prerequisite

- [x] 1.1 Verify a SonarCloud organization exists and the three project keys (`ticketbox-api`, `ticketbox-web`, `ticketbox-checker`) are created or ready to auto-provision on first scan; verify a SonarCloud token is available
- [x] 1.2 Add `sonar.organization=<org>` to `api/sonar-project.properties`, `ticketbox-web/sonar-project.properties`, and `ticketbox-checker/sonar-project.properties`, and verify each file still parses as valid properties syntax

## 2. GitHub Repository Secrets

- [x] 2.1 Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets and verify they appear under Settings → Secrets and variables → Actions
- [x] 2.2 Add `SONAR_TOKEN` repository secret and verify it appears alongside the Docker Hub secrets

## 3. API Workflow

- [x] 3.1 Create `.github/workflows/ci-api.yml` triggered on push/pull_request with `paths: ['api/**']`, and verify it does not trigger on a commit touching only `ticketbox-web/**`
- [x] 3.2 Add a job step using `actions/setup-java` (Temurin, version matching `api/build.gradle`'s toolchain) plus a `services:` Redis container (`redis:8-alpine`), and verify `gradle test` runs and passes against that Redis service
- [x] 3.3 Add a SonarCloud analysis step (`sonarsource/sonarqube-scan-action`) reading the JaCoCo XML report already produced at `build/reports/jacoco/test/jacocoTestReport.xml`, and verify a scan appears on the `ticketbox-api` SonarCloud project with the quality gate evaluated
- [x] 3.4 Add a build+publish step (`docker/build-push-action`) publishing `docker.io/<namespace>/ticketbox-api:<branch>-<shortsha>` always and `:latest` only on main, gated to run only on non-pull_request events, and verify a manual workflow dispatch or push to a test branch produces the correctly tagged image in Docker Hub
- [x] 3.5 Push a same-repo test pull request touching `api/**` and verify: workflow triggers, tests run, SonarCloud quality gate is evaluated, no image is published, and a GitHub check status appears on the PR

## 4. Web Workflow

- [x] 4.1 Create `.github/workflows/ci-web.yml` triggered on push/pull_request with `paths` covering `ticketbox-web/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and verify it does not trigger on a commit touching only `api/**`
- [x] 4.2 Add `actions/setup-node` (version matching `ticketbox-web/Dockerfile`'s Node base image) plus `corepack enable` and `pnpm install --filter ticketbox-web... --frozen-lockfile`, and verify `pnpm --filter ticketbox-web exec tsc --noEmit` and `pnpm --filter ticketbox-web test:coverage` both run and pass, producing `lcov.info` at its natural workspace path
- [x] 4.3 Add a SonarCloud analysis step reading the LCOV report directly (no path-rewrite step needed), and verify a scan appears on the `ticketbox-web` SonarCloud project with the quality gate evaluated
- [x] 4.4 Add a build+publish step publishing `docker.io/<namespace>/ticketbox-web:<branch>-<shortsha>` always and `:latest` only on main, gated to non-pull_request events, and verify the correctly tagged image appears in Docker Hub
- [x] 4.5 Push a same-repo test pull request touching `ticketbox-web/**` and verify: workflow triggers, tests run, SonarCloud quality gate is evaluated, no image is published, and a GitHub check status appears on the PR

## 5. Checker Workflow

- [x] 5.1 Create `.github/workflows/ci-checker.yml` triggered on push/pull_request with `paths` covering `ticketbox-checker/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and verify it does not trigger on a commit touching only `ticketbox-web/**`
- [x] 5.2 Add `actions/setup-node` plus `npm ci` inside `ticketbox-checker/`, and verify `npm test` runs and passes
- [x] 5.3 Add a build+publish step publishing `docker.io/<namespace>/ticketbox-checker:<branch>-<shortsha>` always and `:latest` only on main, gated to non-pull_request events, and verify the correctly tagged image appears in Docker Hub (no SonarCloud step, matching current Jenkinsfile.checker's lack of coverage wiring)
- [x] 5.4 Push a same-repo test pull request touching `ticketbox-checker/**` and verify: workflow triggers, tests run, no image is published, and a GitHub check status appears on the PR

## 6. Fork PR Safety Verification

- [x] 6.1 Open (or simulate via a fork) a pull request from a fork touching one module and verify Docker Hub and SonarCloud secrets are not exposed to that run (job step reading a secret is empty/fails safely, no image is published) — verified via GitHub's documented, unconfigurable platform guarantee (repository secrets are withheld from `pull_request`-triggered runs whose head repo differs from the base repo; our workflows use plain `on: pull_request`, never `pull_request_target`) combined with the working `github.event.pull_request.head.repo.full_name == github.repository` conditional already confirmed live in PR #7's same-repo runs. No second GitHub account was available in this session to open a literal fork PR.

## 7. Dockerfile Cleanup

- [x] 7.1 Remove the `test` stage from `api/Dockerfile` and verify `docker build ./api` (default target) still succeeds
- [x] 7.2 Remove the `test` stage from `ticketbox-web/Dockerfile` and verify `docker build -f ticketbox-web/Dockerfile .` (default target) still succeeds
- [x] 7.3 Remove the `test` stage from `ticketbox-checker/Dockerfile` and verify `docker build ./ticketbox-checker` (default target) still succeeds

## 8. Jenkins and Self-Hosted SonarQube Retirement

- [x] 8.1 Remove `ci/jenkins/` (Jenkinsfile.api, Jenkinsfile.web, Jenkinsfile.checker, README.md) and verify the directory no longer exists
- [x] 8.2 Remove `infra/jenkins/Dockerfile` and verify the directory no longer exists
- [x] 8.3 Remove the `jenkins`, `sonarqube`, `sonarqube-db`, and `ngrok` services and their volumes from `docker-compose.infra.yml`, keeping `mailpit`, and verify `docker compose -f docker-compose.infra.yml config` still parses cleanly with only `mailpit` remaining
- [x] 8.4 Remove `charts/jenkins-values.yaml`, `charts/sonarqube-values.yaml`, `k8s/argocd/jenkins.yaml`, `k8s/argocd/sonarqube.yaml` and verify none of the four paths exist
- [x] 8.5 Update `infra/README.md` to remove the Jenkins startup, credential setup, and ngrok-tunnel sections, and verify the remaining content (Mailpit instructions) still reads coherently top-to-bottom

## 9. Final Verification

- [x] 9.1 Confirm all three workflows are green on the main branch after a full merge, and confirm no references to `ci/jenkins`, `infra/jenkins`, `jenkins-values.yaml`, or `sonarqube-values.yaml` remain anywhere in the repository (`git grep -i jenkins`, `git grep -i sonarqube` return only the kept `sonar-project.properties` files and this change's own OpenSpec artifacts)
