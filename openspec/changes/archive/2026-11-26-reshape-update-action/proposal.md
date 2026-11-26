## Why

The person wants one **Update** action that brings both the core checkout the panel runs from and the workspace up to
date, then rebuilds once. Update workspace (the previous change) covers only the workspace, and two review findings
are still open on it: the pull fetches a second time, so it can move past the commit whose LFS objects were
downloaded, and a workspace that *is* the core checkout is not recognised.

This change fixes both findings and reshapes the action and its names for two repositories, with no new behaviour
for the core yet. The core update itself (fast-forward of the core, continuing from the new core code, dependency
installs, one rebuild and an automatic panel restart) is the next change: together they would be too large for one
reviewable pull request.

## What Changes

- **Exact fast-forward:** the workspace is fast-forwarded with `git merge --ff-only` to the upstream commit read right
  after the fetch, the one whose LFS objects were downloaded. There is no second fetch. Git's "would be overwritten"
  refusal and its file list are kept.
- **Workspace equals core:** a workspace whose path is the core checkout is one repository. Status reports it as such,
  and an update never fast-forwards it twice. Until the core update lands, the workspace part skips it with the reason
  "The workspace is the core checkout: it is updated as the core."
- **Shared helpers:** `repoUpdateStatus(dir, { lfs: 'required' | 'optional' })` and `fastForward(dir, ctx)` serve both
  repositories. The core's status is reported read-only: not a Git checkout, detached, or no upstream each give a
  reason.
- **Renames, no behaviour change:** menu item `Update`, job kind `update`, `GET`/`POST /api/update` returning
  `{ core, workspace, updating }`, `#update-chip`, `updateInPlace`, and `update-cli.ts` behind `pnpm update:repo`. The
  on-disk marker keeps its name `xrb-workspace-update`.
- **Wording:** the menu item is named exactly "Update", because the action covers the core and the workspace. Its
  tooltip names each repository's state and when the remote was last checked, for example "Core: up to date.
  Workspace: up to date. Remote last checked just now." instead of "Up to date with origin at the last check." The
  dialog's titles and summaries say "Update" and name the repository a line is about. No user-visible text says
  "Update workspace" any more; a test asserts the label.
- **Spec:** the sentence "SHALL never update the core checkout the panel runs from" is replaced: Update reports the
  core's status and updates each repository at most once per run.

## Impact

- `packages/control-panel/src/workspace-update.ts` (renamed `update.ts`), `workspace-update-cli.ts` (renamed
  `update-cli.ts`), `jobs.ts`, `panel.ts`.
- `packages/control-panel/ui/app.js`, `ui/rebuild-dialog.js` (and its `.d.ts`), `ui/navigation.js` (and its `.d.ts`),
  `ui/index.html`.
- Root `package.json` (`update:repo`), `docs/private-workspace.md`.
- Tests: the existing workspace-update, rebuild-dialog, navigation, header-order and jobs tests ported to the new
  names, plus tests for both findings and for the core status.
- Spec `control-panel`.
