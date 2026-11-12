## ADDED Requirements

### Requirement: Publisher configuration state

A publisher MAY report `configured: false` with a bounded configuration problem. Such a publisher SHALL remain
discoverable, SHALL refuse Publish, Unpublish and release operations, and its origin SHALL NOT be presented as a
destination. Publishers that omit the field SHALL be treated as configured. A publisher whose destination requires
explicit user configuration SHALL report itself unconfigured until that configuration is complete and valid.

#### Scenario: Explicit destination missing
- **WHEN** a publisher's destination configuration is absent or incomplete
- **THEN** it reports `configured: false` with the missing requirement and every publication operation is refused

#### Scenario: Destination configured
- **WHEN** the configuration becomes complete and valid and services refresh
- **THEN** the publisher reports itself configured and shows its real origin
