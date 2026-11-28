# Proposal

## Why

The panel, Plugins, Settings, Cameras and Hands pages had inconsistent layouts, spacing, labels and status messages, and Hands presets were split per tab. This change makes the pages consistent and gives Hands one preset that stores every look-and-feel value.

## What Changes

- Apps: the run control is a play/stop icon centred in the header with a status chip; the project card starts at its tabs; Publish and Build lock while an app runs; dropdowns say Refreshing while loading; Jobs/Log fit their content; no flash on reload.
- Shared layout: card-style sidebars on Apps, Plugins and Settings with a resizable width, Core/Custom sections, equal top/bottom gaps, sidebar-beside-content as the narrowest layout (horizontal scroll below).
- Plugins: problems as toasts and badge tooltips, issue dots in the list, plugin settings shown below the description, no Details header.
- Settings: block titles inside cards, consistent top spacing, Core/Custom sections.
- Cameras (renamed from Calibration, after Settings in the menu): shared loading card, toast for unavailability, workspace spacing.
- Hands: run icon and status in the header, shared frame-rate meters with short tooltips, Display widget with collapse, Mesh tab (renamed) with a single layer choice, auto-hiding fullscreen controls, and one presets menu for Transform, Display and Mesh.

## Capabilities

### Modified Capabilities

- `control-panel`: header run control and status; settings saves no longer reference an in-card Run.
- `hands-module`: unified presets menu replaces per-tab presets and reset gears; Mesh tab single-choice layer.

## Impact

- `packages/control-panel/ui/`: app.js, index.html, style.css, design-system.css/js, toast.js, navigation.js, calibration.*, hands.*, hands-adjustments.js, hands-postprocessing.js, hands-live-controls.js, hands-shell.js, hands-axis-gizmo.js, new hands-presets.js.
- UI tests updated to the new layout and labels.
