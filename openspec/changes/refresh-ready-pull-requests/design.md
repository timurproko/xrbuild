# Design: refresh stale ready pull requests

## Current behavior

`.github/workflows/ci.yml` reacts to PR events and pushes to `main`. A main push checks main but does not synchronize other PR heads. `config/github-repository-governance.json` declares CI, promotion, probe and inactive workflows; `tools/repo-governance/activation.mjs` rejects undeclared workflow roles and only activates its known roles. There is no branch-refresh workflow.

The existing App already supplies the Contents and Pull requests write identity used by trusted finalization. A workflow-token branch update would suppress downstream workflow events, so the refresh must use an App installation token with no workflow-token mutation fallback.

## Outcome 1: bounded refresh policy and API client

Add `tools/pr-automation/ready-pull-request-refresh.mjs` for pure eligibility/response decisions and the reconciliation function, with a small trusted CLI entrypoint and focused Node tests. Use only Node built-ins; install or execute no candidate dependencies/scripts.

1. List all open PRs targeting `main` through bounded pagination (100 entries per page, at most 10 pages). Malformed listings or exceeded bounds fail before branch writes.
2. Re-read each listed PR. Require a positive integer number, open state, boolean non-draft status, base `main`, both head and base repositories equal to the governed repository, and a full hexadecimal head SHA. Skip closed/draft/fork/wrong-base candidates; fail malformed identities. Verify the fresh PR number matches the listed number.
3. Read the current `main` ref and compare `main...head`. Reject malformed SHA/comparison data. `behind_by === 0` is current and receives no write.
4. For a stale eligible candidate, call `PUT /repos/{repository}/pulls/{number}/update-branch` with `expected_head_sha`. Never force-push, rebase or reset a branch.
5. Report HTTP 202 as accepted (not as CI success), expected-head mismatch as deferred, no-new-commits as current, and merge conflict as blocked for human resolution. Other errors fail that candidate while independent candidates continue; authentication/authorization failures abort the pass.
6. Print bounded per-candidate evidence: PR number, observed head, observed target, disposition and reason. Never print tokens or credentials. A base movement during the pass is not certification of a frozen base; later merge events reconcile against fresh main again.

The CLI must require the dedicated App-token environment variable, verify the governed repository identity, use bounded HTTPS requests with redirects rejected, and return failure for operational errors. Do not copy external repository names or policy into core artifacts.

## Outcome 2: trusted event-producing workflow

Add `.github/workflows/ready-pull-request-refresh.yml`:

- Use `pull_request_target` for merged `closed` PRs targeting `main`. Closed-unmerged events do nothing.
- Include the existing documentation-auto-merge workflow's completed `workflow_run` bridge so token-suppressed merge events can be reconciled if that auxiliary workflow is separately enabled later. Read the current PR inventory rather than trusting that run's branch, artifacts or code; duplicate events are idempotent. Do not enable documentation auto-merge here.
- Check out the trusted repository default branch with checkout credentials disabled and use pinned setup/token actions. Never check out a candidate head, download its artifacts, run candidate code or install dependencies with privileged credentials.
- Use global `ready-pull-request-refresh` concurrency without canceling the running pass, a bounded job timeout, and read-only workflow-token permissions. Mint a current-repository App installation token scoped to Contents and Pull requests write; do not broaden App installation permissions or fall back to `GITHUB_TOKEN`.
- Run only the trusted entrypoint. Record its results in the job summary. Accepted updates emit `synchronize`, activating ordinary CI and existing idempotent finalization on the updated heads; those workflows remain responsible for validation.

This also refreshes ready PRs when the automation PR itself merges, subject to the live workflow being enabled. The workflow never promotes drafts, edits bodies/checklists, sets statuses, merges PRs or arms auto-merge. It does not retry arbitrary historical failed runs; a branch already containing main remains unchanged even if its old run stalled.

## Outcome 3: reviewed governance and operator guidance

Declare an explicit `refresh` workflow role and the trusted refresh entrypoints in the governance file. Extend role validation, enablement planning and readback consistently so full activation includes refresh, while `activate-ci` disables it and `protect` does not mutate workflow state. Add focused activation fixtures for all three cases, unknown-role rejection and missing trusted-main policy. Preserve the existing no-bypass protection, `CI required` producer, non-strict status policy, squash-only main integration and `allow_update_branch: false` (UI preference, not API authorization).

Update `docs/pr-delivery-governance.md` and the repository CI/layout guidance to describe triggers, eligibility, dispositions, App event production and rollout. A source change is not live activation: use the existing read-only preflight and require separate explicit confirmation for any hosting mutation. Keep the existing disabled auxiliary workflows disabled.

## Verification and rollout

Focused tests cover pagination, candidates, current/stale comparisons, head races, merge conflicts, independent failures, credential aborts, malformed API responses and absence of forbidden writes. Workflow-policy tests enforce trusted checkout, App identity, trigger scope, non-canceling concurrency and timeout. Governance tests cover activation profiles and unchanged required protection. Run the name guard and strict change validation; no broad repeated native/device suites are needed for this policy-only change.

After maintainer merge, an authorized live merge/canary can prove that a stale ready branch is updated by the App and receives ordinary CI at the new head. Record exact head/run evidence then. This post-merge observation is a reported rollout gap, not an implementation task to tick in advance. No extra canary PR, merge, activation apply or cleanup is authorized by this plan.
