## MODIFIED Requirements

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

#### Scenario: Device runtime fails after explicit Connect
- **WHEN** native device enumeration or startup fails after the user requests Connect or Start
- **THEN** the page identifies the runtime or device failure without misreporting it as a missing calibration plugin
- **AND** unavailable capture does not disable supported stored-result operations
