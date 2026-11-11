---
name: change-delivery
description: Deliver a change to the XR Build core through its PR flow - own worktree and branch, plan first as a draft PR, implementation only after the maintainer approves, OpenSpec finalization in the PR, handoff and cleanup. Use whenever asked to make, fix, plan or ship a change in this repo (code, docs, specs or CI), and before opening, updating or finishing a PR.
---

# Change delivery

The process for every change to the core. Rules it relies on: `.claude/CLAUDE.md` (names, Git, layout) and
`openspec/config.yaml` (planning). Never merge, arm auto-merge or push to `main`; the maintainer merges.
Workspace-only changes belong to the independent private clone at ignored `.xrbuild/`, not this core PR.
The maintainer uses ordinary Git there; agents never push `main` in either repository.

Route engine and approved `embedded/` changes to the core PR; embedded is part of core Git, not a nested repository.
Route private-only work to its independent private PR without an empty public PR. Paired tasks use separate PRs and
one private/local handoff recording tested revisions and dependencies. Public artifacts must not include private
repository/PR links, source inventories, client details or credentials. A plan approval permits implementation, not
private-source export: each public snapshot needs an audited allowlist and explicit export approval, without importing
private ancestry. Commit/push/merge permissions and worktree protections below remain unchanged.

Use `pnpm task:repos` with bounded ignored `.artifacts/repositories.json` for explicit owner routing, opt-in independent
private provisioning and create-only tested-revision records. Core/embedded-only work needs no private clone; never
create an empty public PR for private-only work. Paired records bind both HEAD and dirty/untracked content state,
canonical repositories/remotes and required core ancestry; reverify after every change. This is a local handoff, not
trusted remote CI or delivery authorization. The helper never stages, exports, pushes, creates PRs, merges or cleans.
Follow `docs/embedded-extensions.md` and the active change's `prerequisites.md`; predecessor synchronization/archive
belongs to the bot's ordered delivery gate, never manual overwriting of an older active change.

A missing canonical baseline after an accepted public bootstrap may use an explicitly maintainer-approved,
contract-only checkpoint: follow `docs/spec-baseline-reconciliation.md`. Bind contracts to the accepted public tree,
review predecessor contracts in their recorded order, and leave historical plans and task completion unchanged.
The checkpoint needs its own complete verified tasks and normal bot finalization; it is not an open-task bypass.
A successor stays blocked until that checkpoint is bot-finalized and maintainer-merged, then updates only its own
ledger with the observed baseline. Approval grants no private export, hosting mutation, cleanup or merge authority.

## 1. Preflight

- From the primary checkout (it stays on `main`): `pnpm worktree sweep` and relay its lines. `--apply` only removes
  merged, clean worktrees; never remove a `dirty`, `active`, `closed` or `unknown` one by hand. A task containing
  `.xrbuild/` or `.artifacts/KEEP` is preserved as dirty even when outer Git is clean. Preserve private repositories
  and marked backups separately before cleanup; never remove the protection just to make sweep pass.
- Follow the shared Worktrees guidance in `AGENTS.md`. Continue the same task's branch, change and PR.
  A1 owns attachment verification, coordination and recovery; do not add an inventory approval gate or a manual
  linkage retry procedure. External agents use ordinary Git worktrees from `origin/main`; the existing repository
  helper remains available for their creation/setup.
- After entry, prepare this checkout's public dependencies using the repository helper's enter operation when needed.
  Dependency setup is separate from attachment; the helper's clean re-entry restriction does not prohibit continuing
  existing task edits or require a second worktree. For edited resumes, install task-local dependencies directly
  rather than invoking clean re-entry. Provision private clones independently and only when needed.
- Attachment does not authorize cleanup or merge. Built-in tools follow the attached root; custom extensions and
  independent terminals may retain their own cwd, so use the returned explicit root for those integrations.
  Never edit the primary checkout or another task's worktree.
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
- Run quick targeted checks for changed code and its written tests, plus `pnpm check:names` and strict change validation;
  use the type check when the repository provides it. Do not turn broad local suites into a repeated pre-push loop.
  Written code/tests and truthful pre-ready bookkeeping determine Implementation progress; exact-final-head CI is the
  later integration gate, not a future result to mark already passed.
- Add `## Acceptance` before `## Automation`: one to ten plain bullets saying what now holds, specific to this change.

## 4. Ready and finalization

- Bring the branch up to date with `origin/main` if it is behind. Add plain Acceptance outcomes before checking
  the last Implementation item. Push completed `tasks.md` and the updated PR body; do not mark new linked PRs
  ready yourself. Trusted automation verifies the exact complete draft and marks it ready. A pre-existing legacy
  ready PR remains on the old path; a policy PR before this automation lands on `main` uses the maintainer-reviewed bootstrap route.
  Missing trusted policy or bot setup does not authorize an agent ready mutation or merge.
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
- An A1 session still attached to the merged task runs `a1 worktree complete` instead and never cleans its own
  attached checkout: the command returns the session to primary first and relays the cleanup report. It runs
  this repository's sweep only where the machine owner configured it once from primary with
  `git config --local a1.worktreeCleanup "node tools/worktree/worktree.mjs sweep --apply"`; without that setting
  it detaches, keeps the checkout and reports cleanup unavailable. Sweep's rules are unchanged: only merged,
  clean worktrees go, and a task holding `.xrbuild/` or `.artifacts/KEEP` is preserved.
- A PR closed unmerged: `pnpm worktree remove <short-desc> --discard`, only when the maintainer says its work is not
  needed.
