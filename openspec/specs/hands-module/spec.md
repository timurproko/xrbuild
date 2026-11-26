# hands-module Specification

## Purpose

Provides a stable Hands configuration surface centred on the selected skeleton source, independently of optional synthetic or acquisition diagnostics.

## Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible independently of optional input/diagnostic plugins. Its primary surface SHALL configure the globally selected skeleton source rather than identify itself with synthetic data. The former Hands route alias SHALL lead to that surface, while optional acquisition diagnostics remain clearly separate.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional diagnostic plugin or compiled viewer
- **THEN** the provider configuration surface still opens, including an empty-source state if necessary

#### Scenario: Diagnostic installed
- **WHEN** the optional acquisition diagnostic is installed
- **THEN** it is offered separately and its synthetic view is not presented as the selected real source's live hand

### Requirement: Minimal provider picker with availability

Hands SHALL show a provider picker, selected source identity, source purpose, availability/reason and explicit Save. It SHALL distinguish installation from running/device status and retain a missing saved source. It SHALL identify source changes as next-launch changes and SHALL NOT claim a live preview in this delivery.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands identifies that provider and its problem without selecting a replacement

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** Hands says it is not started and does not claim that hardware is connected or running

### Requirement: Passive navigation and safe preference writes

Opening Hands or listing providers SHALL NOT start capture, inference, a tracking runtime, an XR session or an installation. Preference writes SHALL require the current revision and preserve unrelated state. Invalid or unsafe saved state SHALL produce an actionable error without reset or overwrite.

#### Scenario: Open Hands
- **WHEN** the user navigates to Hands
- **THEN** no camera permission request, native capture, runtime startup or settings-file creation occurs

#### Scenario: Conflicting edit
- **WHEN** a stale editor saves a source after another writer changed the profile
- **THEN** the save fails with a conflict and the newer selection is preserved

#### Scenario: Malformed state
- **WHEN** saved Hands state is malformed or linked outside the owned state boundary
- **THEN** Hands reports the problem without creating replacement defaults

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

Hands SHALL provide self-contained Position and size and Appearance sections independent of the source card, relocatable together into a side panel beside a future hand view without rebuilding the controls. They SHALL use existing panel styles, short labels and only needed one-line hints. The size hint SHALL say it changes where the hand touches. Each group SHALL have Reset to defaults. Edits and resets SHALL remain drafts until Apply; source Save SHALL remain next-launch-only.

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
