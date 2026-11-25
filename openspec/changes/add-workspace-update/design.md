## Context

`POST host/rebuild` already starts a `host-rebuild` job that calls `rebuildHost(repo, workspace, ctx, { cmake,
generator })` with tools found by desktop setup. It refuses while desktop setup runs or a host is running or starting.
A run refuses while a `host-rebuild` or `desktop-setup` job is active. Nothing in the core calls Git today.

## Decision

A separate job kind `workspace-update`, implemented in `workspace-update.ts` with an injectable command runner so tests
can use a real temporary Git remote and clone and a stubbed `git lfs`.

1. **Preflight** (writes nothing): the workspace is a Git work tree, its branch has an upstream, `git lfs` is
   available; no host running or starting; no `host-rebuild`, `desktop-setup` or other `workspace-update` job active.
   `GET workspace/update` returns the same checks plus ahead, behind and dirty from the last fetch, so the menu item
   can be disabled with a reason and the host chip can say "workspace behind origin by N".
2. `git fetch`. A failure stops with "Could not reach the remote. Nothing changed."
3. `git rev-list --left-right --count HEAD...@{u}`: ahead and behind both above zero stops as diverged ("merge or
   rebase by hand"); behind zero ends with "Already up to date" and no rebuild.
4. `git pull --ff-only`. When Git refuses because local changes would be overwritten, the job fails at this step with
   Git's file list and the advice to commit or stash first. Nothing is stashed or discarded.
5. `git lfs pull`, its progress lines streamed into the job log. On failure the pull has already happened, so the
   job ends with "LFS files missing, run Update again" and does not rebuild.
6. `rebuildHost` with the same tool discovery as Rebuild. The update changes only the workspace, never the core
   checkout, so when the core host is built and current (its freshness check, without the plugins, says so) only
   plugins are rebuilt (`pluginsOnly`); when the core host is missing or outdated the full rebuild runs, as Rebuild.
7. Result line: old and new commit, number of commits, and what was rebuilt. A failure names its step and keeps the
   last lines of output.

The dialog reuses `rebuild-dialog.js` with step titles (Check, Fetch, Pull, LFS, Rebuild). The CLI
`workspace-update-cli.ts` mirrors `rebuild-host.ts` and accepts `--workspace=`.

## Alternatives

- Make Rebuild pull first: Rebuild would need the network, could fail on local changes and would download large LFS
  content every time. Rejected; Rebuild stays local and repeatable.
- Stash local changes around the pull: uncommitted work is never disposable, and a stash conflict is harder to
  recover from than Git's plain refusal. Rejected.

## Risks

- An LFS download can be large and slow; progress is streamed and the job can be followed in the dialog.
- Updating the core checkout under a running panel is out of scope; it stays a manual `git pull` and a restart.
