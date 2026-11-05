# Design: panel restart hint

## D1. What counts as panel code

The scan covers what the server process imported and cannot reload:

- the core's `packages/control-panel/src` and `packages/app-icon/src` (imported by the server);
- each workspace packager and publisher folder the panel loaded at start (the `dir` recorded by discovery), skipping
  `node_modules`, `bin`, `build`, `dist`, `test` and dot folders.

Only what a restart reloads counts: module files (`.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`), `package.json` (the
plugin declaration) and anything under a `config` folder. A plugin may keep runtime state next to its code (the panel's
own test publishers do); such a file changing must not ask for a restart.

`packages/control-panel/ui` is served from disk per request, so a page reload already picks up its changes; it is
not scanned. Plugins added after start are not counted either: they are loaded only by a restart, which the chip
would not hint at, and that is an accepted gap.

## D2. Changed since start

The process records its start time before loading packagers and publishers. A file is a change when its modification
time is later than that start time. A pull or checkout writes new modification times, so a merged change is seen.
The newest such file is reported by its path relative to the core or workspace.

## D3. Endpoint and refresh

`GET /api/panel` returns `{ pid, startedMs, outdated, newestSource }`. The scan is a directory walk of a few hundred
files, cached for a few seconds so several open pages do not repeat it. The UI reads it with the host's existing
30-second refresh and when the page regains focus.

## D4. Presentation

Same pattern as the host: a warn chip in the top bar ("restart available", tooltip
"<file> changed after the control panel started: restart to load it") shown only when outdated, and the existing
dot class on the Restart control panel menu item. The dot style becomes a shared menu-dot class used by both items.
Restart is unchanged: the new process starts after every change, so both disappear after the page reloads.
