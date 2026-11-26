# Spec Delta

## MODIFIED Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible independently of optional input plugins or compiled diagnostic viewers. `/hands/` SHALL be the only Hands product page, titled Hands, with tabbed left and right panels, a large central 3D viewport and header render/tracking fps chips. Former Hands and diagnostic page routes SHALL redirect to it; no separate acquisition diagnostic page or navigation entry SHALL remain.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional input plugin or compiled viewer
- **THEN** the full core layout, source picker, adjustment sections and empty viewport open without requiring plugin setup
- **AND** missing or empty source availability is stated without replacing the saved choice

#### Scenario: Diagnostic installed
- **WHEN** the optional input plugin is installed
- **THEN** its provider remains eligible for the normal picker but no separate acquisition diagnostic page or link is offered

#### Scenario: Old route opened
- **WHEN** the user opens `/hands-diagnostics`, `/hands-diagnostics/`, `/hand-tracking` or `/hand-tracking/`
- **THEN** navigation redirects to `/hands/` instead of loading or starting the old tool

### Requirement: Minimal provider picker with availability

Hands SHALL put the global provider picker first in Source, followed by purpose, availability/reason and explicit source Save/Reload. It SHALL retain missing choices, distinguish installed from running/device status and label changes as next-launch-only. The viewport SHALL identify itself as idle until frames come from an explicitly started provider session, never from a generated substitute or an unrelated app's historical status.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands identifies that provider and its problem without selecting a replacement

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** Hands says it is not started and does not claim that hardware is connected or running

#### Scenario: Page-only delivery before standalone sessions
- **WHEN** Hands opens before standalone provider Start/Stop is available
- **THEN** the viewport contains no hand and explains next to source status that the selected provider runs when an app is launched and live viewing here is not yet available
- **AND** any previous app status is explicitly historical and does not populate the viewport

#### Scenario: Source Save independent of adjustments
- **WHEN** the user saves a provider while adjustment fields have unsaved edits
- **THEN** only the provider selection is saved and adjustment drafts are not silently committed or discarded

## ADDED Requirements

### Requirement: No generated fixture mode

Hands SHALL NOT expose Local fixture delivery, a Fixture picker, generated preview animation, fixture Pause/Restart or fixture-only interaction targets. Synthetic SHALL be selectable only as an ordinary installed provider with the same selection and lifecycle semantics as other providers. Navigation, source failure and an idle session SHALL NOT select Synthetic or inject generated hand frames.

#### Scenario: Open with no provider
- **WHEN** Hands opens with no available provider
- **THEN** the source reason and empty viewport are shown without generated hands, camera requests or fixture controls

#### Scenario: Synthetic provider installed
- **WHEN** an installed Synthetic provider is available
- **THEN** it appears only as a regular provider option and is not started or saved merely by opening Hands

### Requirement: Shared pipeline and profile view

Hands SHALL use the same canonical processing, saved global adjustment profile, filtering, gestures, scene mapping and standard hand appearance as managed SDK apps. It SHALL NOT use the raw diagnostic pipeline or disable app-default filtering. View, Reset and fullscreen SHALL control the viewport only; scene reset SHALL NOT reset the saved profile, provider choice or calibration.

#### Scenario: Idle page uses applied profile
- **WHEN** Hands opens without a provider session
- **THEN** the SDK view loads the validated applied global profile but shows no hand data and no invented tracking rate

#### Scenario: Shared frame processing
- **WHEN** an authorized provider frame is supplied to the Hands view adapter
- **THEN** it is processed with the same profile and default SDK behavior as an app, with geometry applied once and appearance affecting drawing only

#### Scenario: Reset view
- **WHEN** the user resets or changes the view or enters fullscreen
- **THEN** only scene/camera state changes and no provider or profile write occurs

### Requirement: Adjustment and processing panels

Hands SHALL expose Source and Post-processing tabs on the left and Adjustments, Output and Stats tabs on the right. Adjustments SHALL contain Position and size and Appearance together, with independent draft resets and one explicit Apply using the global profile. Until a post-processing registry exists, its tab SHALL state in one sentence that no post-processing plugins are installed, without fake plugins or controls.

#### Scenario: Opening tabs
- **WHEN** Hands opens normally
- **THEN** Source and Adjustments are initially selected and the other capability tabs remain visible

#### Scenario: Apply adjustments
- **WHEN** the user applies Position and size or Appearance drafts
- **THEN** the existing revision-safe global adjustment operation is used without saving an unsaved source choice
- **AND** saved versus applied or failed delivery status remains explicit

#### Scenario: No tracking metrics
- **WHEN** no Hands provider session is feeding the viewport
- **THEN** Output identifies the idle state and tracking fps/frame-age values are unavailable rather than measurements attributed to the selected provider

### Requirement: Retired acquisition UI preserves data

Browser camera landmarks, native RGB-D capture, markers/calibration, surface reconstruction, two-view fusion, benchmarks and diagnostic recording/replay SHALL NOT be reachable from the product UI or old tool endpoints. Retiring those workflows SHALL NOT delete, migrate or rewrite preferences, calibration, recordings, user exports or optional model files. Existing provider-level replay configuration SHALL remain separate and unchanged.

#### Scenario: Retired tool requested
- **WHEN** a client requests an obsolete diagnostic service or asset route
- **THEN** it does not activate capture, bridge services, inference, asset setup or the old viewer

#### Scenario: Existing user data
- **WHEN** the new Hands page is opened or its source/adjustments are saved
- **THEN** plugin preferences/calibration and stored recordings remain unchanged in their existing workspace locations
