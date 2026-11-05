# Tasks

Workflows that run only from `main`'s copy (`pull_request_target`, `workflow_run`, `schedule`, `workflow_dispatch`) cannot
run end to end before this change merges. Their live checks are the tasks of the follow-up change
`pr-delivery-automation-rollout`, whose PR is the first one the bot finalizes; the tasks here are verified by unit
tests, local runs and this PR's own CI.

## 1. Bot identity (maintainer)

- [x] 1.1 Maintainer creates (or reuses) the GitHub App (design D11: repository permissions Contents, Pull requests, Issues read and write; Administration and Metadata read; no webhook), installs it on this repository only, and sets the Actions variable `XRB_BOT_APP_ID` and the secret `XRB_BOT_PRIVATE_KEY`; verify `gh variable list` and `gh secret list` show both (the token probe is rollout task 1.2)
- [x] 1.2 Add the shared step `.github/actions/app-token` that mints the token and the bot's commit identity and stops with a message naming the missing variable or secret, and a `Bot probe` dispatch workflow (with `simulate_missing`); verify every bot workflow uses the step (the live runs are rollout tasks 1.2 and 1.3)

## 2. PR body contract

- [x] 2.1 Add `tools/pr-automation/pr-body.mjs`: parse the `openspec-implementation` fence (version 1, change id as a folder name, optional `archive` and `finalizedHead`), report malformed blocks, and rewrite only the fence; verify with `node --test` cases for a valid block, no block, bad JSON, unknown version, bad id and a rewrite that leaves the rest of the body byte-identical
- [x] 2.2 Replace `.github/pull_request_template.md` with Proposal / Implementation / Acceptance / collapsed Automation (empty fence); verify the parser reads the template's block as "not linked" until a change id is filled in

## 3. Delivery skill and conventions

- [x] 3.1 Write `.claude/skills/change-delivery/SKILL.md` (design D1, D3, D12): preflight sweep, worktree, plan-first draft, approval gate, implementation in the same PR, acceptance, ready, finalization, handoff report, cleanup, never merge; verify the agent tool lists the skill and a read-through against this change's own PR finds no step it skips
- [x] 3.2 Point `.claude/CLAUDE.md` and `openspec/config.yaml` at the skill and replace the "Changes and pull requests" rules it now owns with a short summary; verify `pnpm check:names` passes and no rule is stated in two places with different wording
- [x] 3.3 Add `.artifacts/` to `.gitignore`; verify `git status` stays clean after writing `.artifacts/pr-body.md` in a worktree

## 4. Worktree sweep and handoff

- [x] 4.1 Add `pnpm worktree handoff <name> [--change <id>] [--pr <n>]`: write `.artifacts/handoff.json` and print the report skeleton; verify with a test on a temporary repo and worktree
- [x] 4.2 Add `pnpm worktree sweep [--apply]` with the states of design D12 (PR state from `gh`, injectable for tests) and removal of merged clean worktrees only; verify with tests for each state, including that `--apply` keeps `dirty`, `active`, `closed` and `unknown`
- [x] 4.3 Add `remove --discard` for a worktree whose PR closed unmerged; verify a test refuses it for an open or merged PR and removes it for a closed one

## 5. CI readiness, base-commit policy and delivery check

- [x] 5.1 Add `tools/pr-automation/delivery.mjs` (design D5): linked change still active, malformed block, untracked changes to an active change folder, `openspec-in-progress` label; verify with `node --test` cases over fixture trees and bodies for each pass and fail path
- [x] 5.2 In `ci.yml`, add `ready_for_review`, `converted_to_draft`, `edited`, `labeled` and `unlabeled` types, a `Readiness` job, skip Node and host jobs on drafts, and a `Delivery` job running `delivery.mjs` from the base commit (skipped with a notice while the base has none); `CI required` accepts `Delivery` success or skipped; verify on this PR: as a draft only the light jobs run, marked ready the rest run, and `Delivery` reports the base has no check yet (the run against `main`'s copy is rollout task 2.4)

## 6. OpenSpec finalization

- [x] 6.1 Add `tools/pr-automation/finalize.mjs` (design D4): already-finalized no-op, open-task refusal with the list, archive with the pinned CLI (`@fission-ai/openspec` 1.14.1 as a dev dependency), strict validation, fence update; verify with `node --test` on a temporary repo holding a fixture change (archive result, specs synced, idempotent second run, open-task refusal)
- [x] 6.2 Add `.github/workflows/openspec-finalization.yml` (`pull_request_target`, non-draft same-repo linked PRs, scripts and CLI from `main`, PR head checked out with the App token, commit and push as the App, body update); verify the workflow installs and runs only `main`'s copy and never the PR's (the live run is rollout task 2.2)
- [x] 6.3 Make a refused finalization fail its run with the open tasks in the run summary; verify with the `node --test` refusal case (the live refusal is rollout task 2.3)

## 7. Docs auto-merge on the App

- [x] 7.1 Extend `planAutoMerge` to exclude PRs that link a change or touch an active change folder, and to remove auto-merge the App armed; verify with new `node --test` cases next to the existing ones
- [x] 7.2 Switch `docs-auto-merge.yml` to an App token; verify the workflow passes the App's login to the script (the live merge and the CI run on `main` are rollout task 2.1)

## 8. Unarchived change report

- [x] 8.1 Add `tools/pr-automation/reconcile.mjs` (design D8, merged-PR lookup injectable) and `.github/workflows/openspec-reconcile.yml` (nightly and dispatch, issue labelled `openspec-reconcile` updated in place, closed when clean); verify with `node --test` for the listing and the issue plan (the live run is rollout task 3.1)

## 9. Repository settings as code

- [x] 9.1 Add `config/github-repository-governance.json` with today's live settings, the `protect-main` ruleset and labels `no-auto-merge`, `openspec-in-progress`, `openspec-reconcile`, `nightly-failure`, `governance-drift`; verify `check` against the live repository reports only the new labels as missing (the maintainer's apply is rollout task 1.1)
- [x] 9.2 Add `tools/repo-governance/governance.mjs` `check` and `apply --confirm apply-xr-build-governance` (design D9; API calls injectable) and `pnpm governance`; verify with `node --test` for declared-keys-only comparison, ruleset normalisation, the dry run without the flag and no deletion of undeclared rulesets or labels, and a live dry run that writes nothing
- [x] 9.3 Add `.github/workflows/governance-drift.yml` (weekly, on changes to the file, dispatch; App token; issue on drift, closed when clean); verify the workflow runs `check` with the App token (the live drift round trip is rollout task 3.2)

## 10. Nightly run and triage

- [x] 10.1 Add a nightly `schedule` to `ci.yml` (its own concurrency group, so a push to `main` does not cancel it); verify every job's condition selects it for any event other than `pull_request` (the live run is rollout task 3.3)
- [x] 10.2 Add `tools/pr-automation/nightly-triage.mjs` (design D10: scaffold, draft PR, label, link, comment on repeat and on green; GitHub calls in `main`) and `.github/workflows/nightly-triage.yml` (`workflow_run` of `CI`, schedule event only, dispatch with a run id, App token); verify with `node --test` for first failure, repeat failure and green-again, and that the scaffold passes strict OpenSpec validation (the live triage is rollout task 3.4)

## 11. Docs and close-out

- [x] 11.1 Update `README.md` (changes and pull requests: worktrees, PR flow, settings, the repo bot) and `.claude/CLAUDE.md` layout lines for the new tools, workflows and `config/`; add the follow-up change `pr-delivery-automation-rollout`; verify `pnpm check:names`, `pnpm test` and `openspec validate --all --strict` pass
- [x] 11.2 Archive this change in its own PR by hand (design D13: `openspec archive pr-delivery-automation --yes`); verify the specs `change-delivery`, `ci-validation` and `repository-governance` exist under `openspec/specs/` and strict validation passes
