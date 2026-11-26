# hands-module Specification

## Purpose

Provides a stable Hands configuration surface centred on the selected skeleton source, independently of optional synthetic or acquisition diagnostics.

## Requirements

### Requirement: Core-owned Hands surface

Hands SHALL remain accessible independently of optional input/diagnostic plugins. Its primary surface SHALL configure the globally selected skeleton source rather than identify itself with synthetic data. The former Hands route alias SHALL lead to that surface, while optional acquisition diagnostics remain clearly separate.

#### Scenario: Diagnostic plugin absent
- **WHEN** the user opens Hands without the optional diagnostic plugin or compiled viewer
- **THEN** the provider configuration surface still opens, including an empty-source state if necessary

#### Scenario: Diagnostic installed
- **WHEN** the optional acquisition diagnostic is installed
- **THEN** it is offered separately and its synthetic view is not presented as the selected real source's live hand

### Requirement: Minimal provider picker with availability

Hands SHALL show a provider picker, selected source identity, source purpose, availability/reason and explicit Save. It SHALL distinguish installation from running/device status and retain a missing saved source. It SHALL identify source changes as next-launch changes and SHALL NOT claim a live preview in this delivery.

#### Scenario: Saved source unavailable
- **WHEN** the chosen provider is disabled, missing or failed
- **THEN** Hands identifies that provider and its problem without selecting a replacement

#### Scenario: Installed but not started
- **WHEN** a source is installed and enabled but no run has checked its device
- **THEN** Hands says it is not started and does not claim that hardware is connected or running

### Requirement: Passive navigation and safe preference writes

Opening Hands or listing providers SHALL NOT start capture, inference, a tracking runtime, an XR session or an installation. Preference writes SHALL require the current revision and preserve unrelated state. Invalid or unsafe saved state SHALL produce an actionable error without reset or overwrite.

#### Scenario: Open Hands
- **WHEN** the user navigates to Hands
- **THEN** no camera permission request, native capture, runtime startup or settings-file creation occurs

#### Scenario: Conflicting edit
- **WHEN** a stale editor saves a source after another writer changed the profile
- **THEN** the save fails with a conflict and the newer selection is preserved

#### Scenario: Malformed state
- **WHEN** saved Hands state is malformed or linked outside the owned state boundary
- **THEN** Hands reports the problem without creating replacement defaults
