# Tasks

## 1. Developer entry point

- [x] 1.1 Add an explicit repository option to the existing per-user Start-menu shortcut installer, keeping its ordinary target unchanged by default; verify a focused installer test checks both target choices and checkout-local paths.
- [x] 1.2 Select a separate default port for explicit workspace launches, retaining `XRB_PANEL_PORT` overrides, same-workspace reuse and different-workspace refusal; verify control-panel unit and live-server tests for user/explicit defaults and concurrent panels.

## 2. Documentation and acceptance

- [x] 2.1 Document opting into the developer shortcut, restoring ordinary mode, task worktree launches, ports and collisions without setting a permanent `XRB_HOME`; verify documented paths and commands agree with the launcher and environment tests.
- [x] 2.2 Run the focused control-panel tests, the root name guard and strict OpenSpec validation; verify every command passes and manually check each panel's `/api/ping` reports its own workspace on its own default port.
