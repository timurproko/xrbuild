## Why

The project workspace, Plugins, Settings and the tracking diagnostic use similar three-column screens but duplicate their own page insets and column gaps. Their inconsistent geometry makes the surrounding chrome and content columns visibly drift. The project card also needs faster package version bump actions and a clearer Run/Build workflow.

## What Changes

- Introduce shared developer-tool workspace layout tokens and use them in the Control Panel, Plugins, Settings and tracking diagnostic, preserving responsive behavior.
- Reshape the selected-project card around Develop and Build surfaces that use the same full-width, underlined tab treatment as Log and Jobs; keep Browser preview choices in Develop, package-target tabs in Build, and publication in its own WebXR block; place JSON/folder actions with the title and show a published URL inside the publication block.
- Add Patch, Minor and Major package-version actions to the version field context menu.
- Prevent scrollbar width shifts, keep the launcher catalog complete for panel previews, derive every new package title from its app name, and give windowed native and browser previews one matching larger centered launch size.

## Capabilities

### New Capabilities

- `package-version-actions`: context-menu SemVer increments for a pending package version.

### Modified Capabilities

- `dev-control-panel`: standardize developer-tool workspace geometry, simplify project/action presentation, and make windowed preview geometry consistent across Desktop and WebXR.

## Impact

- Shared control-panel design-system layout tokens and product page layouts.
- Control-panel project UI, preview-browser launch behavior, and native host window defaults.
- The tracked workspace tracking diagnostic stylesheet, following its plugin instructions.
- Focused control-panel UI, browser-launch and host argument tests.
