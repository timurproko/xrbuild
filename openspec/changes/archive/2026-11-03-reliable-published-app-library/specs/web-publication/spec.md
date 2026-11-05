## MODIFIED Requirements

### Requirement: Stable publication identity
Every configured publication SHALL have a generated stable identity, selected publisher and normalized slug. An empty slug SHALL select the publisher's route-prefix root; every non-empty slug SHALL satisfy the generic and publisher route rules. Project folder, title, platform and package identity changes SHALL NOT silently change its route.

#### Scenario: Project renamed
- **WHEN** a configured project folder or display name changes
- **THEN** its publication identity, publisher and slug remain unchanged

#### Scenario: Publisher root
- **WHEN** a publication uses an empty normalized slug
- **THEN** its canonical route is the publisher's route-prefix root without an extra path segment

#### Scenario: Invalid slug
- **WHEN** a non-empty slug is unnormalized, contains traversal or separators, or violates publisher route rules
- **THEN** configuration is rejected before publication
