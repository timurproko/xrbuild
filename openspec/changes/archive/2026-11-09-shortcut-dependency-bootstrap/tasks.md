## 1. Dependency-free launcher and readiness

- [x] 1.1 Add a built-in-only pre-import bootstrap and route the existing user/development/auto script entry points through it without changing shortcut destinations; verify a no-packages fixture can start bootstrap diagnostics and all existing route/argument tests still pass.
- [x] 1.2 Implement actual public runtime dependency/readiness checks, prerequisite diagnostics and an unchanged fast path, including correct existing-panel identity handling; verify missing/dangling/wrong-version packages and stale stamps cannot be accepted while a ready fixture invokes no installer.

## 2. Bounded automatic setup

- [x] 2.1 Install only the selected public core's pinned graph using frozen lock and disabled lifecycle scripts, preserving tracked input bytes and existing workspace setup policy; verify injected command/cwd/environment contracts and negative fixtures for private/external graph escapes, missing tools, failed install and input changes.
- [x] 2.2 Coordinate one installer per canonical core while retaining distinct caller launch selections and safe owner lifetime; verify duplicate clicks, simultaneous modes, unknown owners, snapshot changes and reconnects do not produce concurrent installs, unsafe lock cleanup or the wrong destination.

## 3. Startup dialog and diagnostics

- [x] 3.1 Add a build-free startup page with rebuild-style accessible progress, explicit checking/installing/starting states and bounded sanitized live output; verify browser fixtures render the modal before setup work and preserve existing rebuild-dialog behavior across light/dark and narrow/desktop layouts.
- [x] 3.2 Retain readable errors and owned startup logs with explicit Retry, Copy log and Close behavior; verify offline/permission/prerequisite/lock/import/browser failures do not silently vanish, leak credentials, loop automatically or report success.
- [x] 3.3 Implement the minimal authenticated loopback session/asset surface; verify foreign Host/Origin/session, injected output, traversal/unknown routes and unauthenticated mutations are refused without starting an installer or exposing arbitrary files.

## 4. Verified application handoff

- [x] 4.1 Start or reuse only the requested panel after core readiness and validate its core/workspace/projects/port identity; verify same-tab success, wrong listeners, early server exits, duplicates and browser refresh do not open a second panel or switch workspace.
- [x] 4.2 Make progress-window close/teardown and long-lived server ownership explicit; verify active setup is not orphaned/force-killed, reopening reattaches, failed setup never launches, and the accepted panel survives bootstrap teardown without closed-pipe errors.

## 5. Documentation and focused acceptance

- [x] 5.1 Document automatic core setup, failure/retry/log recovery, prerequisite limits and the separate workspace/embedded ownership boundaries; verify instructions match tested commands and no stable shortcut, primary checkout, private source or existing running panel is changed during validation.
- [x] 5.2 Add and run focused bootstrap/routing/rebuild/browser regressions plus strict production types, naming and strict change validation; verify observed results and any unavailable optional checks are recorded without treating later ready-head CI as already passed.
- [x] 5.3 Record a Windows missing-core-dependency shortcut demonstration using disposable task-local public fixtures, then check all written outcome bookkeeping and proposed Acceptance; verify visible setup/log/failure/retry/success behavior and no device/toolchain/private installation or user-data cleanup occurs.
