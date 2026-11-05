# Tasks

- [x] Add `tools/add-dev-to-start.vbs` to create or refresh the current user's `XR Build Dev.lnk` with the checkout's `start-repo.vbs`, working directory, icon and hidden launcher; verify the script is checkout-relative, idempotent and does not alter `XR Build.lnk`.
- [x] Extend focused launcher tests for distinct ordinary and development shortcut names, absolute checkout arguments and repository workspace selection; verify the Control Panel test suite covers both installers without changing the real Start menu.
- [x] Update README and developer instructions with the two-shortcut workflow, stable-checkout installation and worktree-specific direct launch guidance; verify ordinary user setup remains `%USERPROFILE%\.xrbuild` and the development shortcut remains explicit `.xrbuild` selection.
