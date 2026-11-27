# Spec Delta

## MODIFIED Requirements

### Requirement: Supervised local desktop lifecycle
Only explicit Hands sessions and panel-managed desktop runs consuming Hand SHALL own optional mesh processing. Requests/results SHALL be authenticated and consumer-epoch bound. The owner SHALL contain its processor tree from birth and use bounded preparation and verified stop/crash cleanup. Optional startup or compatibility failure SHALL preserve skeleton input with a visible reason. Mesh SHALL never acquire a camera lease. Unverified cleanup SHALL not be reported as Stopped.

#### Scenario: Sidecar crashes or owner exits
- **WHEN** the mesh child crashes or its owning panel/run exits
- **THEN** mesh becomes unavailable, owned processing stops and ordinary hand input is not changed by mesh cleanup

#### Scenario: Uncooperative child and descendants
- **WHEN** a processor ignores Stop or pipe EOF, blocks in preparation, or leaves an owned descendant alive
- **THEN** bounded forced containment ends the owned tree without signalling any foreign process or relying on a reused numeric PID

#### Scenario: Stop races startup or replacement
- **WHEN** cancellation arrives during spawn, preparation, configure or processor replacement
- **THEN** no late completion can revive retired processing and cleanup completion is based on verified owned-process termination

#### Scenario: Hands Start pins optional processing
- **WHEN** the person explicitly starts Hands with saved post-processing configuration
- **THEN** that session owns its pinned initial mesh selection/settings alongside the provider, without waiting for optional preparation before skeleton delivery
- **AND** a missing processor/runtime or failed preparation does not fail acquisition or start another provider

#### Scenario: Hands page loss or provider crash
- **WHEN** the owning page disappears, its heartbeat expires, its provider crashes or the panel exits
- **THEN** session-owned mesh requests and credentials retire and its contained processing drains through verified cleanup

### Requirement: Bounded fresh geometry only
The path SHALL hold at most one frame in flight and one newest pending frame. Results SHALL pass finite-value, size, index and identity checks. Compensated mesh SHALL have a finite source-age bound of at most 100 ms and pass a current-pose residual check after compensation. Retired epochs/revisions, changed identity, empty/no-hand input and disposal SHALL invalidate mesh immediately. Negotiated configuration generations SHALL fence results and cached topology.

#### Scenario: Late or malformed result
- **WHEN** a result exceeds its compensated source-age bound, is oversized or invalid, or belongs to another pose epoch
- **THEN** it is discarded, skeleton visibility remains governed by appearance settings and status identifies the unavailable mesh

#### Scenario: Retired configuration
- **WHEN** a result or cached topology belongs to a configuration retired by a newer requested generation
- **THEN** it cannot be displayed or counted as drawing the new generation, even if its pose association and topology label otherwise match

#### Scenario: Fast rigid hand motion
- **WHEN** a valid delayed result differs from the current skeleton by wrist translation and rotation but has a plausible articulation residual
- **THEN** raw displacement alone does not discard it and the surface follows the current wrist every render frame

#### Scenario: Unsafe articulation or degenerate anchor
- **WHEN** the source-to-current anchor cannot be established safely or the post-compensation joint residual exceeds the bounded tolerance
- **THEN** mesh is not drawn rather than displaying detached skin, inventing observation confidence or changing skeleton joints

#### Scenario: Paused processor or page
- **WHEN** no replacement result arrives within the source-age bound
- **THEN** previous geometry and drawing-generation evidence expire without refreshing age from render or dispatch activity

### Requirement: Standard SDK mesh drawing
Standard drawing SHALL display valid optional mesh with common scene mapping, no repeated adjustments, global bone colour and an opaque single-sided lit material independent of skeleton opacity. Joints/Bones switches SHALL affect only skeleton components; selecting mesh or None SHALL not change them. Visual opt-out SHALL suppress skeleton and mesh while preserving interaction. Missing, preparing, late or failed mesh SHALL not override skeleton appearance choices.

#### Scenario: Mesh appears without app edits
- **WHEN** the selected plugin returns valid current geometry
- **THEN** standard drawing displays it using global bone colour and opaque single-sided lighting without changing joints or applying adjustments twice

#### Scenario: Visual opt-out
- **WHEN** the app disables standard hand drawing
- **THEN** neither skeleton nor mesh is attached and input still works

#### Scenario: Saved plugin is missing
- **WHEN** a desktop app runs after the selected plugin was removed
- **THEN** skeleton input continues and Hands reports the missing-plugin fallback without erasing the selection

#### Scenario: Independent appearance switches
- **WHEN** the person hides or shows skeleton joints/bones while a valid mesh is enabled, or selects mesh/None while joints/bones are visible
- **THEN** mesh visibility follows only valid selected mesh output and skeleton visibility follows only its appearance switches

#### Scenario: Skeleton opacity changes
- **WHEN** skeleton opacity is changed while mesh is enabled
- **THEN** skeleton opacity changes independently and mesh remains opaque with back faces culled

## ADDED Requirements

### Requirement: Current-pose mesh compensation
Between processor results standard mesh drawing SHALL re-anchor the last valid surface to the current final sampled skeleton every render frame, including wrist translation and orientation. Source geometry and skeleton input SHALL remain unchanged. Normals SHALL follow the same rotation, compensation SHALL not accumulate across frames, and pose fitting age SHALL remain distinct from current rigid anchoring.

#### Scenario: Translation and rotation between replies
- **WHEN** the hand translates and rotates through several renders before another result arrives
- **THEN** the mesh follows the current wrist using the original associated pose, without cumulative drift or a mesh-derived interaction pose

#### Scenario: Same source in Hands and managed app
- **WHEN** both consumers process equivalent final poses, profile generations and delayed results
- **THEN** they use the same compensation and validity policy rather than diverging viewport-specific mesh logic

#### Scenario: Delayed motion acceptance
- **WHEN** an isolated realistic-latency processor is exercised with still, normal and fast translation/rotation plus articulation fixtures
- **THEN** before/after reporting includes mesh-unavailable render fraction, visible source-age percentiles, render cadence and residuals, with a fast-motion target well below five percent unavailability and any visual attachment limitations stated honestly
