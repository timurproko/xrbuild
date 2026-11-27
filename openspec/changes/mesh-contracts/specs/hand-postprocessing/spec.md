# Spec Delta

## MODIFIED Requirements

### Requirement: One global optional selection
The global Hands profile SHALL store None or one selected mesh plugin and schema-versioned settings. Revision-safe saves SHALL preserve source, adjustments, unknown fields and unselected settings. Compatible managed desktop consumers SHALL follow committed post-processing configuration without restarting acquisition. Saved, applying, applied and drawing state SHALL remain distinct; unsupported older consumers SHALL report relaunch guidance.

#### Scenario: Select another plugin
- **WHEN** another plugin or None is committed during a compatible managed desktop run
- **THEN** the old mesh generation is retired and its processor is stopped before any replacement starts, while skeleton acquisition and interaction continue

#### Scenario: Concurrent edit
- **WHEN** the saved profile changed after the selector was loaded
- **THEN** Save reports a conflict without overwriting the newer data

#### Scenario: No owning run
- **WHEN** post-processing configuration is saved with no active managed consumer
- **THEN** only saved configuration changes and no processor, provider or installation starts

#### Scenario: Legacy consumer
- **WHEN** a consumer lacks the current-run configuration capability
- **THEN** saved values remain available for its next launch and status does not claim live application

### Requirement: Supervised local desktop lifecycle
Only panel-managed desktop runs consuming Hand SHALL start the selected installed sidecar. Requests/results SHALL be authenticated and consumer-epoch bound. The run SHALL contain its process tree from birth, own bounded preparation/stop/crash cleanup, and stop owned processing on owner loss. Startup or compatibility failure SHALL preserve skeleton input and app launch with a visible reason. Unverified cleanup SHALL not be reported as Stopped.

#### Scenario: Sidecar crashes or owner exits
- **WHEN** the mesh child crashes or its owning panel/run exits
- **THEN** mesh becomes unavailable, owned processing stops and ordinary hand input is not changed by mesh cleanup

#### Scenario: Uncooperative child and descendants
- **WHEN** a processor ignores Stop or pipe EOF, blocks in preparation, or leaves an owned descendant alive
- **THEN** bounded forced containment ends the owned tree without signalling any foreign process or relying on a reused numeric PID

#### Scenario: Stop races startup or replacement
- **WHEN** cancellation arrives during spawn, preparation, configure or processor replacement
- **THEN** no late completion can revive retired processing and cleanup completion is based on verified owned-process termination

### Requirement: Bounded fresh geometry only
The sidecar path SHALL hold at most one frame in flight and one newest pending frame. Results SHALL pass finite-value, size, index and identity checks. Mesh SHALL expire within 33 ms of dispatch and be rejected on retired epochs/revisions, changed hand identity or excessive pose displacement. Empty/no-hand frames and disposal SHALL invalidate mesh immediately. Negotiated configuration generations SHALL also fence results and cached topology.

#### Scenario: Late or malformed result
- **WHEN** a result is old, oversized, invalid or associated with another pose epoch
- **THEN** it is discarded, the plain skeleton is drawn and status identifies the fallback

#### Scenario: Retired configuration
- **WHEN** a result or cached topology belongs to a configuration retired by a newer requested generation
- **THEN** it cannot be displayed or counted as drawing the new generation, even if its pose association and topology label otherwise match

### Requirement: Standard SDK mesh drawing
Standard SDK drawing SHALL display valid optional mesh with common scene mapping and global bone color/opacity, without app code or repeated adjustments. Joints/Bones switches SHALL affect only skeleton components; selecting mesh or None SHALL not change them. Visual opt-out SHALL suppress skeleton and mesh while preserving interaction. Missing, preparing, late or failed processing SHALL leave skeleton visibility governed by the person's appearance choices and report an independent mesh reason.

#### Scenario: Mesh appears without app edits
- **WHEN** the selected plugin returns valid current geometry
- **THEN** standard drawing displays it using global bone color and opacity without changing joints or applying adjustments twice

#### Scenario: Visual opt-out
- **WHEN** the app disables standard hand drawing
- **THEN** neither skeleton nor mesh is attached and input still works

#### Scenario: Saved plugin is missing
- **WHEN** a desktop app runs after the selected plugin was removed
- **THEN** skeleton input continues and Hands reports the missing-plugin fallback without erasing the selection

#### Scenario: Independent appearance switches
- **WHEN** the person hides or shows skeleton joints/bones while a valid mesh is enabled, or selects mesh/None while joints/bones are visible
- **THEN** mesh visibility follows only valid selected mesh output and skeleton visibility follows only its appearance switches

## ADDED Requirements

### Requirement: Negotiated final-pose observations
A capable processor SHALL receive 21 final panel-metre joints with aligned provider confidence, explicit observation support and nonnegative observation age on the consumer's mapped monotonic clock. Prediction SHALL not refresh observation evidence. Unknown confidence or timing SHALL remain explicitly unknown; fit residuals SHALL not substitute for acquisition support. Legacy processors SHALL receive only their negotiated contract.

#### Scenario: Partly unsupported finger
- **WHEN** acquisition publishes low or zero confidence for some joints of an otherwise accepted hand
- **THEN** the final pose retains those exact scores and support facts after adjustment, filtering and prediction instead of presenting all joints as observed

#### Scenario: Repeated sampling without capture
- **WHEN** a supported joint is sampled repeatedly without a newer observation
- **THEN** its observation age increases and prediction does not become a fresh observation

#### Scenario: Unknown observation provenance
- **WHEN** an older/custom consumer cannot provide acquisition scores or trustworthy mapped age
- **THEN** capability/status reports unknown evidence and no full-confidence or zero-age observation is invented

### Requirement: Acknowledged live configuration
Capable processors SHALL declare bounded live versus reprepare settings and accept validated run-bound configure messages with ordered generations and settings schema version. Applied acknowledgement SHALL identify the exact generation and sanitized values. At most one applying and one newest pending configuration SHALL exist. Duplicate, stale, foreign-run or unsupported acknowledgements SHALL not advance applied state.

#### Scenario: Cached quality setting changes
- **WHEN** a declared live setting changes while a compatible run is active
- **THEN** the processor atomically applies and acknowledges the new generation without ending the run, and subsequent accepted results identify that generation

#### Scenario: Rapid edits and delayed acknowledgement
- **WHEN** several configuration commits arrive while an earlier one is applying
- **THEN** only the newest pending values remain, and an older acknowledgement cannot claim the latest values were applied or drawn

#### Scenario: Configure rejection
- **WHEN** a processor rejects a change, fails preparation or never acknowledges within its allowance
- **THEN** desired saved values remain distinct from applied state, stale geometry is not relabelled, and skeleton input remains unaffected with a bounded reason

### Requirement: Bounded preparation with progress
A capable plugin SHALL declare a preparation allowance accepted only within a finite core bound. Startup and reprepare SHALL expose Preparing, Ready or Failed with bounded progress/status and reason. Progress SHALL not extend the hard allowance. Ready SHALL mean usable processing for an acknowledged generation, not completion of a pipe write or proof of rendering.

#### Scenario: Cold preparation exceeds ten seconds
- **WHEN** a processor prepares for seventeen seconds within its declared allowance
- **THEN** it remains Preparing rather than failing at ten seconds, while skeleton delivery and interaction proceed normally

#### Scenario: Device change requires preparation
- **WHEN** a declared reprepare setting changes during a run
- **THEN** mesh enters Preparing and retires incompatible output without ending the owning app/input session, and becomes Ready only for the acknowledged new generation

#### Scenario: Endless progress or invalid allowance
- **WHEN** progress continues past the hard deadline or a declaration requests an invalid or excessive allowance
- **THEN** mesh fails with a bounded reason and owned cleanup completes without waiting on interaction

### Requirement: Checked writable runtime resolution
An opted-in declaration SHALL resolve a plugin-owned prepared runtime generation beneath the selected user workspace using a complete checked receipt bound to plugin identity, source/declaration inputs and output integrity. Launch files SHALL be contained regular unlinked files and checked again before spawn. Discovery SHALL remain passive; unsafe, missing, stale or incomplete state SHALL report unavailable without PATH search, implicit setup or source-tree writes.

#### Scenario: Runtime outside the source folder
- **WHEN** a plugin has a valid prepared program and model files in its owned user-workspace generation
- **THEN** the checked program can launch with its contained runtime root without core identifying the runtime language, model names or device implementation

#### Scenario: Unsafe or stale runtime
- **WHEN** a receipt belongs to another owner/source, is incomplete, has modified output, or resolves through traversal, symlinks, junctions or hard links
- **THEN** launch is refused with a safe reason, existing files are preserved, and no ambient executable is substituted

#### Scenario: Legacy source-contained program
- **WHEN** a legacy plugin declares its valid source-contained program
- **THEN** it remains usable under existing containment rules without requiring a runtime receipt or rewriting its declaration

### Requirement: Backward-compatible mesh capabilities
Declaration, processor and consumer capability versions SHALL be negotiated independently of the unchanged provider ABI and HANDS wire layout. Legacy version-one processors/consumers SHALL retain their supported launch-time mesh behavior. New-only control, observations or generations SHALL never be sent to a peer that did not negotiate them; unsupported combinations SHALL produce honest skeleton fallback or relaunch guidance.

#### Scenario: Compatibility combinations
- **WHEN** old/new declarations, processors and SDK consumers are paired
- **THEN** only their shared supported contract is used, and live configuration or observation support is never falsely acknowledged
