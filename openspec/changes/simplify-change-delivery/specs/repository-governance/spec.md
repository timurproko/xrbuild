## MODIFIED Requirements

### Requirement: Declared repository state

Reviewed config/github-repository-governance.json SHALL declare merge settings, Actions default permissions, protect-main and required labels. The current no-bypass main policy, squash/linear integration and CI required SHALL remain unchanged by delivery simplification. No agent, bot or maintainer bypass SHALL be introduced. Changes SHALL use reviewed PRs; live apply retains separate explicit confirmation. Canonical wording SHALL describe declared/live no-bypass policy rather than obsolete admin authority.

#### Scenario: Reviewing a settings change
- **WHEN** the maintainer wants merge commits allowed again
- **THEN** the change is a PR editing the file, and the live setting changes only after an apply

#### Scenario: Merging before the checks
- **WHEN** the maintainer marks a PR ready while `Delivery` is still failing
- **THEN** the PR merges through the normal merge button only after `CI required` passes, and the delivery flow never uses the admin bypass to merge a PR

#### Scenario: Bot push to main
- **WHEN** a workflow with the App's token pushes to `main`
- **THEN** the ruleset refuses it

## ADDED Requirements

### Requirement: Source behavior does not imply workflow activation

Delivery guidance SHALL distinguish reviewed source, declared activation and observed live operation. Docs auto-merge, Nightly triage and OpenSpec reconcile SHALL remain disabled under the current reviewed profile; this simplification SHALL not enable them or apply repository settings. A future activation requires separately reviewed policy, explicit existing apply authorization and readback. New coordination labels SHALL be declared through governance without an implicit apply. Remote planning and routine local operations SHALL not require repository administration.

#### Scenario: Dormant workflow exists in source
- **WHEN** documentation describes its supported behavior
- **THEN** it SHALL condition that behavior on explicit activation rather than promise live effects

#### Scenario: Delivery policy changes
- **WHEN** this change implements portable delivery or hold support
- **THEN** current live workflow states and protection SHALL not be mutated implicitly
