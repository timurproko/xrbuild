# Proposal

## Why

Host rebuild progress currently has two implementations. Control Panel and Plugins Manager use the full dialog with status icons, a persistent Autoclose option and job actions, while registered tools create a reduced dialog with different spacing and controls. The visible result depends on which section starts the same rebuild action.

## What Changes

- Replace the separate panel and registered-tool rebuild presentations with one shared rebuild-progress component.
- Use the same status header, bounded output, dimensions, footer, Autoclose preference and completion/error states on Control Panel, Plugins Manager and every registered tool route.
- Keep rebuild execution in place over the active route and retain consistent access to the completed rebuild job.
- Add regression coverage that prevents route-specific rebuild-dialog markup or rendering from returning.

## Capabilities

- `dev-control-panel`: host rebuild progress is one component with one presentation and behavior across every section and registered tool.

## Impact

- Shared Control Panel design-system UI and navigation modules.
- Control Panel host-rebuild integration and focused UI regression tests.
- No rebuild endpoint, job model, workspace, plugin-build or restart-dialog changes.
