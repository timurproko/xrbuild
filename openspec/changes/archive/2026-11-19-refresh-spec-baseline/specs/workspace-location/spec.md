## REMOVED Requirements

### Requirement: Embedded workspace versioning
**Reason**: It specified how a separate private repository versions its own content, which is repository governance and not behaviour of this repository's code.
**Migration**: None. "Workspace roots" keeps the only core-side fact: the workspace may be an independent clone at the core's ignored `.xrbuild/` path.

### Requirement: Private workspace naming boundary
**Reason**: The implemented part is the name guard's exclusion of `.xrbuild/`; the remainder is governance of a separate repository.
**Migration**: See the `name-guard` capability, "Private workspace is excluded".

### Requirement: Independent task workspace ownership
**Reason**: Task worktree provisioning and cleanup are delivery-workflow rules owned by the shared delivery workflow.
**Migration**: None. "Explicit embedded workspace selection" keeps the product behaviour: a repository-development launch selects the invoking checkout's `.xrbuild/`.
