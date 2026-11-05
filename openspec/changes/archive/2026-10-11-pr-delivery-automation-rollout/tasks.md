# Tasks

## 1. Settings and bot

- [x] 1.1 Remove `governance-drift.yml` and the `governance-drift` label, make the bot probe read only the repository, pull requests and issues, and drop Administration from the documented App permissions; verify no workflow calls a settings or rulesets endpoint (`grep` for `actions/permissions` and `rulesets` in `.github/`)
- [x] 1.2 Maintainer runs `pnpm governance apply --confirm apply-xr-build-governance`; verify it creates `openspec-in-progress` and `openspec-reconcile`, removes the `protect-main` bypass actors (3.7), and its closing `check` reports a match
- [x] 1.3 Dispatch `Bot probe` from this branch with the App's Administration permission set to No access; verify the run names the App's bot login and reads the repository, pull requests and issues with the App token
- [x] 1.4 Dispatch `Bot probe` with `simulate_missing`; verify the run stops at the guard with a message naming `XRB_BOT_APP_ID`

## 2. PR flow

- [x] 2.1 Open a ready PR that only fixes a README sentence; verify the App arms squash auto-merge, the PR merges once `CI required` passes, and a `CI` run starts on `main` for the merge commit
- [x] 2.2 Deliver this change through its own PR linked to `pr-delivery-automation-rollout`; verify marking it ready with all tasks done produces one `docs(openspec): finalize pr-delivery-automation-rollout` commit by the App, CI reruns on it, `Delivery` turns green and the Automation block records `archive` and `finalizedHead`; a later push makes no second finalization commit
- [x] 2.3 Before 2.2, mark the same PR ready with this task still open; verify no commit is made and the finalization run fails with a summary naming the open task
- [x] 2.4 Verify on this change's PR that the `Delivery` job runs `main`'s `delivery.mjs` (log shows the base commit's policy path), and that as a draft it runs only `Readiness`, `Changes`, `Name guard`, `OpenSpec` and `CI required`

## 3. Scheduled workflows

- [x] 3.1 Dispatch `OpenSpec reconcile`; verify it lists the active changes, reports no merged-but-unarchived change and opens no issue
- [x] 3.2 Turn on rebase merging in the repository settings and run `pnpm governance check`; verify it exits 1 naming `repository.allow_rebase_merge`; restore with `pnpm governance apply --confirm apply-xr-build-governance` and verify `check` reports a match
- [x] 3.3 Dispatch `CI` on `main`; verify every job runs regardless of paths, including the host build
- [x] 3.4 Push a throwaway branch with a failing test, dispatch `CI` on it, then dispatch `Nightly triage` with that run's id; verify a draft PR `fix/nightly-<date>` labelled `nightly-failure` opens with the failure summary and a linked, valid change scaffold; close it unmerged and delete its branch and the throwaway branch
- [x] 3.5 Give each run on `main` (push, nightly, dispatch) its own concurrency group, so only PR runs cancel each other (a dispatched run on `main` was cancelled by the push of a merge); verify two dispatches of `CI` on this branch in a row both run to the end
- [x] 3.6 Read failed jobs' logs in nightly triage with `fetch` instead of `gh api` (which refuses responses with terminal escape sequences, as every CI log has) and strip every escape from the tail; list failing-test lines (`✖`, `not ok`) ahead of a shorter tail and leave out the `CI required` job (the first live run named only the failed package and showed `CI required`'s setup log); verify the `nightly-triage` tests pass and 3.4 runs from this branch
- [x] 3.7 Remove the admin bypass from `protect-main` (a click merged the first rollout PR past a failing `Delivery`), and compare an empty declared list as a whole in `diffDeclared` (it was taken for typed rules and reported `bypass_actors[undefined]`); verify the governance tests pass, and after 1.2 that the ruleset lists no bypass actors and GitHub offers no bypass on a PR whose `CI required` is pending
- [x] 3.8 Make `governance.mjs` take the repository from its own checkout, not the caller's folder, and refuse any repository other than `xr-build` before reading or writing (run from another repository's folder, apply once rewrote that repository's settings); verify the governance tests pass and `check` run from another repository's folder reports on `xr-build`
