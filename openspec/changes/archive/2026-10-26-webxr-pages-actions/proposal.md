# Proposal

## Why

WebXR builds can be previewed and packaged locally, but the panel has no provider-neutral way to publish a selected
build at a stable public route. Hosting logic and credentials belong in a workspace plugin, while the public core should
only define the contract and user experience.

## What Changes

- Add a publisher plugin contract, discovery and validation alongside the existing packager contract. A publisher
  exposes its origin, route rules, status, Publish and Unpublish operations.
- Add opt-in publication settings and Publish/Unpublish controls to the Build card for WebXR projects only, while
  keeping web Build, browser Run, platform selection and package creation independent.
- Give each opted-in project a stable publication identity and validated slug. Project or folder renames do not
  silently move a published route.
- Record successful web builds and refuse publication after the build output or relevant project settings change.
- Pass only the built entry snapshot and neutral publication metadata to the selected workspace publisher. The core
  stores no hosting credentials and contains no hosting-provider branch or API implementation.
- Define the external publisher behavior needed for complete-tree updates, route ownership, package associations,
  rollback and status. The approved concrete publisher uses an `apps` content branch and one canonical app path.
- Document the separate private publisher and headset-packager migration plus explicit live cutover and legacy-site
  retirement gates. The core PR does not change live hosting or delete repositories or branches.

## Capabilities

### New Capabilities

- `web-publication`: publisher plugin contract, publication identity, route ownership, build snapshot input, status and
  isolation requirements.

### Modified Capabilities

- `dev-control-panel`: WebXR Build-card publication configuration, actions, confirmations and status.

## Impact

- `packages/control-panel`: publisher contract/discovery, project manifest validation, persisted build receipts,
  publication jobs and HTTP routes, Build-card UI and focused tests.
- Workspace publisher plugins: a new neutral contract for local publication. The concrete plugin and credentials stay
  outside the public core.
- Documentation: publisher authoring contract and a cutover/rollback/retirement runbook.
- External dependency: a separately approved private-workspace change must implement the `apps` content-branch
  publisher and decouple package creation from publication.
