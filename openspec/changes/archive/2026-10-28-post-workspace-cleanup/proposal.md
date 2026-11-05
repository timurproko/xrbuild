# Cleanup after the embedded workspace

## Why

The last changes moved the development workspace into the repository and added direct workspace pushes. They left
small loose ends: two agent instruction folders, and a pnpm setup step that needs an admin shell and is lost on a
Node update. This change collects those fixes in one PR, each tested by hand before the merge.

## What Changes

- One `.claude/` folder at the repository root: the workspace's instructions fold into the root `CLAUDE.md`
  Workspace section; `.xrbuild/.claude/` is removed; `AGENTS.md` points to the root file.
- pnpm setup without admin: README and `CLAUDE.md` use `corepack enable pnpm --install-directory`.
- Fast control panel start: publication statuses come from a panel cache, so the project list never waits for a
  publisher; the tab is titled "XR Build Control Panel".
- 3D app icons: an app exports `createIcon()` (`src/icon.js`, built to `dist/icon.js`) returning a three.js object.
  The icon view renders it straight-on with an orthographic camera, so `icon.png` (panel, packages, window) is a
  flat render of the same object, and a launcher can show the object live in 3D. The template gives new apps a
  sphere icon; the workspace apps get their own (launcher: a rocket; UI kit: the robot; the globe app: its globe;
  tests: a sphere), and the workspace launcher drops its hard-coded robot.
- Further cleanup items are added to `tasks.md` as they come up in this PR.

## Impact

- `.claude/CLAUDE.md`, `AGENTS.md`, `README.md`, `.xrbuild/.claude/` (removed).
- `packages/control-panel` (publication status cache, project icon data, tab title), `packages/sdk` (3D icon),
  `templates/app`, workspace apps and launcher under `.xrbuild/projects/`.
- Specs: `web-runtime-sdk` (3D app icon, icon view), `dev-control-panel` (project icon).
