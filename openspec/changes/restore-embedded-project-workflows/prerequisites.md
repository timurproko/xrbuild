# Prerequisites and ownership

## Owner

Core-only: generic control-panel code, public contracts, tests and documentation. No private workspace provisioning, modification, export or dependency installation is needed for planning or public acceptance fixtures.

## Ordered specification synchronization

`user-workspace-public-core` -> `split-private-workspace` -> `bundled-extensions` -> `restore-embedded-project-workflows`.

The bundled-extensions implementation is present in the checked main baseline, but its specification remains an active delta. This change modifies its project requirements as a successor. Do not edit, archive or mark predecessor tasks complete. The repository bot must synchronize predecessors before finalizing this successor's modified requirements. Local validation does not establish that this remote delivery prerequisite is satisfied.

## Approval and delivery

This is a behavior/specification change, not a CSS-only repair. Obtain maintainer review of the plan before implementation. Commit/push only with authorization; implementation remains in fix/apps-ui-regression and its linked task worktree. A draft PR and normal delivery gates are required; no merge, ready mutation or main push is authorized.

## Compatibility boundary

Preserve core/private separation, product-source immutability, ordinary project behavior, scoped personal settings, generation-pinned consumers, contained filesystem access and configured publication/signing prerequisites. The new workflow removes embedded-only action bans, not general safety or capability checks. Old user state and failed/interrupted preparations must remain inspectable, never automatically deleted to make recovery succeed.
