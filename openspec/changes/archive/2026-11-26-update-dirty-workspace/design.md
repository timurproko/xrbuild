# Design

## Context

See proposal.md for motivation. `fastForward` currently rejects any porcelain status before comparing fetched history, and repeats that rejection before checkout. `runUpdate` then defers all follow-up if any repository failed. It prints detailed descriptions, but `UpdateFailure`, the job runner and the CLI each replay those descriptions or the activation sentence. The dialog displays the resulting full-hash paragraph.

The coordinator supplied ordinary-use state: modified `pnpm-lock.yaml` and `xrb-plugins.json`, plus untracked `projects/.gitkeep` and `projects/Unsorted/`. These are not exceptional source edits. The person's fixed rule is that settings and user projects never block Update, including upstream collisions; local user data wins exactly. The existing spec's blanket dirty refusal is therefore intentionally replaced.

Pull request 54 is still open at `23744f4`. It owns service preparation, validated CMake selection and the shared Restart/Retry controls. Coordination was posted there. This plan stays based on `main`; shared-file implementation waits for 54 to land and builds on its result, not a competing implementation.

## Goals / Non-Goals

**Goals:** Preserve user-data bytes, deliberate deletions, staged local edits and untracked files; only refuse genuine source collisions or existing structural/history/operational hazards. Keep follow-up truthful and independently retryable. Bound the result dialog without losing diagnostic detail.

**Non-Goals:** No live panel operation, private checkout access, private repository changes, dependency regeneration, preference merging, Git stash/reset/force, rewritten local history or automatic restart. No blanket ignore of authored project source or core dependency locks.

## Decisions

### 1. Compare history before treating local changes as relevant

Keep fresh remote-default discovery and exact captured-commit fetching. Retain default-branch/upstream validation, local-only/diverged-history refusal, in-progress-operation checks and branch/HEAD race guards. Equality succeeds with dirty/staged/deleted/untracked files; only actual unfinished follow-up runs. Do not require LFS downloads or an installed LFS client merely to confirm equality when no LFS materialization is needed.

For ordinary source updates, use Git's fast-forward safety semantics with autostash disabled and explicit protection against overwriting untracked or ignored files. Never reject solely because status is nonempty. Surface Git's actual blocking paths, bounded to the first few in one sentence; preserve the full diagnostic in output. Continue honoring LFS exclusions and prefetch before touching source files.

Rejected: moving the old dirty check later. That still rejects safe non-overlapping edits and cannot satisfy local-wins settings.

### 2. Protected workspace user data is not source conflict input

Use an explicit role-scoped policy for workspace-root `xrb-plugins.json`, `xrb-panel.json`, panel-owned `config/`, and the user `projects/` tree, including both observed `Unsorted` and canonical `unsorted` spellings. Preserve present data, untracked collisions and deliberate local deletions; do not silently import upstream projects over the person's project tree. Do not extend this rule to core `embedded/` or plugin source merely because it has a similar basename.

Treat a locally present workspace-root `pnpm-lock.yaml` as generated dependency state for this action: keep it byte-for-byte even when incoming lock content differs. Preserve incoming curated lock content in the fetched commit, not by regenerating or replacing the working file. This exception is workspace-role-only; the core public lock stays a checked source input and its setup remains frozen. Update continues not to install private packages. Explicit later workspace dependency preparation can reconcile its dynamic graph; Update itself does not run a package solver.

Local wins is fixed behavior, not a selectable preference. For changed upstream settings/defaults, emit one bounded notice, for example: `Kept local xrb-plugins.json; upstream defaults were not applied; inspect with git show origin/main:xrb-plugins.json before explicitly adopting values in Settings.` Use the captured branch/revision in real output. Multiple retained files share one notice. No settings contents, credentials or project source go into the log.

A plain `git merge --ff-only` cannot implement this when tracked user data also changes upstream. Do not work around it with stash, skip-worktree promises, a forced checkout, or temporary removal of the person's files. Use a bounded index-aware fast-forward transaction for that case:

- Hold the index transaction lock, capture the original index and source range, verify branch/HEAD and ancestry, and record a durable recovery journal under Git metadata before writes.
- Construct a temporary projected target tree: incoming source entries, but original-base entries for protected paths. Use Git's two-tree checkout/unpack safety checks against a copy of the real index to preserve non-conflicting staged source work and reject source collisions before any checkout. Explicitly protect ignored/untracked source collisions too.
- Apply only checked source changes with Git's safe index/worktree machinery. Protected working paths are never checked out, renamed, deleted or rewritten. The final index reflects the actual fetched target for those paths, except that pre-existing staged user-data entries remain staged; their local working bytes remain untouched.
- Advance the actual branch only to the verified descendant captured from the remote, using an expected-old-value ref transaction, not force. Publish the checked index, verify final state and clear the journal only after completion.
- A crash resumes from the recorded old/target/index state; it never guesses, discards another writer's work or reports success with a mismatched ref/index. Ref races or I/O failures retain recovery data and a precise error. The existing build-resume marker is separate from this checkout transaction.

The implementation must prove index/worktree/ref preservation and journal recovery in disposable repositories before this path ships. A temporary index is an internal calculation, not a second checkout of the person's workspace or an automatic commit. No helper commits or merges are created.

### 3. Follow-up is a dependency graph, not an all-repositories gate

Record named steps with `completed`, `failed`, `deferred` or `unchanged` outcomes and explicit source prerequisites. Run independent siblings even after another step fails:

- Frozen core dependency setup depends on accepted core source and its public graph, not workspace Git cleanliness.
- Bundled application/service preparation uses accepted core-owned inputs and checked writable user storage, not successful workspace source advancement. Reuse 54's fresh-process boundary and do not load stale service code from the running panel.
- Core host and core-owned plugin builds use accepted core source/SDK, validated tools and user cache. A workspace Git refusal is not itself a reason to defer them.
- Workspace plugin builds require accepted workspace source and the core SDK they consume. Defer these when that source/SDK is refused, not core-only work. Partition bundled and workspace plugin roots rather than letting the current combined rebuild consume a refused source.
- A filesystem/cache safety failure remains a real prerequisite failure; sharing a writable cache directory does not itself imply dependence on that directory's Git source update.

Extend fresh build boundaries to carry that scope; reuse existing `coreOnly`/`pluginsOnly` options and add origin filtering where needed. Preserve 54's validated CMake/generator. Keep dependency receipts and per-step resume records so completed core work is not repeated simply because workspace work remains pending. A repository can have a successful pull and unfinished build; neither condition overwrites the other. Aggregate failure still truthfully signals actual source or follow-up failures.

### 4. Structured result, one detailed output owner

Retain full revisions and step outcomes in the structured result. Add compact presentation fields or derive them from structured outcomes, never by parsing a giant summary paragraph. Dialog layout:

- Overall title: `Updated`, `Updated, restart needed`, `Already up to date`, or a truthful partial result such as `Core updated; workspace needs attention`.
- One line per distinct repository, combining identical roles; seven-character before/after commits or `already up to date`, a bounded reason for refusal, and any local-defaults-retained notice.
- At most one next-action line combining genuine deferred steps, inspection/adoption guidance and restart. Long command/error details stay in View job.

Reuse 54's Restart action and restart latch, including partial failures; never autoclose a restart-required result. Keep the detailed output accessible in View job rather than repeating the full-hash record as dialog body and log tail simultaneously. Remove the tooltip's assertion that any local change needs attention.

Give the update execution path sole ownership of its terminal detail record. `UpdateFailure` carries a concise error envelope and structured result rather than using the full summary as its exception message. Coordinate the job-runner and CLI wrappers so they append at most a short failure marker and do not print the summary or activation sentence again. Keep unrelated job failure handling unchanged.

### 5. Tracking-policy ownership and exact private-worker handoff

Local-wins behavior above works before any repository migration. Ignoring files is not the safety mechanism: `.gitignore` never untracks existing files and cannot solve an upstream tracked-file collision.

In this core change, update `templates/workspace/.gitignore` to ignore installation-local `/xrb-plugins.json`, `/xrb-panel.json` and their lock/temp write leaves; keep existing ignored `config/` user-state subpaths. Document that newly authored project source is intentionally versionable, so do not silently blanket-ignore `/projects/` or the root dependency lock in the shared template. Untracked projects already cannot block Update because of the protected-data rule.

Separately hand the private-workspace worker these exact outcomes; do not perform them here:

1. Stop tracking installation-local `xrb-plugins.json` and `xrb-panel.json` and add anchored ignores plus write lock/temp patterns. Keep only reviewed shareable defaults in plugin manifests or a clearly separate example/default file, never personal settings.
2. For the reported local-only project convention, add `/projects/Unsorted/`, `/projects/unsorted/` and `/projects/.gitkeep` ignores. Keep intentionally published/authored project directories tracked; do not remove them or blanket-ignore all project source. If a project needs version control, the owner explicitly opts that project in or uses a separate project repository.
3. Decide lock ownership from the actual private graph: for a panel-managed dynamic graph, recommend treating root `pnpm-lock.yaml` as regenerable local state, ignoring/untracking it only there and storing any curated reproducibility seed under a separate versioned path with documented explicit regeneration. For a curated integration graph, keep its lock versioned and separate user-project dependency preparation into user-owned state instead of allowing ordinary installs to rewrite it. Do not apply the private choice to the core lock or shared template by default.
4. A removal commit alone can collide with existing dirty tracked settings on older clients. Provide an owner-run preservation-first migration: independently back up and verify every affected file/project before changing tracking, then restore/verify personal copies after the migration; never merely pull a deletion over local data. New Update's protected-path transaction also preserves them through that removal. The worker changes only their own task clone, never the person's live checkout.

This prevents recurrent settings conflicts rather than instructing people to commit personal state forever. Lock regeneration is explicitly separate from Update and must not lose dependency declarations in projects. The private graph ownership decision does not gate the fixed local-wins updater behavior.

## Risks / Trade-offs

- [Protected tracked data differs from the new HEAD] → This is intentional: local user data wins. Show skipped-defaults notice and inspection guidance; never claim those defaults were applied.
- [Index/ref/worktree transaction spans a crash or outside Git writer] → Use expected-old-value checks, a durable journal and exact recovery fixtures. Never use force or discard unrelated local changes.
- [Broad project ignore hides useful authored work] → No blanket template ignore; private worker uses explicit local-only paths. Updater protection does not depend on ignore status.
- [Workspace lock no longer matches incoming manifests] → Preserve it and explain skipped upstream input; explicit dependency preparation owns reconciliation. Do not falsely report private package installation.
- [Build partition accidentally reads refused plugin sources] → Add per-step dependency/origin assertions in tests, including reversed core/workspace refusal.
- [54 changes shared result code] → Wait for its merge, then preserve service refresh, validated tools and the existing single Restart control.

## Migration Plan

Publish this planning-only change as a draft PR and stop for approval. Implementation then integrates the merged 54 behavior, lands the three outcomes in order and updates documentation. No live-checkout migration is required to obtain safe dirty/local-wins updates. The separately owned tracking cleanup can follow without blocking this fix.

Focused temporary-repository coverage must include: current with all four reported paths; behind with those paths and unrelated source; overlapping tracked source; untracked source overwrite; upstream settings and lock edits; upstream project add/edit/delete collisions; staged edits; ignored-file protection; history/upstream refusals; transaction interruption; and one repository refused while independent work completes for the other. Dialog/CLI/job tests cover concise titles, line limits, seven-character revisions, defaults notices, Restart, and summary printed once. Use only selected test files, not the full suite, and put disposable output outside the worktree in the crew task directory. No native build, private packages or person's panel is required for these fixtures.
