# Spec Delta

## ADDED Requirements

### Requirement: Layer card prerequisite state

While a selected mesh plugin needs setup, or its saved settings need an optional runtime that is not installed, the layer card SHALL show a Prerequisite state from its first render, including while a layer choice saves. Only Install, and the setting that asks for the optional runtime, SHALL stay active; Retry SHALL be hidden.

#### Scenario: Missing runtime
- **WHEN** the selected plugin's runtime is not installed
- **THEN** the card shows Prerequisite and Install, and its settings, colour and on switch are disabled

#### Scenario: Optional runtime for a setting
- **WHEN** a setting selects an optional runtime that is not installed
- **THEN** the card shows Prerequisite and Install, and that setting stays editable so the person can switch back

### Requirement: Stale runtime is a setup step

Discovery SHALL compare a prepared runtime's receipt with the current plugin source and report a mismatch as needing setup with a plain reason, never as Ready. When the runtime is installed and the plugin's setup can re-check it, Install SHALL re-bind it to the current source without downloading.

#### Scenario: Plugin updated after setup
- **WHEN** a plugin's source changes after its runtime was prepared
- **THEN** the layer shows Prerequisite, and Install re-checks the installed files and writes a new receipt without downloading or asking for files again

### Requirement: Local files for setup

A setup plan SHALL be able to name one local file the person must choose, by label and file types. The Install dialog SHALL ask for it with a design-system button and show the chosen name, keep Install disabled until it is chosen, copy it to a private folder of the user's profile for that install only, pass its path to the installer and delete the copy when the install ends.

#### Scenario: Licensed archive
- **WHEN** a setup needs a licensed archive that cannot be downloaded
- **THEN** the person chooses it in the Install dialog, no command is needed, and no copy remains after the install
