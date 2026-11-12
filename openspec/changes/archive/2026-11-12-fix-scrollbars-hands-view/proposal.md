## Why

An unnecessary, sometimes inert scrollbar appears in Jobs and remains visible while switching panel views. Design places its scroll surface inside padded preview framing, producing a different right-edge inset from Apps. Hands can also replace its entire viewer with a Retry page when an optional bridge import cannot resolve `ws`.

## What Changes

- Show shared overlay scrollbars only for genuinely visible, usable overflow; remove stale bars during hidden/pending views, tab switches and document lifecycle transitions.
- Retain real Jobs-list and expanded-output scrolling with pointer, wheel and keyboard operation, without duplicate or inert overlay targets.
- Align Design Main with the shared Apps scrollbar geometry and no-gutter behavior, retaining isolated workflow frames where required.
- Open the normal Hands viewer independently of optional capture-service startup; keep service errors and required setup inline instead of replacing the page with the centered Retry card.
- Preserve explicit public dependency setup, checked source-bound output, restart requirements and capture/model/recording consent. Navigation must not install dependencies, execute private packages or start a device.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `dev-control-panel`: visible-only functional scrollbars, Apps/Design parity and direct managed-view availability.
- `bundled-extensions`: optional hand-service failure must not prevent the current checked generated diagnostic UI from opening.

## Impact

Shared control-panel scrollbar lifecycle/geometry, Activity/UI navigation and Design gallery framing, managed-tool page/runtime boundaries, and the approved embedded hand diagnostic's optional bridge loading. Focused browser and isolated public tests. No private workspace clone or edits, hardware activation, implicit installation, old-source fallback or running-panel restart is authorized.
