# Proposal

## Why

Publication state changes and validation are currently harder to understand than the equivalent project-creation flow: deployment rows change too subtly, invalid fields use inconsistent red-filled controls and error typography, and an empty app slug is rejected even when the intended destination is the publisher's `/apps/` root.

## What Changes

- Animate the complete publication result block when Publish makes it appear or Unpublish removes it.
- Move field validation presentation into the shared component layer so inputs and dropdowns retain their normal surface/focus treatment while helper text uses the standard description typography in the error color.
- Accept an empty app slug as the publisher root route and publish it at `https://xrbuild.dev/apps/`.
- Preserve child app routes when publishing, republishing or unpublishing the root route by tracking and changing only root-owned files.

## Capabilities

- `dev-control-panel`: shared fields present errors consistently, publication state changes are visibly revealed, and an empty publication slug selects the publisher route-prefix root.

## Impact

- Shared design-system fields and Control Panel validation rendering.
- Publication identity/URL validation and focused server/UI tests.
- Private production publisher root-route ownership, verification, rollback and tests.
- No changes to credentials, domain, branch deployment or unrelated project routes.
