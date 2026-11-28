# Proposal

## Why

Embedded apps such as Launcher and UI Kit are shown from durable user working copies. After a core update (git pull, Update, Rebuild, panel restart) those copies only adopted the new installed sources on the next Run/Build, so the panel kept showing old manifests (for example, no Settings tab from newly declared `componentLibraries`) although the person had just updated.

## What Changes

- After the panel starts, and when Rebuild or Update finishes, one visible `project-refresh` job brings every existing embedded working copy whose installed source changed up to date, using the same locked three-way merge as Run/Build.
- Discovery stays read-only and never-materialized projects stay unmaterialized.
- A refused refresh (conflicting local edit, interrupted or invalid state) fails the job and is shown on the project with how to recover; a project that is running or has a job is skipped and refreshed once it is idle. The next Run/Build behaves as before.

## Capabilities

### Modified Capabilities

- `control-panel`: Existing embedded working copies follow installed source updates after start, Rebuild and Update.

## Impact

- `packages/control-panel/src/embedded-project-state.ts`, `panel.ts`, `server.ts`, `jobs.ts`.
- `packages/control-panel/test/embedded-project-workflows.test.ts`, `rebuild-components.test.ts`.
- `docs/embedded-extensions.md`.
