# Publish public apps from the control panel

## Why

The production site now deploys through a trusted public workflow, but the local control panel cannot start it. The maintainer wants the control panel's Publish and Unpublish controls to be the interface, with the workflow acting as the deployment API, even without a local public-app checkout.

## What Changes

- Add a remote-publication view in the local panel for approved apps committed to the public repository. These entries are explicitly remote and read-only for editing, building and running; the launcher and unrelated local projects cannot silently become publication targets.
- Dispatch the existing trusted public workflow from a panel publication job using the maintainer's local operating-system-backed service login. Poll the correlated workflow run and report verified deployment or failure in the panel; retain the public workflow's build, site ownership, rollback and deployment checks.
- Keep browser requests loopback-only and same-origin, require explicit confirmation for Unpublish, and never send a private key, repository token, local build or uncommitted source through the browser or publish from local `docs/`.
- Preserve the public Actions UI as a recovery path. Do not change the Pages source or existing live routes during planning.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: display and manage approved remotely sourced public apps without a project checkout, with truthful queued, running, failed and verified states.
- `web-publication`: allow authenticated panel dispatch of the authoritative public workflow while retaining its trust boundary, route ownership and recovery guarantees.

## Impact

- Private core: neutral remote-project publication surface and job/status handling; no hosting-specific credentials or repo names in core.
- Private workspace: production publisher adapter can list approved remote apps and call the public workflow API, without a local publication write; plugin-specific configuration remains private.
- Public app repository: a reviewed, optional dispatch correlation input and tests for workflow run identification; current Actions UI remains usable.
- Maintainer: an authenticated local service CLI login is required on the machine running the panel; no local app clone or new private-core secret is required. A stale panel process must be restarted after the implementation is merged.
