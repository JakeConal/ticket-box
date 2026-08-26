# Capability: github-actions-ci

## Purpose

Defines the automated build/test/analyze/publish behavior GitHub Actions must provide for the api, web, and checker modules, replacing the equivalent behavior Jenkins previously provided so pull requests and branch builds keep getting fast, accurate feedback without a self-hosted CI server.

## Requirements

### Requirement: Each module has an independently triggered pipeline
The api, web, and checker modules SHALL each have their own GitHub Actions workflow that runs only when files relevant to that module change, so an unrelated module's change does not trigger unnecessary work.

#### Scenario: Change touches only one module
- **WHEN** a push or pull request changes only files under `api/**`
- **THEN** the api workflow runs and the web and checker workflows do not run

#### Scenario: Change touches no module-relevant files
- **WHEN** a push or pull request changes only files outside all three modules' path filters (e.g. root `README.md`)
- **THEN** none of the three workflows run

### Requirement: Tests run on every triggering push and pull request
A workflow SHALL run its module's automated test suite on every push and pull request that triggers it, and SHALL fail the workflow if any test fails.

#### Scenario: Tests pass
- **WHEN** a triggering push or pull request's test suite passes
- **THEN** the workflow proceeds to analysis and later stages

#### Scenario: Tests fail
- **WHEN** a triggering push or pull request's test suite fails
- **THEN** the workflow stops and reports a failed check on the commit/pull request; later stages (analysis, build, publish) do not run

### Requirement: Code analysis runs against SonarCloud for visibility
A workflow SHALL submit its module's source and coverage data to SonarCloud for analysis on both main-branch builds and same-repository pull requests, so analysis results and any inline PR comments are available, without failing the workflow based on the SonarCloud quality gate result.

#### Scenario: Analysis completes
- **WHEN** SonarCloud analysis completes, regardless of quality gate outcome
- **THEN** the workflow proceeds to the build stage

#### Scenario: Pull request from a fork
- **WHEN** a pull request originates from a fork (not the same repository)
- **THEN** the workflow SHALL NOT expose Docker Hub or SonarCloud credentials to that pull request's run

### Requirement: Successful main-branch builds publish a Docker image
A workflow SHALL build and publish a Docker image for its module to the same Docker Hub repository used today, tagged with both a `<branch>-<short-sha>` tag and, only on the main branch, a `latest` tag. Publishing SHALL NOT occur for pull request builds.

#### Scenario: Main branch build succeeds through tests and analysis
- **WHEN** a push to the main branch passes tests and SonarCloud analysis completes
- **THEN** the workflow builds and pushes the module's image tagged `main-<short-sha>` and `latest`

#### Scenario: Pull request build succeeds through tests and analysis
- **WHEN** a pull request build passes tests and SonarCloud analysis completes
- **THEN** the workflow does not push any image

#### Scenario: Non-main branch push succeeds through tests and analysis
- **WHEN** a push to a branch other than main passes tests and SonarCloud analysis completes
- **THEN** the workflow builds and pushes the module's image tagged `<branch>-<short-sha>` only (no `latest` tag)

### Requirement: Commit and pull request status reflects pipeline outcome
GitHub SHALL show a check status on the triggering commit or pull request reflecting whether the workflow passed or failed, without requiring any custom status-posting code in the workflow.

#### Scenario: Workflow succeeds
- **WHEN** a workflow run completes all its stages successfully
- **THEN** the corresponding GitHub check shows a success status on that commit/pull request

#### Scenario: Workflow fails at any stage
- **WHEN** a workflow run fails at any stage (test, analysis, build, or publish)
- **THEN** the corresponding GitHub check shows a failure status on that commit/pull request
