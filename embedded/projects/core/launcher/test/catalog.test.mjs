import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catalogBaseHref,
  catalogEndpoints,
  currentPublicationSlug,
  descriptionFromHtml,
  excludeCurrentPublication,
  isLoopbackDevelopment,
  isPanelPreview,
  loadCatalog,
  loadRuntimeCatalog,
  loadWorkspaceCatalog,
  normalizeInventory,
  titleFromHtml,
  titleFromSlug,
  workspaceCatalogBase,
} from '../src/catalog.js';

test('inventory validation sorts newest publications first', () => {
  assert.deepEqual(normalizeInventory({ version: 1, publications: [
    { id: 'root', slug: '', publishedMs: 30 },
    { id: 'one', slug: 'first-app', publishedMs: 10 },
    { id: 'two', slug: 'second-app', publishedMs: 20 },
  ]}).map((item) => item.slug), ['', 'second-app', 'first-app']);
  assert.throws(() => normalizeInventory({ version: 2, publications: [] }), /unsupported format/);
  assert.throws(() => normalizeInventory({ version: 1, publications: [
    { id: 'one', slug: 'same', publishedMs: 10 },
    { id: 'two', slug: 'same', publishedMs: 20 },
  ]}), /duplicate/);
});

test('catalog paths stay at the publication origin', () => {
  const endpoints = catalogEndpoints('https://example.test/apps/launcher/');
  assert.equal(endpoints.inventory.href, 'https://example.test/.xrb-publications.json');
  assert.equal(endpoints.apps.href, 'https://example.test/apps/');
  assert.equal(currentPublicationSlug('/apps/launcher/'), 'launcher');
  assert.equal(currentPublicationSlug('/'), null);
  const catalog = [
    { id: 'root-id', slug: '', route: 'https://example.test/apps/' },
    { id: 'launcher-id', slug: 'launcher', route: 'https://example.test/apps/launcher/' },
    { id: 'ui-id', slug: 'ui-kit', route: 'https://example.test/apps/ui-kit/' },
  ];
  assert.deepEqual(excludeCurrentPublication(catalog, 'https://example.test/apps/', { id: 'launcher-id', slug: 'launcher' }).map((item) => item.slug), ['launcher', 'ui-kit'],
    'the published route is authoritative when the embedded build identity is stale');
  assert.deepEqual(excludeCurrentPublication(catalog, 'https://example.test/apps/launcher/').map((item) => item.slug), ['', 'ui-kit']);
  assert.deepEqual(excludeCurrentPublication(catalog, 'https://app.local/', { id: 'root-id', slug: 'launcher' }).map((item) => item.slug), ['launcher', 'ui-kit'],
    'native root hosting uses the stable embedded ID when its publisher route differs');
  assert.deepEqual(excludeCurrentPublication(catalog, 'https://app.local/', { slug: 'launcher' }).map((item) => item.slug), ['', 'ui-kit'],
    'a bounded slug remains the fallback for older builds without an ID');
  const previews = [{id:'bundled:launcher',slug:'bundled:launcher',route:'http://127.0.0.1:5180/preview/bundled%3Alauncher/'},{id:'bundled:ui-kit',slug:'bundled:ui-kit',route:'http://127.0.0.1:5180/preview/bundled%3Aui-kit/'}];
  assert.deepEqual(excludeCurrentPublication(previews,'http://127.0.0.1:5180/preview/bundled%3Alauncher/@r-test/').map(item=>item.id),['bundled:ui-kit'],'generation-pinned public preview excludes itself without a deployment identity');
});

test('only loopback origins enable development catalog fixtures', () => {
  for (const href of ['http://localhost:5173/', 'http://127.0.0.1:5181/preview/launcher/']) assert.equal(isLoopbackDevelopment(href), true);
  for (const href of ['https://app.local/', 'https://example.test/apps/launch/', 'https://127.0.0.2/']) assert.equal(isLoopbackDevelopment(href), false);
  assert.equal(isPanelPreview('http://127.0.0.1:5181/preview/launcher/'), true);
  assert.equal(isPanelPreview('http://localhost:5173/'), false);
  assert.equal(isPanelPreview('https://app.local/preview/launcher/'), false);
  assert.equal(catalogBaseHref('https://app.local/'), 'https://app.local/', 'native hosting never adopts an ambient production origin');
  assert.equal(workspaceCatalogBase('https://app.local/?xrb-panel=http%3A%2F%2F127.0.0.1%3A5191%2F'), 'http://127.0.0.1:5191/',
    'a panel-launched native app reads locally rebuilt workspace previews');
  assert.equal(workspaceCatalogBase('https://app.local/?xrb-panel=https%3A%2F%2Fexample.test%2F'), null, 'only loopback panel contexts are accepted');
  assert.equal(workspaceCatalogBase('https://app.local/'), null, 'packaged launchers have no workspace context');
  assert.equal(catalogBaseHref('https://example.test/apps/launch/'), 'https://example.test/apps/launch/', 'published hosting keeps its own origin');
  assert.equal(catalogBaseHref('https://127.0.0.1:8443/apps/launch/'), 'https://127.0.0.1:8443/apps/launch/', 'a launcher published on a local test publisher lists that publisher, not production');
  assert.equal(catalogBaseHref('https://127.0.0.1:8443/releases/11111111-1111-4111-8111-111111111111/abc-0123456789ab/'), 'https://127.0.0.1:8443/releases/11111111-1111-4111-8111-111111111111/abc-0123456789ab/', 'a release archive preview lists its own publisher too');
  assert.equal(catalogBaseHref('https://example.test/.xrb-releases/11111111-1111-4111-8111-111111111111/abc-0123456789ab/'), 'https://example.test/.xrb-releases/11111111-1111-4111-8111-111111111111/abc-0123456789ab/');
  assert.equal(catalogBaseHref('http://localhost:5173/'), 'http://localhost:5173/', 'plain development stays local unless explicitly configured');
  for (const origin of ['http://external.example/', 'https://user:secret@example.test/', 'https://example.test/?private=1']) assert.throws(() => catalogBaseHref('https://app.local/', origin), /clean HTTPS/);
  assert.equal(catalogBaseHref('http://localhost:5173/', 'https://staging.example/apps/'), 'https://staging.example/apps/', 'an explicit development catalog wins');
});

test('panel context rejects non-loopback, credentialed, relative and dirty URLs', () => {
  for (const panel of ['https://remote.test/', 'http://user@localhost:5180/', '/relative', 'ftp://localhost/', 'http://localhost:5180/path', 'http://localhost:5180/?query=1', 'http://localhost:5180/#fragment']) {
    assert.equal(workspaceCatalogBase(`https://app.local/?xrb-panel=${encodeURIComponent(panel)}`), null, panel);
  }
});

test('explicit local catalog context is authoritative, ordered and recoverable across Browser/Desktop modes', async () => {
  const projects = [
    { id: 'bundled:launcher', manifest: { kind: 'app', name: 'Launcher', scripts: { build: 'build' } } },
    { id: 'custom', entryExists: true, manifest: { kind: 'app', name: 'Custom', publication: { id: 'configured-id', slug: 'custom' } } },
    { id: 'bundled:sample', entryExists: true, manifest: { kind: 'app', name: 'Sample' } },
    { id: 'loose', entryExists: true, manifest: { kind: 'app', name: 'Loose' } },
    { id: 'archive/old', archived: true, entryExists: true, manifest: { kind: 'app', name: 'Old' } },
    { id: 'broken', manifest: null },
    { id: 'test', entryExists: true, manifest: { kind: 'test', name: 'Test' } },
  ];
  const layout = { sections: [{ name: 'empty', items: [] }, { name: 'core', items: ['bundled:launcher', 'bundled:sample', 'custom'] }] };
  const requests = [];
  let available = false;
  const fetchImpl = async input => {
    requests.push(String(input));
    assert.equal(String(input), 'http://127.0.0.1:5191/api/projects');
    return available ? Response.json({ projects, layout }) : new Response('', { status: 503 });
  };
  for (const runtime of ['http://localhost:54321/', 'https://app.local/index.html', 'http://127.0.0.1:5191/preview/bundled%3Alauncher/@r-generation/']) {
    const href = new URL(runtime);
    href.searchParams.set('xrb-panel', 'http://127.0.0.1:5191/');
    href.searchParams.set('xrb-project', 'bundled:launcher');
    available = false;
    await assert.rejects(loadRuntimeCatalog({ runtimeHref: href.href, fetchImpl }), /workspace apps \(503\)/);
    available = true;
    const catalog = await loadRuntimeCatalog({ runtimeHref: href.href, fetchImpl });
    // Stale compiled publication identity must not exclude another local project.
    const visible = excludeCurrentPublication(catalog, href.href, { id: 'configured-id', slug: 'custom' });
    assert.deepEqual(visible.map(app => app.projectId), ['bundled:sample', 'custom', 'loose']);
    assert.equal(visible[1].id, 'configured-id');
    assert.equal(visible[1].route, 'http://127.0.0.1:5191/preview/custom/');
  }
  assert.equal(requests.length, 6, 'one local read per failed attempt or refresh, never publication inventory fallback');
  const configured = await loadWorkspaceCatalog({ baseHref: 'http://127.0.0.1:5191/', fetchImpl });
  assert.deepEqual(excludeCurrentPublication(configured, 'http://127.0.0.1:5191/preview/custom/@r-generation/').map(app => app.projectId), ['bundled:launcher', 'bundled:sample', 'loose'], 'preview self-exclusion is independent of publication ID');
});

test('runtime without panel context retains publisher inventory selection', async () => {
  for (const runtimeHref of ['https://app.local/', 'https://example.test/apps/launch/']) {
    const requests = [];
    const result = await loadRuntimeCatalog({ runtimeHref, fetchImpl: async input => {
      requests.push(new URL(input).pathname);
      return Response.json({ version: 1, publications: [] });
    } });
    assert.deepEqual(result, []);
    assert.deepEqual(requests, ['/.xrb-publications.json']);
  }
});

test('titles are readable with or without publication metadata', () => {
  assert.equal(titleFromSlug('hello-xr-world'), 'Hello Xr World');
  assert.equal(titleFromHtml('<title>Control &amp; Status</title>'), 'Control & Status');
  assert.equal(titleFromHtml('<main>No title</main>'), null);
  assert.equal(descriptionFromHtml('<meta name="description" content="Spatial controls &amp; tools.">'), 'Spatial controls & tools.');
  assert.equal(descriptionFromHtml('<main>No description</main>'), null);
});

test('panel preview lists every active workspace app without contacting the production inventory', async () => {
  const requests = [];
  const status = (state) => ({ publicationStandalone: { status: { state } } });
  const fetchImpl = async (input) => {
    requests.push(new URL(input).pathname);
    return Response.json({ projects: [
      { id: 'launcher', ...status('published'), manifest: { kind: 'app', name: 'Launcher', target: 'webxr', publication: { enabled: true, slug: 'launcher' }, scripts: { build: 'build' } } },
      { id: 'offline', entryExists: true, ...status('failed'), manifest: { kind: 'app', name: 'Offline', target: 'webxr', publication: { enabled: true, slug: 'offline' } } },
      { id: 'ui-kit', entryExists: true, icon: { custom: true, model: '/preview/ui-kit/icon.js' }, ...status('published'), manifest: { kind: 'app', name: 'UI Kit', icon: 'icon.png', target: 'webxr', platform: 'headset', publication: { enabled: true, id: 'one', slug: 'ui-kit' } } },
      { id: 'globe', entryExists: true, ...status('unpublished'), manifest: { kind: 'app', name: 'Globe', target: 'webxr', publication: { enabled: true, slug: 'globe' } } },
      { id: 'desktop', entryExists: true, icon: { custom: false, model: null }, card: { name: 'Desktop', description: 'Card text.', icon: { default: true, color: 'purple', shape: 'sphere', model: false } }, manifest: { kind: 'app', name: 'Desktop', description: 'Manifest text.', iconColor: 'blue' } },
      { id: 'archived', archived: true, entryExists: true, ...status('published'), manifest: { kind: 'app', name: 'Archived' } },
      { id: 'not-built', ...status('published'), manifest: { kind: 'app', name: 'Not Built', target: 'webxr', publication: { enabled: true } } },
      { id: 'rig-check', entryExists: true, ...status('published'), manifest: { kind: 'test', name: 'Rig Check', publication: { enabled: true } } },
    ], layout: { sections: [{ name: 'core', items: ['launcher', 'ui-kit'] }] } });
  };
  const apps = await loadWorkspaceCatalog({ fetchImpl, baseHref: 'http://127.0.0.1:5180/preview/launcher/' });
  assert.deepEqual(requests, ['/api/projects']);
  assert.deepEqual(apps.map(({ title, slug }) => [title, slug]), [
    ['Launcher', 'launcher'], ['UI Kit', 'ui-kit'], ['Offline', 'offline'], ['Globe', 'globe'], ['Desktop', 'desktop'],
  ], 'publication state and target do not hide active workspace apps; archived, unbuilt and test projects stay out');
  assert.equal(apps[1].launchUrl, 'http://127.0.0.1:5180/preview/ui-kit/?xrb-xr=enter');
  assert.equal(apps[1].iconUrl, 'http://127.0.0.1:5180/api/projects/ui-kit/icon');
  assert.equal(apps[1].defaultIcon3d, false, 'an app-provided 3D model wins');
  assert.equal(apps[1].defaultSphere, false);
  assert.equal(apps.find((app) => app.title === 'Desktop').defaultIcon3d, true, 'the generated sphere remains a real 3D launcher icon');
  assert.equal(apps.find((app) => app.title === 'Desktop').defaultSphere, true);
  assert.equal(apps.find((app) => app.title === 'Desktop').iconColor, 'purple');
  assert.equal(apps.find((app) => app.title === 'Desktop').description, 'Card text.', 'the panel card is the same contract a publisher records, so it wins over manifest fields');
  assert.equal(apps.find((app) => app.title === 'Globe').description, '', 'local apps without descriptions show no generic filler text');
  await assert.rejects(loadWorkspaceCatalog({ fetchImpl: async () => new Response('', { status: 404 }), baseHref: 'http://127.0.0.1:5180/' }), /workspace apps \(404\)/);
});

test('generated template icon modules retain compact sphere classification and app colour', async () => {
  const apps = await loadWorkspaceCatalog({ baseHref: 'http://127.0.0.1:5180/preview/launcher/', fetchImpl: async () => Response.json({ projects: [
    { id: 'template', entryExists: true, icon: { model: '/preview/template/icon.js' }, manifest: { kind: 'app', name: 'Template', iconColor: 'amber' } },
    { id: 'authored', entryExists: true, icon: { model: '/preview/authored/icon.js' }, manifest: { kind: 'app', name: 'Authored', icon: 'icon.png' } },
  ] }) });
  const template = apps.find(app => app.title === 'Template');
  assert.equal(template.defaultSphere, true, 'generated icon.js is still the template sphere');
  assert.equal(template.defaultIcon3d, false, 'load the existing module rather than synthesizing a replacement');
  assert.equal(template.iconColor, 'amber');
  assert.equal(apps.find(app => app.title === 'Authored').defaultSphere, false, 'authored artwork keeps its own sizing and colours');
});

test('panel preview does not wait for publisher checks', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return Response.json({ projects: [{ id: 'globe', entryExists: true,
      publicationStandalone: { status: { state: 'checking' } }, manifest: { kind: 'app', name: 'Globe' } }] });
  };
  const apps = await loadWorkspaceCatalog({ fetchImpl, baseHref: 'http://127.0.0.1:5180/preview/launcher/' });
  assert.equal(calls, 1);
  assert.deepEqual(apps.map((app) => app.title), ['Globe']);
});

test('catalog enriches inventory with same-origin app metadata and immersive launch URLs', async () => {
  const requests = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname === '/.xrb-publications.json') return Response.json({ version: 1, publications: [
      { id: 'root', slug: '', publishedMs: 30 },
      { id: 'one', slug: 'ui-kit', publishedMs: 20 },
      { id: 'two', slug: 'plain-app', publishedMs: 10 },
    ] });
    if (url.pathname === '/apps/manifest.webmanifest') return new Response('', { status: 404 });
    if (url.pathname === '/apps/') return new Response('<title>Root Experience</title>');
    if (url.pathname === '/apps/ui-kit/manifest.webmanifest') return Response.json({
      name: 'XRBuild',
      description: 'Shared spatial controls.',
      icons: [{ src: './art/icon.png' }],
    });
    if (url.pathname === '/apps/ui-kit/') return new Response('<title>UI Kit</title><meta name="xrb-app-card" content="default" data-color="amber" data-shape="sphere" data-model="1">');
    if (url.pathname === '/apps/plain-app/manifest.webmanifest') return Response.json({ icons: [{ src: 'https://other.example/icon.png' }] });
    if (url.pathname === '/apps/plain-app/') return new Response('<main>Untitled</main>');
    return new Response('', { status: 404 });
  };

  const apps = await loadCatalog({ fetchImpl, baseHref: 'https://example.test/apps/launcher/', token: 'test' });
  assert.deepEqual(apps.map(({ title, slug }) => ({ title, slug })), [
    { title: 'Root Experience', slug: '' },
    { title: 'UI Kit', slug: 'ui-kit' },
    { title: 'Plain App', slug: 'plain-app' },
  ]);
  assert.equal(apps[1].description, 'Shared spatial controls.');
  assert.equal(apps[2].description, '', 'published apps without a description show no filler text, like local ones');
  assert.deepEqual([apps[1].defaultSphere, apps[1].defaultIcon3d, apps[1].iconColor], [true, false, 'amber'], 'the stamped card metadata drives the default sphere sizing and colour');
  assert.deepEqual([apps[2].defaultSphere, apps[2].defaultIcon3d, apps[2].iconColor], [false, false, 'blue'], 'a page without card metadata keeps authored icon sizing');
  assert.equal(apps[0].route, 'https://example.test/apps/');
  assert.equal(apps[0].iconUrl, 'https://example.test/apps/xrb-app-icon.png');
  assert.equal(apps[1].iconUrl, 'https://example.test/apps/ui-kit/art/icon.png');
  assert.equal(apps[2].iconUrl, 'https://example.test/apps/plain-app/xrb-app-icon.png');
  assert.equal(apps[1].launchUrl, 'https://example.test/apps/ui-kit/?xrb-xr=enter');
  assert.deepEqual(await loadCatalog({ fetchImpl: async () => new Response('', { status: 404 }), baseHref: 'https://127.0.0.1:8443/apps/launch/', token: 'test' }), [],
    'a publisher without an inventory yet has published nothing');
  await assert.rejects(loadCatalog({ fetchImpl: async () => new Response('', { status: 503 }), baseHref: 'https://example.test/apps/launcher/', token: 'test' }), /Could not load the app library \(503\)/,
    'other failures remain errors');
  assert.ok(requests.every((url) => url.searchParams.get('xrb-launcher') === 'test'));
});
