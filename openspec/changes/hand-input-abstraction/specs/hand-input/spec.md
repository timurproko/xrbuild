# Spec Delta

## Purpose

Makes Hand a logical application input backed by one globally selected skeleton source, with explicit availability and simple normalization of historical input names.

## ADDED Requirements

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

Hands SHALL store one global source choice in the selected workspace, never per application. With no choice, exactly one installed enabled real source compatible with the execution context SHALL be the initial default; zero or several SHALL require a choice. Discovery SHALL NOT create state. Changes SHALL apply on next launch, not hot-switch running acquisition.

#### Scenario: Two logical-Hand applications
- **WHEN** the user saves a different source in Hands
- **THEN** both applications use that source on their next launch and an existing running application retains its launch source

#### Scenario: Unique real source initially
- **WHEN** no choice exists and exactly one real source is installed and enabled in the execution context
- **THEN** Hands shows it selected and the first launch pins it before starting

#### Scenario: Zero or multiple real sources initially
- **WHEN** no choice exists and zero or several real sources qualify
- **THEN** Hand requires an explicit choice and synthetic or replay sources are not automatically selected

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

### Requirement: Development and replay sources are providers

Synthetic and replay sources SHALL be labelled sources in Hands rather than application input kinds or silent fallbacks. Existing replay recordings and configuration SHALL remain readable. A historical calibrated input name SHALL normalize to Hand, not an invented built-in provider.

#### Scenario: Synthetic source explicitly selected
- **WHEN** the user selects an installed synthetic source in Hands and launches logical Hand
- **THEN** only that source runs, labelled as synthetic

#### Scenario: Replay lacks a recording
- **WHEN** an installed replay source has no required recording configured
- **THEN** Hands reports configuration-required rather than running or substituting another source
