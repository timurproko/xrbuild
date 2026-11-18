## Why

Change delivery now runs from the shared delivery workflow this repository calls. The canonical specifications still
describe the removed local automation: a repository skill, a local body contract and finalizer, a local delivery
check, documentation auto-merge, a governance tool and a base-commit policy rule. A specification that describes
removed behaviour misleads the next change.

## What Changes

- Retire the `repository-governance` capability: rulesets and the Actions event policy are declared in the shared
  workflow repository and installed with its `delivery protect` command.
- Remove the generic delivery requirements from `change-delivery` and state that delivery is delegated to the shared
  workflow. The repository-specific requirements stay: worktree sweep and handoff, agent session worktree context,
  embedded workspace in task worktrees, and the accepted public contract checkpoint.
- Remove the base-commit policy and ready-branch refresh requirements from `ci-validation`, and drop the delivery
  check from the draft rule.

No code changes: the automation itself was removed when the shared workflow was adopted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-delivery`: generic delivery rules removed, delegation to the shared workflow added.
- `repository-governance`: retired.
- `ci-validation`: local delivery policy and branch refresh removed; the draft rule no longer names a delivery check.

## Impact

Specifications only.
