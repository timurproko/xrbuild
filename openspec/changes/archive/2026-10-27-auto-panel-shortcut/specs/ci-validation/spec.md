## ADDED Requirements

### Requirement: OpenSpec length advice does not block validation
The OpenSpec CLI pinned for CI and finalization SHALL report requirement text over 500 characters as informational rather than failing strict validation solely on length. CI and finalization SHALL retain strict validation for other warnings and errors.

#### Scenario: Long requirement
- **WHEN** a change adds a valid requirement with more than 500 characters in its body
- **THEN** finalization syncs it into the canonical spec and strict OpenSpec validation succeeds

#### Scenario: Invalid requirement
- **WHEN** a change adds a requirement without a scenario
- **THEN** strict OpenSpec validation fails and the finalizer does not commit the archive
