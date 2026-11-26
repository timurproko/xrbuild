# Spec Delta

## MODIFIED Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible independently of optional input/tool plugins or compiled viewers. `/hands/` SHALL be the sole Hands product page, titled Hands, with a provider-centred three-column hand view, calibration and recorder sections. Old diagnostic routes and the legacy `/hand-tracking/` alias SHALL return normal not-found responses without redirects. No separate diagnostic identity/page/link SHALL remain.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional hand tools plugin or checked tool build
- **THEN** the core layout, provider picker and available core controls still open
- **AND** dependent calibration/recording actions show one-line unavailability reasons instead of a page-wide setup wall

#### Scenario: Diagnostic installed
- **WHEN** the optional calibration/recording implementation is available
- **THEN** those retained tools are reachable inside Hands without a second product page or laboratory navigation

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

## ADDED Requirements

### Requirement: No generated or laboratory modes

Hands SHALL NOT expose generated fixtures, fixture controls/tests/targets, browser hand-landmark acquisition, general depth-hand surface reconstruction, two-view fusion or benchmarks. Their implementation and build/test entry points SHALL be removed except primitives required by retained calibration or existing recording compatibility. Synthetic SHALL remain only an ordinary installed provider choice, never a preview/fallback.

#### Scenario: Hands opened idle
- **WHEN** Hands opens without a live provider session
- **THEN** no generated hand, fixture action or automatic Synthetic choice appears

#### Scenario: Mixed dependency removed
- **WHEN** obsolete laboratory code shares a helper with calibration or recording compatibility
- **THEN** the required helper remains independently usable without importing the removed engine

### Requirement: Camera calibration retains its true scope

Hands SHALL retain camera-to-camera spatial calibration with its required native RGB-D/marker or manual static-target measurement path, validation, compatible persistence and import/export. It SHALL identify the result as a camera transform, not global hand placement or provider calibration. Calibration-only capture SHALL require an explicit action and existing prerequisites; hand inference and fusion SHALL NOT be prerequisites.

#### Scenario: Calibration performed
- **WHEN** the optional native calibration dependencies and two valid camera profiles are available and the user explicitly starts calibration
- **THEN** the existing marker/manual-target measurement and validated camera-transform save/export can run without hand-model workers or a fusion engine

#### Scenario: Existing result imported
- **WHEN** an existing supported camera calibration is opened
- **THEN** its transform, source identities, validation and original storage/format remain readable without treating it as applied to app hands

#### Scenario: Native calibration unavailable
- **WHEN** calibration capture prerequisites are absent
- **THEN** its action states the concrete missing prerequisite and does not silently start an alternative source

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

Hands SHALL use the shared SDK pipeline and applied global profile for actual provider frames, with no diagnostic filtering override. It SHALL host a post-processing selector mount and the existing grouped Position and size / Appearance component with explicit Apply. Only calibration and recorder need tool tabs. View/Reset/fullscreen SHALL affect scene state, not source/profile/calibration persistence.

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
