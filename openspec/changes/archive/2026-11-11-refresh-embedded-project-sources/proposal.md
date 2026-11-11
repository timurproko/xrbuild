## Why

After an installation update or repository pull, an embedded app can keep running a durable snapshot of older code. The Apps card asks users to review an internal directory and choose Keep my working sources, although ordinary settings changes alone create this snapshot. Keeping that snapshot acknowledges the update without adopting the new sources, so the action contradicts the expectation that pulling and running tests the latest code.

## What Changes

- Refresh outdated embedded working inputs automatically on the next explicit source-consuming action, preserving personal settings, identity, icons and recordings without writing installed sources.
- Record content baselines so unchanged files adopt installed additions, modifications and deletions, while compatible actual source edits survive through a checked three-way update.
- Upgrade older working-state records non-destructively: retain their complete prior generation, prepare current installed sources, and carry validated personal configuration forward. Never guess that an unknown old tree is unedited or delete it.
- Refuse unresolved source conflicts or unsafe state at the attempted action with a short actionable error; never silently continue with old code, overwrite edits, or invalidate an active run.
- Remove the permanent installed-sources warning, internal-directory explanation and Keep my working sources button from the normal Apps card. Retire the acknowledge-without-refresh API rather than keep an alternate stale-code path.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `bundled-extensions`: automatic baseline-aware source refresh, preserved personal state, non-destructive legacy upgrade and coherent output invalidation.
- `dev-control-panel`: normal embedded project controls without the source-baseline banner/button; concise errors only when a requested action cannot safely update.

## Impact

- Embedded working-state preparation, input inventory/baselines, effective manifests and source-consuming panel/build/run paths.
- Normal Apps card and obsolete source-acknowledgement endpoint.
- Public synthetic workflow fixtures, focused UI regression tests and current embedded-workflow documentation.
- No private repository provisioning, native device setup, dependency installation during browsing, export, cleanup or merge authority.
