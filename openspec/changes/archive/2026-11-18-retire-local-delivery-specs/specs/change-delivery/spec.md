## ADDED Requirements

### Requirement: Delivery is delegated to the shared workflow
Pull-request delivery SHALL be performed by the shared delivery workflow that this repository calls from one caller workflow containing no steps of its own. Draft promotion, OpenSpec finalization, the delivery check, ready pull-request refresh and merged-branch deletion SHALL NOT be implemented or re-checked by scripts, workflows or CI jobs in this repository. Agent instructions SHALL name the shared delivery skill as the owner of the delivery rules and SHALL keep only rules that are specific to this repository.

#### Scenario: A pull request is updated
- **WHEN** a pull request into the default branch is opened, edited, pushed, marked ready, converted to draft or closed
- **THEN** the caller workflow invokes the shared delivery workflow for that event
- **AND** no workflow in this repository promotes, finalizes or validates the delivery itself

#### Scenario: A repository-specific rule is needed
- **WHEN** a delivery rule applies only to this repository, such as private workspace preservation
- **THEN** it is stated in the agent instructions here and does not restate the shared rules

## REMOVED Requirements

### Requirement: Delivery skill
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: One task, one worktree, branch and PR
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Plan before code
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: PR body contract
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Finalization in the PR
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Finalization runs no PR code
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Delivery check
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Maintainer merges
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Documentation auto-merge
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Unarchived change report
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Agent scratch folder
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.

### Requirement: Implementation progress while implementing
**Reason**: The shared delivery workflow and its skill own this rule; this repository no longer defines or implements it.

**Migration**: Follow the shared delivery skill.
