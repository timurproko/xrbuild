# Design

## One rebuild component

A dedicated framework-neutral rebuild-progress component will own the dialog DOM, status icons, title and message rendering, bounded output, footer layout, Autoclose persistence and running/completed/failed transitions. It will use the shared `xrb-*` dialog and control styles and the shared icon library.

Control Panel, Plugins Manager and registered-tool navigation will all create and update that component instead of keeping static panel markup beside a reduced navigation-created dialog. Host rebuild orchestration may continue to use the panel's live job state or the navigation helper's bounded polling, but both paths will pass the same job model into the same renderer.

The panel's package build and package setup progress are separate operations and may retain their existing generic job dialog; they will no longer be the source of the host rebuild presentation.

## Consistent actions

The component will always reserve and render the same footer. Autoclose will use one persisted preference on every route and will close only after a successful rebuild. Failure remains visible. The completed dialog will expose the same View job and Close actions; when the active route has no embedded activity view, View job will open the Control Panel job view for that rebuild rather than dropping the action.

## Verification

Focused tests will require one rebuild-dialog template and renderer, imports from both panel and shared navigation, identical controls and state transitions, persisted Autoclose behavior and removal of duplicate host-rebuild markup. Manual acceptance will start Rebuild from Control Panel, Plugins Manager and a registered tool and compare the running, successful and failed presentation.
