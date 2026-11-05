# Tasks

## 1. User default and auto-selection

- [x] 1.0 Change the ordinary default to `%USERPROFILE%\.xrbuild` for panel and workspace dependency tooling without changing explicit paths or migrating `%USERPROFILE%\.xr-build`; verify shared-resolution and legacy-folder fixtures.
- [x] 1.1 Add a shortcut-only startup path that uses `workspaceDir()` to choose user mode when that directory exists (including empty), or the current checkout's embedded workspace when it does not, falling back to user mode if no embedded workspace exists; verify unit fixtures for every presence, environment and checkout case without touching real user folders.
- [x] 1.2 Keep the existing same-workspace reuse, different-workspace refusal and per-invocation port override through both auto routes; verify focused startup and live-server tests for modes 5180 and 5181.

## 2. Installer and handoff

- [x] 2.1 Make the installer's one default Start-menu shortcut invoke the auto launcher, retaining `--repo` and adding `--user` as explicit overrides without changing ordinary commands; verify installer target tests for all three choices and checkout-relative paths.
- [x] 2.2 Document what an existing, empty and absent selected user directory does, the new `%USERPROFILE%\.xrbuild` default vs the checkout-local `.xrbuild`, legacy `.xr-build` override, port behavior and stable-checkout installation; verify documentation against launch and installer tests.
- [x] 2.3 Run control-panel and fetch-deps tests, the root name guard and strict OpenSpec validation, and manually confirm each selected mode through `/api/ping`; verify all commands pass and record any untested Windows shortcut behavior as a gap rather than claiming it works.

## 3. OpenSpec validation parity

- [x] 3.1 Pin OpenSpec 1.11.0 for both CI and the finalization dependency so over-500-character requirement guidance is informational without removing `--strict`; verify the lockfile, CLI versions and strict validation of all changes and specs.
- [x] 3.2 Keep finalization's base-controlled validation working for this PR, and add fixtures proving a long valid requirement archives while an invalid requirement still fails; verify the full finalizer suite and a dry-run archive plus strict validation with main's pinned CLI.
