## MODIFIED Requirements

### Requirement: One required check
CI SHALL end with a `CI required` job that fails when any other CI job failed or was cancelled, and passes when every job succeeded or was skipped as not needed. The `main` ruleset SHALL require only that check. A skipped native host job on a PR SHALL NOT be represented as native validation having passed.

#### Scenario: Skipped host build
- **WHEN** a PR changes only `packages/sdk/`
- **THEN** the host build is skipped and `CI required` passes once the other jobs succeed

#### Scenario: Native change has no host build on the PR
- **WHEN** a ready PR changes files under `native/host/` and every selected PR check succeeds
- **THEN** the host build is skipped and `CI required` passes without claiming the host compiled

### Requirement: Jobs by changed paths
For a PR, CI SHALL always run the name guard and OpenSpec validation, SHALL run the Node tests when `packages/`, `tools/`, `templates/`, the pnpm files or `ci.yml` change, and SHALL NOT run the host build or native tests regardless of changed paths. A push to `main` SHALL run the non-native jobs. A scheduled `main` run and an explicit dispatch SHALL also run the host build and tests.

#### Scenario: Native change
- **WHEN** a PR changes a file under `native/host/`
- **THEN** CI skips `Host build and tests` and still runs its other selected PR jobs

#### Scenario: CI workflow change
- **WHEN** a PR changes `ci.yml`
- **THEN** the Node and workspace-asset jobs remain selected but `Host build and tests` is skipped

#### Scenario: Main push
- **WHEN** a change lands on `main` and its push workflow runs
- **THEN** CI runs its non-native jobs and skips `Host build and tests`

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
