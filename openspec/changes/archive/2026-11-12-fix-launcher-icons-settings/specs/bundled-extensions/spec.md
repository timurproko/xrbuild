## ADDED Requirements

### Requirement: Retire duplicate embedded starter without removing templates

The product catalog SHALL omit the former embedded Test app at `embedded/projects/unsorted/test` and its package registration. The canonical `templates/app` and normal New project workflow SHALL remain available, including generated 3D icon/theme inputs and required notices. Retiring installed content SHALL NOT delete ordinary user projects, independent copies, retained working sources, settings or recordings.

#### Scenario: Fresh installed catalog

- **WHEN** the panel discovers the installed embedded workspace
- **THEN** the retired duplicate Test app is absent while the remaining seven shipped projects retain their existing core/archive placement and identities

#### Scenario: Frozen package graph

- **WHEN** the revised embedded workspace is installed or tested in a managed writable snapshot
- **THEN** its six remaining packages resolve with the matching frozen lockfile and there is no importer for the retired app

#### Scenario: User creates a project

- **WHEN** the user confirms New project with a valid new name
- **THEN** the canonical template generates that editable app normally, including its generated 3D icon, colour/theme inputs and required font notice, without relying on any embedded Test source

#### Scenario: Existing personal projects and state

- **WHEN** the product update no longer ships the former embedded starter
- **THEN** ordinary projects and independent copies named Test or otherwise remain discoverable, and existing user-owned embedded working state remains preserved without automatic cleanup
