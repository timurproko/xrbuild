## Why

The default branch was renamed from `main` to `develop`. CI, the tools and the agent instructions already use the new
name, but four requirements in the canonical specifications still name `main`.

## What Changes

- Name `develop` wherever these requirements refer to the default branch. No behaviour changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ci-validation`: the required check, path-selected jobs and the nightly run name the `develop` branch.
- `change-delivery`: the agent session worktree context names the `develop` branch.

## Impact

Specifications only.
