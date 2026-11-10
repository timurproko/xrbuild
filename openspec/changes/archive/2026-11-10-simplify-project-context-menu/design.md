## Scope and decisions

Remove the cache menu markup, openProjectCache dialog, its event dispatch and browser-only state/rendering that become unused. Preserve the cache-maintenance backend and its API tests; no existing cache files are deleted. Replace the browser test of that removed modal with coverage that it and its entry point are absent, retaining cleanup safety coverage through APIs.

Compute Delete visibility from embedded origin or active running state on every menu open. Do not leave an embedded-only disabled state or tooltip on the shared button, so switching to an ordinary idle project restores its normal Delete action. Archive and Unarchive remain available under their existing rules. Keep server-side embedded deletion refusal and its explanatory response.

Update the focused design-system assertions and browser workflow tests for embedded Projects and Archive, ordinary idle projects, running projects, and transitions between these contexts. Do not change shared menu geometry or other actions.

## Ownership and prerequisites

Core-only work in the linked fix/project-context-menu worktree; no private clone is needed. The canonical dev-control-panel spec already includes the unified embedded workflow at baseline b8bb0d0. This change does not finalize or alter older active changes. Implementation starts only after plan approval; commit/push require maintainer authorization.

## CI repair: contended preference lock

The finalized snapshot's Node CI exposed an existing Windows race in `updatePluginPrefs`: canonicalizing the lock-file leaf before exclusive creation can fail with EPERM when another writer unlinks it. Preserve the writable preference/parent checks and acquire the lock with exclusive creation, which refuses every existing leaf without following or modifying it. Do not broadly ignore filesystem permission errors or change canonical path safety. Add a deterministic lock-leaf regression and retain foreign/link protection and independent-writer coverage. This repairs existing serialization behavior without changing its contract or the approved UI scope. Keep the bot's finalization commit and canonical specs intact.

## Validation

Run focused design-system, embedded-project workflow and cache-maintenance tests, with browser coverage when the documented browser fixture is available; report skips honestly. Run strict TypeScript, name guard and strict change validation. Manually inspect menus on embedded and ordinary projects and verify no cache modal is offered.
