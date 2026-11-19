# ci-validation Specification

## Purpose
What CI checks for a PR, a draft, `main` and the nightly run, the one check the `main` ruleset requires, and what
happens when the nightly run fails.

## Requirements

### Requirement: One required check
CI SHALL end with a `CI required` job on every run that is not for a draft pull request, and that job SHALL run even when other jobs failed. It SHALL fail unless Readiness reported ready and Readiness, Changes, Name guard and OpenSpec succeeded; Node tests and Embedded public boundaries each succeeded when Changes selected them and were skipped when it did not; and Host build and tests succeeded on a scheduled or dispatched run and was skipped on every other run. A selected job that was skipped, failed, cancelled or missing SHALL fail the check. A draft pull request SHALL produce no `CI required` result. A skipped native host job on a PR SHALL NOT be represented as native validation having passed.

#### Scenario: Skipped host build
- **WHEN** a ready PR changes only `packages/sdk/`
- **THEN** the host build is skipped and `CI required` passes once the other jobs succeed

#### Scenario: Native change has no host build on the PR
- **WHEN** a ready PR changes files under `native/host/` and every selected PR check succeeds
- **THEN** the host build is skipped and `CI required` passes without claiming the host compiled

#### Scenario: Selected job did not run
- **WHEN** Changes selected Node tests or Embedded public boundaries and that job ended skipped, failed or cancelled
- **THEN** `CI required` fails

#### Scenario: Draft
- **WHEN** CI runs for a draft pull request
- **THEN** the `CI required` job is skipped and reports no result

### Requirement: Drafts skip heavy jobs
For a draft PR, CI SHALL run only Readiness, Changes, the name guard and OpenSpec validation; it SHALL skip Node tests, the Embedded public boundaries job and the host build, and SHALL produce no `CI required` result. Marking the PR ready, pushing to it, or editing its body or labels SHALL start a new CI run for its head commit, and a newer run for the same PR SHALL cancel that PR's run still in progress. The host build remains reserved for nightly or explicit dispatch on a ready PR as well.

#### Scenario: Plan draft
- **WHEN** a draft PR holding a plan is pushed
- **THEN** only Readiness, the name guard, OpenSpec and change detection run and no `CI required` result is produced

#### Scenario: Ready
- **WHEN** the PR is marked ready
- **THEN** CI runs every PR-eligible job its changes need but skips the host build

#### Scenario: Completed implementation
- **WHEN** a draft PR holding a completed implementation is marked ready
- **THEN** CI runs all applicable PR jobs on its head commit before `CI required` can pass

#### Scenario: New commit on a ready PR
- **WHEN** a commit is pushed to a ready PR while its previous CI run is in progress
- **THEN** the previous run is cancelled and CI runs all applicable PR jobs on the new head before `CI required` can pass

### Requirement: Nightly run
CI SHALL run every job on `develop`'s head once a night, whatever changed, including the full Windows host build and native tests. An explicit workflow dispatch SHALL also permit a full run on the selected ref. The nightly run SHALL cover builds and unit tests only; checks that need a 3D display, a hand tracker or the rig's GPU stay manual.

#### Scenario: Quiet day
- **WHEN** no PR merged during the day
- **THEN** the nightly run still builds the host and runs every test suite on `develop`

#### Scenario: Nightly native failure
- **WHEN** the scheduled host build or native tests fail on `develop`
- **THEN** `CI required` fails and the existing nightly triage reports the failure without retroactively blocking a merged PR

#### Scenario: Manual full check
- **WHEN** the maintainer dispatches CI for a ref before merging a sensitive native change
- **THEN** the full host build and tests run without changing the required PR check policy

### Requirement: Nightly triage
When a nightly run fails, a workflow SHALL read the completed run, jobs and logs with its trusted workflow token,
use that token for labels and triage comments, and use the repository GitHub App for the branch push and pull-request
creation. It SHALL open one draft PR
`fix/nightly-<date>` labelled `nightly-failure` and linked to an OpenSpec change. The draft SHALL use the normal
delivery layout with a proposal scoped to the failed run and jobs, two unchecked implementation outcomes and one
acceptance outcome. Its initial triage comment and generated change design SHALL contain the run link, failed jobs,
failed steps and bounded log excerpts. While such a PR is open, later failures SHALL be added to it as comments, and
a green nightly run SHALL be noted on it. The workflow SHALL NOT merge, mark ready or arm auto-merge.

#### Scenario: First failure
- **WHEN** the nightly run fails and no `nightly-failure` PR is open
- **THEN** an actionable draft repair PR is opened with the detailed failure evidence in its triage comment and change design

#### Scenario: Restricted repository App
- **WHEN** the repository App can write contents and pull requests but cannot read Actions runs or write Issues data
- **THEN** nightly triage uses the workflow token for run evidence, labels and comments while the App pushes the branch and creates the repair PR

#### Scenario: Repeated failure
- **WHEN** the nightly run fails again while that PR is open
- **THEN** no second PR is opened and the open one gets a comment with the new run's summary

#### Scenario: Recovery
- **WHEN** a nightly run succeeds while a `nightly-failure` PR is open
- **THEN** the open PR gets a comment identifying the green run and remains open for the maintainer

### Requirement: OpenSpec length advice does not block validation
CI SHALL validate every specification and active change with OpenSpec CLI version 1.11.0 in strict, non-interactive mode. Requirement text over 500 characters SHALL be reported as informational and SHALL NOT fail strict validation solely on length. Strict validation SHALL fail for other warnings and errors.

#### Scenario: Long requirement
- **WHEN** a change adds a valid requirement with more than 500 characters in its body
- **THEN** strict OpenSpec validation succeeds

#### Scenario: Invalid requirement
- **WHEN** a change adds a requirement without a scenario
- **THEN** strict OpenSpec validation fails and the OpenSpec job fails

### Requirement: Job selection by event and changed paths
CI SHALL run for pull requests into `develop`, pushes to `develop`, a nightly schedule and explicit dispatch. Every run SHALL execute Readiness, Changes, the name guard and OpenSpec validation. For a ready PR, CI SHALL run Node tests when a changed path is under `packages/`, `tools/`, `templates/`, `embedded/`, `native/plugin-sdk/` or `.github/`, or is the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or `tsconfig.json`; SHALL run the Embedded public boundaries job when a changed path is under `embedded/`, `native/host/`, `native/plugin-sdk/`, `packages/control-panel/`, `packages/desktop-package/`, `packages/sdk/`, `packages/ui-kit/`, `packages/app-icon/`, `tools/embedded/`, `tools/fetch-deps/` or `.github/`, or is one of those root files; and SHALL NOT run the host build or native host tests regardless of changed paths. Pushes to `develop` SHALL run Node tests and the Embedded public boundaries job regardless of changed paths and SHALL skip the host build. Scheduled runs and explicit dispatches SHALL also run host build/tests. Core CI SHALL NOT require private workspace source, assets or credentials. The Embedded public boundaries job SHALL perform a frozen public installation with dependency scripts disabled, strict production type checks and synthetic compiler/service/package boundary checks, without private credentials or hardware. The generic core-only build SHALL remain independent of optional device dependencies. Selected public checks that unexpectedly skip SHALL NOT produce a successful required aggregate.

#### Scenario: Native change
- **WHEN** a ready PR changes a file under `native/host/`
- **THEN** CI skips `Host build and tests`, selects the Embedded public boundaries job and does not select Node tests for that path alone

#### Scenario: CI workflow change
- **WHEN** a ready PR changes `ci.yml`
- **THEN** Node tests and the applicable embedded public-boundary checks are selected, host build/tests remain skipped, and no private workspace asset/runtime job is required

#### Scenario: Documentation-only change
- **WHEN** a ready PR changes only files under `docs/` or `openspec/`
- **THEN** neither Node tests nor the Embedded public boundaries job is selected, and the name guard and OpenSpec validation still run

#### Scenario: Develop push
- **WHEN** a change lands on `develop` and its push workflow runs
- **THEN** CI runs its non-host core jobs without checking out private workspace assets

#### Scenario: Explicit full run
- **WHEN** core CI is manually dispatched for a selected ref
- **THEN** it runs the full host build and native tests plus other applicable core jobs without private-repository credentials
