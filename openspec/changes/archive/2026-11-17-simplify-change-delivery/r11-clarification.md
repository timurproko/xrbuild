# Approved paired R11 clarification

The maintainer explicitly authorized: "yes apply R11 clarification to both prs". This is the coordinated contract refinement required by R18, not an implementer-authored exception or a new release-policy decision.

## Exact scope

R11 restricts the ordinary documentation auto-merge controller. Existing release-specific automation, including release-reopening PRs, remains unchanged and governed by its existing eligibility and authorization rules. This grants no new automation authority, does not expand release eligibility or authorize implementation-PR auto-merge, and does not enable dormant workflows. Do not convert the existing release-specific route to manual integration.

The ordinary documentation allowlist, complete-diff/rename checks, authority-path exclusions, hold/opt-out, live-activation checks and human-arm protections remain intact. This clarification does not treat package manifests as routine documentation or introduce a new release route in a repository that has none.

## Updated approval anchors

The contract identity remains `portable-delivery-v1`; this is its explicitly approved paired R11 scope refinement. Planning and deployed copies must match these updated hashes in both repositories:

- `delivery-rules.md`: `f2518a1e49317eef3c64c79733162b80613afee0cbdaf6e6945117e1a6be9876`
- `delivery-contract.json`: `940f241fbdb925c79b2c9717ead2b41e64f05e93b5ff4d9edd96fb3b11f1faa1`
- `delivery-adapters.json` remains unchanged: `8a8b0c4e395003457ce0f2f7d0eae78a9cde227d4db6f4fc550f764e609fd741`
- `delivery-cases.json` remains unchanged: `e35a6024a97fe355f7eb9d6efbc8502fd67f2191949b08f6338f07d283d61f4c`

Only the rulebook's R11 wording, its digest manifests, independent hash anchors and directly conflicting planning records are refined. All 50 expected cases, other rule sections, adapter policy values, OpenSpec framework assets, release code/workflows and existing regression expectations remain unchanged.

## Implementer continuation

Fetch this paired update and reconcile it into the existing task without discarding local work. No further R11 scope approval is needed. Verify the updated contract installation and existing ordinary-documentation/release-specific regression coverage; update task completion only from actual current evidence. Do not continue describing R11 clarification as awaiting approval. Preserve other incomplete tasks and dependencies, including downstream runtime-release availability. This update does not mark the PR ready, claim full CI/acceptance, authorize release/hosting changes or permit a merge.
