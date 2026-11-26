## MODIFIED Requirements

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

Hands SHALL show only Skeleton provider and optional installed post-processing controls in its source sidebar, leaving space above the provider for separately delivered live controls. Provider selection SHALL save silently on change, with an inline error and retry on failure. Save source, Reload, routine availability/session/history prose and next-launch guidance SHALL be absent. Missing/unavailable choices SHALL retain their identity without automatic replacement.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands retains and labels that option without selecting a replacement or showing routine availability prose

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** Hands displays the picker without a not-started status or a claim that hardware is connected or running

#### Scenario: Standalone live session not available
- **WHEN** Hands opens before the separate provider-session capability is delivered
- **THEN** the view remains idle, the space above Skeleton provider stays free and no Start/Stop implementation is fabricated

#### Scenario: Source Save independent of tools
- **WHEN** the person selects a provider while an adjustment edit is in progress
- **THEN** only source selection is saved, without committing/discarding that edit or starting acquisition
- **AND** the current running app keeps its acquisition source

#### Scenario: Selection save fails
- **WHEN** saving a selected provider fails
- **THEN** a short inline error and retry preserve the unsaved selection without a success claim

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
