# Design

## Platform parity

Platform tabs are controlled by the ordinary project manifest contract: app projects receive platform selection;
test projects are run-only diagnostics. The Hand Tracking sample is an interactive browser app with build and dev
scripts, so its plugin-owned manifest will use `kind: app`. Import continues to preserve the declared manifest rather
than adding sample-specific rewrite logic.

## Empty-section cleanup

An empty section created deliberately remains valid. A section is automatically removed only when it held one or
more projects immediately before an archive, delete or layout move and has none afterward. Cleanup removes the saved
section entry and its folder when the folder is empty or contains only `.gitkeep`. Unsorted and archive are never
normal named sections.

Layout reads include a named folder when it has a live project or a saved section entry. This hides orphan empty
folders left by interrupted or externally constrained cleanup without hiding a deliberately created empty section.

## Archive package isolation

Workspace package globs include live projects but explicitly exclude `projects/archive/**`. Archiving therefore does
not introduce a new lockfile importer or prevent panel startup. A project's existing installation moves with its
folder, while unarchive returns it to the live package graph.
