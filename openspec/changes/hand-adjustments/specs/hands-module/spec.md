# Spec Delta

## ADDED Requirements

### Requirement: Shared adjustment profile

Hands SHALL own position, size and appearance in the same workspace profile as source selection. Missing adjustment fields SHALL inherit exact current defaults without a read-time rewrite. Source and adjustment writes SHALL share revision checking and atomic exclusion, preserve unrelated fields and never reset provider calibration.

#### Scenario: Existing source-only profile
- **WHEN** a profile contains only the existing source selection and metadata
- **THEN** the effective offset is zero, size is one and appearance matches the current standard drawing without modifying the file

#### Scenario: First Apply with initial source
- **WHEN** no profile file exists and Hands displays one inferred initial real source
- **THEN** explicit Apply pins that same choice with revision/conflict protection, without selecting synthetic fallback or replacing a saved source

#### Scenario: Source picker races adjustment Apply
- **WHEN** a source Save and adjustment Apply use the same starting revision
- **THEN** at most one succeeds and the other reports a conflict without losing the winner's source or adjustments

#### Scenario: Adjustment with unavailable source
- **WHEN** the saved source is unavailable and the user applies valid adjustments
- **THEN** Hands retains that source identity and saves the adjustments without starting or replacing the provider

### Requirement: Bounded position and size settings

Hands SHALL accept finite XYZ offsets in panel-space millimetres, each from -150 to 150 with default zero, and a finite uniform size from 0.5 to 1.5 with default one. X SHALL mean right, Y up and Z toward the viewer. Wrong types, non-finite or out-of-range stored/submitted values SHALL be rejected with a visible field-specific reason, without silently replacing the saved profile.

#### Scenario: Invalid persisted size
- **WHEN** stored size is outside 0.5 through 1.5 or has the wrong type
- **THEN** Hands and launch preparation report the offending field and permitted range without overwriting the file or starting acquisition

#### Scenario: Invalid offset submission
- **WHEN** an offset is non-finite or exceeds the allowed range
- **THEN** Apply fails visibly and the last saved and running profiles remain unchanged

### Requirement: Bounded appearance settings

Hands SHALL provide separate joint/bone visibility, diameters, colours and shared skeleton opacity, plus indicator visibility, diameter, colour and opacity. Defaults SHALL be visible joints/bones/indicator; diameters 15/15/30 mm; linear colours [0,.541,1]/[0,.482,1]/[1,1,1]; opacities .333/.9. Invalid values SHALL be rejected visibly.

#### Scenario: Appearance bounds
- **WHEN** diameters, opacities or colours are submitted
- **THEN** joints accept 1..40 mm, bones 1..30 mm, indicator 1..60 mm, opacities 0..1, colours exactly three finite linear components 0..1, and visibility only booleans

#### Scenario: Default colour round trip
- **WHEN** the default profile is displayed using colour pickers and an unrelated setting is applied
- **THEN** the exact default linear colour components remain unchanged rather than being quantized by the picker

### Requirement: Grouped adjustment controls and explicit Apply

Below the source picker, Hands SHALL provide Position and size and Appearance using existing panel control styles, short labels and only needed one-line hints. The size hint SHALL say it changes where the hand touches. Each group SHALL have Reset to defaults. Edits and resets SHALL remain drafts until Apply; source Save SHALL remain next-launch-only.

#### Scenario: Reset one group
- **WHEN** the user resets Position and size
- **THEN** only geometry drafts return to defaults; appearance, selected source and provider calibration remain unchanged until the appropriate explicit action

#### Scenario: Appearance reset
- **WHEN** the user resets Appearance and presses Apply
- **THEN** default standard drawing is restored while geometry and source remain unchanged

#### Scenario: Drag without Apply
- **WHEN** the user changes a slider or colour without pressing Apply
- **THEN** neither the saved profile nor a running application's adjustment changes

### Requirement: Honest Apply delivery status

Apply SHALL persist valid adjustments and deliver them to the current managed run without switching its acquisition source. Hands SHALL distinguish saved-for-next-launch, pending application, acknowledged application and delivery failure. Navigation SHALL remain passive and SHALL NOT claim a live hand preview or contact devices.

#### Scenario: No running app
- **WHEN** the user applies adjustments with no managed run
- **THEN** Hands reports them saved for future launches and does not start a provider

#### Scenario: Running app disconnected
- **WHEN** adjustments save but the current run cannot acknowledge them
- **THEN** Hands reports saved values and pending or failed live delivery, not successful application, and retains retry/relaunch guidance

#### Scenario: Unsaved source draft
- **WHEN** the source picker has an unsaved change and adjustments are applied
- **THEN** Apply changes only adjustments, preserves the saved and running source, and leaves source changes subject to explicit Save and next launch
