## 1. Remove stale/inert shared scrollbar overlays

- [ ] 1.1 Correct shared region visibility and document/region lifecycle handling without changing native overflow; verify CSS-hidden/pending views, closed output, removed regions and retired documents have no visible or interactive stale bars.
- [ ] 1.2 Add Jobs/tab/navigation browser regressions and preserve needed list/output scrolling; verify Jobs/Log and Apps/Plugins/Settings switches, live updates/filter/clear, short lists and expanded output target real scrollable regions using wheel/track/thumb/keyboard input with no gutters and native forced-colors fallback.

## 2. Align Apps and Design scrollbar behavior

- [ ] 2.1 Remove unnecessary Design Main scroll-viewport framing and consume shared scrollbar geometry while retaining intentional component padding and isolated workflow bounds; verify matching viewport-edge/inset behavior on Apps and Design without copied scrollbar CSS or controllers.
- [ ] 2.2 Add Main/case/nested/resize browser regressions; verify parity across wide/narrow and light/dark layouts, filtering and content-fit states, while Design workflow actions stay mocked and navigation origin metadata remains correct.

## 3. Open Hands independently of optional capture services

- [ ] 3.1 Separate current checked viewer serving from optional bridge import/startup through neutral contracts and lazy authenticated service endpoints; verify missing `ws` or optional native support does not replace the generated viewer with a centered Retry page or start capture on navigation.
- [ ] 3.2 Keep genuine browser-build/service prerequisites and unresolved failures inline in the normal shared view/shell with explicit setup/recovery, preserving checked runtime selection, restart and request safeguards; verify no implicit package install/download/build, private-package execution, old-source fallback or consent bypass.
- [ ] 3.3 Add focused managed-tool/hand/browser tests and perform final checks; verify current-view/no-wall behavior, rejected origins/mutations, failure/recovery and cleanup pass along with applicable isolated frozen hand/type tests, core strict TypeScript, name guard and strict OpenSpec change validation, reporting device/manual gaps separately.
