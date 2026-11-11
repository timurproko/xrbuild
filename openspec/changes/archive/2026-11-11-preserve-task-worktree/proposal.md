# Preserve task attachment through review

## Why

The shared Worktrees instruction tells agents to detach when handing off or finishing. Implementation completion still leaves review and possible bug fixes, so detaching unnecessarily loses the task checkout and its PR context.

## What Changes

- Keep the task attached after implementation completion and review handoff.
- Limit explicit detach to a maintainer request or task switch; retain runtime shutdown claim release.
- Update the focused instruction regression test without restoring inventory gates or internal recovery recipes.
- Preserve independent private clones, dependency setup, cleanup protection, and maintainer-only merge decisions.

## Impact

Root agent instructions and their focused test only. No product implementation, canonical spec, private workspace, cleanup, or runtime installation changes. This corrects repository guidance and does not require a new product package.
