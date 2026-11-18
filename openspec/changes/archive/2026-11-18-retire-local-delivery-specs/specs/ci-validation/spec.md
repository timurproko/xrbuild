## MODIFIED Requirements

### Requirement: Drafts skip heavy jobs
For a draft PR, CI SHALL skip Node tests and host build while running name guard and OpenSpec validation. A draft SHALL NOT be promoted on the basis of a lightweight CI pass. Trusted readiness automation SHALL promote only a complete linked implementation draft; its ready event SHALL trigger all applicable PR checks, and the finalizer's archive commit SHALL trigger exact-head PR validation again. The host build remains reserved for nightly or explicit dispatch even after promotion.

#### Scenario: Plan draft
- **WHEN** a draft PR holding a plan is pushed
- **THEN** only the name guard, OpenSpec and change detection run and the PR remains draft

#### Scenario: Ready
- **WHEN** the PR is marked ready
- **THEN** CI runs every PR-eligible job its changes need but skips the host build

#### Scenario: Completed implementation
- **WHEN** trusted automation promotes a completed draft to ready and finalizes it on its branch
- **THEN** CI runs all applicable PR jobs on the final commit before `CI required` can make it merge-eligible

## REMOVED Requirements

### Requirement: Policy from the base commit
**Reason**: The shared delivery workflow owns delivery policy and ready-branch refresh, and runs only its own reviewed scripts.

**Migration**: None.

### Requirement: Automatic refresh of stale ready pull requests
**Reason**: The shared delivery workflow owns delivery policy and ready-branch refresh, and runs only its own reviewed scripts.

**Migration**: None.
