## Why

The Apps sidebar can show duplicate section headings and empty drop placeholders instead of one combined library. Launcher development runs can fail to read that library because the development origin is not covered by catalog access and browser development previews do not carry the context Launcher expects.

## What Changes

- Display each logical section once, combining embedded and user projects, with one trailing Unsorted group.
- Hide sections without active projects, including empty Unsorted; retain stored organization and a usable section-creation workflow.
- Supply explicit selected-panel catalog context to Browser and Desktop development runs and allow the bounded read-only catalog resources from loopback development origins.
- Preserve sidebar order in Launcher, omit archived/ineligible apps and Launcher itself, and retain publication inventory behavior without explicit panel context.
- Add focused layout, sidebar browser, launch-context, HTTP-origin and Launcher catalog regression tests.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: nonempty combined sidebar groups and consistent local Launcher ordering.
- `workspace-location`: bounded local catalog access for panel-owned development runs.

## Impact

Core-owned control-panel layout/UI/server/launch code and the approved embedded Launcher. No private workspace clone, private source changes, product-folder movement, dependency installation policy changes, publication deployment or native host changes are required.
