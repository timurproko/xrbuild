## Why

After pulling core changes, a Start-menu shortcut can exit without opening anything when the core's Node dependencies are missing. The current launcher enters the panel server directly; a missing package can fail during static imports before the panel initializes its log or browser UI. Developers should see what is happening and have the missing packages installed automatically, without finding a terminal command.

## What Changes

- Route the existing user, development and auto launchers through a small dependency-free core bootstrap while preserving their selected workspace, projects, port and shortcut mode.
- Keep healthy startup quick and console-free. When core dependencies require repair, open a startup page with a modal matching the existing rebuild progress design: clear stage text, spinner, live output and a persistent failure state.
- Automatically install the selected core checkout's locked public package graph with its pinned package manager, a frozen lockfile and lifecycle scripts disabled; verify readiness before starting the panel.
- Continue into the requested panel automatically after successful setup and verified startup, without a second setup command or a second browser tab.
- Coalesce concurrent setup requests, retain actionable logs and retry controls, and surface missing runtime/tooling, offline, lockfile, permission and server-import failures instead of silently exiting.
- Do not install private/user project graphs, edit locks, download native/model/device tooling, interrupt responsive panels or change existing workspace/service activation policy.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: add pre-import core dependency bootstrap and rebuild-style startup progress to terminal-free shortcut launches.

## Impact

- Existing `start.vbs`, `start-repo.vbs` and `start-auto.vbs` entry points; their Start-menu shortcut paths remain valid.
- A new built-in-only bootstrap entry point and bounded local startup UI/protocol, independent of the panel server's external dependencies.
- Shared progress presentation/styles where safe, without changing existing rebuild-dialog behavior.
- Focused launcher/preflight/coordinator tests, browser UI checks and documented startup recovery.
- Generated dependency directories and runtime logs for the selected public core; no private repository changes or source export.
