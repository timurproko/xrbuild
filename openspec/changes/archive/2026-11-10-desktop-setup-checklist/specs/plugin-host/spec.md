## ADDED Requirements

### Requirement: User-owned core native dependencies
Explicit desktop setup MAY fetch the core's pinned native dependencies into fresh user-owned generations. A source-bound receipt SHALL activate a generation only after successful integrity and tree validation. Managed host/plugin builds SHALL consume the selected validated core dependency root without product writes. Explicit developer builds SHALL retain their ordinary dependency-root default. Failed, unsafe or foreign state SHALL NOT silently fall back or authorize replacement/cleanup.

#### Scenario: Download native libraries
- **WHEN** the user explicitly installs missing core native libraries
- **THEN** archive/file hashes are verified against the existing lock, writes stay in a fresh checked user generation and no product dependencies or pins are modified

#### Scenario: Checked dependency generation
- **WHEN** a managed native rebuild follows successful setup
- **THEN** its CMake inputs use the validated user-cached dependency root while host outputs retain their existing immutable-runtime ownership

#### Scenario: Failed or changed dependency state
- **WHEN** download integrity fails or a dependency receipt/tree becomes unsafe or foreign
- **THEN** the generation is not activated, existing data is preserved and the problem is reported without automatic destructive repair
