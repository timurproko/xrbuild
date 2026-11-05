# ci-validation Specification

## Purpose
What CI checks for a PR, a draft, `main` and the nightly run, the one check the `main` ruleset requires, and what
happens when the nightly run fails.

## Requirements

### Requirement: One required check
CI SHALL end with a `CI required` job that fails when any other CI job failed or was cancelled, and passes when every job succeeded or was skipped as not needed. The `main` ruleset SHALL require only that check. A skipped native host job on a PR SHALL NOT be represented as native validation having passed.

#### Scenario: Skipped host build
- **WHEN** a PR changes only `packages/sdk/`
- **THEN** the host build is skipped and `CI required` passes once the other jobs succeed

#### Scenario: Native change has no host build on the PR
- **WHEN** a ready PR changes files under `native/host/` and every selected PR check succeeds
- **THEN** the host build is skipped and `CI required` passes without claiming the host compiled

### Requirement: Jobs by changed paths
For a PR, CI SHALL always run the name guard and OpenSpec validation, SHALL run the Node tests when `packages/`, `tools/`, `templates/`, the pnpm files or `ci.yml` change, SHALL run a Windows Hand Tracking Input runtime build/test job when its native bridge source, distributed runtime, dependency manifest or CI selection changes, and SHALL NOT run the host build or host native tests regardless of changed paths. A push to `main` SHALL run the non-host jobs. A scheduled `main` run and an explicit dispatch SHALL also run the host build and tests.

#### Scenario: Native change
- **WHEN** a PR changes a file under `native/host/`
- **THEN** CI skips `Host build and tests` and still runs its other selected PR jobs

#### Scenario: Hand Tracking Input bridge change
- **WHEN** a ready PR changes the Hand Tracking Input native bridge source, distributed runtime manifest/files or the CI workflow selecting them
- **THEN** Windows CI builds and tests the helper source, verifies the distributed runtime matches its declared source inputs, and runs the distributed helper self-tests before `CI required` can pass

#### Scenario: Unrelated private workspace change
- **WHEN** a ready PR changes a private workspace document outside the Hand Tracking Input native bridge/runtime paths
- **THEN** CI does not run the Hand Tracking Input runtime build job solely for that document

#### Scenario: CI workflow change
- **WHEN** a PR changes `ci.yml`
- **THEN** the Node, workspace-asset and Hand Tracking Input runtime jobs remain selected but `Host build and tests` is skipped

#### Scenario: Main push
- **WHEN** a change lands on `main` and its push workflow runs
- **THEN** CI runs its non-host jobs, including the Hand Tracking Input runtime job, and skips `Host build and tests`

#### Scenario: Explicit full run
- **WHEN** the CI workflow is manually dispatched for a selected ref
- **THEN** it runs the full host build and native tests as well as the other applicable jobs

### Requirement: Drafts skip heavy jobs
For a draft PR, CI SHALL skip Node tests, host build and the delivery check while running name guard and OpenSpec validation. A draft SHALL NOT be promoted on the basis of a lightweight CI pass. Trusted readiness automation SHALL promote only a complete linked implementation draft; its ready event SHALL trigger all applicable PR checks, and the finalizer's archive commit SHALL trigger exact-head PR validation again. The host build remains reserved for nightly or explicit dispatch even after promotion.

#### Scenario: Plan draft
- **WHEN** a draft PR holding a plan is pushed
- **THEN** only the name guard, OpenSpec and change detection run and the PR remains draft

#### Scenario: Ready
- **WHEN** the PR is marked ready
- **THEN** CI runs every PR-eligible job its changes need but skips the host build

#### Scenario: Completed implementation
- **WHEN** trusted automation promotes a completed draft to ready and finalizes it on its branch
- **THEN** CI runs all applicable PR jobs on the final commit before `CI required` can make it merge-eligible

### Requirement: Policy from the base commit
Scripts that decide readiness, promotion and delivery SHALL be read from the PR's base commit, not from its head; PR files SHALL be treated as data, not executed with the App credential.

#### Scenario: PR weakens the delivery script
- **WHEN** a PR changes readiness or delivery scripts
- **THEN** its own trusted workflow still runs `main`'s versions of those scripts

### Requirement: Nightly run
CI SHALL run every job on `main`'s head once a night, whatever changed, including the full Windows host build and native tests. An explicit workflow dispatch SHALL also permit a full run on the selected ref. The nightly run SHALL cover builds and unit tests only; checks that need a 3D display, a hand tracker or the rig's GPU stay manual.

#### Scenario: Quiet day
- **WHEN** no PR merged during the day
- **THEN** the nightly run still builds the host and runs every test suite on `main`

#### Scenario: Nightly native failure
- **WHEN** the scheduled host build or native tests fail on `main`
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
The OpenSpec CLI pinned for CI and finalization SHALL report requirement text over 500 characters as informational rather than failing strict validation solely on length. CI and finalization SHALL retain strict validation for other warnings and errors.

#### Scenario: Long requirement
- **WHEN** a change adds a valid requirement with more than 500 characters in its body
- **THEN** finalization syncs it into the canonical spec and strict OpenSpec validation succeeds

#### Scenario: Invalid requirement
- **WHEN** a change adds a requirement without a scenario
- **THEN** strict OpenSpec validation fails and the finalizer does not commit the archive
