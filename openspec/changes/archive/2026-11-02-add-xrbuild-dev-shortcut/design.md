# Design

## Context

`start.vbs` opens the ordinary user workspace and `start-repo.vbs` explicitly opens the current checkout's `.xrbuild/`. The existing Start-menu installer owns the ordinary **XR Build** shortcut. Development should be equally discoverable without making one shortcut switch modes or changing the ordinary setup experience.

## Decisions

1. Add `tools/add-dev-to-start.vbs` as a separate installer rather than overloading the ordinary shortcut installer.
2. Install `XR Build Dev.lnk` in the current user's Programs folder. Target `wscript.exe`, pass the absolute checkout path to `start-repo.vbs`, use the checkout as the working directory and reuse the XR Build icon.
3. Re-running the installer replaces the same shortcut idempotently and reveals it in Explorer for optional pinning. It does not create, move or initialize a workspace.
4. Keep `XR Build.lnk`, `start.vbs`, `start-auto.vbs`, `XRB_HOME` and ordinary port selection unchanged. The development shortcut inherits explicit-workspace behavior from `start-repo.vbs`.
5. Treat the shortcut's absolute checkout path as intentional: install it from the stable primary checkout. A task worktree continues to use that worktree's `start-repo.vbs` or `pnpm panel:repo` directly.
6. Cover the installer contract with source-level tests that distinguish the two shortcut names and launchers without writing to the real Start menu.

## Risks and mitigations

- **Repository moved after installation:** document rerunning the installer because Windows shortcuts store absolute paths.
- **Two panels use different workspaces:** preserve existing user port 5180 and explicit-workspace port 5181 behavior and stale-panel refusal.
- **Accidental replacement of the user shortcut:** use a distinct filename and assert the development script never targets `XR Build.lnk`.
