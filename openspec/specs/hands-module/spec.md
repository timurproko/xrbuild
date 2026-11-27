# hands-module Specification

## Purpose

Provides a stable Hands configuration surface centred on the selected skeleton source, independently of optional synthetic or acquisition diagnostics.

## Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible independently of optional input/tool plugins or compiled viewers. `/hands/` SHALL be the sole Hands product page, titled Hands, with a provider-centred three-column hand view and no recording section. Old diagnostic routes and the legacy `/hand-tracking/` alias SHALL return normal not-found responses without redirects. No separate diagnostic identity/page/link SHALL remain.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional hand tools plugin or checked tool build
- **THEN** the core layout, provider picker and available core controls still open without recording placeholders

#### Scenario: Diagnostic installed
- **WHEN** the optional recording implementation is available
- **THEN** Hands still exposes no recording UI or second diagnostic page, while retained recorder code and stored data remain intact

#### Scenario: Old route requested
- **WHEN** a client requests `/hands-diagnostics`, `/hands-diagnostics/`, `/hand-tracking`, `/hand-tracking/` or their children
- **THEN** the panel returns its normal not-found response with no redirect or old page startup

### Requirement: Minimal provider picker with availability

Hands SHALL put Start/Stop atop the left sidebar above the autosaving Skeleton provider and optional installed post-processing controls. State SHALL stay compact in the controls, fps chips and viewport message. Selection SHALL save silently, retain missing identities and offer inline error/retry. Acquisition SHALL keep its launch source until Stop. Routine sidebar prose, Save/Reload, recording UI and generated substitutes SHALL remain absent.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands retains and labels that option without selecting a replacement or routine availability prose

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** the compact Start control does not claim hardware is connected or running, and no separate not-started sentence appears

#### Scenario: Standalone live session not available
- **WHEN** the standalone session runtime is missing, outdated or unsupported on this platform
- **THEN** the hand view stays idle with the concrete unavailable/Rebuild reason, without starting a full host or fabricating provider frames

#### Scenario: Explicit live delivery replaces page-only idle
- **WHEN** the person starts the saved selected provider and valid session frames arrive
- **THEN** the viewport shows those actual hands through the shared SDK adapter
- **AND** before Start it shows no hand, with compact Start guidance confined to the control/viewport rather than sidebar prose or cached app history

#### Scenario: Non-live data is not provider input
- **WHEN** calibration data or replay is available
- **THEN** it does not impersonate the selected provider's live hand

#### Scenario: Source Save independent of tools
- **WHEN** the person selects a provider while an adjustment edit is unfinished
- **THEN** only source selection is saved, without committing/discarding that edit, starting acquisition or switching a running app's source

#### Scenario: Selection save fails
- **WHEN** saving a selected provider fails
- **THEN** a short inline error and retry preserve the unsaved selection without a success claim

#### Scenario: Source draft differs from session
- **WHEN** the person edits or saves another source while a session is active
- **THEN** the active provider remains identified separately and Stop remains available for that session
- **AND** a different source cannot start until the active session has stopped and its source choice is saved

### Requirement: Passive navigation and safe preference writes

Opening Hands or listing providers SHALL NOT start capture, inference, a tracking runtime, an XR session or an installation. Preference writes SHALL require the current revision and preserve unrelated state. Invalid or unsafe saved state SHALL produce an actionable error without reset or overwrite. Clean editors SHALL incorporate newer revisions automatically; conflicts with unfinished edits SHALL remain visible and recoverable without silent overwrite.

#### Scenario: Open Hands
- **WHEN** the user navigates to Hands
- **THEN** no camera permission request, native capture, runtime startup or settings-file creation occurs

#### Scenario: Conflicting edit
- **WHEN** a stale editor saves a source after another writer changed that same choice
- **THEN** the save fails with a conflict, the newer selection is preserved and the unsaved choice remains available for explicit retry after review

#### Scenario: Malformed state
- **WHEN** saved Hands state is malformed or linked outside the owned state boundary
- **THEN** Hands reports the problem without creating replacement defaults

#### Scenario: Another client edits an unrelated field
- **WHEN** a newer profile changes no field involved in a pending local edit
- **THEN** Hands can refresh the base and retry only the local changed fields against the latest revision without overwriting the other client's changes

#### Scenario: Another client changes an edited field
- **WHEN** the latest profile differs from the local edit's original base in the same field
- **THEN** Hands preserves both the latest saved value and pending local intention, reports a short conflict and requires explicit review/retry rather than an automatic overwrite

### Requirement: Shared adjustment profile

Hands SHALL own position, size and appearance in the same workspace profile as source selection. Missing adjustment fields SHALL inherit exact current defaults without a read-time rewrite. Source and adjustment writes SHALL share revision checking and atomic exclusion, preserve unrelated fields and never reset provider calibration.

#### Scenario: Existing source-only profile
- **WHEN** a profile contains only the existing source selection and metadata
- **THEN** the effective offset is zero, size is one and appearance matches the current standard drawing without modifying the file

#### Scenario: First Apply with initial source
- **WHEN** no profile file exists and Hands displays one inferred initial real source
- **THEN** the first committed adjustment pins that same choice with revision/conflict protection, without selecting synthetic fallback or replacing a saved source

#### Scenario: Source picker races adjustment Apply
- **WHEN** source selection and a committed adjustment use the same starting revision
- **THEN** at most one write succeeds on that revision and the other safely refreshes/reconciles or reports a conflict without losing the winner's source or adjustments

#### Scenario: Adjustment with unavailable source
- **WHEN** the saved source is unavailable and the person commits valid adjustments
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

Hands SHALL provide Position and size and Appearance directly in the right panel, using Apps section labels and secondary actions without nested cards. All controls and per-section Reset to defaults SHALL remain. Only the size/contact hint SHALL remain from the removed geometry/drawing prose. Finished edits and resets SHALL save automatically, without Apply, routine Reload or saved-for-next-launch text.

#### Scenario: Reset one group
- **WHEN** the user resets Position and size
- **THEN** only geometry returns to defaults and saves immediately; appearance, selected source and provider calibration remain unchanged

#### Scenario: Appearance reset
- **WHEN** the user resets Appearance
- **THEN** default standard drawing saves immediately while geometry and source remain unchanged

#### Scenario: Drag without Apply
- **WHEN** the user drags a slider or previews a colour
- **THEN** intermediate input does not save or deliver adjustments
- **AND** releasing the slider or committing the colour saves and delivers the finished value without Apply

#### Scenario: Committed field and switch
- **WHEN** the person commits a number field or toggles a switch
- **THEN** that finished change saves and delivers once, retaining validation and exact untouched linear colours

### Requirement: Honest Apply delivery status

Committed valid adjustments SHALL persist and reach the current managed run without switching its acquisition source. Successful saves SHALL be quiet. Failed saves or delivery SHALL show a short inline error and retry; pending delivery SHALL NOT be claimed as applied. Existing geometry release/filter resets and run-bound acknowledgement safety SHALL remain. Navigation SHALL remain passive.

#### Scenario: No running app
- **WHEN** the user commits adjustments with no managed run
- **THEN** they save silently for future launches without starting a provider or showing a saved-for-next-launch line

#### Scenario: Running app disconnected
- **WHEN** adjustments save but the current run cannot acknowledge them
- **THEN** Hands reports a short delivery error and offers retry without requiring another edit or reporting successful application

#### Scenario: Unsaved source draft
- **WHEN** a provider save is pending or failed and an adjustment is committed
- **THEN** the adjustment changes neither the saved source nor the running source and the failed provider intention remains recoverable

#### Scenario: Geometry is delivered
- **WHEN** a committed geometry change reaches a running app
- **THEN** existing held interactions release without a click and filters reset before the next adjusted frame
- **AND** appearance-only or equivalent geometry changes keep the existing non-reset behavior

#### Scenario: Active live view
- **WHEN** a standalone live session owns the view and an adjustment saves
- **THEN** that session alone applies and acknowledges its owned profile at a frame boundary, without idle preview polling taking ownership

#### Scenario: Notifications or responses arrive out of order
- **WHEN** an own notification races its response, another writer returns to an old revision hash, or an old delivery poll completes after a save/retry
- **THEN** stale results cannot erase a pending conflict, revert the profile or report success for the wrong delivery

### Requirement: No generated or laboratory modes

Hands SHALL NOT expose fixtures, browser hand-landmark acquisition, general surface inspection, two-view fusion or benchmarks. Fixture and benchmark/comparison code and tests SHALL be removed. Browser landmark/fusion source SHALL remain unwired for a future provider, with calibration and recording dependencies preserved. Synthetic SHALL remain only an ordinary installed provider choice, never a preview/fallback.

#### Scenario: Hands opened idle
- **WHEN** Hands opens without a live provider session
- **THEN** no generated hand, fixture action or automatic Synthetic choice appears

#### Scenario: Mixed dependency removed
- **WHEN** obsolete laboratory code shares a helper with calibration or recording compatibility
- **THEN** the required helper remains independently usable without importing the removed engine

### Requirement: Independent calibration boundary

Hands SHALL NOT contain a Calibration tab or camera calibration action. Camera calibration SHALL be available through the independent Calibration module at `/calibration/`, retaining its source, stored results and format validators. Its documented output SHALL identify a B-to-A camera transform bound to serials and profiles, not an app-hand adjustment; delivering the independent module SHALL NOT migrate or delete its data.

#### Scenario: Hands opened
- **WHEN** the user opens Hands
- **THEN** camera calibration is not offered as a Hands tab and no camera measurement is started

#### Scenario: Existing calibration retained
- **WHEN** the independent Calibration module replaces the removed viewer's calibration UI
- **THEN** persisted calibration keys and validated scalar formats remain readable and unchanged

#### Scenario: Future consumer documented
- **WHEN** another module consumes the documented calibration output
- **THEN** its contract requires current serial/profile/hash validation and does not imply app profile application, temporal synchronization or physical accuracy

### Requirement: Existing recordings remain readable

Recorder implementations and list/import/read/export/playback compatibility for pose CSV, RGB, RGB-D and paired recordings SHALL remain intact but unmounted and unreachable from Hands. Their original coordinates, timing and provenance SHALL remain unchanged. Removing their page UI SHALL NOT delete or rewrite stored recordings. Future UI placement is outside this change.

#### Scenario: Existing CSV replay
- **WHEN** the Hands page is simplified
- **THEN** the existing CSV reader/replay implementation remains available in source without migration or relabelling of stored data, but Hands offers no recording action

#### Scenario: Existing media replay
- **WHEN** recording UI is removed
- **THEN** RGB/depth and paired-media readers remain intact without requiring model re-inference or two-view fusion, and stored files remain untouched

### Requirement: New hand recording requires an actual session

Retained selected-provider recorder code SHALL require actual session frames and a compatible versioned provenance contract, never fabricated provider frames. Hands SHALL NOT mount recorder UI, legacy recording tools or a recording-needs-session notice. Removing that UI SHALL NOT delete its implementation or existing storage.

#### Scenario: No stream for recording
- **WHEN** Hands opens without a supported live recording producer
- **THEN** it shows no Record section, placeholder or pretend-working capture action and generates no replacement frames

#### Scenario: Legacy provenance retained
- **WHEN** retained recording compatibility code reads old camera-relative or camera-metric data
- **THEN** it does not silently stamp it as canonical provider data or adjust it twice through the global profile

### Requirement: Shared profile view and minimal component slots

Hands SHALL retain its shared SDK view and applied global profile without diagnostic filtering overrides. It SHALL host optional installed post-processing and grouped commit-time adjustments, with no Record tab. A free live-control position SHALL remain above Skeleton provider. Calibration remains independent. View/Reset/fullscreen SHALL affect scene state only.

#### Scenario: Global controls applied
- **WHEN** the person finishes an adjustment
- **THEN** the existing revision-safe profile operation persists and delivers it independently of source intention and calibration/recording storage

#### Scenario: Parallel components connected
- **WHEN** post-processing or live-session components are integrated
- **THEN** they retain the persistent provider/selector roots and shared view/snapshot/request boundary without replacing the page or moving active-session profile ownership

#### Scenario: Idle metrics
- **WHEN** no tracked stream feeds the active view
- **THEN** tracking fps is unavailable and render fps measures actual rendering rather than a fabricated provider rate

### Requirement: User data survives source cleanup

Removing old feature code SHALL NOT delete, migrate or rewrite user preferences, calibration, recordings, exports, models, caches or projects. Existing explicit tool operations SHALL retain validated user-owned storage behavior. Opening Hands or saving global source/adjustments SHALL NOT mutate calibration or recording files.

#### Scenario: Page opened or source saved
- **WHEN** Hands opens or saves the global source/profile
- **THEN** existing calibration/preferences/recordings remain byte-identical unless a separate explicit operation intentionally writes them

### Requirement: Simple post-processing selector

Hands SHALL show its independent post-processing selector below Skeleton provider only when at least one mesh plugin is installed. It SHALL offer None and installed plugins with existing settings and status; a missing saved choice SHALL remain visible when the selector is shown. Without installed plugins the entire section SHALL be hidden, including heading and empty text, without changing stored selection. Opening it SHALL not start capture, processing or installation.

#### Scenario: Empty installation
- **WHEN** no mesh plugins are installed, regardless of a retained saved choice
- **THEN** Hands shows no post-processing heading, selector, status or empty-state sentence and does not alter saved state

#### Scenario: Selected plugin unavailable
- **WHEN** at least one mesh plugin is installed and the saved plugin is missing, disabled or failed
- **THEN** the selector retains its saved identity and skeleton-fallback reason without automatic replacement

#### Scenario: Plugin installed
- **WHEN** at least one mesh plugin is installed
- **THEN** the existing post-processing controls appear below the provider with their current next-desktop-run semantics

### Requirement: Next-run selection and context notice
The selector SHALL save only post-processing selection/settings under the common profile revision discipline, independently of source and adjustment drafts. It SHALL label changes as applying on the next desktop run and disclose that browser previews, published web builds and offline packages do not use post-processing. It SHALL offer no multiple-stage ordering or bypass controls.

#### Scenario: Save independently
- **WHEN** the person saves the mesh selection while source or adjustment drafts are dirty
- **THEN** those drafts remain unsaved and the running app retains its current mesh selection

#### Scenario: Context limitation
- **WHEN** the section is displayed
- **THEN** it says "Post-processing is used only in desktop apps run from this panel, not browser previews, published web builds or offline packages."

### Requirement: Honest live session states and rates

Hands SHALL distinguish Not started, Starting, Running, Running but no hands detected, Stopping, Failed with reason, and Stopped compactly on or beside Start/Stop, in the fps chips and viewport message, without adding sidebar status sentences. Tracking fps SHALL derive from valid session frames, separately from render fps; frame age SHALL derive from mapped capture time. Unavailable measurements SHALL remain unavailable, never fixture motion or cached app rates.

#### Scenario: Running with hands
- **WHEN** fresh valid frames contain hands
- **THEN** status shows Running, source identity, observed tracking rate and frame age, and the header tracking chip reflects those frames

#### Scenario: Running with no detection
- **WHEN** fresh valid frames contain zero hands
- **THEN** status says Running but no hands detected, the hand view is empty and capture rate continues to reflect actual received frames

#### Scenario: Failure or no frames yet
- **WHEN** startup fails or a running worker has not delivered a fresh valid frame
- **THEN** the view remains empty and reports the provider's bounded reason or waiting/stalled state without claiming no detection from missing data

#### Scenario: Explicit Stop
- **WHEN** Stop completes
- **THEN** status says Stopped, the tracking chip is unavailable and no old hands or active test holds remain

### Requirement: Live viewport shares applied app semantics

Session frames SHALL pass through the same validated applied global profile, canonical ingress, default filtering, gestures, scene mapping and standard drawing as managed apps. Geometry SHALL be applied exactly once. Committed immediate adjustment edits SHALL distinguish persistence from actual session application and retain the running source. There SHALL be no Apply button, and unfinished or invalid edits SHALL NOT change live input.

#### Scenario: Same frame and profile
- **WHEN** Hands and an app process equivalent source frames, clocks and applied profiles
- **THEN** their processed hand positions, size, gestures and standard appearance agree without a second geometry transform

#### Scenario: Apply while holding
- **WHEN** changed geometry is committed immediately during pinch or drag
- **THEN** shared SDK cleanup releases the hold without click, clears old filter state and acknowledges the new session-bound profile only after application
- **AND** an appearance-only commit changes drawing without releasing that hold or altering acquisition

#### Scenario: Delivery fails after save
- **WHEN** profile persistence succeeds but the viewport does not acknowledge application
- **THEN** Hands says saved but live delivery failed rather than Applied, and retains the last valid applied snapshot

### Requirement: Real-session interaction checks

Hands SHALL offer a small pinch target and draggable target using the shared SDK interaction path and current session hand. Test feedback SHALL clear on no hands, staleness, geometry reset, Stop, failure or disposal. It SHALL NOT use generated poses or count mouse actions as evidence of tracked-hand success.

#### Scenario: Live pinch and drag
- **WHEN** the current session hand pinches the test target or grabs and moves the drag target
- **THEN** visible feedback reflects shared SDK events and the drag follows the processed hand

#### Scenario: Discontinuity while dragging
- **WHEN** tracking becomes stale or the session stops while a target is held
- **THEN** the target is released without a click and late old frames cannot resume the hold

### Requirement: Paired numeric adjustment rows

Each numeric adjustment SHALL have its label above one row with a number input on the left and synchronized slider on the right. Both controls SHALL retain existing bounds, steps, validation and finished-edit autosave/delivery. Colour swatches SHALL remain beside their diameter row. The sidebar SHALL fit narrow widths without horizontal scrolling in light and dark themes.

#### Scenario: Every numeric setting has paired controls
- **WHEN** the person opens adjustments
- **THEN** X (mm), Y (mm), Z (mm), Size, Joint diameter (mm), Bone diameter (mm), Skeleton opacity, Indicator diameter (mm) and Indicator opacity each show one labelled number-and-slider row
- **AND** Size no longer puts its slider below its input

#### Scenario: Number and slider stay synchronized
- **WHEN** the person edits either control of a numeric setting
- **THEN** its paired control reflects that setting's finite valid value without changing other settings
- **AND** the number input still accepts every value valid under the existing bounds and steps

#### Scenario: Existing commit timing and validation remain
- **WHEN** the person types a number or drags a slider
- **THEN** intermediate edits do not save or deliver adjustments
- **AND** a valid number committed by change or Enter, a number-stepper click, or slider release saves and delivers through the existing path without duplicate saves
- **AND** invalid number values retain field errors without changing saved or running state

#### Scenario: Compact sidebar in both themes
- **WHEN** adjustments are displayed in light or dark at the normal sidebar width or in a 320-pixel-wide sidebar
- **THEN** each number and slider remain beside one another, colour swatches stay next to their respective diameter rows, and the adjustment content requires no horizontal scrolling

### Requirement: Accessible section reset gear menus

Position and size and Appearance SHALL each show a plain borderless gear icon button matching the Apps project-header icon style instead of a reset text button. Each gear SHALL open a small menu containing only Reset to defaults. Buttons and menus SHALL support keyboard and screen-reader use, Escape and outside-click dismissal. The viewport Reset SHALL remain unchanged.

#### Scenario: Opening and operating a section menu
- **WHEN** the person activates a section's gear by pointer, Enter or Space
- **THEN** its single Reset to defaults menu item is shown and keyboard reachable with focus in the menu
- **AND** the trigger has an accessible section-specific name and exposes its popup and expanded state

#### Scenario: Dismissing a reset menu
- **WHEN** the person presses Escape in an open menu or clicks outside it
- **THEN** the menu closes without changing adjustments
- **AND** Escape restores focus to that section's gear button

#### Scenario: Resetting exactly one section
- **WHEN** the person activates Reset to defaults from a section menu
- **THEN** the menu closes and that section resets through the existing immediate commit path
- **AND** the other section's saved values and unfinished edits, selected source and provider calibration remain unchanged

#### Scenario: Viewport reset is separate
- **WHEN** the person uses Reset inside the 3D view
- **THEN** its existing scene-only reset behavior and control remain unchanged
