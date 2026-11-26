# hands-module Specification

## Purpose

Provides a stable Hands configuration surface centred on the selected skeleton source, independently of optional synthetic or acquisition diagnostics.

## Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible independently of optional input/tool plugins or compiled viewers. `/hands/` SHALL be the sole Hands product page, titled Hands, with a provider-centred three-column hand view and Record as its only tool section. Old diagnostic routes and the legacy `/hand-tracking/` alias SHALL return normal not-found responses without redirects. No separate diagnostic identity/page/link SHALL remain.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional hand tools plugin or checked tool build
- **THEN** the core layout, provider picker and available core controls still open
- **AND** dependent recording actions show one-line unavailability reasons instead of a page-wide setup wall

#### Scenario: Diagnostic installed
- **WHEN** the optional recording implementation is available
- **THEN** recordings are reachable inside Hands without a second diagnostic page or laboratory navigation

#### Scenario: Old route requested
- **WHEN** a client requests `/hands-diagnostics`, `/hands-diagnostics/`, `/hand-tracking`, `/hand-tracking/` or their children
- **THEN** the panel returns its normal not-found response with no redirect or old page startup

### Requirement: Minimal provider picker with availability

Hands SHALL put the global provider picker first, followed by purpose, availability/reason and explicit source Save/Reload. It SHALL retain missing choices, distinguish installed from running/device status and label changes as next-launch-only. Provider session status and historical app status SHALL be distinct; camera calibration data or replay SHALL NOT impersonate the selected provider's live hand.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands identifies that provider and its problem without selecting a replacement

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** Hands says it is not started and does not claim that hardware is connected or running

#### Scenario: Standalone live session not available
- **WHEN** Hands opens before the separate provider-session capability is delivered
- **THEN** its hand view is idle and the source notice says the selected provider runs when an app is launched and live viewing here is not yet available

#### Scenario: Source Save independent of tools
- **WHEN** the user saves a provider with adjustment drafts or an open calibration/recording tool
- **THEN** only source selection is saved, without committing/discarding those drafts or starting acquisition

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

### Requirement: No generated or laboratory modes

Hands SHALL NOT expose fixtures, browser hand-landmark acquisition, general surface inspection, two-view fusion or benchmarks. Fixture and benchmark/comparison code and tests SHALL be removed. Browser landmark/fusion source SHALL remain unwired for a future provider, with calibration and recording dependencies preserved. Synthetic SHALL remain only an ordinary installed provider choice, never a preview/fallback.

#### Scenario: Hands opened idle
- **WHEN** Hands opens without a live provider session
- **THEN** no generated hand, fixture action or automatic Synthetic choice appears

#### Scenario: Mixed dependency removed
- **WHEN** obsolete laboratory code shares a helper with calibration or recording compatibility
- **THEN** the required helper remains independently usable without importing the removed engine

### Requirement: Independent calibration boundary

Hands SHALL NOT contain a Calibration tab or camera calibration action. Camera calibration source, stored results and format validators SHALL remain intact for extraction into an independent Calibration module in a following change. Its documented output SHALL identify a B-to-A camera transform bound to serials and profiles, not an app-hand adjustment; removing the old viewer SHALL NOT change its data.

#### Scenario: Hands opened
- **WHEN** the user opens Hands
- **THEN** camera calibration is not offered as a Hands tab and no camera measurement is started

#### Scenario: Existing calibration retained
- **WHEN** old viewer entry points are removed
- **THEN** persisted calibration keys and validated scalar formats remain readable and unchanged for the separate module

#### Scenario: Future consumer documented
- **WHEN** another module consumes the documented calibration output
- **THEN** its contract requires current serial/profile/hash validation and does not imply app profile application, temporal synchronization or physical accuracy

### Requirement: Existing recordings remain readable

Hands SHALL preserve list/import/read/export and ordinary playback of existing pose CSV, RGB, RGB-D and paired recordings with their original coordinate/timing/provenance semantics. Basic recorded-data playback SHALL NOT require live capture, new hand inference, benchmarks or fusion. Play/Pause/seek SHALL remain recording controls, independent of removed fixture actions.

#### Scenario: Existing CSV replay
- **WHEN** a supported on-disk pose recording is selected
- **THEN** its original time/coordinate-tagged joints replay without migration or being relabelled as selected-provider input

#### Scenario: Existing media replay
- **WHEN** supported recorded RGB/depth or paired media is imported
- **THEN** its saved streams and observations remain readable/playable without model re-inference or two-view fusion

### Requirement: New hand recording requires an actual session

Hands SHALL NOT claim that the former camera recorder already records the selected skeleton provider. New selected-provider recording SHALL require actual session frames and a compatible versioned provenance contract. Until that dependency is delivered, Hands SHALL explain that recording needs a live hand session rather than expose a pretend-working start action. Existing recording readers SHALL remain available independently.

#### Scenario: No stream for recording
- **WHEN** no supported live recording producer is connected
- **THEN** Hands states the live-session requirement and does not generate, write or mislabel replacement frames

#### Scenario: Legacy provenance retained
- **WHEN** old camera-relative or camera-metric data is replayed
- **THEN** it is not silently stamped as canonical provider data or adjusted twice through the global profile

### Requirement: Shared profile view and minimal component slots

Hands SHALL use the shared SDK pipeline and applied global profile for actual provider frames, with no diagnostic filtering override. It SHALL host a post-processing selector mount and the existing grouped Position and size / Appearance component with explicit Apply. Record SHALL be the only Hands tool tab; Calibration belongs to a separately delivered module. View/Reset/fullscreen SHALL affect scene state, not source/profile/calibration persistence.

#### Scenario: Global controls applied
- **WHEN** adjustment drafts are applied
- **THEN** the existing revision-safe profile operation is used independently of source drafts and calibration/recording storage

#### Scenario: Parallel components connected
- **WHEN** post-processing or live-session components are integrated
- **THEN** they use the documented persistent selector/action roots and SDK frame adapter without replacing the page

#### Scenario: Idle metrics
- **WHEN** no tracked stream feeds the active view
- **THEN** tracking fps is unavailable and render fps measures actual rendering rather than a fabricated provider rate

### Requirement: User data survives source cleanup

Removing old feature code SHALL NOT delete, migrate or rewrite user preferences, calibration, recordings, exports, models, caches or projects. Existing explicit tool operations SHALL retain validated user-owned storage behavior. Opening Hands or saving global source/adjustments SHALL NOT mutate calibration or recording files.

#### Scenario: Page opened or source saved
- **WHEN** Hands opens or saves the global source/profile
- **THEN** existing calibration/preferences/recordings remain byte-identical unless a separate explicit operation intentionally writes them
