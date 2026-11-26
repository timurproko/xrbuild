# Proposal

## Why

Module changes currently hide useful UI behind startup work, and ordinary settings saves move the primary action. Remote updates and maintenance failures also need the same compact, actionable feedback already used elsewhere in the panel.

## What Changes

- Measure module navigation before and after, then remove the measured blank-page bottleneck so the header and page frame paint without waiting for slow data or fonts.
- Check core and workspace origin default-branch tips at startup and every five minutes while idle, using read-only remote queries without fetching or pulling; expose an actionable update-available header label and menu dot.
- Save app settings silently without shifting Run; show only short, non-displacing failure feedback.
- Reuse the Jobs log-copy control at the log box's top right in shared maintenance progress dialogs, including running and failed states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-panel`: Responsive module shells, passive remote-update indication, stable background saves and shared maintenance log copying.

## Impact

Panel UI boot/navigation, shared maintenance components, server-side read-only update discovery and focused tests. No new UI framework or visual language; no changes to automatic pull policy or Update's safety checks. Work starts from the current default branch, keeps the dialog patch small beside PR 56, and incorporates main if that PR merges before implementation handoff. Browser validation uses isolated task-owned state and saves evidence outside the checkout.
