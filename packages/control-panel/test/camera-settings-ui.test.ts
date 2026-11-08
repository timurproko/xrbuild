import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const ui = path.resolve(import.meta.dirname, '../ui');

test('project 2D mode replaces global camera settings and keeps the remaining controls explicit', async () => {
  const [html, app, navigation, style, design, panel, server, fullscreenHtml, fullscreenApp] = await Promise.all([
    ...['index.html', 'app.js', 'navigation.js', 'style.css', 'design-system.css'].map((file) => fs.readFile(path.join(ui, file), 'utf8')),
    fs.readFile(path.resolve(import.meta.dirname, '../src/panel.ts'), 'utf8'),
    fs.readFile(path.resolve(import.meta.dirname, '../src/server.ts'), 'utf8'),
    fs.readFile(path.join(ui, 'fullscreen-preview.html'), 'utf8'),
    fs.readFile(path.join(ui, 'fullscreen-preview.js'), 'utf8'),
  ]);
  assert.match(html, /id="global-settings"/);
  assert.match(navigation, /id:'settings',label:'Settings'/);
  assert.doesNotMatch(app, /camera-channel-options|camera-projection-options|Camera projection|saveCameraProjection|globalSettings/);
  assert.doesNotMatch(server, /readGlobalSettings|saveGlobalSettings|settings-changed/);
  assert.doesNotMatch(panel, /XRB_DISTRIBUTION_CHANNEL|XRB_CAMERA_PROJECTION|appBuildContext/);
  assert.match(panel, /appEnv\(\)[\s\S]*XRB_CORE: this\.repo/);
  assert.match(panel, /--camera-projection=\$\{flat \? 'orthographic' : 'perspective'\}/);
  assert.match(panel, /switchView: selection\.display !== 'desktop'/);
  assert.match(panel, /flat && selection\.display !== 'desktop' \? \['--view=2d'\]/);
  assert.match(panel, /async preview\(p: Project, mode: RunMode[\s\S]*runner\.startPreview[\s\S]*case 'preview'/);

  assert.match(app, /const appRunOption = \(name, p\) => \{[\s\S]*const key = `panel\.\$\{name\}\.\$\{p\.id\}`[\s\S]*legacyRunOptionKey\(name, p\)[\s\S]*localStorage\.setItem\(key, legacy\)/);
  assert.match(app, /const devMode = \(p\) => appRunOption\('dev', p\)/);
  assert.match(app, /const flatMode = \(p\) => appRunOption\('flat', p\)/);
  assert.match(app, /const fullscreenMode = \(p\) => appRunOption\('fullscreen', p\)/);
  assert.match(style, /\.run-dot\.running \{ background: var\(--err\); box-shadow: 0 0 0 3px var\(--err-soft\); \}/);
  assert.match(app, /const phase = r\.phase === 'stopping' \? 'stopping' : r\.phase === 'starting' \? 'launching' : 'running'/);
  assert.doesNotMatch(html, /id="project-heading"|>Activity<\/h2>/);
  assert.match(app, /const workflowTabs = m \? `<div class="project-workflow-tabs xrb-tabs"[\s\S]*data-surface="display"[\s\S]*>Develop<[\s\S]*data-surface="build"[\s\S]*>Build</);
  assert.match(app, /platformField\(m, surface\)/);
  assert.match(app, /const controls = m && displaySurface[\s\S]*const settings =[\s\S]*controls\?\.view[\s\S]*controls\?\.dev/);
  assert.match(app, /const buildSettings = !displaySurface[\s\S]*id="build-settings" class="xrb-stack/);
  assert.match(app, /const surfaceKey = \(\) => 'panel\.surface'/);
  assert.match(app, /surfaceChoiceKey[\s\S]*selectProjectSurface[\s\S]*options\.includes\(current\) \? current[\s\S]*savePlatformChoice[\s\S]*animateDetailHeights\(\(\) => renderDetail\(true\)\)/);
  assert.match(style, /\.project-workflow-tabs \{ margin-bottom: 4px; \}/);
  assert.match(style, /\.project-hero-top \{ grid-template-columns: auto minmax\(0, 1fr\); grid-template-rows: auto;[^}]*align-items: center; \}/, 'icon, title and actions share one identity line');
  assert.match(style, /\.project-hero \.icon-btn \{ grid-column: 1; grid-row: 1; align-self: center; width: 26px; height: 26px;/, 'the hero icon matches the sticky app-bar icon size');
  assert.match(design, /\.xrb-tabs\.xrb-tabs-compact/);
  assert.match(app, /const setDevMode = \(p, on\) => setAppRunOption\('dev', p, on\)/);
  assert.match(app, /setAppRunOption\('fullscreen', p, e\.target\.checked\)/);
  assert.match(app, /setAppRunOption\('flat', p, e\.target\.checked\)/);
  assert.doesNotMatch(app, /removeItem\(legacyRunOptionKey\('flat'/);
  assert.match(app, /class="settings-tools"[\s\S]*controls\?\.view[\s\S]*controls\?\.dev/);
  assert.match(app, /const manifestButton = m[\s\S]*id="open-manifest"[\s\S]*aria-label="Open JSON"/);
  assert.match(app, /<div class="hero-actions">\$\{projectActions\}<\/div><\/div>/, 'Folder and Open JSON sit at the identity row\'s right edge');
  assert.match(app, /const actionRow = heroButton \? `<div class="project-actions">\$\{heroButton\}<\/div>` : '';/, 'the primary action row sits below the surface content');
  assert.match(app, /data-surface="build"[\s\S]*\$\{publicationLink \? `<span class="spacer"><\/span>\$\{publicationLink\}` : ''\}/);
  assert.match(app, /const projectActions =[\s\S]*id="out-path"[\s\S]*id="open-dir"[\s\S]*\$\{manifestButton\}/);
  assert.match(app, /renderProjectHero\(el, `<section class="card hero project-hero">\$\{top\}<div class="xrb-section-divider project-surface-content">\$\{settings\}\$\{buildSettings\}\$\{actionRow\}<\/div><\/section>`, p\.id\)/);
  assert.match(app, /view: `\$\{fullBox\}\$\{viewBox\}`/);
  assert.match(app, /3D displays always run fullscreen\.[\s\S]*checked disabled> Fullscreen/);
  assert.match(html, /id="display-menu"[\s\S]*data-act="refresh-displays"[^>]*>Refresh displays/);
  assert.match(app, /name="display"[\s\S]*closest\('\.dropdown'\)[\s\S]*contextmenu/);
  assert.match(app, /dataset\.act !== 'refresh-displays'[\s\S]*await loadMonitors\(\);[\s\S]*refreshedDesktopDisplay\(p\.manifest, state\.monitors\)[\s\S]*saveSettings\(p, form, 'display'\)/);
  assert.match(app, /flatLocked = running \? state\.run\?\.phase !== 'running' \|\| !state\.run\?\.channelUrl/);
  assert.match(app, /Use an Orthographic camera in 2D; Perspective in 3D/);
  assert.match(app, /previewPath[\s\S]*xrb-preview-projection/);
  assert.match(panel, /const projection = flat \? 'orthographic' : 'perspective'[\s\S]*url\.searchParams\.set\('xrb-camera', projection\)[\s\S]*url\.searchParams\.set\('xrb-preview-route', route\)/);
  assert.match(app, /signalPreviewProjection\(p, e\.target\.checked\)/);
  assert.match(app, /sessionStorage\.getItem\(previewTokenKey\(p\)\)[\s\S]*api\('POST', '\/api\/preview\/projection', \{ route, token, projection \}\)/);
  assert.match(app, /function headsetButtons\(p, busy\)[\s\S]*id="act-dev"[\s\S]*id="act-fullscreen"[\s\S]*id="act-flat"/);
  assert.match(app, /const runtimeSettings = displaySurface[\s\S]*displayField\(m, \{ monitorsOnly: headset \}\)[\s\S]*inputField\(m\)[\s\S]*runtimeSettings \? `<div class="settings-grid runtime-settings">/);
  assert.match(app, /packagedHeadset \? null : headset \? headsetButtons\(p, busy\)/);
  assert.doesNotMatch(app, /openPreviewTarget|window\.open/);
  assert.match(app, /function startManagedRun\(p, mode, flat, request\)[\s\S]*phase: 'starting'[\s\S]*await request\(\)[\s\S]*await loadRun\(\)/);
  assert.match(app, /function stopManagedRun\(\)[\s\S]*phase: 'stopping'[\s\S]*api\('POST', '\/api\/run\/stop'\)[\s\S]*await loadRun\(\)/);
  assert.match(app, /function runButtons\(p, busy\)[\s\S]*phase === 'starting'[\s\S]*launching \|\| stopping \? 'disabled'[\s\S]*Launching…[\s\S]*Stopping…/);
  assert.match(app, /startManagedRun\(p, mode, flat[\s\S]*projectUrl\(p\.id\)\}\/preview`[\s\S]*startManagedRun\(p, mode, flat[\s\S]*projectUrl\(p\.id\)\}\/run`/);
  assert.doesNotMatch(app, /Enter fullscreen|requestFullscreen/);
  assert.match(app, /const monitor = Math\.max[\s\S]*projectUrl\(p\.id\)\}\/preview`[\s\S]*mode, flat, fullscreen, monitor/);
  assert.match(panel, /Get-NetTCPConnection[\s\S]*--window-position[\s\S]*--kiosk/);
  assert.match(fullscreenHtml, /iframe[^>]+xr-spatial-tracking/);
  assert.match(fullscreenApp, /BroadcastChannel\('xrb-preview-projection'\)[\s\S]*postMessage\(\{ \.\.\.event\.data, token \}/);
  assert.match(app, /api\('POST', '\/api\/run\/view', \{ flat: e\.target\.checked \}\)/);

  assert.match(app, /const filters = new Set\(\[\.\.\.\(plugins\.length \? \['all'\] : \[\]\), 'control-panel', \.\.\.plugins\.map/);
  assert.match(app, /\{ id: 'all', name: 'All', meta: 'settings'/);
  assert.match(app, /\{ id: 'control-panel', name: 'Apps', meta: 'core'/);
  assert.match(app, /field\('Cursor', 'cursor', state\.appSettings\.cursor/);
  assert.match(app, /requestedFilter && !filters\.has\(requestedFilter\)[\s\S]*searchParams\.delete\('module'\)/);
  assert.match(app, /data-plugin-settings/);
  assert.match(app, /panelSettings/);
  assert.match(style, /settings-toolbar \.display-options \{ display: inline-flex; gap: 8px; \}/);
  assert.doesNotMatch(style, /\.display-field|\.refresh-displays/);
  assert.doesNotMatch(style, /settings-camera-field/);
  assert.match(design, /\.xrb-app-bar, \.top[^}]*z-index: 4/);
  assert.match(html, /id="run-dock"[\s\S]*class="run-project"[\s\S]*class="name"[\s\S]*<button type="button" class="action-button"/,
    'the sticky project action follows the selected app name');
  assert.match(style, /\.run-dock button \{ width: 62px; min-width: 62px; height: 30px;/, 'the sticky Run action keeps a compact fixed width');
  assert.match(app, /const pending = state\.run\?\.phase === 'starting' \|\| state\.run\?\.phase === 'stopping';[\s\S]*btn\.textContent = pending \? '\.\.\.' : src\.id === 'act-stop' \? 'Stop' : 'Run'/,
    'the sticky action uses Run, ..., and Stop without resizing');
});
