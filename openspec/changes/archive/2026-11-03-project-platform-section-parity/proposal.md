# Proposal

## Why

The imported Hand Tracking diagnostic is currently a `test` project, so it does not receive the normal Desktop,
Station, WebXR and headset platform tabs available to app projects. Named project sections can also remain visible
after their final project is archived, deleted or moved away, leaving an empty `Drag projects here.` section.

Imported interactive samples should behave like ordinary apps, and every named section should disappear when the
operation removing its last project leaves that section empty.

## What Changes

- Make the Hand Tracking sample an app project so imported copies use the normal platform tabs and per-platform
  runtime settings.
- Remove a named section when archive, delete or drag/move removes its final project. Keep explicitly created empty
  sections until they have held a project, and keep a section while any project remains.
- Ignore orphan empty section folders that are neither saved as intentional sections nor occupied by projects.
- Exclude `projects/archive/` from workspace package discovery so archiving a package project does not make the
  workspace lock stale or prevent the panel from starting.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: align imported interactive samples with ordinary app platform selection and prune sections
  emptied by project lifecycle operations.

## Impact

- `packages/control-panel`: layout cleanup, delete lifecycle integration, project-list tests and specification.
- Hand Tracking sample manifest and integration test.
- No host ABI, plugin ABI, package format or sample-copy safety change.
