## MODIFIED Requirements

### Requirement: PR body contract
A new linked draft SHALL have `## Proposal` (one or two sentences), `## Implementation` (at least two outcome checkboxes initially unchecked, with two to five recommended for readability), and final collapsed `## Automation` with a valid link. Trusted promotion SHALL NOT impose a maximum number of otherwise valid Implementation outcomes. On completion the PR SHALL add `## Acceptance` (one to ten plain outcome bullets) and check all Implementation items. Existing ready version-1 PRs with plain Implementation bullets SHALL retain their finalization path. One parser SHALL own the link fence.

#### Scenario: Linked PR
- **WHEN** a PR body holds a valid fence naming an active change
- **THEN** CI and trusted finalization treat the PR as delivering that change

#### Scenario: Malformed link
- **WHEN** the fence holds invalid JSON, an unknown version or a change id that is not a valid folder name
- **THEN** the delivery check fails with a message naming the problem

#### Scenario: Draft progress
- **WHEN** an agent completes a scoped implementation outcome and its code, tests and detailed task bookkeeping
- **THEN** it checks that PR body item without marking the PR ready or claiming maintainer acceptance

#### Scenario: Detailed implementation checklist
- **WHEN** a completed linked draft has more than five valid checked Implementation outcomes
- **THEN** trusted promotion accepts the checklist rather than blocking solely because it exceeds the recommended count
