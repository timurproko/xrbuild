---
name: change-delivery
description: Deliver a change to the XR Build core through its PR flow - own worktree and branch, plan first as a draft PR, implementation only after the maintainer approves, OpenSpec finalization in the PR, handoff and cleanup. Use whenever asked to make, fix, plan or ship a change in this repo (code, docs, specs or CI), and before opening, updating or finishing a PR.
---

# Change delivery

The process for every change to the core. Rules it relies on: `.claude/CLAUDE.md` (names, Git, layout) and
`openspec/config.yaml` (planning). Never merge, arm auto-merge or push to `main`; the maintainer merges.
Workspace-only changes belong to the independent private clone at ignored `.xrbuild/`, not this core PR.
The maintainer uses ordinary Git there; agents never push `main` in either repository.

## 1. Preflight

- From the primary checkout (it stays on `main`): `pnpm worktree sweep` and relay its lines. `--apply` only removes
  merged, clean worktrees; never remove a `dirty`, `active`, `closed` or `unknown` one by hand. A task containing
  `.xrbuild/` or `.artifacts/KEEP` is preserved as dirty even when outer Git is clean. Preserve private repositories
  and marked backups separately before cleanup; never remove the protection just to make sweep pass.
- Reuse only when branch, change and PR are exactly this task's. For a new task, run `pnpm worktree enter
  <type>/<short-desc>` (types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`) to create or cleanly
  re-enter its registered checkout from `origin/main`, and capture the absolute path it prints. On resume, use the
  exact previously assigned registered path; never create or adopt another task's checkout.
- In an active A1 shell-tool session, run `a1 session link-worktree <absolute-path>`, then `a1 session worktrees`.
  **Before any planning or implementation edit**, require that inventory to display the exact path and branch as
  `current`. Re-link and confirm on resume or task switch. A missing command, inactive runtime, failed native claim,
  foreign path, busy checkout or mismatched display of this task's worktree blocks task edits; do not fall back to the
  primary checkout. A stale entry for some other worktree (its directory is gone; `git worktree list` marks it
  `prunable`) is never a blocker, even when it makes the inventory fail: run `git -C <primary> worktree prune`, rerun
  `a1 session worktrees`, and continue once it shows this task's path as `current`.
  Claude Code's native `EnterWorktree` uses `<type>--<short-desc>` and enters that worktree directly.
- Native linkage owns session presentation and cooperative claims; it does **not** authorize cleanup or merge and
  may not change every live tool cwd. Work only in `.worktrees/<short-desc>/` using absolute paths for file tools and
  `git -C`/explicit cwd for commands. Never edit the primary checkout or another task's worktree.
- Scratch (PR bodies, logs, patches, captured output) goes in the worktree's `.artifacts/` (git-ignored), never the
  system temp folder, the home folder or another checkout.

## 2. Plan (draft PR)

- A change that needs a plan (new behaviour, a spec change, anything beyond a small fix) starts as an OpenSpec change
  in `openspec/changes/<change-id>/`: proposal, design, spec deltas, tasks (each ending in a verify clause). A fix that
  changes no spec sets `skip_specs: true` in its `.openspec.yaml`.
- Commit `docs(openspec): propose <change-id>`, push, and open a **draft** PR to `main`: title `type(scope): subject`,
  body from `.github/pull_request_template.md` written to `.artifacts/pr-body.md` and passed with `--body-file`:
  - `## Proposal`: one or two sentences.
  - `## Implementation`: at least two unchecked, implementation-specific outcome checkboxes; two to five is recommended for readability, not enforced as a maximum.
  - `## Automation`: the collapsed block with `{"version":1,"change":"<change-id>"}` in the `openspec-implementation` fence.
  - No `## Acceptance` yet, no list of commands or generic test/CI/merge checkboxes.
- Hand off (section 6) and **stop**. No implementation until the maintainer approves the plan and asks for the
  implementation in words. A request that asks for a plan and its implementation together is approval only when it
  says the plan needs no review.

## 3. Implement (same worktree, branch and PR)

- Update proposal, design, deltas and tasks before the code they cover when the plan shifts.
- Commits: `type(scope): subject`, concise; no AI attribution lines anywhere.
- Tick each task in `tasks.md` only when its verify clause holds. A task that can only be verified after merge belongs
  in a follow-up change, not ticked here. Manual device-only acceptance may be reported as a gap, but never
  pretend an unverified task is done. Tick a PR Implementation outcome as soon as its code, tests and related
  detailed tasks are done; CI status and manual acceptance do not count as checkbox progress.
- Run the focused tests for what changed (`node --test` in the package, `host-tests` for the host) and `pnpm check:names`.
- Add `## Acceptance` before `## Automation`: one to ten plain bullets saying what now holds, specific to this change.

## 4. Ready and finalization

- Bring the branch up to date with `origin/main` if it is behind. Add plain Acceptance outcomes before checking
  the last Implementation item. Push completed `tasks.md` and the updated PR body; do not mark new linked PRs
  ready yourself. Trusted automation verifies the exact complete draft and marks it ready. A pre-existing legacy
  ready PR remains on the old path; a policy PR before this automation lands on `main` uses the old manual route.
- The OpenSpec finalization workflow (the repo bot) archives the linked change in the PR branch, syncs the specs,
  commits `docs(openspec): finalize <change-id>` and records the archive in the Automation block. It refuses while
  `tasks.md` has open tasks; its run lists them.
- Always `git pull` before pushing again; never revert a finalization commit, push fixes on top.
- CI's `Delivery` job stays red ("awaiting finalization") until that commit lands; `CI required` is the gate.
- A PR that edits an active change folder without linking it fails `Delivery`; a change delivered over several PRs
  uses the `openspec-in-progress` label on the intermediate PRs.

## 5. CI

- Drafts run only the name guard, OpenSpec and change detection; ready PRs run every job their paths need.
- Do not watch CI in the foreground; check the result afterwards (`gh pr checks <n>`) and report it.
- Fix failures in the same PR without weakening a test.
- Docs-only PRs that link no change merge by themselves once CI passes (`no-auto-merge` opts out).

## 6. Handoff

After pushing a plan, after CI is green, and after any repair push:
`pnpm worktree handoff <short-desc> --change <change-id> --pr <n>` and fill its skeleton in the reply:
worktree, branch and PR, commit, commands run, behaviour, gaps (each with what happens to it), and one manual test
command for the maintainer.

## 7. After the merge

- Verify: the PR merged, the archive and synced specs are on `main`, the remote branch is gone. Only then report the
  change as delivered; never edit a merged PR's body.
- Local cleanup is the next session's `pnpm worktree sweep --apply` (or `pnpm worktree remove <short-desc>`).
- A PR closed unmerged: `pnpm worktree remove <short-desc> --discard`, only when the maintainer says its work is not
  needed.
