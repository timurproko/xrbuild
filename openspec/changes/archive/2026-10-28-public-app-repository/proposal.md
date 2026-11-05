# Public app repository

## Why

The private repository currently stores apps twice: source projects under the tracked `.xrbuild/projects/` workspace
on `main`, and published static builds on its `apps` branch. The production publisher is configured to push that
branch in the same private repository, while `xrbuild.dev` points at the hosting service. The domain currently returns
a Pages 404 because the private repository is not an active public site. App source and public deployment state need
a repository boundary of their own.

## What Changes

- Use the public `xrbuild.dev` repository, whose `main` branch contains approved app/project source and app-workspace metadata plus publisher-owned static output under `docs/`.
- Let the panel use an explicit project repository root, separate from the selected private integration workspace.
  Projects, their layout and their package workspace come from the public app checkout; plugins, pinned integration
  dependencies, package output and machine state remain in the private workspace.
- Point the production publisher at the public repository's `main` branch and `docs/` Pages subtree. It changes only that subtree, preserves unrelated routes, the publication inventory, the root association document and the custom-domain file, and verifies the public origin after every publish or rollback.
- Export the current app source as a reviewed fresh snapshot rather than publishing the private repository's history.
  Remove tracked projects and app importers from the private repository after the public checkout is proven.
- Migrate the currently published site state to the public repository before moving `xrbuild.dev`, then delete the old
  publication branch only after the new origin serves the same inventory and routes.

## Capabilities

### Modified Capabilities

- `workspace-location`: a project repository can be selected independently from the private integration workspace.
- `dev-control-panel`: project discovery, layout, project creation and app dependency installation use the selected
  project repository root.
- `web-publication`: the production site is an explicitly separate public repository and Pages subtree.

## Impact

- `packages/control-panel`: path resolution, project/layout operations, app package installation, server startup and
  tests gain a distinct project repository root.
- Launchers and commands: repository-development startup can select both the private integration workspace and the
  public app checkout without storing a machine-specific path in tracked files.
- `.xrbuild/`: tracked project source and app lockfile importers leave this private repository; plugins, publisher
  configuration, pinned dependencies and package tooling remain private.
- The production publisher configuration targets the new public repository's `main` branch and `/docs` Pages path; its tests cover an empty target, migrated state and source/deployment subtree separation.
- A one-time export/cutover tool or documented script prepares source and site snapshots, scans them for credentials
  and private material, and verifies routes before the old branch is removed.
- External setup: the maintainer creates the public repository, configures branch rules and Pages, verifies the domain
  and performs the final DNS/custom-domain cutover.
