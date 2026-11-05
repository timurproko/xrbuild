# Proposal

## Why

Current Control Panel restart still directly creates the console-subsystem Node executable, which can briefly flash a terminal application on Windows. Rebuild from a managed workspace tool also navigates away to Control Panel and asks for confirmation before showing progress, while Restart already stays over the active tool and begins immediately.

## What Changes

- Route current Windows restart through `wscript.exe` and the existing hidden restart script.
- Launch replacement Node with Windows window style `0`, preserving the active route, arguments, environment and detached lifecycle without showing terminal UI.
- Make Rebuild from registered tools behave like Restart: remain on the active route, start immediately without confirmation and show live progress in a shared modal over that tool.
- Keep regression coverage for silent restart, in-place rebuild and the historical compatibility launcher contract.

## Capabilities

- `dev-control-panel`: maintenance actions execute explicitly from the shared navigation without leaving the current registered tool; rebuild progress remains visible over the active route and no longer requires a confirmation step.

## Impact

- Shared Control Panel/tool navigation and progress-dialog presentation.
- Control Panel restart invocation and focused regression coverage.
- No route, port, workspace, rebuild endpoint or ordinary launcher changes.
