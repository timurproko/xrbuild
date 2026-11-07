// The packager contract with a fake packager plugin: discovery, fields, validation, the build job,
// and "packaging unavailable" when no plugin packages for the project's platform.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { EventHub } from '../src/http.ts';
import { Panel } from '../src/panel.ts';
import { discoverPackagers, platformsFor, targetOf, validSetupStatus } from '../src/packagers.ts';
import { savePluginPrefs } from '../src/plugin-manager.ts';
import { buildTargetOf, discoverAll, ManifestConflictError, saveManifest, validateManifest } from '../src/projects.ts';
import { describeProject } from '../src/server.ts';

const FAKE_PACKAGER = `
import fs from 'node:fs/promises';
import path from 'node:path';
export const packager = {
  name: 'fake',
  identityFields: [
    { key: 'code', label: 'Code', kind: 'text', required: true },
    { key: 'version', label: 'Version', kind: 'version', required: true },
  ],
  validate(identity) {
    return identity.code ? [] : [{ field: 'code', message: 'code is required' }];
  },
  async build(o) {
    o.log('fake build ' + o.identity.code);
    await fs.mkdir(o.out, { recursive: true });
    const file = path.join(o.out, o.identity.code + '.pkg');
    await fs.writeFile(file, JSON.stringify({ identity: o.identity, plugins: o.plugins, from: path.basename(path.dirname(o.pluginDirs[o.plugins[0]])), shipped: await fs.readdir(o.pluginDirs[o.plugins[0]]), selection: o.selection, projectName: o.projectName, config: o.config, app: path.basename(o.app) }));
    return { file, sizeBytes: (await fs.stat(file)).size };
  },
};
`;

// A packager for WebXR headset apps: it gets the web app, icon and identity, never a host or plugins.
const HEADSET_PACKAGER = `
import fs from 'node:fs/promises';
import path from 'node:path';
export const packager = {
  name: 'headset',
  target: 'webxr',
  identityFields: [{ key: 'id', label: 'App id', kind: 'text', required: true }, { key: 'version', label: 'Version', kind: 'version', required: true }],
  validate: () => [],
  async build(o) {
    await fs.mkdir(o.out, { recursive: true });
    const file = path.join(o.out, o.identity.id + '.app');
    await fs.writeFile(file, JSON.stringify({ identity: o.identity, runtimeDir: o.runtimeDir, plugins: o.plugins, hasPluginDirs: 'pluginDirs' in o, app: path.basename(o.app), platform: o.selection.platform, launchUrl: o.launchUrl }));
    return { file, sizeBytes: (await fs.stat(file)).size };
  },
};
`;

/** `repo`: the workspace (projects, plugins with their bin/); `core`: the host build. */
async function fixture(withPackager: boolean, withPluginBuild = true) {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-packager-'));
  const core = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-packager-core-'));
  const w = async (rel: string, data: string, base = repo) => {
    await fs.mkdir(path.dirname(path.join(base, rel)), { recursive: true });
    await fs.writeFile(path.join(base, rel), data);
  };
  if (withPackager) {
    await w('plugins/platform-fake/xrb-plugin.json', JSON.stringify({ title: 'Fake Platform', type: 'platform', version: '0.1.0' }));
    await w('plugins/platform-fake/packager/package.json', JSON.stringify({ name: 'fake-packager', xrBuild: { packager: './src/packager.mjs' } }));
    await w('plugins/platform-fake/packager/src/packager.mjs', FAKE_PACKAGER);
    await w('plugins/headset/xrb-plugin.json', JSON.stringify({ title: 'Headset', type: 'platform', version: '0.1.0' }));
    await w('plugins/headset/package.json', JSON.stringify({ name: 'headset-packager', xrBuild: { packager: './packager.mjs', publisher: './publisher.mjs' } }));
    await w('plugins/headset/packager.mjs', HEADSET_PACKAGER);
    await w('plugins/headset/publisher.mjs', "export const publisher = { name: 'fixture', origin: 'https://example.test', routePrefix: 'apps', validate: () => [], status: async () => ({ state: 'unpublished' }), publish: async () => ({}), unpublish: async () => ({}) };");
  }
  const headsetApp = (target: string | undefined) => JSON.stringify({ name: 'Glasses', kind: 'app', entry: 'dist', target, platform: 'headset', plugins: { headset: { id: 'glasses', version: '0.2.0' } }, publication: { enabled: true, publisher: 'fixture', id: '11111111-1111-4111-8111-111111111111', slug: 'glasses' } });
  await w('projects/Apps/glasses/xrb-project.json', headsetApp('webxr'));
  await w('projects/Apps/glasses/dist/index.html', 'glasses');
  await w('projects/Apps/hostglasses/xrb-project.json', headsetApp(undefined));
  await w('projects/Apps/hostglasses/dist/index.html', 'glasses');
  await w('plugins/broken/xrb-plugin.json', JSON.stringify({ title: 'Broken', type: 'plugin', version: '0.1.0' }));
  await w('plugins/broken/package.json', JSON.stringify({ xrBuild: { packager: './missing.mjs' } }));
  const app = (code: string) => JSON.stringify({ name: 'Demo', kind: 'app', entry: 'dist', input: 'none', display: 'desktop', platform: 'fake', plugins: { fake: { code, version: '1.0.0' } } });
  await w('projects/Apps/demo/xrb-project.json', app('D1'));
  await w('projects/Apps/demo/dist/index.html', 'demo');
  await w('projects/Apps/nocode/xrb-project.json', app(''));
  await w('projects/Apps/nocode/dist/index.html', 'demo');
  await w('projects/Apps/solo/xrb-project.json', JSON.stringify({ name: 'Solo', kind: 'app', platform: '' }));
  await w('native/host/build/Release/xrb-host.exe', 'exe', core);
  if (withPluginBuild) await w('plugins/platform-fake/bin/xrb_platform_fake.dll', 'dll');
  const panel = new Panel(core, repo, new EventHub());
  // The host would report the plugin's name and DLL (`--list-plugins`); the fixture has no real host.
  panel.pluginDirs = async () => (withPluginBuild ? { fake: path.join(repo, 'plugins', 'platform-fake', 'bin') } : {});
  panel.awaitPublicationStatus = true;
  await panel.loadPackagers();
  await panel.loadPublishers();
  const projects = Object.fromEntries((await discoverAll(repo)).map((p) => [p.id, p]));
  return { repo, core, panel, projects };
}

test('optional setup status validates states, reasons and HTTPS terms', () => {
  assert.equal(validSetupStatus({ state: 'ready' }), true);
  assert.equal(validSetupStatus({ state: 'setup-required', reason: 'missing tools', termsUrl: 'https://example.test/terms' }), true);
  for (const value of [{ state: 'pending' }, { state: 'ready', termsUrl: 'https://example.test' },
    { state: 'setup-required', termsUrl: 'javascript:alert(1)' }, { state: 'setup-required', reason: 42 }]) {
    assert.equal(validSetupStatus(value), false);
  }
});

test('setup requires a read-only status hook; old packagers stay discoverable', async () => {
  const { repo, core, panel, projects } = await fixture(true);
  assert.deepEqual(await panel.packageSetupStatus(projects.glasses), { state: 'ready' });
  assert.equal(panel.packagingOf(projects.glasses.manifest).setupSupported, false);
  await assert.rejects(panel.packageSetup(projects.glasses, false), /does not offer setup/);
  const dir = path.join(repo, 'plugins', 'broken-setup');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'Broken Setup', type: 'platform', version: '0.1.0' }));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ xrBuild: { packager: './packager.mjs' } }));
  await fs.writeFile(path.join(dir, 'packager.mjs'), "export const packager={name:'broken-setup',identityFields:[],validate(){return []},async build(){return {}},async setup(){}};");
  const result = await discoverPackagers(core, repo);
  assert.ok(result.problems.some((problem) => problem.includes('broken-setup')));
  assert.ok(result.found.some(({ packager }) => packager.name === 'headset' && !packager.setup));
});

async function finished(panel: Panel, id: string) {
  for (let i = 0; i < 200; i++) {
    const j = panel.jobs.list().find((x) => x.id === id);
    if (j && j.state !== 'running') return j;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job did not finish');
}

test('discovery: packagers declared in package.json#xrBuild.packager; broken ones reported, not fatal', async () => {
  const { repo, core } = await fixture(true);
  const d = await discoverPackagers(core, repo);
  assert.deepEqual(d.found.map((f) => f.packager.name).sort(), ['fake', 'headset']);
  assert.equal(d.problems.length, 1);
  assert.match(d.problems[0], /plugins[\\/]broken/);
});

test('the project shows the packager fields and its validation', async () => {
  const { repo, panel, projects } = await fixture(true);
  const demo = await describeProject(repo, projects['demo'], panel);
  assert.equal(demo.packaging.available, true);
  assert.equal(demo.packaging.packager, 'fake');
  assert.deepEqual(demo.packaging.fields.map((f) => f.key), ['code', 'version']);
  assert.deepEqual(demo.packaging.errors, []);
  assert.equal(demo.packagingChoices['host:fake'].packager, 'fake');
  assert.equal(demo.packagingChoices['webxr:headset'].packager, 'headset');
  assert.equal(demo.packagingChoices['webxr:'].available, false);
  const bad = await describeProject(repo, projects['nocode'], panel);
  assert.deepEqual(bad.packaging.errors, [{ field: 'plugins.fake.code', message: 'code is required' }]);
  await assert.rejects(panel.packageBuild(projects['nocode'], {}), /code is required/);
  // The panel itself checks only the generic part of the identity.
  assert.deepEqual(validateManifest({ name: 'X', kind: 'app', platform: 'fake', plugins: { fake: { code: 'x', version: 'v1' } } }, repo).map((e) => e.field), ['plugins.fake.version']);
});

test('the build job runs the packager with the app, identity, selection and the selected plugins', async () => {
  const { repo, panel, projects } = await fixture(true);
  const job = await panel.packageBuild(projects['demo'], {});
  const done = await finished(panel, job.id);
  assert.equal(done.state, 'done', done.error ?? '');
  const out = JSON.parse(await fs.readFile(path.join(repo, 'builds', 'fake', 'D1.pkg'), 'utf8'));
  assert.deepEqual(out, {
    identity: { code: 'D1', version: '1.0.0' }, plugins: ['fake'], from: 'plugins', shipped: ['xrb-runtime.json', 'xrb_platform_fake.dll'],
    selection: { input: 'none', inputs: ['mouse', 'keyboard'], display: 'desktop', platform: 'fake' }, projectName: 'Demo',
    config: { input: 'none', inputs: ['mouse', 'keyboard'], display: 'desktop', platform: 'fake', plugins: { fake: { code: 'D1', version: '1.0.0' } } }, app: 'app',
  });
  const m = JSON.parse(await fs.readFile(path.join(repo, 'projects/Apps/demo/xrb-project.json'), 'utf8'));
  assert.deepEqual(m.plugins.fake, { code: 'D1', version: '1.0.1', lastPackaged: '1.0.0' }, 'version raised after the package');
});

test('a package includes every selected input plugin alongside the platform plugin', async () => {
  const { repo, panel, projects } = await fixture(true);
  projects.demo.manifest!.inputs = ['mouse', 'tracker-a', 'simulated', 'tracker-b'];
  for (const name of ['tracker-a', 'tracker-b']) {
    const dir = path.join(repo, 'plugins', name, 'bin');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${name}.dll`), 'dll');
  }
  panel.pluginDirs = async () => ({
    fake: path.join(repo, 'plugins', 'platform-fake', 'bin'),
    'tracker-a': path.join(repo, 'plugins', 'tracker-a', 'bin'),
    'tracker-b': path.join(repo, 'plugins', 'tracker-b', 'bin'),
  });
  const job = await panel.packageBuild(projects.demo, {});
  assert.equal((await finished(panel, job.id)).state, 'done');
  const out = JSON.parse(await fs.readFile(path.join(repo, 'builds', 'fake', 'D1.pkg'), 'utf8'));
  assert.deepEqual(out.plugins, ['tracker-a', 'tracker-b', 'fake']);
  assert.deepEqual(out.selection.inputs, ['mouse', 'tracker-a', 'simulated', 'tracker-b']);
});

test('disabling a platform hides packaging without changing its project selection', async () => {
  const { repo, panel, projects } = await fixture(true);
  await savePluginPrefs(repo, { disabled: ['platform-fake', 'headset'], settings: {}, panelSettings: {} });
  await panel.loadPackagers();
  assert.equal((await describeProject(repo, projects.demo, panel)).packaging.available, false);
  assert.equal((await describeProject(repo, projects.glasses, panel)).packaging.available, false);
  await assert.rejects(panel.packageBuild(projects.demo, {}), /packaging unavailable/);
  await assert.rejects(panel.packageBuild(projects.glasses, {}), /packaging unavailable/);
  assert.equal(projects.demo.manifest!.platform, 'fake');
  assert.equal(projects.glasses.manifest!.platform, 'headset');
  await savePluginPrefs(repo, { disabled: [], settings: {}, panelSettings: {} });
  await panel.loadPackagers();
  assert.equal((await describeProject(repo, projects.demo, panel)).packaging.available, true);
  assert.equal((await describeProject(repo, projects.glasses, panel)).packaging.available, true);
});

test('a selected plugin that is not built in the workspace refuses the package', async () => {
  const { panel, projects } = await fixture(true, false);
  await assert.rejects(panel.packageBuild(projects['demo'], {}), /plugin fake is not built in the workspace: rebuild the host first/);
});

test('no packager for the platform, or a standalone app: packaging unavailable, the rest works', async () => {
  const { repo, panel, projects } = await fixture(false);
  const demo = await describeProject(repo, projects['demo'], panel);
  assert.equal(demo.packaging.available, false);
  assert.match(demo.packaging.reason!, /no packager plugin for platform "fake"/);
  await assert.rejects(panel.packageBuild(projects['demo'], {}), /packaging unavailable/);
  assert.equal(demo.errors.length, 0, 'the project itself is fine');
  const solo = await describeProject(repo, projects['solo'], panel);
  assert.match(solo.packaging.reason!, /standalone/);
});

test('a standalone host packager packages Desktop without becoming another Platform choice', async () => {
  const { repo, panel, projects } = await fixture(true);
  panel.packagers.found.push({ dir: repo, packager: {
    name: 'desktop-package', target: 'host', standalone: true,
    identityFields: [{ key: 'id', label: 'ID', kind: 'text', required: true, hidden: true, deriveStyle: 'filename' }, { key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'version', label: 'Version', kind: 'version', required: true }],
    validate: () => [], build: async () => ({ file: '', sizeBytes: 0 }),
  } });
  const solo = await describeProject(repo, projects.solo, panel);
  assert.equal(solo.packaging.available, true);
  assert.equal(solo.packaging.platform, 'desktop-package');
  assert.equal(solo.packaging.channel, 'desktop');
  assert.equal(solo.packaging.packager, 'desktop-package');
  assert.ok(!platformsFor(panel.packagers, 'host').includes('desktop-package'));
});

test('packagers declare their target: host by default, webxr for headset apps; the platform lists follow it', async () => {
  const { repo, core } = await fixture(true);
  const d = await discoverPackagers(core, repo);
  assert.deepEqual(d.found.map((f) => [f.packager.name, targetOf(f.packager)]).sort(), [['fake', 'host'], ['headset', 'webxr']]);
  assert.deepEqual(platformsFor(d, 'host'), ['fake']);
  assert.deepEqual(platformsFor(d, 'webxr'), ['headset']);
});

test('a packager with an unknown target is reported, not loaded', async () => {
  const { repo, core } = await fixture(false);
  await fs.mkdir(path.join(repo, 'plugins', 'odd'), { recursive: true });
  await fs.writeFile(path.join(repo, 'plugins', 'odd', 'xrb-plugin.json'), JSON.stringify({ title: 'Odd', type: 'platform', version: '0.1.0' }));
  await fs.writeFile(path.join(repo, 'plugins', 'odd', 'package.json'), JSON.stringify({ xrBuild: { packager: './p.mjs' } }));
  await fs.writeFile(path.join(repo, 'plugins', 'odd', 'p.mjs'), "export const packager = { name: 'odd', target: 'phone', identityFields: [], validate: () => [], build: async () => ({}) };");
  const d = await discoverPackagers(core, repo);
  assert.ok(!d.found.some((f) => f.packager.name === 'odd'));
  assert.ok(d.problems.some((p) => /odd/.test(p) && /target host or webxr/.test(p)));
});

test('a WebXR headset app is packaged without a host: the packager gets the app and identity only', async () => {
  const { repo, core, panel, projects } = await fixture(true, false);
  await fs.rm(path.join(core, 'native'), { recursive: true });  // no host built at all
  const glasses = await describeProject(repo, projects['glasses'], panel);
  assert.equal(glasses.packaging.available, true, glasses.packaging.reason ?? '');
  assert.equal(glasses.publication.available, true, 'publication is independent of the selected package platform');
  assert.equal(glasses.publication.reason, null);
  assert.equal(glasses.publicationStandalone.available, true, 'standalone publication status is preloaded for an immediate tab switch');
  assert.equal(glasses.publicationStandalone.status?.state, 'unpublished');
  assert.equal(glasses.publicationDestinations.fixture.slug, 'glasses');
  assert.equal(glasses.publicationDestinations.fixture.status.state, 'unpublished', 'publisher-specific status is preloaded');
  assert.equal((await finished(panel, panel.webBuild(projects['glasses']).id)).state, 'done');
  const published = await finished(panel, (await panel.publish(projects['glasses'])).id);
  assert.equal(published.state, 'done', published.error ?? '');
  assert.equal(projects['glasses'].manifest?.platform, 'headset', 'publication does not change the package selection');
  const job = await panel.packageBuild(projects['glasses'], {});
  const done = await finished(panel, job.id);
  assert.equal(done.state, 'done', done.error ?? '');
  const out = JSON.parse(await fs.readFile(path.join(repo, 'builds', 'headset', 'glasses.app'), 'utf8'));
  assert.deepEqual(out, { identity: { id: 'glasses', version: '0.2.0' }, runtimeDir: '', plugins: [], hasPluginDirs: false, app: 'app', platform: 'headset', launchUrl: 'https://example.test/apps/glasses/' });
});

test('target and packager must match: a host app cannot use a headset packager', async () => {
  const { repo, panel, projects } = await fixture(true);
  const d = await describeProject(repo, projects['hostglasses'], panel);
  assert.equal(d.packaging.available, false);
  assert.match(d.packaging.reason!, /builds for the WebXR target, the app is set to Desktop/);
});

test('a WebXR headset app does not run on the host', async () => {
  const { panel, projects } = await fixture(true);
  await assert.rejects(panel.run(projects['glasses'], 'built'), /WebXR headset app: open it in a browser/);
});

test('the manifest target is host or webxr; unset means host', async () => {
  const { repo } = await fixture(false);
  assert.deepEqual(validateManifest({ name: 'X', kind: 'app', target: 'webxr' }, repo), []);
  assert.deepEqual(validateManifest({ name: 'X', kind: 'app', target: 'phone' }, repo).map((e) => e.field), ['target']);
  assert.equal(buildTargetOf({ name: 'X', kind: 'app' }), 'host');
  assert.equal(buildTargetOf({ name: 'X', kind: 'app', target: 'webxr' }), 'webxr');
});

test('switching the target is saved like any setting, and refused when the manifest changed on disk', async () => {
  const { projects } = await fixture(true);
  const demo = projects['demo'];
  const saved = await saveManifest(demo.dir, { ...demo.manifest!, target: 'webxr' }, demo.manifestMtimeMs);
  assert.deepEqual(saved.errors, []);
  assert.equal(JSON.parse(await fs.readFile(path.join(demo.dir, 'xrb-project.json'), 'utf8')).target, 'webxr');
  // stale: the file time the panel read before the save above
  await assert.rejects(saveManifest(demo.dir, { ...demo.manifest!, target: undefined }, demo.manifestMtimeMs - 1000), ManifestConflictError);
});
