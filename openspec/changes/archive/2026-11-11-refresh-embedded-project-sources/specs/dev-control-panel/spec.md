## ADDED Requirements

### Requirement: Embedded source updates without routine reconciliation UI
The Apps card SHALL keep normal workflow controls without the Installed sources changed text, internal path or Keep my working sources button. Explicit source-consuming actions SHALL safely refresh current inputs, never accept a fingerprint alone to permit stale sources. Exceptional failures SHALL use concise actionable errors, not routine source-review UI. Discovery SHALL remain read-only.

#### Scenario: Pull latest and run
- **WHEN** a user pulls current repository code or updates the installation, opens the panel through its normal shortcut and runs an embedded app without source conflicts
- **THEN** the normal project controls remain available without the former banner/button, the action uses current installed source updates with preserved personal choices, and stale finalized output is not silently selected

#### Scenario: Existing settings are not a source conflict
- **WHEN** an embedded app's old working state exists only because the user previously selected providers, changed a name/icon or used normal project actions
- **THEN** a compatible installation update requires no manual source-review acknowledgement and retains those personal choices while adopting current source inputs

#### Scenario: Genuine unsafe update
- **WHEN** an attempted action encounters conflicting source edits, ambiguous legacy source configuration or invalid working state
- **THEN** the action explains the specific recovery requirement without replacing preserved data, pretending an update succeeded or silently running old code

#### Scenario: Old browser tab
- **WHEN** an older client sends the former keep-working-sources mutation
- **THEN** it cannot accept an updated baseline while leaving old working source files effective
