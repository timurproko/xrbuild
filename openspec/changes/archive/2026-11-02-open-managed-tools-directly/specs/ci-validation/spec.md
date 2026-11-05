## MODIFIED Requirements

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
