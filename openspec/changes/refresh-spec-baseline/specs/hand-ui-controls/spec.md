## ADDED Requirements

### Requirement: Opt-in segmented re-selection
A segmented control SHALL accept an optional `reselectIndex` naming one of its segments; constructing it with a value that is not the index of a segment SHALL throw a range error. When a hand or mouse activates the already selected segment of a control with `reselectIndex`, the control SHALL select the `reselectIndex` segment instead. Without `reselectIndex`, activating the selected segment SHALL change nothing. Selection by code SHALL never apply `reselectIndex`. Each effective selection change SHALL emit exactly one `change` event with the new index, value and source; a selection that leaves the index unchanged SHALL emit none. A disabled control SHALL ignore hand and mouse activation.

#### Scenario: Selected segment activated again
- **WHEN** a control with options Full, X, Y, Z and `reselectIndex` 0 has X selected and the user activates X
- **THEN** Full becomes selected and one `change` event reports Full with the hand or mouse source

#### Scenario: Another segment
- **WHEN** X is selected in that control and the user activates Y
- **THEN** Y becomes selected

#### Scenario: Fallback segment already selected
- **WHEN** Full is selected in that control and the user activates Full
- **THEN** Full stays selected and no `change` event is emitted

#### Scenario: No fallback or selection by code
- **WHEN** a control without `reselectIndex` has its selected segment activated, or code selects the current index of any control
- **THEN** the selection is unchanged and no `change` event is emitted

#### Scenario: Disabled control
- **WHEN** a disabled control receives a hand or mouse activation
- **THEN** its selection does not change

#### Scenario: Invalid fallback
- **WHEN** a control with three segments is constructed with `reselectIndex` 3
- **THEN** construction throws a range error
