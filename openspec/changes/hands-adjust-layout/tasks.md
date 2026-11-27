# Tasks

## 1. Paired numeric adjustment rows preserve validation and finished-edit autosave in the narrow sidebar

- [ ] 1.1 Capture the unchanged adjustment UI in an isolated disposable preview in light/dark at normal and narrow widths; retain baseline pictures in the task evidence folder before editing product code.
- [ ] 1.2 Render all nine labelled number-left/slider-right rows and trailing diameter colour swatches using shared controls and local layout rules; assert paired controls, existing bounds/steps, alignment and no horizontal overflow at 340- and 320-pixel sidebar widths.
- [ ] 1.3 Generalize Size-only synchronization to every numeric key while preserving draft/commit/reset/refresh behavior; adjustment browser tests cover both directions, invalid values, stepper commits, Enter/change deduplication, slider release and exact untouched colours.
- [ ] 1.4 Run only adjustment-focused tests, capture numeric-row pictures in both themes and widths, and retain results with this outcome before committing it.

## 2. Accessible gear menus reset only their own adjustment section and leave viewport Reset unchanged

- [ ] 2.1 Replace heading reset text buttons with shared settings icons and single-item floating menus; browser assertions cover accessible names, popup/expanded state, Enter/Space opening, focused menu items and section-only reset behavior.
- [ ] 2.2 Add Escape/outside-click/focus-leave dismissal and scoped cleanup; browser tests exercise focus restoration, mount isolation, reparenting, disposal and preservation of unfinished edits in the other section.
- [ ] 2.3 Run the adjustment-only regression checks and capture final light/dark normal/narrow pictures with the menus visible where useful; attach before/after proof and record that viewport Reset and session/provider files are unchanged.

## Workflow follow-up

- Keep the draft plan unimplemented until approval; no product edits are part of the planning handoff.
- Publish each implemented outcome and tick it as it lands after approval; keep all implementation within the adjustment UI, its styles and tests.
- Dispatch CI on the final branch head if draft CI skips relevant checks, report immediately without polling, and stop every disposable server/browser instance before handoff.
