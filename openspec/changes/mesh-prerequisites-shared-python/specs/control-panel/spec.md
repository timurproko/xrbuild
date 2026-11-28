# Spec Delta

## ADDED Requirements

### Requirement: Native rebuild builds host plugins only

Native Rebuild and its freshness check SHALL build and require a host plugin DLL only for plugins that load into the host. A plugin that declares a hand mesh SHALL be left out of the native plan; its programs are prepared by its own setup.

#### Scenario: Hand-mesh plugin with a CMake project
- **WHEN** Rebuild runs while a selected hand-mesh plugin has a CMakeLists.txt that builds a standalone program
- **THEN** Rebuild neither builds it nor fails for a missing host plugin DLL, and freshness does not report it as outdated

### Requirement: Core-provisioned plugin Python

A plugin SHALL be able to declare an exact Python version and hash-locked wheels, with optional named wheel sets that may use their own https index. Core SHALL provision them with one pinned package manager verified by size and SHA-256, install only the declared wheels by hash without dependency resolution or source builds, and never use a Python or package manager already on the machine or change PATH or the registry. Core SHALL offer a reusable environment under the user's `~/.xrbuild/python` and a placement inside a plugin's own runtime folder. Downloads that are still needed SHALL join the plugin's install plan and consent.

#### Scenario: Setup-time environment
- **WHEN** a plugin's install plan asks for its Python environment and it is not ready
- **THEN** the plan lists the package manager, interpreter and wheels, Install prepares the environment before the plugin's installer and passes it the interpreter, and a ready environment is reused without downloads

#### Scenario: Runtime-folder placement
- **WHEN** a plugin's install plan asks for Python inside its runtime folder
- **THEN** the exact interpreter is copied there with a path file pointing only at its own library and the runtime's site-packages, the chosen wheel set is installed there as plain files, and the plugin's receipt covers them

#### Scenario: Invalid declaration
- **WHEN** a manifest declares a version range, a wheel without a SHA-256, a duplicate wheel, an unknown field or a non-https index
- **THEN** the plugin manifest is rejected and nothing is downloaded

### Requirement: Plugin switches lock until confirmed

Every plugin or post-processing layer on/off switch SHALL use one shared behaviour: a click moves the switch to the requested side, locks it and shows the requested state at once; repaints from older data SHALL NOT move it back; it SHALL unlock when the page confirms the requested state, or return to the confirmed side and unlock with a reported reason when the change fails.

#### Scenario: Turning a layer off
- **WHEN** the person turns a post-processing layer off
- **THEN** the switch shows off and is locked, the badge reads Off immediately, and the switch unlocks after the saved state is off, without showing on in between

#### Scenario: Change refused
- **WHEN** saving the change fails
- **THEN** the switch returns to its previous side, unlocks, and a notice names the reason

### Requirement: Settings save errors are toasts

A project settings save that fails or conflicts with another editor SHALL be reported as one error toast naming the reason with a single action (Retry for a failed write, Reload for a conflict), and SHALL NOT add an inline status beside Run. The toast SHALL close when a later save succeeds.

#### Scenario: Save refused
- **WHEN** a settings change cannot be saved
- **THEN** an error toast says Not saved with the reason and offers Retry, Run does not move, and no inline status row appears
