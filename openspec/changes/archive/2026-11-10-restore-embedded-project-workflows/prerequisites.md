# Prerequisites and ownership

## Owner

Core-only: generic control-panel code, public contracts, tests and documentation. No private workspace provisioning, modification, export or dependency installation is needed for planning or public acceptance fixtures.

## Ordered specification synchronization

`user-workspace-public-core` -> `split-private-workspace` -> `bundled-extensions` -> `restore-embedded-project-workflows`.

The missing canonical-contract prerequisite is now satisfied through the maintainer-approved contract-only checkpoint in PR #5, following the relevant predecessor contracts in the order above. The normal bot finalized that checkpoint at `af537cf9496264e32e5d14911d4171c143c00e68` and archived it at `openspec/changes/archive/2026-11-10-reconcile-public-spec-baseline/`. The maintainer merged PR #5 into main at `8027ebd01444f5bb366cff055c0857ddf9ec8725` on 2026-11-10. That observed main snapshot contains the canonical `bundled-extensions` target and accepted workspace/ownership contracts and is incorporated into this branch.

This is the approved accepted-contract disposition documented in `docs/spec-baseline-reconciliation.md`, not completion or archival of the historical plans. Their migration, device, export, hosting and external-companion acceptance remains unchanged and outside this successor. Do not edit, archive or mark predecessor tasks complete, or blindly reapply their old deltas over newer canonical behavior.

This successor retains MODIFIED requirements against the actual merged canonical target. Its own normal bot finalization, exact-final-head CI and maintainer merge remain separate required gates; local validation does not certify them.

## Approval and delivery

This is a behavior/specification change, not a CSS-only repair. Obtain maintainer review of the plan before implementation. Commit/push only with authorization; implementation remains in fix/apps-ui-regression and its linked task worktree. A draft PR and normal delivery gates are required; no merge, ready mutation or main push is authorized.

## Compatibility boundary

Preserve core/private separation, product-source immutability, ordinary project behavior, scoped personal settings, generation-pinned consumers, contained filesystem access and configured publication/signing prerequisites. The new workflow removes embedded-only action bans, not general safety or capability checks. Old user state and failed/interrupted preparations must remain inspectable, never automatically deleted to make recovery succeed.
