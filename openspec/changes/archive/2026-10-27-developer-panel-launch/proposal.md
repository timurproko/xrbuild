# Proposal

## Why

A repository developer who opens the existing XR Build Start-menu shortcut gets the ordinary user panel. On this machine that means `XRB_HOME` points to an uninitialized home-folder workspace, so the browser shows “Create your workspace” even though the checkout already contains `.xrbuild/`. The repository-development launcher already selects `.xrbuild/`, but the user panel on port 5180 prevents it from opening concurrently and the hidden launcher reports that conflict only in its log.

## What Changes

- Let a developer explicitly configure their own existing Start-menu shortcut to launch the repository-development panel from the checkout used to install the shortcut. Keep the ordinary shortcut behavior when this option is not chosen.
- Give repository-development launches a separate default loopback port from the ordinary panel, so an existing user-mode panel does not block or impersonate the developer panel. Keep the existing per-process port override and workspace-mismatch protection.
- Document the opt-in and worktree-aware commands; test that repository mode opens its checkout-local `.xrbuild/` even if `XRB_HOME` names a different folder, while ordinary users' workspace and port defaults remain unchanged.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: explicit developer shortcut, workspace-aware single-instance behavior and separate default panel ports.

## Impact

- Panel startup selection, the existing Windows Start-menu installer, documentation and focused tests.
- No automatic selection merely because `.xrbuild/` exists; no permanent `XRB_HOME`, workspace migration, public-user default change, plugin ABI or panel project UI change.
