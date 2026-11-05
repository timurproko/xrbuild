## ADDED Requirements

### Requirement: Session-start ownership routing
Core entry-point instructions SHALL describe generic engine/library ownership, the core-owned embedded workspace, and independently owned user workspaces. An agent starting at the core checkout SHALL determine affected repositories, read applicable instructions, and bind an isolated task worktree before edits. Private source SHALL be provisioned only when the task needs it and access is authorized.

#### Scenario: Embedded module task
- **WHEN** a task changes only reviewed embedded plugins or projects
- **THEN** its source, tests and planning belong to the core task branch and public PR without requiring private access

#### Scenario: Private-only task
- **WHEN** a task changes only the authorized private workspace
- **THEN** the agent uses an independent task-local private clone and branch, delivers a private PR, and does not create an empty public PR or edit the primary clone

#### Scenario: Missing private access
- **WHEN** private changes are required but the selected repository cannot be independently provisioned or verified
- **THEN** the agent reports the blocker and does not stage the private change in core or borrow another task's workspace

### Requirement: Task-scoped delivery authorization
Instructions SHALL distinguish implementation permission, task delivery authorization and separate operational permissions. An explicit request to deliver a task MAY authorize scoped commits, task-branch pushes and PR creation/updates across its affected repositories without repeated confirmation for each command. It SHALL NOT authorize main pushes, agent merges, auto-merge activation by agents, production publication, device operations or destructive cleanup. Substantial core changes SHALL retain plan-first review.

#### Scenario: Approved task delivery
- **WHEN** the owner explicitly requests delivery and approves any required implementation plan
- **THEN** the agent may commit and push the task's reviewed changes to verified owning task branches and update their PRs while main branches remain untouched

#### Scenario: Investigation only
- **WHEN** the owner requests analysis without delivery authorization
- **THEN** analysis does not implicitly authorize committing, pushing or creating PRs

### Requirement: One coordinated private or local handoff
A task touching multiple repositories SHALL retain separate histories, branches and PRs and record their identities, tested immutable revisions, dependencies and outcomes in one private/local handoff. Public descriptions SHALL contain only public architecture, public artifacts and neutral requirements. Private identifiers, repository/PR URLs, deployment details, findings and source SHALL NOT be copied into public PR metadata or artifacts.

#### Scenario: Cross-repository change
- **WHEN** both public and private repositories change
- **THEN** one agent coordinates one PR per affected repository and reports a combined status privately without claiming a cross-repository atomic commit or merge

#### Scenario: Public architecture plan
- **WHEN** the public PR describes how embedded and user extensions interact
- **THEN** it uses neutral roles and synthetic examples without exposing the private migration inventory or client mapping

### Requirement: Revision-paired compatibility
Cross-repository delivery SHALL record exact tested revisions and an explicit dependency order. A private change requiring a public core update SHALL NOT be considered independently deliverable against an unmerged core task branch. Changes to either candidate or relevant base SHALL invalidate stale compatibility evidence.

#### Scenario: Required public core change remains open
- **WHEN** private tests pass only against an unmerged public core candidate
- **THEN** the private delivery reports the dependency and cannot qualify for automated merge until the accepted public revision is available and retested

#### Scenario: Candidate changes after tests
- **WHEN** a candidate or required base changes after validation
- **THEN** the handoff and automation require fresh validation for the new revision pair

### Requirement: Separately governed private app automation
Public coordination tooling SHALL default to manual private delivery unless an independently approved private-repository policy and enforcement are available. A proposed private automation lane MAY allow trusted bot promotion/merge of opt-in same-repository app-source/test PRs only when exact-head required checks and compatibility pass. Workflow, agent-policy, governance, dependency, binary, signing/publication configuration, native/device and unclassified changes SHALL remain outside the initial automated lane. Public implementation PRs SHALL remain maintainer-merged; agents SHALL NOT merge or arm auto-merge.

#### Scenario: Eligible routine app delivery
- **WHEN** a private repository has an approved and enforced automation policy and a qualifying opt-in app PR has current required validation
- **THEN** its trusted repository bot may handle routine delivery while the agent reports the result without issuing a merge itself

#### Scenario: Policy changed by candidate
- **WHEN** an app PR also changes the automation allowlist, workflows or instructions
- **THEN** it requires manual review and cannot use its own proposed policy to authorize its merge

#### Scenario: Automation is not configured
- **WHEN** private Actions, required checks, protection or trusted bot permissions are disabled or unavailable
- **THEN** coordination reports manual delivery as required and never labels the absent checks as passing

### Requirement: Privileged merge isolation
Any separately enabled private merge bot SHALL use trusted base-branch code and validated metadata for privileged decisions, never run candidate code with merge credentials, and never bypass repository protection. It SHALL validate complete changed-path classification, authorized opt-in, repository and PR identity, approved check provenance, current head/base compatibility and applicable review state immediately before acting. Missing, stale, failed, skipped or ambiguous required validation SHALL block delivery. Merging source SHALL NOT itself publish an application.

#### Scenario: Candidate changes after eligibility check
- **WHEN** the PR head changes between eligibility evaluation and the merge attempt
- **THEN** the bot refuses to act on stale authorization and requires validation of the new head

#### Scenario: Candidate tries to run privileged code
- **WHEN** candidate files contain modified scripts or workflow artifacts
- **THEN** the privileged decision uses trusted base code and does not execute those files with merge credentials

#### Scenario: Source merge succeeds
- **WHEN** the private bot merges an eligible source PR
- **THEN** no deployment, credential upload, device activation or production publication follows without a separately authorized operation
