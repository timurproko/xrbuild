# Proposal

## Why

Update can finish successfully while the running core stays on old code: the implementation from pull request 45 explicitly leaves core read-only and only fetches the workspace's configured upstream. A removed upstream or stale local remote reference therefore cannot satisfy the person's expectation that both repositories reach their remote default branch.

## What Changes

- Update both the running core checkout and the selected independent workspace, using fresh discovery and fetch of each origin's default branch rather than cached upstream state.
- Refuse unsafe repositories with one actionable sentence, continue updating the other repository, and fail the overall job when either repository needs attention.
- **BREAKING**: refuse all uncommitted changes and local-only commits, including non-conflicting edits and local-ahead branches previously accepted; never stash, reset, force or create merge commits.
- For a removed or non-default upstream, leave the checkout unchanged and explain how to switch safely to the advertised default branch; do not silently migrate branches.
- Report per-repository before/after commits, fresh-check results, post-pull setup/build results and the explicit requirement to restart the panel to load new code.
- Preserve workspace LFS download, native rebuild and resumable post-pull failures; prepare changed public core dependencies through the existing frozen, hook-disabled installer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-panel`: replace workspace-only update and read-only core reporting with safe two-repository default-branch updates, independent failures and honest completion/restart reporting.

## Impact

- `packages/control-panel/src/update.ts`, `panel.ts`, `update-cli.ts`, job result handling and shared update dialog/menu presentation.
- Existing public core dependency setup in `tools/panel-bootstrap/runtime.mjs` and native rebuild integration; no new global/native-tool installation or private package enrollment.
- Local bare-repository regression tests in the control-panel suite, plus HTTP/job/dialog coverage and owner-facing Update documentation.
- No operations against real user checkouts; implementation reproduction uses disposable repositories only.
