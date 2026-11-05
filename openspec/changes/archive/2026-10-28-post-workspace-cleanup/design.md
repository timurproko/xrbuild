# Design

## Publication status cache

A publisher's `status()` may read remote state (a content branch, the public origin): seconds per project, and the
project list asked it for every project before answering. The panel now keeps the last status per publisher and
publication identity. The list answers from it at once (`checking` before the first status), refreshes an entry older
than 15 s in the background, one refresh per entry at a time, and sends `publication-status` when a refreshed status
differs; the UI reloads the list on that event. A finished publication job marks every entry stale. Tests that
assert publication semantics set `awaitPublicationStatus` to read settled statuses.

## 3D app icon

- **Module.** An app's icon is `src/icon.js` with a default export `createIcon()` returning a `THREE.Object3D`
  (optionally `object.userData.update(seconds)` for idle motion). The app's build emits it as `icon.js` next to
  `index.html`, an ES module whose chunks (three.js among them) load relative to it. A consumer imports it from the app's
  route (`/preview/<id>/icon.js` under the panel, `<route>/icon.js` when published, same origin as the launcher).
  Renderers use three.js's flag checks (`isMesh`, `isMaterial`), so an object from another three.js copy renders.
- **Icon view.** `createXrb({ icon: { create } })` (or an `icon.js` the app passes in) makes the icon view draw only
  that object, centred and fitted to its bounding sphere, through an orthographic camera looking down -Z, on a
  transparent square. The studio's Take and the host's `--render-icon=` therefore save a flat render of the same
  object the launcher shows in 3D. Apps without one keep today's scene render.
- **Panel.** `describeProject` reports `icon.model` (the preview URL of `icon.js`) when the build has one.
  `icon.png` stays the one 2D icon for the list, packages and the window.
- **Template.** New apps get a sphere `src/icon.js` and the second build entry.
- **Workspace.** Launcher: a rocket; UI kit: the robot; the globe app: its globe (replacing its own icon framing);
  hello-cube: a sphere (rig-check is a plain page without a build and keeps its PNG). The launcher loads each app's `icon.js`, shows the object on the card and falls back to the PNG.
