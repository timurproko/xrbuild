# Design: panel-initiated public workflow

## Source of truth and presentation

The public repository's reviewed default branch owns app source, manifest identities and the complete `docs/` tree. The panel offers a distinct **Public apps** remote list (not local workspace projects) with only the workflow's approved app choices. The production publisher adapter loads the committed manifests and inventory, verifies stable publication IDs, slugs and route ownership, and exposes remote status. Remote cards offer Publish/Unpublish and a public source/deployment link, not local Build, Run, manifest edits or packaging. A selected local Launcher or stale local app cannot dispatch an operation. Missing, conflicting or unapproved metadata disables the action with a reason.

A neutral, optional remote-publication capability in the panel's publisher contract supplies a catalog, the supported operations, and a job callback. Hosting-specific repository, workflow and authentication details stay in the private workspace plugin. Preserve existing local publisher interfaces for other plugins. Keep the panel loopback and same-origin HTTP protections on all new endpoints.

## Dispatch, authentication and correlation

The local server invokes the maintainer's existing OS-backed `gh` login; no token or private App key is stored in the workspace, exposed in a browser response, or logged. Check the authenticated user's repository/workflow access before dispatch. The server, not the browser, generates a unique non-secret request identifier; validate an allowlisted project key and operation before making the fixed-ref workflow-dispatch API request. The public workflow accepts an optional bounded identifier in its run name, leaving manual Actions UI runs unchanged. Its existing main-only gate, read-only private-core checkout, complete-site deployment and verification remain authoritative.

Workflow dispatch may return no run ID. Poll the public workflow's runs for an exact identifier and repository/ref, then track the run ID through completion. Record only the run ID and sanitized status in the panel job. Do not treat dispatch acknowledgement or a public inventory entry as proof of this operation's success. On success, refresh remote inventory and deployed route, and link to the run; on cancellation, timeout, authorization error, unexpected run or verification/rollback failure, report a safe error and retain a diagnostic link where available. After a panel restart, remote inventory and workflow state are re-read, never inferred from previous local intent. Serialize the panel's duplicate requests, and let the public workflow continue to serialize publication decisions.

## Safety and compatibility

Unpublish requires the panel's own confirmation and the workflow's confirmation input. Only the two approved public apps can be submitted; the root launcher, arbitrary paths, local manifests and local build output cannot be sent. The plugin refuses local git pushes in Actions mode. The browser gets no workflow token; the public workflow never receives an arbitrary app path/ref or a local artifact. No new Pages settings, credential scopes, domain or publication IDs are needed. If the CLI login is absent or unauthorized, show a Setup/login explanation instead of a misleading Publisher unavailable or a failed local push. The Actions UI remains an independent fallback.

## Verification

Use fake service API responses and disposable panel/plugin fixtures for dispatch validation, correlation, duplicate prevention, authentication failure, job transitions, restart, missing metadata, unpublish confirmation and unsuccessful deployment. Public workflow tests check optional correlation input without opening a path/ref injection. Run focused panel and plugin tests plus full Node tests, name guard and OpenSpec validation before handoff. The real public workflow may be rehearsed only after its public PR is reviewed; do not change production Pages or dispatch a production publication as part of tests.
