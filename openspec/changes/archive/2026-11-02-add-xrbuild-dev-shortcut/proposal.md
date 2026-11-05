# Proposal

## Why

The ordinary XR Build shortcut correctly uses the user workspace, but repository development still requires remembering a launcher or command. The maintainer wants a separate, clearly named Start-menu shortcut that always opens the checkout's tracked `.xrbuild/` workspace without changing the ordinary user shortcut.

## What Changes

- Add a tool script that installs an **XR Build Dev** Start-menu shortcut for the checkout from which the script is run.
- Make the development shortcut invoke `start-repo.vbs`, so it explicitly selects that checkout's `.xrbuild/` workspace and keeps the existing hidden, console-free launch behavior.
- Keep the existing **XR Build** shortcut and ordinary `%USERPROFILE%\.xrbuild` setup flow unchanged.
- Document stable-checkout installation, repository-worktree development and shortcut removal, with focused tests for names, paths and launcher separation.

## Capabilities

### Modified Capabilities

- `workspace-location`: repository development can be installed as a distinct Start-menu entry while ordinary user launch remains bound to the user workspace.

## Impact

- Start-menu tooling, focused Control Panel launcher tests, README and developer instructions.
- No workspace migration, second repository, submodule, history rewrite, route change or change to runtime workspace resolution.
