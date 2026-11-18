## MODIFIED Requirements

### Requirement: One required check
CI SHALL end with a `CI required` job that fails when any other CI job failed or was cancelled, and passes when every job succeeded or was skipped as not needed. The `develop` ruleset SHALL require only that check. A skipped native host job on a PR SHALL NOT be represented as native validation having passed.

#### Scenario: Skipped host build
- **WHEN** a PR changes only `packages/sdk/`
- **THEN** the host build is skipped and `CI required` passes once the other jobs succeed

#### Scenario: Native change has no host build on the PR
- **WHEN** a ready PR changes files under `native/host/` and every selected PR check succeeds
- **THEN** the host build is skipped and `CI required` passes without claiming the host compiled

### Requirement: Jobs by changed paths
For a PR, core CI SHALL always run the name guard and OpenSpec validation, SHALL run Node tests when `packages/`, `tools/`, `templates/`, the pnpm files or `ci.yml` change, and SHALL NOT run the host build or native host tests regardless of changed paths. Main pushes SHALL run non-host core jobs. Scheduled develop runs and explicit dispatches SHALL also run host build/tests. Core CI SHALL NOT require private workspace source, assets or credentials; private integration jobs belong to private CI. Ready public embedded-module, shared-contract, dependency and relevant compiler changes SHALL select the implemented Windows embedded public-boundary lane, including frozen public installation, strict production type checks and synthetic compiler/service/package boundary checks, without private credentials or hardware. The generic core-only build SHALL remain independent of optional device dependencies. Selected public checks that unexpectedly skip SHALL NOT produce a successful required aggregate.

#### Scenario: Native change
- **WHEN** a PR changes a file under `native/host/`
- **THEN** CI skips `Host build and tests` and still runs its other selected PR jobs

#### Scenario: CI workflow change
- **WHEN** a ready PR changes `ci.yml`
- **THEN** Node tests and the applicable embedded public-boundary checks are selected, host build/tests remain skipped, and no private workspace asset/runtime job is required

#### Scenario: Main push
- **WHEN** a change lands on develop and its push workflow runs
- **THEN** CI runs its non-host core jobs without checking out private workspace assets

#### Scenario: Explicit full run
- **WHEN** core CI is manually dispatched for a selected ref
- **THEN** it runs the full host build and native tests plus other applicable core jobs without private-repository credentials

#### Scenario: Hand Tracking Input bridge change
- **WHEN** a private input bridge source or distributed runtime changes in the private repository
- **THEN** its build, source/runtime consistency verification and helper self-tests belong to private CI and do not require a public-core job

#### Scenario: Unrelated private workspace change
- **WHEN** a private workspace document changes without a core change
- **THEN** the public core does not select or require a private runtime build for that document

#### Scenario: Private integration change
- **WHEN** a private workspace integration or pinned dependency changes in its own repository
- **THEN** its integration checks belong to that private repository rather than the public core's required check graph

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
