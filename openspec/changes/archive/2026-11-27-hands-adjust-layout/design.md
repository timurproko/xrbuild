# Design

## Context

See proposal.md for motivation. The root-scoped adjustment editor already owns revision-safe drafts, commits, retries, section resets and disposal. Only Size currently has a slider, and its pairing logic is hard-coded to sizeFactor. The number helper supplies existing HTML validation bounds/steps, shared steppers commit their clicks, and range input/change separate drafts from finished values. The shared design system supplies `iconSvg('settings')`, borderless `xrb-icon-button`, `openFloating` and menu styling; navigation supplies `menuKeyboard`.

The default right sidebar is 340 pixels wide; responsive layouts also expose narrower content. Live-session work is parallel and must not be changed.

## Goals / Non-Goals

**Goals:** Generalize control pairing without changing the save state machine. Keep all layout and menu lifetime scoped to each mounted editor, including reparenting/disposal and multiple instances.

**Non-Goals:** Changes to session, lease, provider, profile schema, bounds, step sizes, API endpoints, SDK delivery, viewport controls or shared component appearance. No tracking startup or hardware is needed for evidence.

## Decisions

### Reuse full existing numeric limits

Render every numeric field through one number-and-range row, using the same min/max/step for both controls:

| Fields | Min | Max | Step |
| --- | --- | --- | --- |
| X, Y, Z (mm) | -150 | 150 | 1 |
| Size | .5 | 1.5 | .01 |
| Joint diameter (mm) | 1 | 40 | 1 |
| Bone diameter (mm) | 1 | 30 | 1 |
| Skeleton opacity | 0 | 1 | .001 |
| Indicator diameter (mm) | 1 | 60 | 1 |
| Indicator opacity | 0 | 1 | .01 |

These finite validation ranges are already sensible slider ranges; a narrower convenience range would add unnecessary mismatch. Generalize existing Size pairing by field key for input, refresh and reset. A range draft updates its canonical number before validation/commit, and valid number drafts update the matching range. Keep invalid number text local rather than letting browser range clamping overwrite it. Retain input/change/Enter event semantics and existing serialized field-merge behavior rather than adding an alternate save path.

### Stack rows and constrain only layout

Replace the XYZ multi-field grid with one full-width row per setting. Inside each labelled field use a compact number/stepper column and `minmax(0, 1fr)` slider column. Place each colour swatch in a small trailing slot beside its diameter row, retaining accessible colour names and exact linear-colour handling. Use shared spacing tokens and minimum-width rules; do not copy shared control visuals. A vertical slider-below-input fallback is rejected because it defeats the requested consistent row pattern.

### Root-owned gear menus using shared primitives

Give each section heading a shared borderless settings icon trigger, with a section-specific accessible name, `aria-haspopup="menu"`, `aria-controls` and `aria-expanded`. Use unique mount-prefixed IDs. Each menu contains one button with `role="menuitem"` and the existing section reset key, leaving the reset algorithm intact. Open through shared floating positioning with focus on the item; share keyboard navigation/Escape behavior. Close on selection, outside pointer interaction, Escape or focus leaving; Escape returns focus to the trigger. Allow only one menu per editor at a time. Register and remove document listeners and any portalled menu nodes in the editor lifecycle. A custom control style or native select would diverge from the requested Apps header style.

## Risks / Trade-offs

- Shared steppers wrap number inputs after render → lay out the wrapper, not a bare-input-only selector, and exercise stepper commits.
- Browser ranges clamp invalid/out-of-step values → retain number validation as authoritative and never replace invalid drafts from range state.
- Floating menus can clip inside the scrollable sidebar or leak listeners → use shared bounded floating placement and verify mount, reparent, outside-click and disposal behavior.
- Broad tests would overlap parallel live fixes → run adjustment-only tests and isolated browser checks; leave integration CI to the final pushed revision.
- Before/after pictures require a real baseline → capture the unchanged editor in disposable isolated storage before code edits, then the new editor in light/dark at normal and narrow widths; attach evidence without changing real user state.

## Migration Plan

No data migration or dependency change. Reverting only the UI and layout changes restores the previous layout without altering saved profiles. Implementation remains gated on plan approval.
