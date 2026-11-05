## ADDED Requirements

### Requirement: Opt-in segmented re-selection fallback

A segmented control SHALL support an optional fallback index used when a hand or mouse activates its already selected non-fallback segment. Without that option, re-selecting the active segment SHALL preserve existing radio behavior. Programmatic selection SHALL remain idempotent. Effective selection changes SHALL use the control's standard change event, visual state, and feedback exactly once. Disabled controls SHALL ignore activation.

#### Scenario: Axis toggles back to Full
- **WHEN** a control with Full as its fallback has X, Y, or Z selected and the user activates that same segment again
- **THEN** Full becomes selected and one change event reports Full with the original hand or mouse source

#### Scenario: Switch between axes
- **WHEN** X is selected and the user activates Y
- **THEN** Y becomes selected, rather than Full

#### Scenario: Full already selected
- **WHEN** Full is selected and the user activates Full again
- **THEN** Full remains selected without an extra change event

#### Scenario: Existing or programmatic usage
- **WHEN** an ordinary segmented control without fallback is reselected, or code assigns the current index
- **THEN** the current selection is unchanged and no extra change event is emitted

#### Scenario: Disabled axis control
- **WHEN** an axis selector is disabled and receives a hand or mouse activation
- **THEN** neither its selection nor its linked rotation mode changes
