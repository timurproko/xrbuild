## 1. Workspace update job

- [ ] 1.1 `workspaceUpdateStatus(workspace)` reports clone, upstream, LFS, ahead, behind and dirty without fetching, with a reason when the action is unavailable
- [ ] 1.2 `updateWorkspace(repo, workspace, ctx, deps)` runs preflight, fetch, fast-forward check, `pull --ff-only`, `lfs pull` and `rebuildHost` through an injectable runner and reports old and new commit, commit count and what was rebuilt
- [ ] 1.3 Tests against a temporary bare remote and clone with `git lfs` stubbed: fast-forward then rebuild, up to date, dirty non-conflicting kept, dirty conflicting refused, diverged refused, no upstream, not a clone, fetch failure, LFS failure skips rebuild

## 2. Panel routes and job guards

- [ ] 2.1 `GET workspace/update` returns the status and `POST workspace/update` starts a `workspace-update` job with the same 409 guards as `host/rebuild`
- [ ] 2.2 Run, Rebuild and Update refuse while another of the three is active
- [ ] 2.3 Tests for the routes and the mutual exclusion

## 3. Panel menu and dialog

- [ ] 3.1 Menu item `update` next to Rebuild, its id reserved in `navigation.ts`, disabled with the status reason
- [ ] 3.2 Step-aware dialog in `rebuild-dialog.js` and the "workspace behind origin by N" hint on the host chip
- [ ] 3.3 `rebuild-dialog.test.ts` and `navigation.test.ts` cover the new item and steps

## 4. Command line and docs

- [ ] 4.1 `pnpm update:repo` runs the job for `.xrbuild` through `workspace-update-cli.ts`
- [ ] 4.2 `docs/private-workspace.md` names the Update workspace action
