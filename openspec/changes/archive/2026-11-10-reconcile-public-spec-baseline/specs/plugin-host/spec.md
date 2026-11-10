## MODIFIED Requirements

### Requirement: Core runs without plugins
The generic host, SDK and control panel SHALL build, start and run an app without optional plugins, private workspace access or device-specific SDKs/runtimes; only the browser engine and standard core toolchain SHALL be required. Generic engine sources SHALL contain no plugin-specific branches, SDK includes or protocol implementation. The public repository MAY contain separately built, reviewed embedded plugins reached through the same neutral contracts as user plugins. Embedded-module membership SHALL NOT make optional integration dependencies mandatory for the generic core-only build.

#### Scenario: Clean core build
- **WHEN** the generic core is built on a machine with the browser engine and core toolchain but no optional plugin or device software
- **THEN** the build succeeds and the host runs an app with the built-in desktop display and none input provider

#### Scenario: No plugin code in the core
- **WHEN** generic engine sources are inspected for concrete plugin SDK includes, plugin library names or plugin-specific protocol branches
- **THEN** none is found and any reviewed embedded implementation lives in a separately built plugin module

#### Scenario: Reviewed embedded plugin
- **WHEN** a public module is built under the embedded workspace
- **THEN** it integrates through the existing plugin ABI or applicable neutral service contract without embedding its implementation into the host or requiring private workspace contents

## ADDED Requirements

### Requirement: Managed tool navigation recovery
A managed tool document invalidated by source or route changes SHALL enter non-modal automatic recovery rather than offer a retry that cannot clear invalidation. Recovery SHALL refuse embedded-frame activation, use only a currently registered same-panel tool route, verify the panel instance and repository/workspace identity, wait for idle runs/jobs/preparation, and bound automatic restart attempts. It SHALL NOT force active work to stop, install dependencies implicitly, bypass source-containment checks, or redirect into a different workspace. Unrelated preference refreshes SHALL NOT invalidate unchanged tool implementations. Panel shutdown SHALL stop accepting connections before draining its owned event streams and tools.

#### Scenario: Changed tool recovers safely
- **WHEN** a selected managed tool requires restart and its owning panel is idle
- **THEN** navigation performs at most one automatic restart within the recovery window and resumes the current registered route only after the replacement instance matches the original repository and workspace

#### Scenario: Busy or mismatched panel
- **WHEN** work is active or another panel identity occupies the origin during recovery
- **THEN** recovery does not force restart or follow an untrusted destination and presents bounded non-modal status with a route back to Apps

#### Scenario: Unchanged tool survives preferences refresh
- **WHEN** unrelated plugin preferences change without changing a tool declaration or executed module code
- **THEN** the existing tool remains usable rather than entering a permanent restart-required state
