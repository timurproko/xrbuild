# Tasks

## 1. Workspace selection

- [x] 1.1 Add explicit panel workspace-path parsing with precedence over `XRB_HOME` and the home default, while leaving an invocation without the argument unchanged; verify with control-panel tests for explicit, environment and default resolution.
- [x] 1.2 Add separate repository-development panel commands and a no-console launcher that resolve `.xrbuild/` from the current checkout, while retaining `pnpm panel` and `start.vbs` as user-mode entry points; verify both launch modes report their expected workspace through `/api/ping`.
- [x] 1.3 Add a convenient embedded-workspace dependency command using the existing explicit fetch path without changing plain core dependency fetching; verify the fetch-deps tests and a dry fixture select `.xrbuild/` only for the new command.

## 2. Task worktree isolation

- [x] 2.1 Ensure task worktrees preserve tracked LFS dependencies without replacing them with links, while continuing to share untracked core dependencies and isolate plugin builds and application output; verify with worktree tests for creation, re-entry and removal.
- [x] 2.2 Ensure repository-development launchers in a task worktree resolve that worktree's `.xrbuild/` rather than the primary checkout or an environment override; verify with a two-checkout test fixture using distinct workspace marker files.

## 3. Repository policy and documentation

- [x] 3.1 Update `.claude/CLAUDE.md`, `AGENTS.md` where needed and `openspec/config.yaml` to define `.xrbuild/` as the real embedded workspace, preserve the logical core boundary and require task edits through the linked worktree; verify the instructions consistently distinguish `.xrbuild/` from the user default `.xr-build`.
- [x] 3.2 Update README and workspace documentation with the two launch modes, separate package workspaces, ignored outputs and the no-nested-Git rule; verify every documented user command retains the home-directory default and every repository-development command selects `.xrbuild/` explicitly.
- [x] 3.3 Restrict the name guard to paths and contents outside the private `.xrbuild/` subtree; verify tests reject prohibited core paths and content but permit private project, plugin and third-party paths and contents.

## 4. Workspace import

- [x] 4.1 The maintainer copies the existing workspace into this task worktree at `.xrbuild/` without its `.git` metadata and without changing the primary checkout; verify Git sees one repository and the imported workspace satisfies the standard workspace layout.
- [x] 4.2 Review the imported workspace's tracked candidates, ignore generated output and credentials while allowing only pinned LFS dependencies in `third_party/`; verify `git status --ignored`, LFS tracking and no nested repository or secret file staged.
- [x] 4.3 Validate workspace installation, project/plugin discovery and available automated plugin checks using materialized LFS dependencies; verify a fresh LFS checkout matches every pinned hash without the external source trees and the panel lists embedded projects/plugins. Report hardware-only validation as an explicit gap; do not claim to have tested devices. Physical display, tracker and station acceptance remains for the maintainer.
- [x] 4.4 Audit private project assets for required legal attribution and accidental credentials; keep `.xrbuild/` out of public archives and core name rules; verify the attribution files, export archive and core name guard.
- [x] 4.5 Make the embedded launcher browser preview use local panel projects when the production inventory is unavailable, without changing the published catalog; verify offline/local preview and published catalog tests.
- [x] 4.6 Restore a plugin-supplied product label in panel UI without changing core naming; verify both UI selection and plugin discovery tests and run the name guard.
- [x] 4.7 Store exactly the pinned workspace dependencies under Git LFS, not installs or generated binary output; verify LFS pointers, the materialized files' pinned hashes and clean checkout behavior without local source trees.

## 5. Final verification

- [x] 5.1 Run focused control-panel, fetch-deps, worktree and name-guard tests plus strict OpenSpec validation; verify all commands pass.
- [x] 5.2 Run the full repository test suite and `pnpm check:names`, and manually start both user-mode and repository-development panel entry points; verify user mode uses `%USERPROFILE%\.xr-build`, repository mode uses the current checkout's `.xrbuild/`, and neither mode changes the other workspace.
