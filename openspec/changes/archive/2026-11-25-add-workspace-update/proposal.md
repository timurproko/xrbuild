## Why

The panel can rebuild the native host and plugins, but nothing brings a Git workspace up to date first. Today a person
pulls by hand, remembers `git lfs pull`, and only then rebuilds; a rebuild after a plain pull fails or runs with LFS
pointer files instead of the real content.

## What Changes

- A new **Update workspace** action next to **Rebuild** in the control panel. One job runs a preflight that writes
  nothing, `git fetch`, a fast-forward check, `git lfs fetch` of the new commits, `git pull --ff-only`, then the existing
  native rebuild.
- It never stashes, merges, rebases, resets or discards. Git's own refusals (diverged branch, local changes that would
  be overwritten) are shown with what to do by hand. Non-conflicting local changes stay.
- `GET workspace/update` reports whether the action is possible and how far the workspace is behind its upstream;
  `POST workspace/update` starts the job. Run, Rebuild and Update never overlap.
- `pnpm update:repo` runs the same job without the panel.
- **Rebuild** stays build-only and does not pull. Only the selected workspace is updated, never the core checkout the
  panel runs from.

## Impact

- New `packages/control-panel/src/workspace-update.ts` and `workspace-update-cli.ts`.
- `packages/control-panel/src/panel.ts` (routes and job guards), `src/navigation.ts` (reserved id),
  `ui/app.js`, `ui/rebuild-dialog.js` (menu item, step-aware dialog, behind hint).
- Root `package.json` (`update:repo`), `docs/private-workspace.md` (one line).
- New capability spec `control-panel`.
