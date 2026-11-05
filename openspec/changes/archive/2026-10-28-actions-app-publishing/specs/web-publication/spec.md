## ADDED Requirements

### Requirement: No-checkout Actions publication
The public app repository SHALL offer a trusted maintainer-triggered workflow for publishing or explicitly unpublishing an approved project without a local project checkout. It SHALL derive route ownership and identity from committed project metadata, build using a reviewed private core source with short-lived read-only access, and upload only the complete approved public site to Pages. Raw private core sources, private plugins, credentials and unreviewed pull-request code SHALL NOT enter the public deployment artifact or receive the private checkout credential; compiled SDK runtime code inside approved app bundles is expected.

#### Scenario: Publish an approved project
- **WHEN** a maintainer dispatches Publish for an allowlisted app on the public default branch
- **THEN** the workflow builds its committed source, updates its owned route and inventory and verifies the deployed HTTPS route without requiring a local clone

#### Scenario: Reject unsafe or untrusted input
- **WHEN** a requested project is unknown, its identity collides, its output is unsafe or the ref is not trusted
- **THEN** the workflow refuses to publish without exposing credentials or changing the site

#### Scenario: Preserve unrelated site state
- **WHEN** one approved app is published or explicitly unpublished
- **THEN** the root page, custom-domain file, association document, inventory and all unrelated routes remain valid; only the selected route and its owned metadata may change

#### Scenario: Deployment or verification fails
- **WHEN** Pages deployment or public verification fails after a site update
- **THEN** the workflow restores and verifies the last-known-good complete site or reports clearly that restoration could not be verified

### Requirement: Safe transition to Actions hosting
A migration from branch-based Pages to Actions Pages SHALL require maintainer approval and verification before local publication is disabled. Once Actions is the authoritative writer, local production Publish and Unpublish SHALL refuse rather than racing it; status SHALL remain readable.

#### Scenario: Before cutover
- **WHEN** the public repository still serves `main:/docs` as a branch-based site
- **THEN** the existing publisher remains the sole production writer and an unapproved workflow cannot replace the live site

#### Scenario: After verified cutover
- **WHEN** Pages serves a verified workflow deployment with the existing routes, inventory, associations and HTTPS origin intact
- **THEN** future publication uses the public Actions workflow and local production writes are refused

#### Scenario: Cutover rollback
- **WHEN** the first Actions deployment fails to verify
- **THEN** the maintainer can restore branch deployment from the unchanged `main:/docs` tree without removing the custom domain

## MODIFIED Requirements

### Requirement: Dedicated publication repository
A production publisher SHALL target an explicitly configured public publication repository, branch and Pages subtree that are independent from the private core repository. Before mutating production state it SHALL verify that the intended public repository is served from the configured branch and subtree at the configured HTTPS origin. With branch-based deployment, Publish and Unpublish SHALL modify only the configured deployment subtree and SHALL NOT modify project source outside it. After Actions cutover, local production Publish and Unpublish SHALL refuse and direct the user to the public workflow.

#### Scenario: Public deployment target
- **WHEN** the configured public repository serves `main` from `/docs` at the production origin with HTTPS in branch mode
- **THEN** the local publisher may update only `docs/` and verifies the requested route publicly before reporting success

#### Scenario: Wrong repository, branch or path
- **WHEN** branch hosting serves another repository, branch or path
- **THEN** the local publisher refuses to push and names the expected production target

#### Scenario: Source files preserved
- **WHEN** an app is published or unpublished by either supported writer
- **THEN** project source and package metadata outside `docs/` are unchanged

#### Scenario: Actions mode
- **WHEN** GitHub Pages serves the public repository through Actions
- **THEN** the local publisher reports status without pushing and directs Publish or Unpublish to the trusted Actions workflow
