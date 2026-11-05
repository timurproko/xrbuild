## ADDED Requirements

### Requirement: Dedicated publication repository
A production publisher SHALL target an explicitly configured public publication repository, branch and Pages subtree that are independent from the private core repository. Before mutating production state it SHALL verify that the intended public repository is served from the configured branch and subtree at the configured HTTPS origin. Publish and Unpublish SHALL modify only the configured deployment subtree and SHALL NOT modify project source outside it.

#### Scenario: Public deployment target
- **WHEN** the configured public repository serves `main` from `/docs` at the production origin with HTTPS
- **THEN** the publisher may update only `docs/` and verifies the requested route publicly before reporting success

#### Scenario: Wrong repository, branch or path
- **WHEN** hosting serves another repository, branch or path
- **THEN** the publisher refuses to push and names the expected production target

#### Scenario: Source files preserved
- **WHEN** an app is published or unpublished
- **THEN** project source and package metadata outside `docs/` are unchanged

### Requirement: Publication repository cutover
A publication-repository migration SHALL preserve the complete publisher-owned site state, including publication identities, slugs, inventory, root association data, custom-domain file and route bytes. The old deployment branch SHALL remain available until the new origin serves and verifies that state. After cutover, the old repository SHALL no longer hold a publication branch or custom-domain claim.

#### Scenario: Migrate existing routes
- **WHEN** publication state moves to the new public repository's `main:docs/` subtree
- **THEN** the source and destination site-tree digests match before the old private branch is removed

#### Scenario: Cutover verified
- **WHEN** the custom origin serves the migrated inventory, every recorded route and the association document from the new repository
- **THEN** the publisher target can switch and the old deployment branch can be retired

#### Scenario: Cutover fails
- **WHEN** the custom origin does not verify
- **THEN** the old deployment branch remains available and no route is claimed migrated
