# Publish public apps without a local checkout

## Why

The public app repository owns project source and the website, but the production publisher still builds from a local project checkout through the private control panel. The maintainer wants to publish from GitHub without cloning the public repository locally. Switching GitHub Pages to Actions without a build, inventory-preservation and rollback workflow would break the existing publisher and potentially replace the live site.

## What Changes

- Add a maintainer-triggered workflow in the public app repository that builds an approved app from public `main`, deploys the complete site via GitHub Pages Actions and verifies the HTTPS route before reporting success. GitHub's Actions UI, not the local control panel, becomes the no-clone publication interface.
- Obtain the private core's SDK source through narrowly scoped, short-lived read-only credentials; never copy raw core source, plugins, dependency binaries or credentials into the public repository or Pages artifact. App bundles necessarily include compiled SDK runtime code, as the existing site already does.
- Preserve the current `docs/` website tree, publication IDs and slugs, inventory, associations, root files and unrelated routes. Serialize operations, reject unsafe output and collisions, and retain or restore the last-known-good site on failure.
- Cut over only after a rehearsal and verification, then switch the public Pages setting from branch deployment to GitHub Actions. Keep existing local publication available until the new workflow is proven; document the new supported workflow and how to roll back the hosting setting.

## Capabilities

### Modified Capabilities

- `web-publication`: support a manually dispatched, verified Actions deployment in addition to the existing local publisher, with an explicit safe cutover and one authoritative writer at a time.

## Impact

- Public app repository: workflow, publication script, tests and deployment documentation on a reviewed feature branch/PR; existing `main:docs/` is the input and continuity baseline, not an empty replacement.
- Private core: production publisher readiness/status and documentation must reflect the Actions hosting mode; disable or explicitly coordinate local writes after cutover so it cannot race the workflow.
- Maintainer GitHub setup: provide private-core read-only GitHub App access to a trusted workflow and configure Pages Actions only after an end-to-end test. The secret is stored as an Actions secret, never in Git, and is never available to pull-request jobs.
- No local public-app clone is required for publication through the GitHub Actions UI. Local project editing and local control-panel operations still require a checkout.
