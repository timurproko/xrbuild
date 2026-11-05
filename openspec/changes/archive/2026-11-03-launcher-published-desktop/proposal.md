# Proposal

## Why

The launcher currently treats the native app host as a development origin because its hostname ends in `.local`. That adds test-only empty slots and can expose the launcher itself in the catalog even though the desktop launcher should mirror the published browser catalog. The launcher also draws a spatial mouse ring that is distracting in this catalog, while the Control Panel has no direct way to deliberately rebuild one app from its project context menu.

## What Changes

- Add **Rebuild** to the project-row context menu for projects with a valid build script. It always runs the app build, refreshes the build receipt and exposes the resulting background job in Activity without publishing or packaging.
- Treat only loopback browser origins as launcher development previews. Native desktop hosting reads and launches the configured published inventory exactly like the published browser launcher, with no local route substitution.
- Keep synthetic empty catalog slots only on loopback development previews.
- Embed the launcher's publication identity in its build so a native desktop launcher hosted at a root path can omit its own published catalog entry.
- Remove the launcher's visible spatial mouse ring while retaining mouse, hand and button interaction.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: add a deliberate per-project rebuild action to the existing context menu and job flow.
- `workspace-location`: distinguish loopback launcher previews from native hosting and align native desktop catalog behavior with the published inventory.

## Impact

- `packages/control-panel`: project context-menu markup and behavior, a force-rebuild project endpoint, and focused server/UI tests.
- `.xrbuild/projects/core/launcher`: origin classification, publication identity, catalog filtering, test-only placeholders, cursor presentation, documentation and focused tests/build.
- No project manifest schema, publisher contract, host channel or package format change.
