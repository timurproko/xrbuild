## Context

Baseline is core main `5b49b29`, merged PR #15 with its archived/synchronized shared-layout contracts.

`navigationItems()` in `packages/control-panel/ui/navigation.js` renders Restart before Rebuild. `ui/index.html` instead places `host-chip` before `panel-chip`; the hand diagnostic's `index.html` repeats that order. Shared status helpers mutate badge state/text but do not currently relate their ordering to navigation.

## 1. Shared maintenance-label order

Treat the shared menu's maintenance model as the source of ordering. Reuse a single ordered definition/helper for menu entries and corresponding header labels. Default markup also follows Restart then Rebuild before script initialization. Use neutral maintenance metadata on badge nodes or equivalent shared bindings, retaining existing stable IDs and handlers. Reorder existing nodes when necessary; do not recreate stateful elements or use CSS-only visual order that diverges from DOM/accessibility order.

Apply this to the common Apps/Plugins/Settings header and the approved embedded hand header. Headers without maintenance labels remain unchanged; this is not a request to add new labels to Design or unrelated tools. Keep user-configured tool navigation ordering and the existing menu separator intact. No plugin-name branch belongs in generic core code.

## 2. State and refresh safeguards

Badge availability, captions, semantic colours, tooltip/focus behavior and corresponding menu dots/actions are unchanged. Both visible labels follow the menu; one visible label retains its ordinary placement; no labels means no placeholder or reserved empty slot. Status refreshes and navigation rerenders must not restore a different order or invoke maintenance. Preserve the running process's mode and all workspace/runtime preferences.

Focused unit/source tests tie header order to shared menu order, and browser checks compare DOM/pixel order across both/single/none states and view/status transitions. Check the hand header through its public fixture/build lane as needed, without requiring native compilation, device capture, model assets or private workspace provisioning. Run strict public TypeScript, name guard and strict change validation. Native/device checks are out of scope.

## Delivery

Two ordered task groups map to the PR Implementation outcomes. Implement code/tests and tick/push each outcome before starting the next. This plan requires draft publication and maintainer approval before implementation; historical plans/spec archives and personal preview backups are not changed.
