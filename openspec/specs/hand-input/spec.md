# hand-input Specification

## Purpose

Makes Hand a logical application input backed by one globally selected skeleton source, with explicit availability and simple normalization of historical input names.

## Requirements

### Requirement: Logical Hand input

The application Input selector SHALL offer Hand alongside Mouse and Keyboard rather than individual skeleton providers. A new Hand choice SHALL require an installed, enabled provider compatible with the execution context. A saved Hand choice SHALL remain visible when unavailable.

#### Scenario: Installed native source
- **WHEN** an enabled native skeleton provider is installed for a native application
- **THEN** Input offers Hand and does not offer that provider as a separate input kind

#### Scenario: No compatible source
- **WHEN** no installed enabled source supports the application's execution context
- **THEN** Hand is not offered as a new choice and a saved Hand selection remains visible as unavailable

### Requirement: Provider declaration and identity

Plugins and core SHALL register hand skeleton sources with stable owner-qualified identities and availability. Native sources SHALL retain the existing input ABI, coordinate semantics and wire layout. Compatible undeclared native input providers SHALL remain usable through legacy registration. Ownership conflicts SHALL NOT resolve by discovery order.

#### Scenario: Old binary with no new metadata
- **WHEN** a validated enabled native input provider has no explicit skeleton declaration
- **THEN** it remains usable under its actual owner and runtime identity without altering its published frames

#### Scenario: Conflicting owners
- **WHEN** a selected source has ambiguous or mismatched ownership
- **THEN** it is unavailable and another source is not substituted

### Requirement: One global selected source

Hands SHALL store one global source choice in the selected workspace, never per application. With no choice, exactly one installed enabled real source compatible with the execution context SHALL be the initial default; zero or several SHALL require a choice. Discovery SHALL NOT create state. Source changes SHALL apply on next launch, not hot-switch running acquisition; adjustment Apply SHALL NOT switch the running source.

#### Scenario: Two logical-Hand applications
- **WHEN** the user saves a different source in Hands
- **THEN** both applications use that source on their next launch and an existing running application retains its launch source

#### Scenario: Unique real source initially
- **WHEN** no choice exists and exactly one real source is installed and enabled in the execution context
- **THEN** Hands shows it selected and the first launch pins it before starting

#### Scenario: Zero or multiple real sources initially
- **WHEN** no choice exists and zero or several real sources qualify
- **THEN** Hand requires an explicit choice and synthetic or replay sources are not automatically selected

#### Scenario: Adjustment after source Save
- **WHEN** a different source was saved during a managed run and the user applies adjustments
- **THEN** the current run receives the adjustments while retaining its original source and policy

### Requirement: Visible source failure without fallback

A missing, disabled, unconfigured, incompatible or failed selected source SHALL be identified as such. The system SHALL NOT replace it with another source or report it as running without runtime evidence. Hardware availability SHALL remain unknown until an explicit launch checks it.

#### Scenario: Selected source removed
- **WHEN** the saved source is missing while a synthetic source is installed
- **THEN** the launch reports the saved source as missing and does not start synthetic input

#### Scenario: No current detection
- **WHEN** a running source reports no hands in a frame
- **THEN** that alone does not remove the Hand choice or trigger a source switch

### Requirement: Consistent execution and package resolution

Managed native runs, development runs, browser previews and packages SHALL resolve logical Hand before execution or dependency staging. Only one source SHALL feed logical Hand. Unsupported source/context combinations SHALL fail explicitly. Packages SHALL freeze a portable resolved selection without requiring the author's panel or workspace at runtime.

#### Scenario: Native built and dev runs
- **WHEN** the same Hand-enabled app is launched in built and development modes
- **THEN** both receive the same selected concrete provider and effective provider settings

#### Scenario: Browser context mismatch
- **WHEN** a Hand-enabled browser preview selects a native-only source
- **THEN** it reports incompatibility without starting a native worker or silently selecting WebXR

#### Scenario: WebXR source
- **WHEN** the selected browser source is WebXR
- **THEN** hand delivery uses the existing joint adapter only in an explicitly entered supported session

#### Scenario: Offline package
- **WHEN** a native package is built and the workspace selection subsequently changes
- **THEN** the package retains its checked concrete provider/configuration snapshot and runs without reading workspace preferences

### Requirement: Normalize all provider inputs to Hand

Saved concrete hand-provider inputs SHALL be read as logical Hand, including unknown names and arrays naming several providers. They SHALL launch the global source, without per-app assignments, adoption steps or semantics versions. Reads SHALL NOT rewrite manifests; the next settings Save SHALL write canonical inputs and preserve plugin configuration.

#### Scenario: Old application names another provider
- **WHEN** an application's saved input names a different provider from the global choice
- **THEN** it launches the global provider and its file remains unchanged until settings are saved

#### Scenario: Several old names
- **WHEN** an input list names several concrete hand providers
- **THEN** they are represented as one Hand and only the global source launches

#### Scenario: Next settings save
- **WHEN** settings for an old application are saved
- **THEN** canonical inputs replace historical provider input names and plugins configuration is retained

### Requirement: Preserve published signals and shared processing

Native and WebXR hand delivery SHALL enter the shared processing pipeline without changing existing ABI/wire structures or default processing behaviour. Native optional gesture/palm fields and capabilities SHALL remain available. Managed input policy SHALL prevent WebXR injecting hands when Hand is off or assigned to native, without input-semantics versions.

#### Scenario: Native gesture compatibility
- **WHEN** a provider publishes native pinch, grab and palm capabilities
- **THEN** those signals reach the existing SDK processing with unchanged native-pinch/native-grab policy and no extra filtering

#### Scenario: Managed Hand disabled
- **WHEN** a managed application without Hand enters an XR session
- **THEN** WebXR hand observations do not bypass that input policy

### Requirement: Managed apps show enabled hand input by default

Managed SDK apps, including newly created projects, SHALL attach standard hand visuals and enable the shared hand interaction pipeline without author-written hand attachment code. Visibility SHALL follow received hand data. An explicit SDK visual opt-out SHALL remain available without disabling interaction.

#### Scenario: Fresh Unsorted project
- **WHEN** Hand is enabled in a freshly created project and the selected fake provider delivers binary hand frames
- **THEN** its launch config selects that provider and the managed app shows SDK hands in its scene without manual attachment code

#### Scenario: Author hides the standard visual
- **WHEN** a managed app explicitly disables the standard hand visual
- **THEN** hand data and interaction remain available without attaching that visual

### Requirement: Development and replay sources are providers

Synthetic and replay sources SHALL be labelled sources in Hands rather than application input kinds or silent fallbacks. Existing replay recordings and configuration SHALL remain readable. A historical calibrated input name SHALL normalize to Hand, not an invented built-in provider.

#### Scenario: Synthetic source explicitly selected
- **WHEN** the user selects an installed synthetic source in Hands and launches logical Hand
- **THEN** only that source runs, labelled as synthetic

#### Scenario: Replay lacks a recording
- **WHEN** an installed replay source has no required recording configured
- **THEN** Hands reports configuration-required rather than running or substituting another source

### Requirement: Canonical wrist-relative hand adjustment

Each accepted provider frame SHALL receive geometry adjustment exactly once after provider panel conversion and before shared filtering, gestures, interaction, pointer and drawing. For each hand wrist w and point p, the result SHALL be w + s*(p-w) + offsetMm/1000. Identity defaults SHALL leave frames bit-identical. Provider rig correction SHALL NOT be repeated or changed.

#### Scenario: Scale before translation
- **WHEN** a hand with wrist [0.1,0.2,0.3] and fingertip [0.2,0.4,0.6] uses size 0.5 and offset [10,-20,30] mm
- **THEN** the wrist becomes [0.11,0.18,0.33] and fingertip becomes [0.16,0.28,0.48] metres within arithmetic precision, without origin-relative scaling or a second transform

#### Scenario: Two wrists
- **WHEN** two hands have different wrist positions
- **THEN** each scales about its own wrist and receives the same panel-space translation

#### Scenario: Identity native and WebXR
- **WHEN** native or WebXR frames enter with zero offsets and size one
- **THEN** coordinates, optional fields, flags, scores, capabilities, IDs and timestamps remain bit-identical and existing gesture traces are unchanged

### Requirement: Coherent optional provider geometry

Present native pinch positions, grab position and palm origin SHALL use the same wrist-relative transform as joints. Palm direction vectors SHALL remain unchanged. Unsupported optional geometry SHALL remain absent or retain its unsupported representation. Native gesture flags, confidence, IDs, timestamps and capability masks SHALL remain unchanged; derived gestures SHALL use adjusted geometry with existing thresholds and native-gesture policy.

#### Scenario: Full native geometry
- **WHEN** a capable provider supplies pinch positions, a grab position, palm origin and orientation vectors
- **THEN** positions transform once with their hand's original wrist while orientation vectors and native pinch/grab flags remain unchanged

#### Scenario: Skeleton-only source
- **WHEN** a source lacks native gesture and palm capabilities
- **THEN** no optional capability is invented and existing derivation operates on adjusted joints

### Requirement: Appearance cannot change interaction

Global appearance SHALL govern the standard SDK skeleton and its existing pinch-or-grab indicator only after geometry processing. Joint/bone visibility, thickness, colour, opacity and indicator settings SHALL NOT alter interaction coordinates, collision radii, gesture decisions or pointer events. The indicator SHALL remain at the thumb/index midpoint on pinch OR grab. Default drawing SHALL be unchanged.

#### Scenario: Appearance during held interaction
- **WHEN** only appearance changes while a hand holds a control
- **THEN** materials, visibility and visual diameters update without moving interaction points, resetting filters or cancelling that hold

#### Scenario: Grab indicator
- **WHEN** grabbing is true, pinching is false and the indicator is enabled
- **THEN** it appears at the existing thumb/index midpoint, not at a newly chosen native grab marker

#### Scenario: Visual opt-out
- **WHEN** an app uses createXrbApp with handVisual false
- **THEN** geometry adjustment still governs its hand input and interaction but the standard visual remains unattached

#### Scenario: Custom app drawing
- **WHEN** an app authors its own canvas, mesh or diagnostic visual
- **THEN** global appearance does not claim to restyle that drawing, and absent global overrides preserve explicit SDK constructor styles

### Requirement: Portable profile on every managed launch and build

Managed native/dev/browser apps and trusted Launcher destinations SHALL receive a validated versioned adjustment snapshot without app code or workspace-path discovery. Packages and publications SHALL freeze their build-time snapshot and require no panel at runtime. Managed Hand-off SHALL remain off. Existing bundles without the new SDK SHALL NOT be claimed to support adjustments without rebuilding.

#### Scenario: Built and dev launch
- **WHEN** a Hand-enabled app launches through either native or browser built/dev flow
- **THEN** its SDK uses the same saved adjustment snapshot and no raw-frame interaction occurs before initial profile readiness

#### Scenario: Native Launcher destination
- **WHEN** an active managed native host navigates through trusted Launcher links, nested links or resume
- **THEN** the destination retains that host's active adjustment snapshot and acquisition policy without resolving a second source or weakening URL trust

#### Scenario: Frozen package and publication
- **WHEN** desktop, headset or published browser output is built and workspace adjustments later change
- **THEN** that output retains its build-time profile offline, without local paths, live control credentials or a dependency on the author's panel

### Requirement: Ordered safe running profile Apply

A running managed app SHALL accept only validated full profile messages bound to its current run and a newer ordered revision. Geometry changes SHALL atomically release held interactions and pointer presses, clear old hand state and reset filters before new frames use the new transform. Appearance-only changes SHALL update drawing without those resets. Stale, duplicate, malformed, out-of-order or retired-run messages SHALL NOT change active state.

#### Scenario: Geometry Apply while holding
- **WHEN** the current run accepts a newer geometry profile while holding a control or pointer press
- **THEN** the hold is released without a synthetic click, filters and previous geometry are cleared, and subsequent provider frames use only the new transform

#### Scenario: Appearance-only and equivalent profile
- **WHEN** a newer profile changes only appearance or is geometrically equivalent
- **THEN** interaction continues without cancellation or filter reset

#### Scenario: Reordered and retired messages
- **WHEN** an older sequence, duplicate, wrong-run or invalid profile arrives after a valid Apply
- **THEN** it is ignored without reverting geometry, changing appearance or cancelling interaction

#### Scenario: Reconnect and disposal
- **WHEN** an active app reconnects or a disposed run's delayed message arrives
- **THEN** reconnect restores the newest current-run profile before hand use and disposed-run messages have no effect

### Requirement: Optional mesh leaves hand input unchanged
A selected mesh post-processor SHALL consume only a copy of the final processed skeleton and SHALL NOT change source data, native signals, filtering, gestures or interaction. Mesh availability SHALL NOT gate hand input or app launch. Existing provider ABI and wire layouts SHALL remain unchanged.

#### Scenario: Any selected skeleton provider
- **WHEN** the same canonical poses arrive from different selected providers
- **THEN** optional mesh processing uses the same final-pose contract without a provider-specific branch

#### Scenario: Mesh fails during a grab
- **WHEN** a mesh processor crashes or becomes late during an active grab
- **THEN** skeleton interaction continues unchanged, without releasing or restarting the grab because of mesh failure

### Requirement: Final sampled observation provenance
Final sampled hands SHALL expose optional copied per-joint acquisition confidence, observation support and age for geometry consumers. Scores SHALL retain provider meaning; unsupported or unknown evidence SHALL not become confident through smoothing or prediction. Age SHALL refer to the requested sample time on the mapped capture clock. Adding metadata SHALL not change coordinates, validity, gestures, native flags, filtering or provider ABI/wire layouts.

#### Scenario: Same input with optional geometry enabled
- **WHEN** the same partial-confidence hand sequence is processed with None, healthy, preparing or failed mesh processing
- **THEN** final coordinates, gestures, pointer events and held interactions remain identical, while capable mesh consumers can inspect aligned observation evidence

#### Scenario: Unsupported joint and prediction
- **WHEN** a previously supported joint now has zero confidence while other joints keep the hand valid
- **THEN** the current score/support identifies that lack of observation and the last supported observation ages rather than resetting to the prediction time

#### Scenario: Identity retirement
- **WHEN** a hand or consumer epoch is retired and its numeric hand ID is later reused
- **THEN** prior joint-support history is not assigned to the replacement hand

#### Scenario: Existing custom Hand producer
- **WHEN** older application code creates a Hand without the optional metadata
- **THEN** it remains source-compatible and existing interaction works, while new consumers identify observation evidence as unknown rather than fabricated
