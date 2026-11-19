## REMOVED Requirements

### Requirement: Worktree sweep and handoff
**Reason**: Worktree sweep, handoff and cleanup are delivery-workflow rules owned by the shared delivery workflow outside this repository.
**Migration**: None. Follow the shared delivery workflow; this repository specifies no delivery rules.

### Requirement: Agent session worktree context
**Reason**: Binding an agent session to a task worktree is a delivery-workflow rule owned by the shared delivery workflow.
**Migration**: None. Follow the shared delivery workflow.

### Requirement: Embedded workspace in task worktrees
**Reason**: Provisioning and cleanup of task worktrees are delivery-workflow rules owned by the shared delivery workflow.
**Migration**: None. Repository-development commands still select the invoking checkout's `.xrbuild/` (`workspace-location`, "Explicit embedded workspace selection").

### Requirement: Accepted public contract checkpoint
**Reason**: It describes a one-time reconciliation procedure for the specification baseline, not behaviour of this repository's code.
**Migration**: None.

### Requirement: Delivery is delegated to the shared workflow
**Reason**: With every delivery rule owned by the shared workflow, this repository specifies none; the delegation itself is a delivery-workflow statement.
**Migration**: None. `ci-validation` specifies what this repository's own CI does.
