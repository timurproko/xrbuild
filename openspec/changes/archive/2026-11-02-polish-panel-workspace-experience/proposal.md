## Why

Control Panel restart is intended to be a silent maintenance action, but the current Windows relaunch path can still expose a terminal window. Restart and Rebuild also share the same amber presentation when maintenance is available, making two different actions look equivalent. The auto-routing launcher can fall back to the checkout workspace when the selected user `.xrbuild` directory is missing, bypassing the expected first-run Create your workspace setup. Empty user workspaces currently spend most of the page on redundant project and activity placeholders, while the Plugins Manager shows an unusable Details column when no plugin exists. Fresh panel-created workspaces also have no package lock yet, so their first Hello XR run incorrectly requests a frozen install and fails. Generic failures then place raw process output in a large paragraph with no copy action.

## What Changes

- Make panel-owned Windows restart and launch-script execution remain completely hidden, without spawning or flashing a terminal window.
- Keep Restart as the existing amber maintenance action.
- Present Rebuild with a distinct reddish label, status chip and menu indicator whenever rebuild is available or required.
- Keep the auto launcher on the selected user workspace even when its `.xrbuild` directory is missing or empty, so first run shows Create your workspace; keep repository development on the explicit launcher.
- When an existing user workspace has no projects, immediately open the standard New project dialog with its folder input focused, keep a plain `Projects` heading, `No project yet.` placeholder and `+ New project` in the project sidebar behind it, and leave the project content and activity sidebar empty. Repair stale remembered selections when projects do exist and never restore the retired `No projects yet` detail card.
- When no plugins are installed, keep only `No plugins installed yet.` in the Plugins sidebar and hide the unusable Details heading and selection placeholder.
- Consolidate repeated Control Panel and Hand Tracking visuals and behaviors into the shared design system, using named component variants instead of product-owned copies, inline SVGs, inline presentation styles or duplicate floating-menu behavior.
- Bootstrap and refresh the generated dependency graph for a panel-created user workspace when package manifests change; explicit repositories continue to require frozen installs from their committed current lockfile.
- Present generic failures with a stable generic description plus a bounded shared log surface with a copy-to-clipboard action instead of repeating raw error text as prose.
- Let users drag live projects to the Archive tab and archived projects back to Projects, with a shared primary drop-target state and the moved project retained as the selection.
- Add focused regression coverage for silent invocation, distinct maintenance colors, refresh-time auto routing, empty states, dependency bootstrap, copyable errors and shared-component ownership.
- Keep two to five PR Implementation outcomes as readability guidance while allowing larger completed checklists when the delivered change has more independently useful outcomes.

## Scope

This change does not add confirmation to Restart, remove Rebuild confirmation, automatically run maintenance, change restart/rebuild authorization, alter managed-tool capture behavior, create or remove workspace folders during routing, change explicit repository launch selection, or change the information architecture of non-empty project, plugin or Hand Tracking layouts.

## Capabilities

- `dev-control-panel`: auto routing consistently selects the user workspace and redirects older auto-routed repository pages on refresh, and empty project/plugin views use focused creation and minimal shared empty states.
- `change-delivery`: completed linked drafts require at least two outcome checkboxes, with two to five remaining a recommendation rather than a promotion limit.
