## Why

The accepted public implementation was bootstrapped with unfinished historical OpenSpec plans. Canonical workspace specifications still describe core-tracked private content, and the canonical `bundled-extensions` capability is missing. Consequently the bot cannot finalize `restore-embedded-project-workflows` (PR #4), even though its implementation checks pass. Completing historical migration, external-companion and operational acceptance tasks is not equivalent to documenting the public contracts already implemented.

## What Changes

- Deliver the maintainer-approved, contract-only checkpoint for the accepted public implementation at `d7f9c04493f1731cdfbefc451d33b3900edb7c66`, not completion of any historical plan.
- Reconcile relevant workspace-separation contracts in recorded predecessor order, then embedded ownership and the pre-PR-#4 embedded project contract. Existing canonical ordinary-user resolution remains authoritative; do not restore obsolete defaults from older pending deltas.
- Have the normal repository bot synchronize and archive this independently completed reconciliation change. Do not manually edit canonical specs or archive predecessor plans.
- Preserve historical plans/tasks unchanged. Document remaining acceptance separately from this checkpoint and require explicit maintainer approval before treating the checkpoint as satisfying PR #4's canonical-contract prerequisite.
- Preview both this baseline and PR #4 against it with the pinned merger, preserving predecessor scenario identities and coverage. PR #4 remains a successor with MODIFIED requirements, not a newly invented capability.

## Capabilities

### New Capabilities

- `public-history-export`: Document the implemented read-only audit and owner-controlled export contract without claiming any export or hosting operation was performed.
- `bundled-extensions`: Establish the missing accepted public embedded contract before PR #4's workflow modifications.

### Modified Capabilities

- `workspace-location`: Independent private workspace ownership, explicit selection and cleanup protection.
- `change-delivery`: Independent task workspaces and explicitly approved contract-only baseline checkpoints.
- `ci-validation`: Public-only job ownership and already-implemented public embedded-boundary selection.
- `repository-governance`: Remove the obsolete workspace main-push exception and retain exact target validation.
- `plugin-host`: Generic core remains optional-plugin-independent while reviewed embedded modules use neutral contracts.

## Impact

Plan/delta artifacts first; implementation is a public-contract evidence review and documentation reconciliation, not runtime or privileged-automation changes. No private clone, source export, hosting mutation, hardware operation, task-completion rewrite or cleanup is authorized. No required check is removed or bypassed. The maintainer approved draft PR #5's checkpoint approach and requested implementation (`yes implement it`); only the maintainer chooses when to merge its normally finalized PR. PR #4 then incorporates that actual canonical baseline.
