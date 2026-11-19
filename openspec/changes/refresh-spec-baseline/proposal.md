## Why

`openspec/specs/` must describe only what the code in this repository does today. It currently also holds delivery-workflow rules owned by a shared workflow outside this repository, finished one-time migration procedures, requirements the code contradicts, and it lacks requirements for behaviour that is implemented.

## What Changes

- Retire the `change-delivery` and `public-history-export` capabilities by removing all of their requirements (`retire_capabilities: true` in this change's metadata lets the archive delete the emptied spec files).
- Reduce `ci-validation` to what this repository's CI workflow and required-check script do.
- Remove one-time migration, governance and process requirements from `web-publication`, `workspace-location` and `bundled-extensions`.
- Correct `web-runtime-sdk` "Return to a launcher" to the SDK-owned return control and `dev-control-panel` to the lowercase `projects/unsorted/` folder.
- Specify implemented behaviour: the Apps cursor preference and single-row Activity header (`dev-control-panel`), cursor styles (`web-runtime-sdk`, `web-host`), segmented re-selection (`hand-ui-controls`), the name guard and the supply of the SDK to apps.
- Fold in the pending `dev-control-panel` "Start without a terminal" requirement from `repair-dev-workspace-startup` unchanged and delete that change.

No code changes. Where a specification and the code disagreed, the specification was changed.

## Capabilities

### New Capabilities

- `name-guard`: the hash-only banned-name check, its commands, hooks, CI job and private-workspace exclusion.
- `app-sdk-supply`: apps get the SDK and UI kit from the core's sources through `XRB_CORE`, never from a registry.

### Modified Capabilities

- `change-delivery`: all requirements removed; capability retired.
- `public-history-export`: all requirements removed; capability retired.
- `ci-validation`: required check, job selection, draft handling and OpenSpec validation rewritten to the implemented behaviour.
- `web-publication`: two one-time transition requirements removed.
- `workspace-location`: three governance requirements removed.
- `bundled-extensions`: one process requirement and one completed-retirement requirement removed.
- `web-runtime-sdk`: return control corrected; cursor style added.
- `web-host`: system cursor visibility added.
- `dev-control-panel`: startup requirement synchronized; unsorted folder corrected; cursor preference and Activity header added.
- `hand-ui-controls`: segmented re-selection added.

## Impact

- Specifications only. `openspec/changes/repair-dev-workspace-startup/` is deleted after folding.
- Purpose paragraphs are outside delta scope and are corrected separately.
- Other active changes that modify requirements removed here (`split-private-workspace`) can no longer apply those deltas.
