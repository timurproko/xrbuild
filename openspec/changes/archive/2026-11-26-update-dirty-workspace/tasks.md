# Tasks

## 1. Local work and user data survive Update

- [x] 1.1 Replace blanket dirty refusals with fresh-history equality and Git-safe source fast-forwards; targeted temporary-repository tests cover current dirty/untracked state, non-overlapping staged/unstaged edits, source overlap and untracked source overwrite, while existing history/upstream refusals remain covered.
- [x] 1.2 Implement the protected user-data index transaction for workspace settings, config, projects and the locally present generated lock; disposable fixtures prove local bytes/deletions/staging survive upstream add/edit/delete collisions, HEAD reaches the captured commit, no stash/reset/force occurs, and interrupted/ref-raced transactions retain safe recovery.
- [x] 1.3 Add skipped-default inspection/adoption notices and remove dirty-only blocking tooltips; fixtures reproduce modified pnpm-lock.yaml and xrb-plugins.json plus untracked projects/.gitkeep and projects/Unsorted/, both current and behind, including simultaneous upstream settings/lock changes.
- [x] 1.4 Add installation-local settings and transient-write ignores to templates/workspace/.gitignore and update README.md, docs/private-workspace.md and template guidance; focused checks prove settings are ignored without indiscriminately hiding authored projects or curated locks, and documentation includes the exact separately owned private migration handoff.

## 2. Successful repositories complete independent follow-up

- [x] 2.1 Replace the aggregate refusal gate with named source-dependent steps and per-step retry state; focused setup tests prove core dependencies and bundled components prepare after workspace refusal and completed work does not rerun on unchanged retries.
- [x] 2.2 Partition fresh-process native builds by core/bundled/workspace source prerequisites using the merged preparation/toolchain behavior from pull request 54; injected build fixtures prove core host/bundled work continues safely while workspace-dependent work alone is deferred and named.
- [x] 2.3 Cover both refusal directions, independent setup/build failures and retained restart/resume state in targeted Update tests, and document the actual dependency/deferred-step behavior in docs/private-workspace.md.

## 3. Readable results and single-copy job output

- [x] 3.1 Present a truthful overall title, one seven-character-range or already-up-to-date line per repository, bounded local-default/refusal details and at most one next-action line; focused presentation tests cover success, no-op, protected defaults and partial failure.
- [x] 3.2 Reuse pull request 54's single in-place Restart control and preserve its service preparation, validated toolchain and no-autoclose activation behavior; targeted dialog/browser fixtures prove recovery controls work without a live panel or real restart.
- [x] 3.3 Give Update one terminal-detail output owner and use short job/CLI failure envelopes; focused job and CLI tests assert full revision records and terminal summary are not repeated and unrelated job failure behavior is unchanged.
- [x] 3.4 Update result/recovery documentation and run only the affected temporary-repository, setup, presentation and recovery test files; report exact commands and outcomes without running the full local suite or touching private checkouts.
