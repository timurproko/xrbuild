# Proposal

## Why

Ordinary panel use modifies workspace settings and the package lock and creates untracked projects, so rejecting every dirty checkout makes Update unusable even when the workspace already matches its remote. A workspace refusal also incorrectly blocks successful core preparation, while repeated full-hash summaries obscure what actually happened.

## What Changes

- Accept freshly confirmed current repositories regardless of local tracked, staged or untracked changes; permit Git-safe fast-forwards with non-overlapping source edits and name the first few blocking source paths on a real collision.
- Keep workspace plugin/panel settings and user projects exactly local, even when upstream changes those paths; they never block Update. Report skipped upstream defaults and how to inspect/adopt them explicitly. Preserve the panel-generated workspace lock locally rather than silently regenerating it.
- Run each successful repository's independent preparation and builds even if the other repository refuses; defer only work that consumes a refused source and retain precise retry markers.
- Present an overall result title, one compact line per repository and at most one next-action line, reusing the Restart control from pull request 54. Keep full revisions and detailed steps in one job-output record, without replaying the summary through failure wrappers.
- Document panel-written files as normal workspace state, add local-settings ignores to the core workspace template, and provide an exact private-repository tracking-policy handoff. Do not automatically stash, regenerate locks, merge preferences or discard user data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-panel`: Safe local-work-preserving updates, independent follow-up, and concise results with truthful partial success and activation requirements.

## Impact

- `packages/control-panel/src/update.ts`, fresh-process update runtime/build boundaries, job failure output, shared rebuild dialog and focused Update tests.
- `README.md` and `docs/private-workspace.md` must stop describing every dirty file as a refusal.
- Temporary-repository tests cover modified `pnpm-lock.yaml` and `xrb-plugins.json`, plus untracked `projects/.gitkeep` and `projects/Unsorted/`, without inspecting or modifying any person's checkout.
- Pull request 54 was open at planning time. Shared-file implementation waits for it to land, incorporates its service preparation and validated toolchain, and reuses its Restart control. This plan targets the default branch `main` and does not include that PR's implementation.
- No edits to the independent private workspace repository and no live panel operation. Local-wins protection is implemented here without requiring that repository to migrate first; its tracked-settings removal and optional generated-lock/project ignores are separately owned, preservation-first work.
