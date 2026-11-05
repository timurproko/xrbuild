# Spec Delta

## MODIFIED Requirements

### Requirement: Drafts skip heavy jobs
For a draft PR, CI SHALL skip Node tests, host build and the delivery check while running name guard and OpenSpec validation. A draft SHALL NOT be promoted on the basis of a lightweight CI pass. Trusted readiness automation SHALL promote only a complete linked implementation draft; its ready event SHALL trigger full validation, and the finalizer's archive commit SHALL trigger exact-head validation again.

#### Scenario: Plan draft
- **WHEN** a draft PR holding a plan is pushed
- **THEN** only the name guard, OpenSpec and change detection run and the PR remains draft

#### Scenario: Ready
- **WHEN** the PR is marked ready
- **THEN** CI runs every job its changes need

#### Scenario: Completed implementation
- **WHEN** trusted automation promotes a completed draft to ready and finalizes it on its branch
- **THEN** CI runs all applicable jobs on the final commit before `CI required` can make it merge-eligible

### Requirement: Policy from the base commit
Scripts that decide readiness, promotion and delivery SHALL be read from the PR's base commit, not from its head; PR files SHALL be treated as data, not executed with the App credential.

#### Scenario: PR weakens the delivery script
- **WHEN** a PR changes readiness or delivery scripts
- **THEN** its own trusted workflow still runs `main`'s versions of those scripts
