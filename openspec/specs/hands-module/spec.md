# hands-module Specification

## Purpose

Provides a stable Hands configuration surface centred on the selected skeleton source, independently of optional synthetic or acquisition diagnostics.

## Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible without optional input/tool plugins or compiled viewers. `/hands/` SHALL be the sole Hands page, titled Hands, with the 3D viewer beside one side panel of Setup, Transform, Display, Post-process and Log tabs, present with Start and status from the first paint, and no recording section. Old diagnostic routes and `/hand-tracking/` SHALL return normal not-found responses without redirects, and no separate diagnostic page or link SHALL remain.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional hand tools plugin or checked tool build
- **THEN** the core layout, provider picker and available core controls still open without recording placeholders

#### Scenario: Diagnostic installed
- **WHEN** the optional recording implementation is available
- **THEN** Hands still exposes no recording UI or second diagnostic page, while retained recorder code and stored data remain intact

#### Scenario: Old route requested
- **WHEN** a client requests `/hands-diagnostics`, `/hands-diagnostics/`, `/hand-tracking`, `/hand-tracking/` or their children
- **THEN** the panel returns its normal not-found response with no redirect or old page startup

#### Scenario: Reload keeps the selected tab
- **WHEN** the page reloads or the panel restarts
- **THEN** the previously selected tab shows from the first paint and Start appears disabled, never hidden, until live controls load

### Requirement: Minimal provider picker with availability

Hands SHALL lead the viewer toolbar with Start/Stop and show the session status in the header. The Setup tab SHALL hold the autosaving Skeleton provider, listing only workspace-installed trackers. Selection SHALL save silently, retain missing identities and offer inline retry. Acquisition SHALL keep its launch source until Stop. Diagnostics SHALL go to the Log tab, with no viewer centre text, Save/Reload, recording UI or generated substitutes.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands retains and labels that option without selecting a replacement or routine availability prose

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** the compact Start control does not claim hardware is connected or running, and no separate not-started sentence appears

#### Scenario: Built-in sources hidden
- **WHEN** only built-in synthetic, replay or browser sources and one installed tracker exist
- **THEN** the list offers the installed tracker, while a hidden source that is already the saved choice stays listed

#### Scenario: Standalone live session not available
- **WHEN** the standalone session runtime is missing, outdated or unsupported on this platform
- **THEN** the hand view stays idle and Start stays disabled with the concrete reason in the Log tab, without starting a full host or fabricating provider frames

#### Scenario: Explicit live delivery replaces page-only idle
- **WHEN** the person starts the saved selected provider and valid session frames arrive
- **THEN** the viewport shows those actual hands through the shared SDK adapter
- **AND** before Start it shows no hand and no centre text or cached app history

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

Hands SHALL provide the Transform and Display tabs in the side panel. Each SHALL start with a Preset dropdown offering Default, saved presets and Custom when the values match none, with save and delete actions. Per-tab Reset to defaults SHALL remain. Finished edits, slider drags, presets and resets SHALL save automatically, without Apply.

#### Scenario: Reset one group
- **WHEN** the user resets Transform
- **THEN** only geometry returns to defaults (offset zero, size one) and saves immediately; appearance, selected source and provider calibration remain unchanged

#### Scenario: Appearance reset
- **WHEN** the user resets Display
- **THEN** default standard drawing saves immediately while geometry and source remain unchanged

#### Scenario: Drag without Apply
- **WHEN** the user drags a slider or previews a color
- **THEN** values apply while dragging, with at most one save in flight that always ends on the latest value, without Apply

#### Scenario: Committed field and switch
- **WHEN** the person commits a number field or toggles a switch
- **THEN** that finished change saves and delivers once, retaining validation and exact untouched linear colors

#### Scenario: Choosing a preset
- **WHEN** the person chooses a preset
- **THEN** only that tab's values change and save, and the dropdown shows Custom after any later edit that matches no preset

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
- **THEN** existing controls appear below the provider and status accurately distinguishes saved configuration from supported current-run delivery

### Requirement: Next-run selection and context notice
The selector SHALL save only post-processing selection/settings under common revision discipline, independently of source and adjustment drafts. Compatible Hands sessions and managed desktop runs SHALL follow committed configuration; older consumers SHALL receive next-run guidance without false live success. Browser previews, published web builds and offline packages SHALL remain excluded. Multiple-stage ordering and bypass controls SHALL remain absent.

#### Scenario: Save independently
- **WHEN** the person saves the mesh selection while source or adjustment drafts are dirty
- **THEN** those drafts remain unsaved, the running skeleton source is unchanged, and only supported post-processing delivery is attempted

#### Scenario: Context limitation
- **WHEN** the section is displayed
- **THEN** its context information identifies Hands live sessions and desktop apps run from this panel as supported, and browser previews, published web builds and offline packages as excluded

### Requirement: Honest live session states and rates

Hands SHALL distinguish Not started, Starting, Running, Running but no hands detected, Stalled, Stopping, Failed with reason, and Stopped compactly on or beside Start/Stop, in fps chips and viewport feedback. Rejected observations SHALL have counted non-fatal feedback. Tracking fps SHALL derive from valid session frames and frame age from mapped capture time. Unavailable measurements SHALL remain unavailable. Start SHALL return only after owned teardown, never remain permanently Stopping.

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
- **AND** the provider has ended, ownership is released and the button is enabled Start for an available saved source

#### Scenario: Isolated rejection remains recoverable
- **WHEN** a malformed provider observation is dropped during live tracking
- **THEN** compact feedback exposes its count and rejected value kind and joint index when applicable without an immediate Failed badge or synthetic replacement
- **AND** valid subsequent frames continue to supply real tracking metrics

#### Scenario: Failure has completed cleanup
- **WHEN** a failed session completes cleanup
- **THEN** its failure reason remains reportable, local retired/stopping flags are cleared before terminal controls render, and Start is available without false Busy on its own leftovers

#### Scenario: Stalled input resumes or times out
- **WHEN** input is Stalled and no fresh frame is available
- **THEN** tracking fps shows a dash and old hands and holds remain cleared
- **AND** fresh input resumes tracking automatically, or bounded liveness expiry ends and joins acquisition before Start is offered with a clear timeout reason

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

Hands SHALL offer one object, a cube, sphere or Suzanne chosen in Setup at a set position in front of the screen frame, that the current session hand can pinch or grab to pick up through the shared SDK interaction path. A held object SHALL keep its offset from the hand and turn with the palm. Holds SHALL clear on no hands, staleness, geometry reset, Stop, failure or disposal. It SHALL NOT use generated poses or count mouse actions as evidence of tracked-hand success.

#### Scenario: Live pinch and drag
- **WHEN** the current session hand pinches or grabs the object and moves or rotates
- **THEN** the object follows the processed hand and turns with the palm through shared SDK events, and returns to its set position on Reset

#### Scenario: Discontinuity while dragging
- **WHEN** tracking becomes stale or the session stops while the object is held
- **THEN** the object is released without a click and late old frames cannot resume the hold

### Requirement: Paired numeric adjustment rows

Each numeric adjustment SHALL have its label above one row with a number input on the left and synchronized slider on the right, all sliders in a tab sharing one width. Both controls SHALL retain existing bounds, steps and validation. Color swatches SHALL sit at the row end, aligned with the panel's content edge. Joints, bones and the pinch/grab indicator SHALL be one Display multi-select. The panel SHALL fit narrow widths without horizontal scrolling in light and dark themes.

#### Scenario: Every numeric setting has paired controls
- **WHEN** the person opens Transform or Display
- **THEN** X (mm), Y (mm), Z (mm), Size, Joint diameter (mm), Bone diameter (mm), Skeleton opacity, Indicator diameter (mm) and Indicator opacity each show one labelled number-and-slider row

#### Scenario: Number and slider stay synchronized
- **WHEN** the person edits either control of a numeric setting
- **THEN** its paired control reflects that setting's finite valid value without changing other settings
- **AND** the number input still accepts every value valid under the existing bounds and steps

#### Scenario: Existing commit timing and validation remain
- **WHEN** the person types a number or drags a slider
- **THEN** typing does not save until committed by change or Enter, while slider drags apply live without duplicate saves
- **AND** invalid number values retain field errors without changing saved or running state

#### Scenario: Compact sidebar in both themes
- **WHEN** adjustments are displayed in light or dark at the normal panel width or in a 320-pixel-wide panel
- **THEN** each number and slider remain beside one another, color swatches stay at their row end, and the content requires no horizontal scrolling

### Requirement: Accessible section reset gear menus

The Transform and Display tabs SHALL each show a plain gear in the tab bar that opens a small menu containing only Reset to defaults, right-aligned under the gear. Buttons and menus SHALL support keyboard and screen-reader use, Escape and outside-click dismissal. The viewport Reset SHALL remain separate.

#### Scenario: Opening and operating a section menu
- **WHEN** the person activates a tab's gear by pointer, Enter or Space
- **THEN** its single Reset to defaults menu item is shown and keyboard reachable with focus in the menu
- **AND** the trigger has an accessible tab-specific name and exposes its popup and expanded state

#### Scenario: Dismissing a reset menu
- **WHEN** the person presses Escape in an open menu or clicks outside it
- **THEN** the menu closes without changing adjustments
- **AND** Escape restores focus to that tab's gear button

#### Scenario: Resetting exactly one section
- **WHEN** the person activates Reset to defaults from a tab's menu
- **THEN** the menu closes and that tab resets through the existing immediate commit path
- **AND** the other tab's saved values and unfinished edits, selected source and provider calibration remain unchanged

#### Scenario: Viewport reset is separate
- **WHEN** the person uses Reset in the viewer toolbar
- **THEN** it frames the monitor and resets the object without changing saved adjustments

### Requirement: Actionable Hands ownership recovery

Hands SHALL distinguish its own draining acquisition from a different live owning page. Explicit Start SHALL automatically reconcile stale same-page or failed/dead same-panel ownership. Genuine live-page contention SHALL expose an explicit take-over action that requires authenticated authorization and completed old-worker teardown before capture starts. Reload SHALL NOT leave permanent stale Busy or silently start capture.

#### Scenario: Same page or failed session remains recorded
- **WHEN** a page requests Start after failure or stop and its own stale session remains recorded
- **THEN** it completes bounded recovery rather than showing another-page Busy or a permanently disabled Stopping button

#### Scenario: Another live page owns Hands
- **WHEN** a different live Hands page owns acquisition
- **THEN** Busy accurately identifies contention and an enabled explicit take-over action is offered
- **AND** taking over cannot overlap provider processes or target a replacement owner through a stale response

#### Scenario: Page reload
- **WHEN** the person reloads Hands during or after a failed/stalled session
- **THEN** the old page's session is retired and drained, navigation starts no device, and the next explicit Start can acquire after verified cleanup

### Requirement: Post-processing delivery status contract
Post-processing status SHALL expose owner identity, desired saved revision, requested/applied generation, preparation state/progress/failure reason and current consumer drawing generation where supported. Missing evidence SHALL remain unknown. Skeleton-session acknowledgement SHALL not count as processor or drawing acknowledgement. Configuration persistence SHALL succeed independently of optional delivery failure.

#### Scenario: Saved but still preparing
- **WHEN** desired settings are persisted and their processor generation has not completed preparation
- **THEN** backend status distinguishes saved/applying from applied/drawing, exposes Preparing and leaves skeleton controls and acquisition unaffected

#### Scenario: Applied but not drawn
- **WHEN** a processor acknowledges a generation but no compatible SDK reports current valid drawing for it
- **THEN** status identifies applied settings without claiming the mesh is visible

#### Scenario: Hands owns mesh delivery
- **WHEN** an explicit Hands session is active and has a compatible mesh gateway
- **THEN** backend save/retry/status operations target that session's mesh run and never start a second provider or confuse its evidence with a managed app

#### Scenario: No Hands mesh session yet
- **WHEN** Hands is open but neither an explicit Hands session nor a compatible managed desktop run owns processing
- **THEN** backend configuration/status operations start no mesh or provider and do not claim live mesh delivery

### Requirement: Declared post-processing controls

The selected plugin's declared settings SHALL render generically as labelled number-left/slider-right rows, select dropdowns and boolean switches. Bounds, steps, defaults and hints SHALL come from the declaration. Paired numbers SHALL remain synchronized and usable at normal and narrow widths in light and dark themes. Core SHALL contain no plugin-specific control behavior or wording.

#### Scenario: Mixed declared settings
- **WHEN** an installed plugin declares number, select and boolean settings with arbitrary valid keys
- **THEN** only its declared settings appear with their own labels, defaults, options and hints using the shared Hands control style
- **AND** each numeric setting has its label above a number input on the left and a slider on the right, without horizontal overflow at a 320-pixel sidebar width

#### Scenario: Plugin identity and visibility
- **WHEN** at least one plugin is installed and None or a missing/unavailable saved plugin is selected
- **THEN** the section remains visible with None and installed choices and retains a missing saved identity without selecting a replacement
- **AND** the entire section is hidden only when no plugin is installed, without altering saved selection or starting any runtime

### Requirement: Post-processing section reset menu

Post-processing SHALL have a plain borderless accessible gear opening a menu containing only Reset to defaults. Reset SHALL commit the selected plugin's declared defaults through the normal finished-edit path without changing the plugin selection, source, adjustments, calibration or other plugins' stored settings. None SHALL not create plugin settings.

#### Scenario: Keyboard and pointer menu operation
- **WHEN** the person activates the gear by pointer or keyboard
- **THEN** its single Reset to defaults item receives usable menu focus and the gear exposes its section-specific name and expanded state
- **AND** Escape restores gear focus and outside activation dismisses without resetting

#### Scenario: Reset current plugin
- **WHEN** Reset to defaults is activated for a selected available plugin
- **THEN** all its declared defaults are saved together immediately, independently of unrelated unfinished edits, with delivery status governed by acknowledgement

#### Scenario: None or unavailable declaration
- **WHEN** None or a missing plugin with no usable declaration is selected
- **THEN** Reset cannot fabricate settings or change the stored selection

### Requirement: Finished post-processing edits persist safely

Valid finished edits SHALL save immediately without routine Save or Reload. Intermediate or invalid input SHALL not persist or deliver. Writes SHALL preserve unrelated fields and unfinished drafts, safely rebase nonconflicting changes and retain same-field conflicts for explicit review/retry or use-saved recovery. Rapid commits SHALL not lose the newest intention or overwrite it with older responses.

#### Scenario: Number and slider commit timing
- **WHEN** the person types a number or drags its slider
- **THEN** paired preview updates alone do not save
- **AND** valid change, Enter, number-stepper completion or slider release commits once; duplicate completion events do not cause duplicate writes
- **AND** invalid input keeps a field error without changing the saved or live setting

#### Scenario: Select and switch commit timing
- **WHEN** the person chooses a plugin, None or an option, or toggles a boolean
- **THEN** the finished change saves immediately without a submit action and retained per-plugin values survive switching away and back

#### Scenario: Concurrent unrelated write
- **WHEN** another editor changes source, adjustments or another unedited plugin setting before a local commit
- **THEN** only the locally committed changes are reconciled against current profile and catalog revisions without overwriting that writer or unfinished local fields

#### Scenario: Concurrent same-field write
- **WHEN** another writer changes the same edited value or selection from its original base
- **THEN** the editor preserves the newer saved value and local intention, shows the conflict and requires explicit review before retrying or using saved

#### Scenario: Save in flight or component retired
- **WHEN** another finished edit occurs during a pending save, or the component is disposed before a response arrives
- **THEN** older completion cannot erase the newer edit, mark it applied or resurrect retired UI work

### Requirement: Acknowledgement-fenced post-processing feedback

Compact status near the controls SHALL distinguish saved, applying, Preparing, Applied and Failed using current owner/run, saved revision and configuration-generation evidence. Applied SHALL require the desired requested generation to be acknowledged, never just saved, written or skeleton-acknowledged. Failure SHALL retain saved choices and expose a reason and explicit Retry. Missing evidence SHALL not imply success or drawing.

#### Scenario: Saved before configuration acknowledgement
- **WHEN** persistence succeeds while the desired configuration generation is still pending
- **THEN** the UI reports applying or Preparing, never Applied, even if an older generation was applied

#### Scenario: Repreparation while input continues
- **WHEN** a plugin-declared reprepare setting is committed and current delivery reports Preparing
- **THEN** the control shows Preparing with available bounded progress, keeps saved choices and does not stop the skeleton session or demand relaunch of a compatible consumer

#### Scenario: Acknowledged settings without drawing
- **WHEN** the current desired generation is acknowledged for the matching run, plugin and saved configuration but no drawing generation is reported
- **THEN** the UI may say Applied but does not claim that a mesh is visible

#### Scenario: Delayed status or changed owner
- **WHEN** a poll, save or retry response belongs to an older request, revision, generation or retired run
- **THEN** it cannot replace newer feedback or report the current desired settings applied

#### Scenario: Delivery failure and retry
- **WHEN** preparation or live application fails after a successful save
- **THEN** a short reason and Retry appear without erasing the desired values or retrying automatically
- **AND** Retry targets the current run and saved revision without rewriting the profile or starting an idle consumer

#### Scenario: No active or compatible consumer
- **WHEN** there is no active mesh consumer or it cannot acknowledge live configuration
- **THEN** saves remain valid and navigation/edits start no capture or processor, while the UI avoids Applied and gives capability-appropriate relaunch guidance when needed

### Requirement: Session-bound optional mesh viewport
An explicit live Hands session SHALL feed copies of its final sampled pose to optional mesh processing and draw returned geometry through shared standard SDK drawing and compensation. Geometry profile, hand identity, settings generation and topology changes SHALL retire incompatible mesh. Stop, stale/empty input, failure and page disposal SHALL clear mesh. Replay and idle navigation SHALL not implicitly create a live mesh consumer.

#### Scenario: Final sampled pose is dispatched
- **WHEN** an active session receives frames under nonidentity global size/offset and the mesh service is ready
- **THEN** the processor receives the same adjusted, filtered, sampled pose used by the viewport and interaction, with observation provenance and no second adjustment

#### Scenario: Live None or plugin replacement
- **WHEN** None, another plugin or changed settings are committed during Hands acquisition
- **THEN** old-generation geometry retires immediately, contained processing is configured or replaced safely and skeleton filters and held interactions are unchanged

#### Scenario: Mesh and skeleton switches are independent
- **WHEN** post-processing is enabled with any combination of Joints and Bones switches
- **THEN** valid mesh is shown independently and those switches alone govern skeleton components, including during preparation or mesh failure

#### Scenario: Discontinuity and disposal
- **WHEN** a geometry profile changes, input becomes stale/empty, or Stop/failure/disposal retires the session
- **THEN** old mesh and drawing evidence clear before the next render and late replies cannot reattach geometry to a replacement session

#### Scenario: Appearance changes while holding
- **WHEN** only appearance changes during a held interaction
- **THEN** mesh colour and skeleton appearance update without releasing the hold, restarting acquisition or invalidating compatible topology

### Requirement: Viewer reference scene

The viewer SHALL show an endless grid and a monitor frame in the screen plane, a bottom-left orientation widget and the centre object, each on by default and toggled from View. The frame SHALL follow the Monitor resolution (4K by default, 2K or custom). Hands SHALL be drawn where they physically are relative to the frame; the Transform offset changes only what apps receive. Left drag SHALL orbit, middle drag pan and right drag zoom, without smoothing.

#### Scenario: Hands relative to the screen
- **WHEN** a Transform offset is set and a tracked hand is in front of the screen's top-left corner
- **THEN** the viewer draws that hand in front of the frame's top-left corner

### Requirement: Hands log tab

The Log tab SHALL list provider start and stop events, diagnostics and failure reasons as rows with a source badge, message and time, newest last and bounded, with a clear action.

#### Scenario: Provider lifecycle
- **WHEN** a session starts, runs and stops
- **THEN** the log shows one starting, one started, one stopping and one stopped row

### Requirement: Post-processing layers

The Post-process tab SHALL follow Display and offer an Add layer multi-select of installed post-processing plugins. A chosen plugin SHALL show as a layer card with its settings, a live status badge, an on/off switch and a remove action; one hand-mesh layer runs at a time. A plugin whose runtime is missing SHALL stay selectable and show Install when it exports a setup. With none installed, the tab shows a short empty note.

#### Scenario: Adding a layer that needs prerequisites
- **WHEN** the person adds a post-processing plugin whose runtime is not installed
- **THEN** it becomes the saved layer with an Install action instead of an unavailable label

#### Scenario: Switching a layer off
- **WHEN** the person turns off a layer's switch in its card corner
- **THEN** the layer and its settings stay saved, no mesh runs, and turning it on again resumes it

#### Scenario: Cancelling an install
- **WHEN** the person presses Cancel while an install runs
- **THEN** the install stops, its downloads are kept, and the next Install continues where it stopped

#### Scenario: Installing prerequisites
- **WHEN** the person presses Install and accepts the shown downloads, sizes and licences
- **THEN** the plugin's setup runs as a panel job with live output, Restart waits for it, and the layer becomes ready when it finishes
- **AND** progress follows one core contract for every plugin, showing each step's percent or running time

### Requirement: Resizable side panel

A splitter between the viewer and the side panel SHALL resize the panel by pointer drag or arrow keys, remember the width and redraw the viewer without blank frames. Tabs that do not fit SHALL move into a more menu at the end of the tab bar, keeping the selected tab visible.

#### Scenario: Narrow side panel
- **WHEN** the person drags the splitter until not every tab fits
- **THEN** the last tabs move into the more menu, and choosing one there selects it

### Requirement: Viewer display menu

The viewer toolbar SHALL offer a Display multi-select after Reset, separated from it, listing Skeleton and the active post-processing mesh layer by name. Each choice SHALL only show or hide that drawing in the viewer, remembered in the browser, without changing saved adjustments or stopping the layer. The mesh layer card SHALL offer a view-only mesh color and brightness, keeping the mesh opaque.

#### Scenario: Hiding the skeleton
- **WHEN** the person unchecks Skeleton while the mesh runs
- **THEN** the viewer draws only the mesh, and the saved joint and bone settings stay unchanged
