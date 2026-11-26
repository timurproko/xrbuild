## Context

The approved design for "Update core and workspace" splits the work into steps A (reshape, no behaviour change),
B (core update), C (availability indicator) and D (hardening). This change is step A plus two open review findings of
the previous change. Steps B, C and D follow as their own changes.

## Decisions

### Fast-forward to the fetched commit

After `git fetch`, read `git rev-parse @{u}` once and use that sha for the ahead/behind count, `git lfs fetch` and
`git merge --ff-only` of that sha. `git pull` is no longer used, so nothing fetches a second time. A merge that cannot
fast-forward because local changes would be overwritten prints the same "would be overwritten" list, which
`overwrittenFiles()` already parses.

Test: a stubbed `git lfs fetch` pushes one more commit to the bare remote. `HEAD` must end at the commit read after
the fetch, not at the newer one, and the next Update brings the newer one.

### Workspace equals core

`repoUpdateStatus` is called for the core checkout and for the workspace. When both resolve to the same path
(`samePath`), the workspace status is marked as the core repository and the update contains that repository once, as
the core. In this change the core part does not run, so such a workspace is not updated and the reason says so. The
next change updates it once, as the core. Tested in both the status and the job.

### Shared helpers

- `repoUpdateStatus(dir, { lfs })`: the read-only status of the previous change for any repository.
  `lfs: 'required'` (workspace) makes a missing Git LFS a reason; `lfs: 'optional'` (core) does not.
- `fastForward(dir, ctx)`: fetch, read the upstream sha, refuse a diverged branch, LFS fetch when needed,
  `merge --ff-only`, write the marker. It returns from and to. The workspace job uses it now; the core uses it in the
  next change.
- The workspace marker keeps its name `xrb-workspace-update`, so an unfinished update from the previous version still
  resumes.

### Names

Job kind, route, chip id and UI function are a contract between one panel server and its own UI, so they are renamed
without a compatibility shim. The menu id `update` is already reserved.

## Risks

- A panel started before this change and a page loaded after it disagree on the route until the panel restarts. The
  panel already flags its own server code as outdated after a change, so this is the existing behaviour.
