# Spec Delta

## Purpose

Adds one optional hand mesh from a separately installed local plugin during panel-managed desktop runs, without changing hand input or application code.

## ADDED Requirements

### Requirement: Discover installed mesh plugins passively
Mesh plugins SHALL declare a versioned sidecar entry and bounded settings schema with an origin-qualified identity. Discovery SHALL read metadata only, without importing code, starting a process or downloading assets. Missing, disabled and conflicting selections SHALL be reported without selecting another plugin.

#### Scenario: List installed options
- **WHEN** Hands opens with a mesh plugin installed
- **THEN** it is listed without execution, installation or user-state creation

### Requirement: One global optional selection
The existing global Hands profile SHALL store None or one selected mesh plugin and its settings. Revision-safe saves SHALL preserve source, adjustments, unknown fields and settings for unselected plugins. Selection/settings changes SHALL take effect on the next desktop app run, not hot-reconfigure an existing run.

#### Scenario: Select another plugin
- **WHEN** a new selection is saved while an app is running
- **THEN** the active run retains its launch selection and the next run uses the new selection

#### Scenario: Concurrent edit
- **WHEN** the saved profile changed after the selector was loaded
- **THEN** Save reports a conflict without overwriting the newer data

### Requirement: Mesh-only processing never changes input
The plugin SHALL receive copies of the final sampled canonical skeleton after shared adjustments/filtering/prediction. It SHALL return only optional mesh geometry, never replacement joints or gestures. Dispatch, readiness and results SHALL never block or alter skeleton delivery, gestures, pointer or interaction. None SHALL start no processor and preserve existing input behavior bit-identically.

#### Scenario: Slow or healthy mesh plugin
- **WHEN** the same hand fixtures run with None, healthy or delayed mesh processing
- **THEN** skeleton values and gesture/interaction traces are identical

### Requirement: Supervised local desktop lifecycle
Only panel-managed desktop runs consuming Hand SHALL start the selected installed sidecar. The run SHALL authenticate loopback communication, bind requests/results to its consumer epoch and own bounded startup/stop/crash cleanup. Owner loss SHALL terminate the child. Startup or compatibility failure SHALL leave skeleton input running with a visible reason, not fail the app launch.

#### Scenario: Sidecar crashes or owner exits
- **WHEN** the mesh child crashes or its owning panel/run exits
- **THEN** mesh becomes unavailable, owned processing stops and ordinary hand input is not changed by mesh cleanup

### Requirement: Bounded fresh geometry only
The sidecar path SHALL hold at most one frame in flight and one newest pending frame. Results SHALL pass finite-value, size, index and identity checks. Mesh SHALL expire within 33 ms of dispatch and be rejected on retired epochs/revisions, changed hand identity or excessive pose displacement. Empty/no-hand frames and disposal SHALL invalidate mesh immediately.

#### Scenario: Late or malformed result
- **WHEN** a result is old, oversized, invalid or associated with another pose epoch
- **THEN** it is discarded, the plain skeleton is drawn and status identifies the fallback

### Requirement: Standard SDK mesh drawing
Standard SDK hand drawing SHALL automatically display valid optional mesh with common scene mapping and global appearance, without app code. Visual opt-out SHALL suppress both skeleton and mesh drawing while preserving interaction. Missing, starting, late or failed processing SHALL visibly fall back to the ordinary skeleton with an independent mesh status reason.

#### Scenario: Mesh appears without app edits
- **WHEN** the selected plugin returns valid current geometry
- **THEN** standard drawing displays it using global bone color and opacity without changing joints or applying adjustments twice

#### Scenario: Visual opt-out
- **WHEN** the app disables standard hand drawing
- **THEN** neither skeleton nor mesh is attached and input still works

#### Scenario: Saved plugin is missing
- **WHEN** a desktop app runs after the selected plugin was removed
- **THEN** skeleton input continues and Hands reports the missing-plugin fallback without erasing the selection

### Requirement: Excluded contexts remain skeleton-only
Browser previews, published web builds, offline packages and unmanaged launches SHALL not use the optional mesh sidecar. The global mesh selection SHALL not block those operations or be implicitly erased. Processor runtime paths, credentials and code SHALL not enter portable output through this feature. Hands SHALL disclose this limitation in one line.

#### Scenario: Publication with a saved mesh selection
- **WHEN** a Hand app is previewed, published or packaged with a mesh plugin selected globally
- **THEN** the existing operation proceeds without mesh processing or mesh runtime credentials
