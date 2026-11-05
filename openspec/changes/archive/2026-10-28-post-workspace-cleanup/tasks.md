# Tasks

## 1. Claude cleanup

- [x] 1.1 Fold the workspace's `.claude/CLAUDE.md` rules into the root `CLAUDE.md` Workspace section, remove `.xrbuild/.claude/` (its settings are a subset of the root's) and point `AGENTS.md` at the root file; verify no file outside archived changes references `.xrbuild/.claude` and `pnpm check:names` passes.
- [x] 1.2 Document pnpm setup without admin (`corepack enable pnpm --install-directory`) in README and `CLAUDE.md`; verify `pnpm --version` prints 9.15.9 from Git Bash and PowerShell after that command.

## 2. Fast control panel start

- [x] 2.1 Serve publication statuses from a panel cache: the project list answers `checking` before a publisher's first status, refreshes stale entries in the background, announces `publication-status`, and marks entries stale after a publication job; the UI reloads the list on that event, shows Checking… on the publication action, and does not hold the reveal for the monitor query; verify the control panel tests pass, `/api/projects` answers in well under a second with the repository workspace's publishers, and the maintainer sees the panel at once from the Start-menu shortcut.

## 3. Panel tab title

- [x] 3.1 Title the panel's browser tab "XR Build Control Panel"; verify the tab shows it after a reload.

## 4. 3D app icons

- [x] 4.1 SDK: `createXrb({ icon: { create } })` draws the created object in the icon view, centred and fitted, through an orthographic camera on a transparent square, calling `object.userData.update` when present; apps without it keep the scene render; verify SDK tests cover the fit and the orthographic camera and pass.
- [x] 4.2 Panel: `describeProject` reports `icon.model` when the build has `icon.js`; verify a control panel test for a project with and without it.
- [x] 4.3 Template: new apps get a sphere `src/icon.js`, pass it to `createXrb`, and build `icon.js` next to `index.html`; verify a project created from the template builds both and its icon view shows the sphere.
- [x] 4.4 Workspace apps: launcher rocket, UI kit robot, globe app globe (replacing its own icon framing), hello-cube sphere; rig-check, a plain page without a build, keeps its PNG; verify each builds `icon.js` and the icon studio shows the object orthographically.
- [x] 4.5 Launcher: load each app's `icon.js` and show the object in 3D on its card, falling back to the PNG; remove the hard-coded robot; verify the launcher tests pass and the maintainer sees 3D icons in the launcher and flat renders in the panel.
- [x] 4.6 Icon menu and studio: right-click on the thumbnail opens the menu (sphere colours, Upload image…, Render 3D… when the build has `icon.js`, Remove icon); Upload image… frames the PNG (drag to move, right-drag or scroll to zoom, Reset fits) and saves the framed square on Take (the thumbnail changes only on Take); Render 3D… previews the 3D icon alone (Render preview, no app), still, left-drag turns, right-drag or scroll zooms, Reset restores, Take never advances it, controls disabled until loaded; the other shapes and row colours are gone; verify the panel and SDK tests pass and the maintainer checks each flow.

## 5. Project list sections

- [x] 5.1 Section rename sends the previous name and renames the folder with everything in it; deleting a section (Delete section in its right-click menu, no × on the heading) moves its projects to Unsorted and its other files to the Recycle Bin; verify the layout tests cover a section with a README and the maintainer renames and deletes the Tests section.
- [x] 5.2 Every card's heading row has one height (`--card-head-h`), with or without a toggle or icon button, so the Running card and those below it do not move when Cameras appears; verify the maintainer switches between a host project and a WebXR project and nothing below the headings moves.
- [x] 5.3 Run options (Fullscreen, or 2D for a 3D display) sit in the platform row next to Dev server; a 3D display plugin's `screenName` matches the start of the system's monitor name, so the Display list names both modes as the system does (for example "<monitor> (2D)" and "<monitor> (3D)"); section headings show the panel's "Double-click to rename" tooltip; verify the panel tests pass and the maintainer sees the row and the names.
- [x] 5.4 Publication status problems read as what they are: the panel shows a published app the site does not serve as published ("Published, not reachable", Unpublish available) or "Publisher unavailable", not "Publication failed"; the production publisher says why a published app is not live (site not served, not deployed yet, other version); the local test publisher answers status without its server, so unpublished apps show no error; verify the publisher tests pass and the maintainer sees no error for an unpublished app.
- [x] 5.5 Empty Log and Jobs show one compact note like the Running card; a platform switch eases the project cards to their new heights; verify the panel tests pass and the maintainer switches Desktop and WebXR.
- [x] 5.6 Platform tabs reorder by drag and drop, the order saved for the workspace (`platformOrder` in `xrb-panel.json`); the toolbar keeps Open JSON in the top-right corner and wraps only the run options when the settings card is narrow; section tooltips anchor on the section name; verify the layout tests cover the saved order and the maintainer drags a tab and checks a wide and a narrow window.
- [x] 5.7 Section folders are lower case: a name typed with capitals is saved lower case and its folder renamed (headings still show capitals); unarchive finds a project's section without case; the workspace's sections are renamed to `core` and `apps`; verify the layout tests cover it and the maintainer creates a section named "My Apps" and sees the folder `my apps`.
- [x] 5.8 Return to the launcher: the launcher's build emits `return-overlay.js`, and `createXrb()` (or `loadReturnOverlay()`) loads it for an app opened with a same-origin `?xrb-return=`; verify the SDK tests cover the origin rule, a headless run shows the close control over two apps opened from the panel-served launcher, and the maintainer closes an app from the launcher.
- [x] 5.9 Each platform tab keeps its own Display, Input (manifest `platformSettings`) and run options (Fullscreen, 2D, Dev server per project and tab in the panel); verify the platform-choice tests cover switching back and forth and the maintainer sets different displays for Desktop and Station.
