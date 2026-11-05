# Design

## Context

The panel already has two explicit entry points: `start.vbs` / `pnpm panel` resolve `XRB_HOME` or `%USERPROFILE%\.xr-build`, and `start-repo.vbs` / `pnpm panel:repo` pass `--workspace=.xrbuild`. The Start-menu installer currently creates only an ordinary shortcut. Both modes default to port 5180; when the other workspace's panel is running, startup refuses the mismatch but the hidden launcher cannot display it. On the maintainer's machine `XRB_HOME` names a separate, uninitialized folder and a user-mode server is currently running on 5180. Opening its browser URL shows workspace setup, not the embedded projects.

## Goals / Non-Goals

**Goals:** An explicit, persistent, per-user choice of developer launcher in the Start menu; independent ordinary and repository panel default ports; checkout-relative workspace resolution and safe reuse of only the matching server.

**Non-Goals:** No automatic developer mode based on `.xrbuild/` presence, permanent machine-wide environment change, switching a running server's workspace, killing an existing panel, or changing the default behavior of `start.vbs` / `pnpm panel`.

## Decisions

### D1. Opt-in shortcut, not a global workspace setting

The existing `tools/add-to-start.vbs` keeps its default behavior: install the “XR Build” shortcut pointing at `start.vbs`. An explicit repository option instead points this user's shortcut at `start-repo.vbs` from the checkout where the installer is run. Running the installer in ordinary mode restores the ordinary target. Both launchers themselves remain explicit; the shortcut does not save an absolute `XRB_HOME`. Document that a shortcut installed from a disposable task worktree will break when that checkout is removed; install from the desired stable checkout, or use the task worktree's `pnpm panel:repo` directly.

*Alternative:* use `.xrbuild/` automatically when found or set a persistent `XRB_HOME` to the primary checkout. Rejected because it changes ordinary user behavior and redirects task worktrees to the wrong sources.

### D2. Isolate default ports by explicit workspace mode

The normal panel keeps 5180. A CLI launch with an explicit workspace path (including both repository-development entry points) defaults to 5181, unless `XRB_PANEL_PORT` is provided for that invocation. The existing `/api/ping` check still reuses only a panel serving the requested workspace on the chosen port; an occupied port serving a different workspace or another program remains an error, never a silent browser redirect. With an ordinary server on 5180, the developer shortcut starts its own panel on 5181 and opens that URL. A custom workspace selected explicitly also gets the explicit-workspace port, avoiding a second mode flag.

*Alternative:* shut down or reconfigure the server on 5180. Rejected because it might interrupt a running host/build and silently modify someone else's workspace context.

### D3. Clear and testable selection

Keep the port decision in one small function testable with synthetic args and environment; report the selected workspace and port through the existing `/api/ping` and startup log. Add focused tests for default/overridden ports, environment precedence, actual concurrent instances and mismatch refusal; assert that the Windows shortcut installer changes target only with its explicit option. Document browser URLs and how to choose a distinct port if another checkout is already using 5181.

## Risks / Trade-offs

- [Two panels may coexist] → Only the one the developer launcher starts is opened, each has its own loopback port; neither changes or terminates the other.
- [Another checkout already owns 5181] → Retain mismatch refusal and document a per-invocation `XRB_PANEL_PORT` override; never open the wrong workspace.
- [Shortcut installed from a task worktree later disappears] → Document that a persistent shortcut should point to a stable checkout.
- [Older server already using repository workspace on 5180] → An explicit developer launch now opens 5181; the old server can be quit separately. No server is killed or moved automatically.

## Rollout

Implement the opt-in shortcut and explicit-workspace port selection with tests, document how to switch the shortcut and use repository-mode commands from each checkout, then manually open the developer panel alongside a user-mode panel and confirm `/api/ping` on each. Rollback restores the ordinary shortcut by rerunning the installer in its default mode.
