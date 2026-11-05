## Why

Publication jobs are visible in Activity with semantic queued, running and done colors, but affected projects keep showing the static published badge in the sidebar. During an Unpublish queue this is especially misleading: the project says published without showing that removal is queued or running. The two regions should present the same publication state language and motion.

## What Changes

- Replace a project's publication badge with `queued` while its publication job waits and `running` while it executes.
- Reuse the Activity job badge tones: queued yellow, running blue with the shared animated dot, and published green.
- Restore the correct published badge or no badge immediately when Publish or Unpublish completes or fails, without waiting for remote status polling.
- Restore queued/running sidebar badges when the page reloads with active publication jobs.
- Add UI regression coverage for state priority, shared styling, event refresh and completion behavior.

## Capabilities

- `dev-control-panel`: The project sidebar mirrors active publication job state using the same semantic badges as Activity.

## Impact

- Control Panel project-list rendering and product-specific badge overrides.
- Publication job event refresh behavior and UI tests.
- No publisher, queue execution or production publication behavior changes.
