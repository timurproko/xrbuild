# Protected PR delivery

Source policy is not live hosting configuration. `config/github-repository-governance.json` declares settings, no-bypass default-branch protection and reviewed workflow roles. This repository's command refuses other repositories and validates the canonical checkout identity; independently owned companions hold their own policy and commands.

## Agent completion and bot readiness

Keep the approved PR Implementation outcomes truthful. Check an outcome when its code/tests and detailed bookkeeping are written; add plain Acceptance before the final item. Run focused checks for changed code, not repeated broad local validation loops. Do not check future post-finalization CI, manual acceptance or merge as completed implementation.

Trusted main policy inspects the exact PR head as data with read-only credentials first. Unchecked implementation stays draft with a stable incomplete result. A fully checked body with unfinished detailed tasks or malformed acceptance/association reports an error explaining the blocker. Only an eligible snapshot requests a bot token, then rechecks PR identity, repository, base, head and body before promotion. No agent ready mutation, candidate dependency install or candidate script execution occurs with privileged credentials.

The App's ready event starts ordinary CI. The finalizer uses trusted tools, archives/synchronizes on the PR branch and rechecks before publishing and updating the body. Ordinary PR events validate the final head. Drafts do not emit a successful protected aggregate; selected gates that unexpectedly skip, fail or cancel cannot make `CI required` green. A green gate is not acceptance or permission for an agent to merge.

## Accepted public contract checkpoints

A missing canonical baseline after public bootstrap may be reconciled only through an explicitly approved,
contract-only checkpoint with public implementation evidence, independently complete tasks and the normal trusted
bot finalizer. Historical plans and unfinished task completion stay unchanged. This neither changes privileged
workflow execution nor waives any required check. A dependent successor remains blocked until the checkpoint is
bot-finalized and maintainer-merged; only then does its own ledger cite the observed canonical baseline.
See [baseline reconciliation](spec-baseline-reconciliation.md) for the accepted source, evidence and remaining scope.

## Owner prerequisites

Use a repository-installed App with Contents and Pull requests write, Metadata read, and only other permissions actually needed by enabled probes. Set the numeric App id in `XRB_BOT_APP_ID` and supply its key through the repository secret `XRB_BOT_PRIVATE_KEY`. Never put keys in chat, source, logs or scratch. Existing encrypted secrets cannot be extracted from another repository. Names/settings presence alone is not proof of installation permissions; a real probe and event-producing canary remain required.

Unsupported private protection is a hard account-capability blocker. Keep the repository private; the owner must provide a supported plan. No command purchases a plan, changes visibility, bypasses checks or fabricates successful protection.

## Commands and partial modes

- `pnpm governance preflight`: read-only capability/settings inspection for full automation. Reports missing bot setup and trusted-main bootstrap separately from ordinary drift.
- `pnpm governance protect`: dry-run PR-only protection and declared settings. It can proceed without bot credentials but requires supported protection and a trusted CI workflow on main.
- `pnpm governance activate-ci`: dry-run protection plus ordinary CI. Promotion/probe and explicitly inactive auxiliary workflows stay disabled; no automatic readiness is claimed.
- `pnpm governance activate`: dry-run reviewed protection/CI/promotion/probe activation after bot setup and trusted-main prerequisites exist.
- Add `--confirm apply-xr-build-governance` to a mutation mode only after reviewing its exact target and writes. Readbacks distinguish partial configuration from configured-but-not-certified automation.
- `pnpm governance check` and legacy `apply` compare/apply declared repository settings only. They are not complete automation certification. Legacy apply also refuses bypass actors.

The reviewed activation profile disables currently inactive documentation-auto-merge, nightly-triage and reconciliation workflows explicitly. Their existing narrow source policy is preserved, not broadened; re-enabling one requires a reviewed declaration change. An unknown active workflow blocks activation instead of being disabled silently. CI's existing software-only scheduled/native lane remains part of the reviewed CI workflow; this activates no hardware, publication, model or signing operation.

A partial application never automatically removes installed protection. Preserve successful restrictions, inspect drift and repair with an approved exact configuration. Roll back only to an equally restrictive known policy; never temporarily permit direct main updates, relax required checks or change visibility to bootstrap.

## Bootstrap and acceptance

Privileged policy cannot establish trust by executing its own proposed head. Main already has the core promotion/finalization entrypoints, but an independently owned repository may not. Where trusted policy is missing, its owner reviews and integrates the bootstrap policy through a PR under the existing manual route before enforcing the new checks; no agent performs that merge or substitutes a ready mutation. A branch-protection apply refuses a missing trusted CI workflow so it cannot lock the bootstrap behind a nonexistent check.

After setup, use the workflow's dry-run input to inspect one explicitly opted-in canary. Then authorize the event-producing reconciliation, observe readiness and final-head PR checks, and retain the exact head/run identities. Do not check real unfinished tasks just to make a canary eligible, auto-enroll old drafts, merge canaries or equate local fixtures with live acceptance. Events predating activation need an explicit bounded new event/reconciliation; they do not replay automatically.

The owner approved a one-time manual readiness bootstrap for the setup PRs. The maintainer clicks Ready for review; the agent does not. The core setup uses the established in-progress delivery label while activation/canary tasks remain pending. A companion may enable reviewed ordinary read-only CI independently of unavailable protection, but must report that partial state explicitly and keep privileged readiness off. Its bounded manual bootstrap validates proposed governance code and all retained legacy integration checks; it cannot grant candidate App privileges or waive unsupported source coverage.

Companion governance tests are not source/integration acceptance. Preserve useful existing validation in a separate selected lane when refreshing an explicitly approved older CI delivery, and retain its ancestry rather than force-pushing. Other source/retirement scopes still need reviewed coverage and the actual merged core dependency. No governance result represents private device or client acceptance, and no unrelated draft is silently migrated.
