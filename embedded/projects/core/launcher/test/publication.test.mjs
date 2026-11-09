import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inProject = (file) => path.join(root, file);

test('the production build contains website and headset launch assets', async () => {
  const [index, manifestText, sourceManifest, icon, sourceIcon, projectText, main, viteConfig] = await Promise.all([
    readFile(inProject('dist/index.html'), 'utf8'),
    readFile(inProject('dist/manifest.webmanifest'), 'utf8'),
    readFile(inProject('public/manifest.webmanifest'), 'utf8'),
    readFile(inProject('dist/icon.png')),
    readFile(inProject('icon.png')),
    readFile(inProject('xrb-project.json'), 'utf8'),
    readFile(inProject('src/main.js'), 'utf8'),
    readFile(inProject('vite.config.js'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  const project = JSON.parse(projectText);
  assert.match(index, /<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">/);
  assert.equal(manifestText, sourceManifest);
  assert.equal(manifest.name, project.name);
  assert.equal(manifest.start_url, './?xrb-xr=enter');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.icons[0].src, 'icon.png');
  assert.deepEqual(icon, sourceIcon);
  assert.ok(project.target === undefined || project.target === 'webxr');
  assert.equal(project.publication, undefined);
  assert.equal(project.plugins, undefined);
  assert.match(main, /from '@xr-build\/sdk'/);
  assert.match(main, /fitIcon/);
  assert.match(main, /from '@xr-build\/ui-kit'/);
  assert.match(main, /createXrbApp/);
  assert.match(main, /app\.setFrame/);
  assert.match(main, /app\.start/);
  assert.match(main, /xrb\.enterXR/);
  assert.match(main, /appLaunchUrl\(this\.app\.launchUrl, \{ returnUrl: location\.href, projection: app\.projection \}\)/,
    'navigation carries the managed projection, including loopback preview updates without a host');
  assert.match(main, /scene\.add\(xrb\.handsObject, xrb\.cursorObject\)/, 'the launcher uses the same spatial cursor as managed apps');
  assert.match(main, /title\.position\.set\(0, 0\.001,[\s\S]*description\.position\.set\(0, -0\.018,[\s\S]*this\.launch\.position\.set\(0, -0\.055,/,
    'card descriptions stay grouped with their titles instead of the Open button');
  assert.match(main, /app\.defaultIcon3d[\s\S]*fitIcon\(new THREE\.Mesh[\s\S]*SphereGeometry[\s\S]*MeshStandardMaterial/,
    'the generated default sphere is rendered as 3D geometry rather than a flat PNG');
  assert.match(main, /app\.defaultSphere \? 0\.819315 : 1/,
    'the generated sphere uses the agreed compact scale while authored icons keep their size');
  assert.match(main, /material\?\.color\?\.set\(DEFAULT_ICON_COLORS\[app\.iconColor\]/,
    'the 3D default sphere follows the app manifest icon colour');
  assert.match(main, /setInterval\(\(\) => void updateCatalog\(\), 1000\)/,
    'bounded local launchers refresh workspace icon metadata while they remain open');
  assert.match(main, /fixedControls\.forEach\(\(control\) => control\.attach\(xrb\.interaction\)\)/);
  assert.match(main, /this\.launch\.attach\(xrb\.interaction\)/);
  assert.match(main, /xrb\.bindMouse\(\)/);
  assert.match(main, /catalogBaseHref\(location\.href, import\.meta\.env\.VITE_CATALOG_ORIGIN\)/,
    'packaged native hosting resolves the canonical published catalog instead of its local app origin');
  assert.match(main, /workspaceCatalogBase\(location\.href\)[\s\S]*loadWorkspaceCatalog\(\{ baseHref: workspaceBase \?\? location\.href/,
    'a panel-launched native launcher resolves rebuilt workspace apps through the bounded panel context');
  assert.match(main, /local workspace unavailable; using published library/,
    'a stopped panel falls back to the published library');
  assert.match(main, /const development = isLoopbackDevelopment\(location\.href\)/);
  assert.match(main, /if \(development && !panelPreview\) nextApps = nextApps\.map\(localizePublishedApp\)/,
    'local route substitution remains loopback-only outside a panel workspace preview');
  assert.doesNotMatch(main, /previewSlots|Empty slot/,
    'workspace previews show real active projects instead of synthetic empty cards');
  assert.match(main, /catalogError = error;[\s\S]*apps = \[\]/,
    'catalog failure never creates fake cards');
  assert.match(main, /excludeCurrentPublication\(catalog, location\.href, \{[\s\S]*VITE_XRB_PUBLICATION_ID[\s\S]*VITE_XRB_PUBLICATION_SLUG[\s\S]*\}\)/,
    'native root hosting filters the compiled launcher identity');
  assert.match(viteConfig, /VITE_XRB_PUBLICATION_ID/);
  assert.match(viteConfig, /PUBLICATION_ID/);
  assert.match(viteConfig, /VITE_XRB_PUBLICATION_SLUG/);
  assert.match(viteConfig, /PUBLICATION_SLUG/);
  assert.doesNotMatch(viteConfig, /return-overlay/);
});
