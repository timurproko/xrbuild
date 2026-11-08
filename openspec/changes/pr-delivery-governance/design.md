# Design: protected pull-request delivery

## Observed gaps

Committed governance configuration and workflows are not live enforcement. Read-only inspection found disabled Actions, absent bot settings, no active public default-branch ruleset and an always-on administrator bypass in declared configuration. A separately owned private repository reports an account-capability denial for both rulesets and classic branch protection. This must remain an explicit blocker, not become an instruction to publish private source.

The existing trusted promotion implementation already reads default-branch policy and treats the exact PR head as data. Preserve that design rather than copying unrelated product or release automation. Completion of PR-body outcomes alone must not conceal unchecked linked implementation tasks or an invalid association. Conversely, post-ready CI results are integration gates, not implementation checkboxes that must falsely claim future runs already passed.

## Intended flow

1. An approved implementation is developed in its isolated branch and draft PR. Its author owns truthful Implementation checkboxes and detailed task bookkeeping; acceptance is plain behavior/outcome text.
2. Default-branch trusted policy inspects one same-repository snapshot: PR identity, base, head, body, declared association and the exact tree's applicable task ledger. Forks, unrelated legacy drafts and incomplete candidates are not silently opted in.
3. The final checked outcome with complete records permits the bot to mark the draft ready. Re-read every mutable input immediately before mutation. A fully checked body with unfinished authoritative records produces a visible stable blocker rather than a green no-op.
4. Existing trusted finalization archives/synchronizes the linked change on the PR branch. Ordinary PR CI must run against the resulting exact final head and emit the stable `CI required` aggregate only when all selected gates actually succeed.
5. The maintainer reviews and merges through the PR. Promotion is not acceptance, merge permission or authority to arm implementation auto-merge.

A repository without the core specification layout needs its own explicit, versioned completion contract and trusted task-source policy. Do not point its workflow at core scripts or infer completion from titles, branches, task counts shown by the UI or arbitrary prose. Existing companion drafts require explicit migration after review, not automatic promotion because their current bodies happen to contain checked boxes.

## Credentials and event propagation

Use a repository-installed bot identity with only the permissions needed for PR readiness/body updates and finalization commits on topic branches. Existing variable/secret names can remain compatible. The owner installs/grants the bot per repository and supplies its key through a secure secret channel; never request a key in chat, copy secret values out of another repository or persist credentials as scratch. The agent may verify setting names and installation capabilities, not print keys or tokens.

Keep ordinary workflow tokens read-only by default and PR review approval disabled. Privileged workflows execute only trusted base policy and pinned trusted tooling, never install or execute candidate scripts with bot credentials. The ready transition and finalization push must use an identity whose events start downstream CI; a suppressed workflow-token event is not successful activation. Reconciliation is bounded and idempotent, and reports missing bot configuration clearly.

## Default-branch protection

Keep settings declarative and idempotent. Protect the default branch with PR-required squash integration, linear history, review-thread resolution, no deletion, no force pushes and the required aggregate attributed to the expected check producer. No always-on administrator or bot bypass is allowed. No independent approval count is required for a single-maintainer repository; this does not waive PR or CI requirements. Unrelated rulesets, labels and repository settings remain untouched.

The core governance command remains bound to its own canonical repository. Companion governance belongs to the independently owned repository, with its own instructions, branch, PR and tests. Public documentation describes the contract without private repository identities or links.

## Capability checks and activation

Preflight checks repository identity, actor permission, protection feature availability, Actions state, workflow/token policy, bot setup, trusted workflow presence and expected check names. A capability-denied response remains `blocked`, distinguishable from authentication failure, an absent ruleset, unknown network state or ordinary configuration drift. Neither classic protection fallback nor a changed visibility may be claimed as equivalent when the service rejects both mechanisms.

Live application uses the maintainer-approved exact configuration and records before/after readback. Activate only the reviewed workflow set and selected validation lanes; do not activate publication, physical hardware or unrelated delivery automation. Never temporarily disable protections to bootstrap a policy merge. Unsupported companion protection remains an unmet acceptance condition even if its CI can run.

## Bootstrap and existing work

This governance change starts independently from the default branch, not the unmerged application rollout. A workflow cannot establish its own trust by executing policy from its proposed head. Where the trusted default-branch implementation already supports readiness, configure and verify that path; otherwise the maintainer reviews the bootstrap policy PR under the current approved manual path. An agent never performs its merge or changes readiness as a substitute for the bot. Reconcile existing drafts explicitly after trusted policy is installed.

Do not fabricate completion of predecessor specification synchronization, unrelated private automation work or the current rollout's remaining tasks to make a ready mutation succeed. Scope changes require a separately approved follow-up disposition. Re-enable existing events or request a bounded owner-authorized reconciliation after activation; old pushes alone need not generate new workflow runs.

## Validation

Add API and trusted-policy fixtures for complete/incomplete/stale/forked candidates, fully checked bodies with open task ledgers, missing credentials, suppressed events, unsupported protection capabilities, no bypass, aggregate provenance and wrong-repository refusal. Test promotion separately from exact-final-head CI and manual merge. After owner prerequisites are satisfied, record real readbacks and an explicitly opted-in canary PR transition in each repository. A canary must not merge, publish artifacts containing private source, start devices or alter existing implementation scope. Missing live acceptance stays visible rather than being replaced by local fixtures.
