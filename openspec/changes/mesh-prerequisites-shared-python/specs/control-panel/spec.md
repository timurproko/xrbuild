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
