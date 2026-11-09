## ADDED Requirements

### Requirement: Protected default branch requires pull-request integration
Each approved repository SHALL enforce pull-request-only updates to its default branch with squash integration, linear history, resolved review threads and the stable required CI aggregate attributed to its expected producer. It SHALL prohibit deletion and force pushes and SHALL provide no administrator or bot bypass. Agents SHALL NOT merge implementation PRs, arm their auto-merge or push to the default branch.

#### Scenario: Administrator attempts a direct update
- **WHEN** an administrator attempts to update the protected default branch without a pull request
- **THEN** the configured policy rejects that update rather than exempting the administrator

#### Scenario: Bot finalizes a candidate
- **WHEN** trusted automation writes a finalization commit
- **THEN** it writes only the owning PR branch and cannot bypass default-branch PR or required-check rules

### Requirement: Automation activation is explicit and verifiable
Governance SHALL distinguish committed policy from live configuration. Approved activation SHALL verify repository identity, actor authority, Actions enablement, trusted workflow presence, bot configuration and expected required-check identity before applying the exact declared policy, then SHALL read back the resulting state. Unrelated settings and workflows SHALL not be enabled or rewritten incidentally.

#### Scenario: Workflows exist but Actions are disabled
- **WHEN** workflow source is present while repository Actions are disabled
- **THEN** governance reports automation inactive rather than claiming that pushes or checked tasks will start CI

#### Scenario: Part of an application fails
- **WHEN** the hosting service rejects a required mutation or its readback cannot be verified
- **THEN** governance reports partial or blocked activation with the affected capability and does not report both repositories configured

### Requirement: Unsupported protection remains an owner-visible blocker
A repository whose account does not support required branch protection SHALL remain explicitly blocked. Automation SHALL distinguish capability denial from absent configuration and unknown API state and SHALL NOT change repository visibility, purchase a plan, relax required checks or invent an equivalent successful protection result.

#### Scenario: Private protection is unavailable
- **WHEN** the service refuses both rulesets and classic protection for an account capability reason
- **THEN** the report identifies the owner-controlled prerequisite and preserves private visibility without trying to bypass the restriction

### Requirement: Privileged workflow credentials remain isolated
Privileged readiness/finalization SHALL execute trusted default-branch policy and pinned trusted tooling only. Candidate trees SHALL be treated as data. Bot credentials SHALL be repository-scoped and limited to required PR/topic-branch operations; ordinary workflow tokens SHALL default to read-only without PR-review approval. Secret values SHALL not enter source, logs, chat or scratch files.

#### Scenario: Candidate changes automation scripts
- **WHEN** a candidate modifies its own promotion, finalization or dependency scripts
- **THEN** privileged inspection uses trusted base policy and neither installs nor executes those candidate scripts with bot credentials

#### Scenario: Bot configuration is absent
- **WHEN** required bot installation or key configuration is missing
- **THEN** activation reports the missing setting or permission without exposing a secret or silently substituting an event-suppressed identity

### Requirement: Ready transitions produce exact-head CI
A complete opted-in draft SHALL be promoted by trusted automation only after rechecking its repository, identity, base, head, body, task records, acceptance and open/draft state. Bot-origin ready and finalization events SHALL trigger ordinary PR validation for the final candidate head. The stable required aggregate SHALL succeed only when all selected gates actually succeeded for that head. Readiness SHALL confer no implementation merge authority.

#### Scenario: Finalization advances the candidate
- **WHEN** finalization writes a new head after draft promotion
- **THEN** selected CI gates run against that final head and prior draft results cannot certify it

#### Scenario: Workflow-origin event is suppressed
- **WHEN** a ready mutation or finalization push does not produce its required CI event
- **THEN** governance reports the missing event as blocked rather than treating promotion itself as a successful CI run

### Requirement: Companion governance has independent ownership
A separately owned repository SHALL hold its own completion contract, trusted workflows, tests and protection configuration. Core governance SHALL not apply core settings to that repository, import its source or expose private identifiers in public artifacts. Historical companion PRs SHALL require an explicit reviewed migration or supersession decision, not automatic readiness based solely on existing checked boxes.

#### Scenario: Core command targets another repository
- **WHEN** the core governance command resolves an independent companion as its mutation target
- **THEN** it refuses the operation and identifies the ownership mismatch

#### Scenario: Existing private draft lacks the completion contract
- **WHEN** a historical draft has checked body items but lacks the approved versioned completion association
- **THEN** trusted automation leaves it unchanged until its owner approves an explicit migration
