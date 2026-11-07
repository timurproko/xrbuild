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
