# Design

## Context

The panel pages (Apps, Plugins, Settings, Cameras) and the Hands page grew their layouts separately: different sidebar styles, spacing, run controls, status wording, presets per tab and reset gears per section.

## Decisions

- **Shared chrome in the design system.** Card sidebars, the resizable sidebar width (`mountSidebarSplitter`, one width shared by Apps, Plugins and Settings), equal top and bottom gaps, the two-column minimum layout, the loading card, the run icon style (`setRunButtonLabel`) and the stats dock live in `design-system.css/js`. Page-specific list items stay in `style.css`.
- **One run control.** Start and Stop are a header icon on Apps and Hands. On Apps it starts the selected app from any tab with the remembered Develop choices (`startProjectRun`). Status chips use plain words without ellipses and appear only once the real state is known.
- **Hands presets as providers.** `hands-presets.js` owns the menu and the browser store; the Transform/Display editor and the Mesh editor each expose `presetValues`, `presetDefaults`, `matchesPreset` and `applyPreset`. Applying goes through each editor's normal commit path, so saving, ordering and delivery stay unchanged. Reset to defaults keeps the chosen Mesh layer.
- **Mesh layer is one choice.** The layer picker is a single-select dropdown because only one hand-mesh layer can run.

## Risks

- Presets are stored in the browser only; per-app presets and a workspace store are planned as a separate change.
- Several UI tests assert on source text and were updated with the new markup and labels.
