## MODIFIED Requirements

### Requirement: Jobs by changed paths
For a PR, core CI SHALL always run the name guard and OpenSpec validation, SHALL run Node tests when `packages/`, `tools/`, `templates/`, the pnpm files or `ci.yml` change, and SHALL NOT run the host build or native host tests regardless of changed paths. Main pushes SHALL run non-host core jobs. Scheduled main runs and explicit dispatches SHALL also run host build/tests. Core CI SHALL NOT require private workspace source, assets or credentials; private integration jobs belong to private CI. Ready public embedded-module, shared-contract, dependency and relevant compiler changes SHALL select the implemented Windows embedded public-boundary lane, including frozen public installation, strict production type checks and synthetic compiler/service/package boundary checks, without private credentials or hardware. The generic core-only build SHALL remain independent of optional device dependencies. Selected public checks that unexpectedly skip SHALL NOT produce a successful required aggregate.

#### Scenario: Native change
- **WHEN** a PR changes a file under `native/host/`
- **THEN** CI skips `Host build and tests` and still runs its other selected PR jobs

#### Scenario: CI workflow change
- **WHEN** a ready PR changes `ci.yml`
- **THEN** Node tests and the applicable embedded public-boundary checks are selected, host build/tests remain skipped, and no private workspace asset/runtime job is required

#### Scenario: Main push
- **WHEN** a change lands on main and its push workflow runs
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
