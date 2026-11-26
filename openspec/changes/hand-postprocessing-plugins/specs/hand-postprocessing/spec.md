# Spec Delta

## Purpose

Provides separately installed, globally configured hand processing with safe bounded execution and common optional surface geometry, independent of skeleton providers and application code.

## ADDED Requirements

### Requirement: Versioned metadata-only stage registry
Plugins SHALL declare post-processing stages through versioned metadata with owner-qualified identities, slot, execution support, settings schema, resource bounds and content identity. Discovery SHALL read metadata only, without importing processor code, starting processes, opening devices or downloading assets. Disabled, conflicting and invalid installed declarations SHALL remain diagnosable without implicit origin fallback.

#### Scenario: Installed stage discovery
- **WHEN** Hands lists a plugin with processor metadata and an executable entry point
- **THEN** its declaration is listed without executing that entry point or creating user state

#### Scenario: Conflicting or invalid owner
- **WHEN** the saved stage has conflicting origins, an unsupported version or an escaped entry point
- **THEN** it is unavailable with an explicit reason and no other stage is substituted

### Requirement: One global revisioned processing profile
Enabled stage identities, order, settings versions and explicit bypass choices SHALL persist in the same workspace-global Hands profile as source and adjustments. Writes SHALL require the current profile and registry revisions, preserve unknown and uninstalled stage data, and reject unsafe or oversized state without overwriting it. Pipeline edits SHALL apply on the next session, not hot-load code into a running session.

#### Scenario: Independent source and pipeline drafts
- **WHEN** a pipeline is saved while the source picker has an unsaved choice
- **THEN** only pipeline fields are committed and the source choice remains unchanged

#### Scenario: Competing writer
- **WHEN** another editor has changed the profile or declaration since the pipeline was loaded
- **THEN** pipeline Save reports a conflict and retains both the saved data and local draft for review

#### Scenario: Removed stage
- **WHEN** an enabled stage is uninstalled
- **THEN** its identity and settings remain visible and launches requiring it fail until explicitly resolved

### Requirement: Two ordered processing slots
Skeleton refinement SHALL run in saved order before the single shared size/offset transform and shared filtering/gestures. Geometry enrichment SHALL consume the final sampled canonical pose after shared filtering/prediction, never delay interaction, and never replace the 21-point interaction layout. Fixed slots, dependencies and geometry channel ownership SHALL be validated rather than inferred from discovery order.

#### Scenario: Nonidentity adjustments and several stages
- **WHEN** two skeleton stages and a geometry stage are enabled
- **THEN** skeleton stages run in saved order, adjustments run once, and geometry receives the resulting sampled pose with no second transform

#### Scenario: Competing mesh writers
- **WHEN** two enabled stages claim the same standard mesh channel
- **THEN** pipeline validation rejects the conflict before processing starts

### Requirement: Exact empty-pipeline compatibility
With no stage enabled the processing extension SHALL preserve frames bit-identically relative to the existing adjustment pipeline, including optional signals, clocks, capabilities and negative zero. It SHALL start no processing worker or sidecar and SHALL preserve existing filtering, gesture, interaction and standard-visual behavior.

#### Scenario: Disabled and absent stages
- **WHEN** native and browser-source fixtures pass through empty and disabled-only pipelines
- **THEN** their frame objects and numeric bits match the existing path and interaction/event traces remain identical

### Requirement: Versioned immutable frame and result association
Stage inputs and results SHALL identify schema, units, coordinate frame, source, session epoch, profile/pipeline revision, hand IDs, source sequence, capture clock and sample identity. Inputs SHALL be immutable snapshots. Results SHALL preserve their input association and pass finite-value, schema, topology and size checks before admission. Optional confidence or fitted quality SHALL not be fabricated as measured sensor confidence.

#### Scenario: Malformed result
- **WHEN** a stage returns nonfinite vertices, invalid indices, excessive buffers or the wrong input identity
- **THEN** the result is rejected and the applicable slot failure policy is reported

#### Scenario: Optional source provenance
- **WHEN** the final sampled pose has no new sensor confidence measurement
- **THEN** the geometry stage receives labelled source provenance or unavailable confidence, not an invented sample measurement

### Requirement: Coherent refined signal semantics
A skeleton stage SHALL declare whether it returns coherent native gesture/palm fields or explicitly requests downstream derivation with corresponding capabilities cleared. The original published fields SHALL remain available as provenance. Undeclared mixing of refined joints with obsolete native geometry or gesture decisions SHALL fail validation. The no-stage path SHALL retain current native signal policy exactly.

#### Scenario: Derived refined gestures
- **WHEN** an enabled skeleton stage declares downstream derivation
- **THEN** the shared pipeline derives the affected signals, identifies that policy visibly, and retains original fields in provenance

### Requirement: Bounded work and freshness
Each active execution queue SHALL hold at most one frame in flight and one replaceable newest pending frame. Skeleton work SHALL obey an admitted total deadline of at most 8 ms per frame; geometry SHALL never delay interaction and SHALL expire no later than 33 ms after its input sample. Results from retired epochs, revisions or hand identities SHALL never be applied. Drops, output age and deadline violations SHALL be observable.

#### Scenario: Processor slower than source
- **WHEN** more frames arrive while a stage is busy
- **THEN** only the newest pending frame is retained, superseded work is counted, and no unbounded backlog develops

#### Scenario: Late previous session result
- **WHEN** an otherwise valid result arrives after stop, reset, profile replacement or hand identity retirement
- **THEN** it is discarded without restoring input, geometry or interaction state

### Requirement: Slot-specific failure and safe release
Optional geometry failure SHALL visibly fall back to the plain skeleton without altering interaction. Skeleton failure SHALL stop processed input and release gestures, holds and pointer presses without a click. Bypass SHALL occur only after explicit prior consent for a stage that declares support, with a reset and prominent degraded status. Failures SHALL NOT trigger another source or endless automatic restarts.

#### Scenario: Geometry crash or stale mesh
- **WHEN** optional geometry crashes, misses its deadline or no longer matches the current pose
- **THEN** the mesh disappears, plain skeleton interaction continues and the stage reports the reason

#### Scenario: Skeleton failure while grabbing
- **WHEN** a required skeleton stage times out or produces invalid data during a grab
- **THEN** input stops, active holds and pointer presses release without a click, and no unprocessed frame leaks through

#### Scenario: Explicitly permitted bypass
- **WHEN** a failed skeleton stage has both declared bypass support and saved user consent
- **THEN** the same source resumes only after filter/interaction reset and the stage remains visibly bypassed

### Requirement: Supervised authenticated sidecar lifecycle
Heavy stages SHALL run in a supervised local process, never on the render thread or native capture callback. Managed native runs SHALL own authenticated loopback start, ready, frame, result, stop and crash handling. Code and credentials SHALL remain bound to the selected installed owner and run. Stop, disposal, launch rollback, host exit and panel exit SHALL retire credentials and clean up owned processes with bounded waits.

#### Scenario: Sidecar readiness
- **WHEN** an explicit managed native launch requires a sidecar
- **THEN** the selected installed runtime is started once, authenticates and declares compatible readiness before required processing accepts input

#### Scenario: Foreign client or orphan
- **WHEN** an old token, foreign origin or another run attempts connection, or the supervisor disappears
- **THEN** foreign access is refused and the owned sidecar terminates rather than becoming an unowned service

### Requirement: Runtime feature acknowledgement
A managed run with enabled stages SHALL require a compatible SDK processing acknowledgement before releasing hands to the app. Missing, old or incompatible consumers SHALL fail visibly rather than ignore required processing fields. Portable profile versioning SHALL distinguish a required processing snapshot from legacy adjustment-only data.

#### Scenario: Old SDK bundle
- **WHEN** the app cannot acknowledge the enabled pipeline contract
- **THEN** launch remains gated and reports rebuild or relaunch guidance instead of delivering unprocessed hands

### Requirement: Common optional geometry and standard drawing
Apps SHALL retain the existing common skeleton and interaction APIs and gain an optional provider-neutral geometry accessor tied to a valid pose/hand identity. Compatible mesh output SHALL render automatically in standard SDK visuals with common scene mapping and global appearance. Visual opt-out SHALL disable all standard drawing without disabling processing or interaction. Empty frames, hand loss and disposal SHALL invalidate geometry and release drawing resources.

#### Scenario: Mesh without app edits
- **WHEN** a compatible stage supplies current mesh geometry to a managed app
- **THEN** standard visuals draw it without provider-specific app code, using global color/opacity and the same panel-to-scene mapping

#### Scenario: Standard drawing disabled
- **WHEN** the app uses the standard visual opt-out
- **THEN** neither skeleton nor mesh is attached while common geometry access and interaction remain available

#### Scenario: No current hand
- **WHEN** a source publishes an empty frame or the hand identity is lost
- **THEN** its mesh is invalidated immediately even if ordinary skeleton grace remains active

### Requirement: Honest execution-context closure
Before launch, preview, publication or offline packaging, Hand consumers SHALL resolve the enabled pipeline against the actual execution context and supported lifecycle owner. Unsupported stages SHALL block the operation with actionable reasons, not be dropped or implicitly disabled. Disabled-only pipelines SHALL retain existing deployment behavior. Processor code, credentials and machine paths SHALL not enter portable app output implicitly.

#### Scenario: Local sidecar requested in deployed contexts
- **WHEN** a managed-native-only stage is enabled for browser preview, publication or an offline package
- **THEN** the operation refuses before output or startup and asks for explicit disabling or a supported execution context

#### Scenario: App without Hand
- **WHEN** an app does not consume logical Hand
- **THEN** globally enabled stages are not started and do not block unrelated app execution
