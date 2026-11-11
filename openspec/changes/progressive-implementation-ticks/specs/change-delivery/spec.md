## ADDED Requirements

### Requirement: Implementation progress while implementing
`AGENTS.md` SHALL hold one `Implementation progress` paragraph that every agent runtime loads; other guidance SHALL refer to it. A linked change's `tasks.md` SHALL hold one task group per PR Implementation outcome, in the same order. The agent SHALL deliver one outcome at a time: write its code and tests, tick its tasks, commit and push, then tick that outcome in the PR body before starting the next.

#### Scenario: Several outcomes
- **WHEN** an approved plan has several Implementation outcomes
- **THEN** each outcome is ticked after its own pushed commit and before work on the next one starts

#### Scenario: Outcome awaits only CI or a device
- **WHEN** an outcome's code and tests are written and pushed but CI or manual device acceptance has not run
- **THEN** the agent ticks the outcome without waiting and reports the unobserved part as a gap

#### Scenario: Defect after a tick
- **WHEN** a ticked outcome later needs a fix
- **THEN** the fix is a new commit in the same PR

#### Scenario: Any agent runtime
- **WHEN** an agent loads the repository's instructions through `AGENTS.md` or `.claude/CLAUDE.md`
- **THEN** it receives the same single progress paragraph

#### Scenario: Plan tasks
- **WHEN** an agent writes a linked change's `tasks.md`
- **THEN** it has no task for ticking PR outcomes or handing off

#### Scenario: Single owner
- **WHEN** `.claude/CLAUDE.md`, the delivery skill or the PR template mention implementation progress
- **THEN** they refer to the `AGENTS.md` paragraph and do not restate it
