# Spec Delta

## Purpose

What CI checks for a PR, a draft, `main` and the nightly run, the one check the `main` ruleset requires, and what
happens when the nightly run fails.

## ADDED Requirements

### Requirement: One required check
CI SHALL end with a `CI required` job that fails when any other CI job failed or was cancelled, and passes when every job
succeeded or was skipped as not needed. The `main` ruleset SHALL require only that check.

#### Scenario: Skipped host build
- **WHEN** a PR changes only `packages/sdk/`
- **THEN** the host build is skipped and `CI required` passes once the other jobs succeed

### Requirement: Jobs by changed paths
For a PR, CI SHALL always run the name guard and OpenSpec validation, SHALL run the Node tests when `packages/`,
`tools/`, `templates/`, the pnpm files or `ci.yml` change, and SHALL build the host and run its tests when `native/`,
`tools/fetch-deps/` or `ci.yml` change. Any other event SHALL run every job.

#### Scenario: Native change
- **WHEN** a PR changes a file under `native/host/`
- **THEN** CI builds the host and runs `host-tests`

### Requirement: Drafts skip heavy jobs
For a draft PR, CI SHALL skip the Node tests, the host build and the delivery check, and SHALL still run the name guard
and OpenSpec validation. Marking a PR ready or editing its body SHALL start a full run.

#### Scenario: Plan draft
- **WHEN** a draft PR holding a plan is pushed
- **THEN** only the name guard, OpenSpec and change detection run

#### Scenario: Ready
- **WHEN** the PR is marked ready
- **THEN** CI runs every job its changes need

### Requirement: Policy from the base commit
The scripts that decide readiness and delivery SHALL be read from the PR's base commit, not from its head.

#### Scenario: PR weakens the delivery script
- **WHEN** a PR changes the delivery check script
- **THEN** its own CI run still uses `main`'s version of the script

### Requirement: Nightly run
CI SHALL run every job on `main`'s head once a night, whatever changed. The nightly run SHALL cover builds and unit
tests only; checks that need a 3D display, a hand tracker or the rig's GPU stay manual.

#### Scenario: Quiet day
- **WHEN** no PR merged during the day
- **THEN** the nightly run still builds the host and runs every test suite on `main`

### Requirement: Nightly triage
When a nightly run fails, a workflow running as the repo's GitHub App SHALL open one draft PR `fix/nightly-<date>`
labelled `nightly-failure`, holding an OpenSpec change scaffold with the failed jobs, the run link and the last log
lines of each failed step, and linked to that change. While such a PR is open, later failures SHALL be added to it as
comments, and a green nightly run SHALL be noted on it. The workflow SHALL NOT merge, mark ready or arm auto-merge.

#### Scenario: First failure
- **WHEN** the nightly run fails and no `nightly-failure` PR is open
- **THEN** a draft PR with the failure summary is opened

#### Scenario: Repeated failure
- **WHEN** the nightly run fails again while that PR is open
- **THEN** no second PR is opened and the open one gets a comment with the new run's summary
