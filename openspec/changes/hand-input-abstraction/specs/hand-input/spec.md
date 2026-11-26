# Spec Delta

## Purpose

Makes Hand a logical application input backed by one globally selected skeleton source, with explicit availability and compatible legacy launches.

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

Hands SHALL store one explicit source choice in the selected integration workspace for all logical-Hand applications, including applications from separate project repositories. There SHALL be no new per-application source setting. Discovery SHALL NOT choose a source or create state. Selection changes SHALL apply to subsequent launches, not hot-switch running acquisition.

#### Scenario: Two logical-Hand applications
- **WHEN** the user saves a different source in Hands
- **THEN** both applications use that source on their next launch and an existing running application retains its launch source

#### Scenario: No saved selection
- **WHEN** several or only one source is installed but no source has been saved
- **THEN** Hands remains unselected and a logical-Hand launch asks for an explicit selection

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

### Requirement: Preserve legacy source behaviour until adoption

Legacy concrete input selections and aliases SHALL retain their provider configuration and gesture behaviour until explicit adoption of global Hand. Reads, launches and unrelated saves SHALL NOT implicitly migrate inputs. Adopting multiple distinct legacy sources SHALL require explicit consolidation to one global source; until then the legacy concrete launch path SHALL remain supported.

#### Scenario: Application saved before upgrade
- **WHEN** an old application's input names a concrete provider and the global choice names another
- **THEN** the old application still launches its original provider with unchanged effective settings and native pinch/grab behaviour, with a legacy-source notice

#### Scenario: Explicit adoption
- **WHEN** the user explicitly saves the input as global Hand after acknowledging any source change
- **THEN** only the approved saved input scope is migrated and provider configuration is retained

#### Scenario: Old provider missing
- **WHEN** an old concrete selection no longer resolves
- **THEN** it remains an unavailable legacy selection without falling back or rewriting the file

#### Scenario: Multiple distinct old sources
- **WHEN** a legacy application names two distinct skeleton sources
- **THEN** its original concrete launch path and files are retained and explicit adoption requires consolidating sources

### Requirement: Preserve published signals and shared processing

Native and WebXR hand delivery SHALL enter the shared processing pipeline without changing existing ABI/wire structures or default processing behaviour. Native optional gesture/palm fields and capabilities SHALL remain available. Version-two logical input policy SHALL prevent WebXR injecting hands when Hand is off or assigned to native. Unversioned legacy browser input behaviour SHALL remain supported.

#### Scenario: Native gesture compatibility
- **WHEN** a provider publishes native pinch, grab and palm capabilities
- **THEN** those signals reach the existing SDK processing with unchanged native-pinch/native-grab policy and no extra filtering

#### Scenario: Managed Hand disabled
- **WHEN** an application explicitly using version-two input semantics without Hand enters an XR session
- **THEN** WebXR hand observations do not bypass that input policy

#### Scenario: Unversioned browser application
- **WHEN** an existing unversioned WebXR application enters a session after upgrade
- **THEN** its automatic WebXR hands remain unchanged until explicit input-policy adoption

### Requirement: Development and replay sources are providers

Synthetic and replay sources SHALL be labelled sources in Hands rather than application input kinds or silent fallbacks. Existing replay recordings and configuration SHALL remain readable. A historical calibrated source name SHALL resolve only to its actual installed owner, never to an invented built-in substitute.

#### Scenario: Synthetic source explicitly selected
- **WHEN** the user selects an installed synthetic source in Hands and launches logical Hand
- **THEN** only that source runs, labelled as synthetic

#### Scenario: Replay lacks a recording
- **WHEN** an installed replay source has no required recording configured
- **THEN** Hands reports configuration-required rather than running or substituting another source
