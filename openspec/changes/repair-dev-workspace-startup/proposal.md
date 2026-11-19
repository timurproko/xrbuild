## Why

The repository-development shortcut currently exits when its workspace dependency lock is stale because managed-tool setup uses a frozen install before the panel starts. A developer should be able to open the panel after pulling workspace changes without manually repairing its local dependency graph.

## What Changes

- Let repository-development shortcut startup reconcile a stale workspace dependency lock before starting managed tools.
- Keep the panel available when a nonessential managed-tool setup still fails, exposing its existing retryable failure instead of aborting all startup.
- Preserve frozen dependency installation for ordinary and explicitly selected workspaces.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: make repository-development launcher startup repair its own workspace dependencies and remain available when a managed tool cannot start.

## Impact

- Control-panel workspace dependency bootstrap and managed-tool startup behavior.
- Focused control-panel server and workspace setup tests.
- The repository workspace lock may be refreshed after a development shortcut detects it is stale.
