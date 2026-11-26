# camera-calibration Specification

## Purpose

Provide independent two-depth-camera spatial measurement and portable, identity-bound results for hand providers without performing hand inference or fusion.

## Requirements

### Requirement: Independent module and concise purpose

The panel SHALL expose Calibration in its shared module menu beside Apps, Hands and Settings and serve `/calibration/` independently of optional plugins. The page SHALL reuse existing panel components and visual language with minimal text, omit the transform description in all states, and use the standard loading indication rather than a plugin-checking sentence. Start SHALL align with Method's control baseline and height.

#### Scenario: Module opened
- **WHEN** Calibration is selected from any shared module menu
- **THEN** `/calibration/` opens with Calibration selected and no transform-description line
- **AND** no removed laboratory, inference or fusion view appears

#### Scenario: Loading and loaded controls
- **WHEN** calibration availability or its browser module is still loading
- **THEN** the page displays the existing panel loading indication without the plugin-checking sentence or a blank body
- **AND** once loaded, Start and the enhanced Method dropdown share the same baseline and height

### Requirement: Passive discovery and honest availability

Navigation SHALL NOT start cameras, native services, installation or inference, or create user state. Missing plugins, stale service dependencies, missing/stale/invalid native bridge output, and device-runtime or camera failures SHALL have concise distinct notices with the applicable recovery action. Recoverable component staleness SHALL offer existing Rebuild; optional device dependencies SHALL remain explicit. Supported stored-result operations SHALL remain enabled without capture.

#### Scenario: Missing prerequisite
- **WHEN** the plugin is absent, its bridge is missing or stale, or fewer than two depth cameras are available
- **THEN** the page identifies that reason without fallback or an automatic setup action
- **AND** it offers an applicable recovery action or concise operator instruction without suggesting Rebuild provisions optional device dependencies

#### Scenario: Passive open
- **WHEN** the page loads or reads saved results
- **THEN** no capture starts and preferences, profiles and projects remain unchanged

#### Scenario: Stale application components
- **WHEN** an installed application component snapshot is stale or has a retryable failed preparation
- **THEN** Calibration identifies the component preparation problem and offers the existing explicit Rebuild flow
- **AND** successful preparation makes the current contribution available, or identifies an actual restart requirement

#### Scenario: Previously built bridge after source update
- **WHEN** a source update invalidates a previously built bridge and the reviewed device dependency is present
- **THEN** normal explicit Rebuild rebuilds and stages the bridge for current source without a separate manual build step or device capture
- **AND** a genuinely missing device dependency instead produces one sentence naming what is missing, without downloading it

#### Scenario: Device runtime fails after explicit Connect
- **WHEN** native device enumeration or startup fails after the user requests Connect or Start
- **THEN** the page identifies the runtime or device failure without misreporting it as a missing calibration plugin
- **AND** unavailable capture does not disable supported stored-result operations

### Requirement: Explicit owned measurement lifecycle

Capture SHALL require explicit selection of two different camera serials and supported exact profiles and explicit Start. Calibration SHALL acquire exclusive capture ownership without stopping another owner, authenticate native transport and validate packets and source bindings. Stop, cancellation, disconnect and disposal SHALL release both owned streams and fence late data/results; partial starts SHALL roll back.

#### Scenario: Start races Stop or fails on one camera
- **WHEN** Stop occurs during Start or one camera cannot start
- **THEN** both owned streams are stopped and no late result is adopted

#### Scenario: Device busy or changed
- **WHEN** another session owns capture or a running stream changes serial/profile
- **THEN** capture fails visibly without takeover, fallback or acceptance of changed-source data

### Requirement: Manual static-target workflow

The page SHALL provide live camera previews, explicit surface probes, matching target IDs with fit/check roles, removal/clear, fixed-rig confirmation and reference evidence. Fitting SHALL retain proper rigid B-to-A estimation, at least six fit pairs and three held-out pairs, calibrated depth sampling, source hashes and existing metric/reprojection gates. Incomplete or failed evidence SHALL remain visibly provisional with no identity fallback.

#### Scenario: Complete static measurement
- **WHEN** matching static probes from both cameras meet fit, held-out and evidence requirements
- **THEN** the page displays the fitted transform, fit/check residuals and qualification without applying it to any provider

#### Scenario: Bad or stale probes
- **WHEN** probes are stale, invalid, unmatched, degenerate or have failing held-out residuals
- **THEN** fitting refuses them or labels the result provisional and explains why

### Requirement: Marker workflow without hand inference

The page SHALL provide the retained two-preview marker workflow with progress, rejection reasons, cancellation and qualified result review. It SHALL retain native marker observations, depth-supported geometry, identity/profile checks, paired-frame and held-out qualification policy without loading hand models or starting fusion.

#### Scenario: Sufficient marker evidence
- **WHEN** accepted marker observations satisfy the existing paired-frame, duration, repeatability and residual gates
- **THEN** the page presents the qualified spatial result for explicit Save or Export, still marked physically unverified

#### Scenario: Insufficient evidence or cancellation
- **WHEN** marker observations fail qualification or the user cancels
- **THEN** no qualified result is silently persisted or applied and owned capture stops on cancellation

### Requirement: Compatible explicit result storage

Save, Import and Export SHALL retain existing validated scalar formats and the workspace preferences path and calibration key without migration or deletion. Qualified results SHALL save only on explicit action; provisional results SHALL be exportable but not saved as qualified. Writes SHALL preserve unrelated preferences and reject stale revisions or unsafe/malformed files without reset.

#### Scenario: Existing inventory or export
- **WHEN** an existing supported scalar file, saved inventory or supported setup wrapper is opened
- **THEN** its validated result remains readable with unchanged identity and units and can be exported without capture

#### Scenario: Failed save or invalid import
- **WHEN** preferences conflict, storage is malformed/unsafe or an imported result fails integrity validation
- **THEN** the error is visible and existing stored data is preserved without reporting success

### Requirement: Stable provider output contract

Documentation SHALL define `xrbuild-spatial-calibration` v1, B-to-A optical metres, matrix order, units, serial/profile/calibration hashes, evidence, limits and validity checks. Consumers SHALL reject changed bindings or rigs and independently qualify timing and physical accuracy. `physicalValidation: operator-required`, `temporalAlignment: null` and `fusionEnabled: false` SHALL NOT imply provider activation or synchronization approval.

#### Scenario: Future provider reads a result
- **WHEN** a provider follows the published contract
- **THEN** it can validate the unchanged file without depending on page internals and cannot treat spatial qualification as timing or physical acceptance
