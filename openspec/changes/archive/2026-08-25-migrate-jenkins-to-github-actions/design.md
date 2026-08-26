## Context

Three Jenkinsfiles (`ci/jenkins/Jenkinsfile.{api,web,checker}`) share near-identical stage structure — Checkout (with a hand-rolled `changedFilesForBuild()`/`hasRelevantChanges()` git-diff filter), Test, SonarQube Analysis (main branch or trusted same-repo PR only, using isolated `*-pr-<id>` project keys because SonarQube Community can't do native PR decoration), Build, and Publish Image (non-PR only, `<branch>-<shortsha>` + `latest`-on-main). Each Jenkinsfile also duplicates a `publishGithubStatus()` curl-based GitHub status function. Jenkins itself runs via `docker-compose.infra.yml` with `/var/run/docker.sock` mounted so it can shell out to `docker build`/`docker compose`; `ngrok` exists solely to tunnel Jenkins to GitHub for webhooks. `api/Dockerfile`, `ticketbox-web/Dockerfile`, and `ticketbox-checker/Dockerfile` each have a `test` build stage that Jenkins invokes via `docker build --target test`. Coverage for web currently requires copying an LCOV file out of the test container and rewriting its internal paths (`sed 's|SF:/workspace/ticketbox-web/|SF:|'`) before the SonarQube scanner can read it. See proposal.md for why this is changing now.

## Goals / Non-Goals

**Goals:**
- Full behavioral parity with today's pipeline outcomes: same test-then-analyze-then-build-then-publish ordering, same tag scheme, same fork-PR credential safety, same per-module independence.
- Eliminate Docker-in-Docker/docker.sock entirely — GitHub-hosted runners provide a real Docker daemon natively.
- Eliminate the SonarQube Community PR-isolation workaround by using SonarCloud's native PR decoration.
- Simplify coverage wiring by running tests natively on the runner instead of inside a Docker build stage.
- Fully retire the self-hosted Jenkins and SonarQube infrastructure (compose services, Dockerfiles, k8s/ArgoCD scaffolding) rather than leaving it running unused.

**Non-Goals:**
- No changes to application code, `docker-compose.yml` (the runtime stack), or the runtime chart (`charts/ticketbox-app`) from `kubernetes-app-workloads` — this change is CI-only.
- No CD/deploy stage (bumping `charts/ticketbox-app/values.yaml` image tags and triggering an ArgoCD sync) — that was already scoped out of `kubernetes-app-workloads` as a separate future change and stays separate here too; this change only re-homes CI, it doesn't add deployment automation.
- No self-hosted GitHub Actions runner — SonarCloud's public reachability removes the only reason one was being considered.
- No monitoring/observability work — unrelated thread from the same exploration session, tracked separately if picked up.

## Decisions

**Three separate workflow files, not one shared/matrix workflow**: mirrors the existing three-Jenkinsfile structure exactly, keeping the migration a mechanical 1:1 translation per module rather than a redesign. Alternative considered: a single workflow with three path-filtered jobs, or a reusable `workflow_call` shared by three thin caller workflows — rejected for this pass because it adds an abstraction layer before there's a second migration to justify deduplicating against; can be revisited later if the duplication becomes painful.

**Trigger-level `paths:` filters, not job-level `dorny/paths-filter`**: Actions' native `on.push.paths` / `on.pull_request.paths` means a workflow run simply never starts for irrelevant changes — closer to Jenkins' status-skip UX in effect (no noisy failed/pending check) and needs no extra action or job-skip logic. Trade-off: unlike Jenkins' current behavior (which always posts a status, "skipped" included), a filtered-out workflow posts no check at all rather than an explicit skipped-with-reason status. Accepted — GitHub already shows "Some checks haven't completed yet" distinctly from a failure, and no one has asked for an explicit skipped status.

**Native runner test execution (Option B), not `docker build --target test`**: removes the LCOV extract-and-path-rewrite hack for web, and lets api's JaCoCo XML land exactly where `api/sonar-project.properties` already expects it (`build/reports/jacoco/test/jacocoTestReport.xml`) with zero extra steps. Trade-off: the runner's toolchain versions (JDK 25, Node 22) must now be pinned explicitly in the workflow (`actions/setup-java`, `actions/setup-node`) rather than being implicitly correct via the Dockerfile's base image — a version could drift between the workflow and the Dockerfile's final-stage base image if not kept in sync manually. Mitigated by using the same version numbers already pinned in each Dockerfile.

**Drop the `test` stage from all three Dockerfiles**: dead weight once CI never invokes `docker build --target test`. Alternative considered: leave the stages in for local debugging convenience — rejected per explicit user direction; a developer who wants to reproduce CI locally can run the native test commands directly (`gradle test`, `pnpm test`, `npm test`), which is what CI itself now does.

**Redis via Actions' native `services:` block for the api workflow**: direct 1:1 replacement for `ci/docker/ticketbox-api-test.compose.yml` — Actions spins up and health-checks a `redis:8-alpine` sidecar container for the job, reachable at `localhost:6379`, no Compose file needed.

**SonarCloud, not self-hosted SonarQube reachable via a tunnel or self-hosted runner**: SonarCloud is public, so any GitHub-hosted runner reaches it with no networking setup. This also removes the only reason a self-hosted Actions runner was being considered (network locality to `sonarqube:9000`), which in turn keeps the docker.sock/Kaniko problem fully off the table — GitHub-hosted runners never needed privileged Docker access here. Existing `sonar-project.properties` files carry over unchanged aside from adding `sonar.organization`; SonarCloud reads them the same way the self-hosted scanner did. PR analysis is native to SonarCloud (same project key, inline PR comments), replacing the `*-pr-<id>` isolated-project-key trick used for SonarQube Community.

**`docker/build-push-action` + `docker/metadata-action` for the Publish stage**: standard, well-maintained actions that replicate the current manual `docker login`/`tag`/`push`/`logout` shell block with less code and built-in caching support (out of scope to configure now, but available later without further redesign).

**Fork-PR safety via Actions' default secret scoping**: forked-repo `pull_request` workflow runs do not receive repository secrets by default, which is a stronger, built-in guarantee than Jenkins' manual `env.CHANGE_FORK` check — no equivalent conditional logic needs to be written.

**Full retirement of Jenkins + self-hosted SonarQube, not a parallel-run period**: per explicit user direction — once GitHub Actions covers full pipeline parity, there's no reason to keep unused infrastructure running (compose services, `infra/jenkins/Dockerfile`, `charts/jenkins-values.yaml`, `charts/sonarqube-values.yaml`, `k8s/argocd/{jenkins,sonarqube}.yaml`). `mailpit` in `docker-compose.infra.yml` is unrelated to CI and stays; `ngrok` existed only to tunnel Jenkins webhooks and is removed alongside it.

## Risks / Trade-offs

- **[Risk]** Toolchain version drift between each Dockerfile's final-stage base image and the workflow's `setup-java`/`setup-node` version pin (both now independently declared). → *Mitigation*: use the exact same version strings already pinned in each Dockerfile when writing the workflow files; revisit only if this repo starts tracking toolchain versions in a shared place.
- **[Risk]** SonarCloud is a new external dependency requiring account/project setup (org, project keys, token) before the workflows can succeed — this is a manual setup step outside this change's file-level scope. → *Mitigation*: proposal.md's Impact section calls this out explicitly as a prerequisite; tasks.md will include a setup-verification task rather than assuming it's already done.
- **[Risk]** No parallel-run/rollback window once Jenkins is removed in the same change — if a GitHub Actions workflow has a bug, there's no fallback CI system. → *Mitigation*: accepted per explicit user direction (full retirement, not a staged cutover); the workflows should be validated (e.g. via a draft PR) before the Jenkins removal commit lands, if that ordering is achievable within tasks.md.
- **[Trade-off]** Losing the always-posted "skipped, no changes" GitHub status for untouched modules (trigger-level path filtering means no run, hence no status at all) in exchange for simpler workflow files with no manual diffing logic — accepted, no functional loss for branch protection purposes since GitHub distinguishes "no check ran" from "check failed."

## Migration Plan

1. Add SonarCloud project setup (org + three project keys) as an external prerequisite — not a file change in this repo, called out in tasks.md for verification.
2. Add the three GitHub Actions workflow files with test, SonarCloud analysis, and publish stages; add `sonar.organization` to each module's `sonar-project.properties`.
3. Verify each workflow end-to-end on a real PR and branch push (path filtering, tests, quality gate, image publish, tag scheme) before removing anything.
4. Strip the `test` stage from all three Dockerfiles once native test execution is verified working in Actions.
5. Remove `ci/jenkins/`, `infra/jenkins/Dockerfile`, the Jenkins/SonarQube/ngrok services and volumes from `docker-compose.infra.yml`, the k8s/ArgoCD Jenkins/SonarQube scaffolding, and update `infra/README.md`.
6. Rollback (if needed before step 5): keep using the existing Jenkins pipelines; the new workflow files can coexist harmlessly with Jenkins until step 5 actually removes it, since GitHub Actions and Jenkins triggering off the same repo don't conflict with each other.

## Open Questions

None — schema/tooling decisions (three separate workflows, native test execution, SonarCloud, full retirement) were all resolved during the openspec-explore conversation prior to this proposal.
