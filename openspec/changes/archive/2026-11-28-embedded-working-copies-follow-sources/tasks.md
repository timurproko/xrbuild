# Tasks

## 1. Existing embedded working copies follow installed source updates after start, Rebuild and Update

- [x] 1.1 Add a read-only staleness check and an existing-only locked refresh in `embedded-project-state.ts`, sharing the Run/Build preparation path.
- [x] 1.2 Run one visible `project-refresh` job after panel start and after successful Rebuild and Update; skip busy projects and retry them once idle.
- [x] 1.3 Show refused or pending refreshes on the project (`refreshProblem` and project errors) and clear them after a successful refresh or Run/Build.
- [x] 1.4 Cover stale refresh with new manifest fields, read-only discovery, unmaterialized projects, conflicts and running projects in focused control-panel tests.
- [x] 1.5 Document the behavior in `docs/embedded-extensions.md`.
