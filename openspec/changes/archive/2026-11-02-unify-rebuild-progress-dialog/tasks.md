# Tasks

- [x] Add one shared rebuild-progress component that owns the complete dialog structure, status rendering, bounded log, footer and persisted Autoclose behavior; verify component tests cover running, success, failure and automatic close.
- [x] Move Control Panel and Plugins Manager host rebuilds to the shared component while keeping package/setup progress separate; verify host rebuild job updates and View job behavior remain functional.
- [x] Move registered-tool rebuild polling to the same component and provide the same completed actions without leaving the active route during the rebuild; verify navigation regressions contain no reduced rebuild-dialog implementation.
- [x] Run focused and full Control Panel tests, strict OpenSpec validation and the name guard; manually verify matching rebuild dialogs from Control Panel, Plugins Manager and a registered tool.
