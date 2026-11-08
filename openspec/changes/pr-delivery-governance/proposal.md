# Proposal: activate protected pull-request delivery

## Why

A pushed branch is not an integrated or validated delivery. The repository already declares task-based draft promotion, trusted finalization and a required CI aggregate, but live automation is disabled, bot configuration is absent and branch protection is not installed. The declared administrator bypass also conflicts with the requested rule that all work goes through pull requests. Independently owned companion repositories need equivalent enforcement without sharing source, secrets or publishing private policy through core history.

## What changes

- Make completed implementation drafts advance automatically through trusted exact-snapshot promotion, finalization and ordinary CI, while incomplete or invalid candidates remain drafts with actionable reasons.
- Require pull requests and the stable required CI aggregate on the default branch, including for administrators and the repository bot; prohibit direct updates, force pushes and branch deletion without adding a bypass identity.
- Make Actions enablement, least-privilege bot setup and live governance drift checks explicit, verifiable activation steps rather than assuming that committed workflow files configure hosting.
- Report unsupported private-repository protection, missing bot configuration and missing permissions as blockers. Never make a repository public, purchase a plan, weaken protection or substitute a successful status automatically.
- Define a separate companion delivery for independently owned CI/readiness/protection policy. Core tooling must not rewrite another repository's settings or import its source or identifiers.
- Document a maintainer-reviewed bootstrap for policy changes and existing drafts. Preserve current implementation PRs and their unfinished work; do not check tasks merely to trigger readiness.

## Capabilities

### New

- `repository-governance`: enforceable PR-only default-branch updates, explicit automation activation, capability reporting and independently owned companion policy.

### Modified

- `change-delivery`: actionable completed-draft readiness reporting, exact-head CI handoff and safe governance bootstrap without agent merge authority.

## Boundaries and approval

This is a plan-only change. It changes no live setting, workflow, permission, bot installation, repository visibility, billing, branch protection or PR readiness. Implementation follows maintainer plan approval. The requested eventual activation is in scope, but unavailable account capabilities and secret provisioning remain owner-controlled prerequisites. No agent merges, arms implementation auto-merge or pushes to a protected default branch. Existing narrow documentation-only auto-merge is not broadened. Public artifacts contain no private repository links, source inventories, client mappings or credentials.
