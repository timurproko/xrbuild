# Panel restart hint

## Why

The control panel's Node process loads its server code and the workspace's packager and publisher plugins once, at
start. After a pull or a plugin edit it keeps running the old code with no sign of it: a publisher whose target had
moved kept reporting a live app as unpublished until the panel was restarted by hand. The host already shows when it
is outdated (a chip and a dot on Rebuild host); the panel itself does not.

## What Changes

- The panel notes when its process started and reports whether any code it loaded has changed since: the core's
  panel server sources and the folders of the workspace packagers and publishers it loaded.
- When something changed, the top bar shows a "restart available" chip naming the newest changed file, and the
  panel menu's Restart control panel item gets the same dot Rebuild host has. Restart clears both, since the new
  process starts after every change.
- Panel UI files are read from disk on every request, so they need only a page reload and do not count.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: a panel freshness check alongside the host freshness check.

## Impact

- `packages/control-panel/src`: a freshness scan and its endpoint.
- `packages/control-panel/ui`: the chip, the menu dot and its periodic refresh.
- No host, SDK, plugin ABI or packager/publisher contract change.
