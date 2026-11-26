## 1. Exact fast-forward to the fetched commit

- [x] 1.1 Read the upstream sha once after the fetch and use it for the count, `git lfs fetch` and `git merge --ff-only`; drop `git pull`
- [x] 1.2 Keep the "would be overwritten" refusal and file list for the merge
- [x] 1.3 Test: the remote moves between the LFS fetch and the fast-forward, and `HEAD` ends at the fetched commit

## 2. Workspace that is the core checkout

- [x] 2.1 Status marks a workspace whose path equals the core path as the core repository, with its reason
- [x] 2.2 The update job never fast-forwards that repository twice; in this change the workspace part skips it
- [x] 2.3 Tests for the status and the job

## 3. Shared helpers and core status

- [x] 3.1 `repoUpdateStatus(dir, { lfs })` and `fastForward(dir, ctx)` extracted and used by the workspace job
- [x] 3.2 Core status reported read-only: not a Git checkout, detached HEAD and no upstream each give a reason; LFS optional
- [x] 3.3 Tests for the core status cases

## 4. One Update action: names and wording

- [x] 4.1 Job kind `update`, overlap guard and `step` capture in `jobs.ts`
- [x] 4.2 `GET`/`POST /api/update` returning `{ core, workspace, updating }` in `panel.ts`
- [x] 4.3 Menu label exactly `Update`, `#update-chip` and `updateInPlace` in the UI
- [x] 4.4 Tooltip names each repository's state and the last remote check ("Core: up to date. Workspace: up to date. Remote last checked just now."); dialog titles and summaries say Update and name the repository
- [x] 4.5 While the core part is read-only, the tooltip and the job result say plainly when the core is behind or cannot be updated here, that this version does not update it yet and to pull it by hand, and never report the core as updated
- [x] 4.6 No user-visible text says "Update workspace"; a test asserts the menu label is exactly `Update`
- [x] 4.7 `update-cli.ts` behind `pnpm update:repo`, and `docs/private-workspace.md`
- [x] 4.8 Existing workspace-update, rebuild-dialog, navigation, header-order and jobs tests ported to the new names

## 5. Spec

- [x] 5.1 Replace the sentence that says the core checkout is never updated
