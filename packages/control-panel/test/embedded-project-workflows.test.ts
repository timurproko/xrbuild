import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { createServer } from '../src/server.ts';
import { freePort, devProcessEnvironment } from '../src/host-runner.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import { buildInventory } from '../src/embedded-inputs.ts';
import { embeddedProjectRoot, prepareEmbeddedProject, withEmbeddedProjectLock } from '../src/embedded-project-state.ts';
import { effectiveProjectOutput } from '../src/embedded-project-output.ts';
import { runProcess } from '../src/jobs.ts';
import { defaultIcon } from '../../app-icon/src/icon.ts';
import { reviewWorkingCache, cleanWorkingCache } from '../src/cache-maintenance.ts';
import { readProjectRunSettings, saveProjectRunSettings } from '../src/project-run-settings.ts';
import { withBrowser, sleep } from './browser-fixture.ts';
import type { Manifest } from '../src/projects.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/embedded-workflows-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'), projects = path.join(root, 'projects-home');
  for (const dir of [core, workspace, projects]) await fs.mkdir(dir);
  const write = async (file: string, value: unknown) => {
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const project = async (owner: string, section: string, name: string, extra: Partial<Manifest> = {}) => {
    const dir = path.join(owner, 'projects', section, name);
    await write(path.join(dir, 'xrb-project.json'), { name, kind: 'app', target: 'webxr', entry: 'dist', ...extra });
    await write(path.join(dir, 'dist/index.html'), '<html><head></head><body>fixture</body></html>');
    return dir;
  };
  const source = await project(path.join(core, 'embedded'), 'core', 'sample');
  await project(projects, 'core', 'sample');
  await project(path.join(core, 'embedded'), 'archive', 'archived');
  const port = await freePort(), server = createServer({ repo: core, workspace, projects, port });
  await new Promise<void>(resolve => server.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await server.close(); await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }); });
  const request = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) });
    const text = await response.text(); let json: any; try { json = JSON.parse(text); } catch { /* static content */ }
    return { status: response.status, json, text };
  };
  const catalog = async () => (await request('GET', '/api/projects')).json;
  const bundled = async () => (await discoverProjectCatalog(core, workspace, projects)).projects.find(p => p.key === 'bundled:sample')!.project;
  const save = async (manifest: Manifest, mtimeMs?: number, revision?: string) => {
    const current = (await request('GET', '/api/projects/bundled%3Asample')).json;
    return request('PUT', '/api/projects/bundled%3Asample/manifest', { manifest, mtimeMs: mtimeMs ?? current.manifestMtimeMs, revision: revision ?? current.manifestRevision });
  };
  return { root, core, workspace, projects, source, write, project, server, request, catalog, bundled, save };
}

test('embedded projects use durable normal settings and immutable builds without duplicate projects or product writes', async t => {
  const f = await fixture(t), before = (await buildInventory(f.core)).fingerprint;
  const initial = await f.catalog(), p = initial.projects.find((p: any) => p.id === 'bundled:sample');
  assert.equal(p.canDelete, false); assert.equal(p.manifest.name, 'sample');
  await assert.rejects(fs.access(path.join(f.projects, '.xrb')), 'discovery does not materialize or install');
  const saved = await f.save({ ...p.manifest, name: 'My sample', description: 'Customized' }, p.manifestMtimeMs);
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.manifest.name, 'My sample');
  assert.equal(saved.json.readOnly, false); assert.equal(saved.json.entryExists, true, 'a static working app stays runnable before finalization');
  assert.equal((await f.catalog()).projects.length, 2, 'materialization is not another project');
  assert.equal((await f.catalog()).projects.find((p: any) => p.id === 'sample').manifest.name, 'sample');
  assert.equal((await f.save({ ...p.manifest, name: 'Stale writer' }, p.manifestMtimeMs, p.manifestRevision)).status, 409);
  const working = await f.bundled(), file = path.join(working.dir, 'xrb-project.json'), fixedTime = new Date('2001-01-01T00:00:00Z');
  await fs.utimes(file, fixedTime, fixedTime);
  const previous = (await f.request('GET', '/api/projects/bundled%3Asample')).json;
  await fs.writeFile(file, JSON.stringify({ ...working.manifest, name: 'External edit' })); await fs.utimes(file, fixedTime, fixedTime);
  const external = (await f.request('GET', '/api/projects/bundled%3Asample')).json;
  assert.equal(external.manifestMtimeMs, previous.manifestMtimeMs);
  assert.equal((await f.save(previous.manifest, previous.manifestMtimeMs, previous.manifestRevision)).status, 409, 'content revision rejects stale edits even with identical Windows timestamps');
  assert.equal((await f.save({ ...external.manifest, name: 'My sample' })).status, 200);
  const job = await f.request('POST', '/api/projects/bundled%3Asample/build-web');
  assert.equal(job.status, 202, job.text);
  const done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(job.json.id)!);
  assert.equal(done.state, 'done', done.error ?? '');
  const effective = await f.bundled(), output = await effectiveProjectOutput(f.core, f.workspace, effective);
  assert.ok(!output.entry.startsWith(effective.dir));
  const preview = await f.request('GET', `/preview/bundled%3Asample/@${output.generation}/`);
  assert.equal(preview.status, 200, preview.text); assert.match(preview.text, /xrb-app-icon/);
  const review = await reviewWorkingCache({ core: f.core, workspace: f.workspace, project: effective });
  assert.deepEqual(review.candidates, []);
  await assert.rejects(cleanWorkingCache({ core: f.core, workspace: f.workspace, project: effective }, { revision: review.revision, generations: [path.basename(path.dirname(effective.workingRoot!))], confirm: true }), /unsafe|stale/);
  assert.equal(JSON.parse(await fs.readFile(path.join(effective.dir, 'xrb-project.json'), 'utf8')).name, 'My sample');
  assert.equal((await buildInventory(f.core)).fingerprint, before);
  const reloaded = await discoverProjectCatalog(f.core, f.workspace, f.projects);
  assert.equal(reloaded.projects.find(p => p.key === 'bundled:sample')!.project.manifest!.name, 'My sample');
  const independent = await f.request('POST', '/api/projects/bundled%3Asample/copy', { folder: 'independent' });
  assert.equal(independent.status, 201, independent.text); assert.equal(independent.json.manifest.name, 'My sample');
  assert.equal(independent.json.canDelete, true); assert.equal(independent.json.manifest.publication, undefined);
  assert.equal((await buildInventory(f.core)).fingerprint, before);
});

test('normal icon and source-opening actions use only editable user files, including repair of invalid defaults', async t => {
  const f = await fixture(t), initial = (await f.catalog()).projects.find((p: any) => p.id === 'bundled:sample');
  let opened = '';
  f.server.panel.openInShell = target => { opened = target; };
  assert.equal((await f.request('POST', '/api/projects/bundled%3Asample/open-manifest')).status, 200);
  assert.ok(opened.startsWith(path.join(f.projects, '.xrb'))); assert.ok(opened.endsWith('xrb-project.json'));
  const png = defaultIcon(16, 'red');
  const uploaded = await f.request('PUT', '/api/projects/bundled%3Asample/icon', png);
  assert.equal(uploaded.status, 200, uploaded.text); assert.equal(uploaded.json.icon.custom, true);
  const effective = await f.bundled(); assert.deepEqual(await fs.readFile(path.join(effective.dir, 'icon.png')), png);
  assert.equal((await f.request('DELETE', '/api/projects/bundled%3Asample/icon')).status, 200);
  await assert.rejects(fs.access(path.join(effective.dir, 'icon.png')));
  assert.equal(JSON.parse(await fs.readFile(path.join(f.source, 'xrb-project.json'), 'utf8')).name, initial.manifest.name);
  const broken = await f.project(path.join(f.core, 'embedded'), 'core', 'broken');
  await fs.writeFile(path.join(broken, 'xrb-project.json'), '{broken');
  const openedBroken = await f.request('POST', '/api/projects/bundled%3Abroken/open-folder');
  assert.equal(openedBroken.status, 200, openedBroken.text); assert.ok(opened.startsWith(path.join(f.projects, '.xrb')));
  const p = (await f.request('GET', '/api/projects/bundled%3Abroken')).json;
  const fixed = await f.request('PUT', '/api/projects/bundled%3Abroken/manifest', { manifest: { name: 'Repaired', kind: 'app', target: 'webxr', entry: 'dist' }, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
  assert.equal(fixed.status, 200, fixed.text); assert.equal(fixed.json.manifest.name, 'Repaired');
  assert.equal(await fs.readFile(path.join(broken, 'xrb-project.json'), 'utf8'), '{broken');
});

test('mixed sections, ordering, archive/unarchive and default archive retain identities across discovery', async t => {
  const f = await fixture(t), before = (await buildInventory(f.core)).fingerprint;
  let layout = (await f.catalog()).layout;
  assert.deepEqual(layout.sections, [{ name: 'core', items: ['bundled:sample', 'sample'] }]);
  const result = await f.request('PUT', '/api/layout', { ...layout, sections: [{ name: 'demos', items: ['sample', 'bundled:sample'] }] });
  assert.equal(result.status, 200, result.text);
  let info = await f.catalog(); assert.deepEqual(info.layout.sections, [{ name: 'demos', items: ['sample', 'bundled:sample'] }]);
  await fs.access(path.join(f.projects, 'projects/demos/sample'));
  assert.equal((await f.request('PUT', '/api/layout', layout)).status, 409, 'stale layout rejected');
  const archived = await f.request('POST', '/api/projects/bundled%3Asample/archive');
  assert.equal(archived.status, 200, archived.text); assert.equal(archived.json.id, 'bundled:archive/sample');
  info = await f.catalog();
  assert.ok(info.archived.some((p: any) => p.id === 'bundled:archive/sample' && p.key === 'bundled:sample'));
  assert.deepEqual(info.layout.sections, [{ name: 'demos', items: ['sample'] }]);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Aarchive/sample/unarchive')).status, 200);
  assert.equal((await f.catalog()).projects.find((p: any) => p.id === 'bundled:sample').section, 'demos');
  assert.equal((await f.request('POST', '/api/projects/bundled%3Aarchive/archived/unarchive')).status, 200);
  assert.ok((await f.catalog()).projects.some((p: any) => p.id === 'bundled:archived'));
  layout = (await f.catalog()).layout;
  assert.equal((await f.request('PUT', '/api/layout', { ...layout, sections: [{ name: 'renamed', from: 'demos', items: ['bundled:sample', 'sample'] }] })).status, 200);
  assert.equal((await f.request('PUT', '/api/layout', { ...(await f.catalog()).layout, sections: [] })).status, 200);
  assert.equal((await f.catalog()).projects.find((p: any) => p.id === 'bundled:sample').section, 'unsorted');
  assert.equal((await buildInventory(f.core)).fingerprint, before);
});

test('archiving the last embedded item prunes its occupied section and restores into Unsorted', async t => {
  const f = await fixture(t);
  const moved = await f.request('PUT', '/api/layout', { ...(await f.catalog()).layout, sections: [{ name: 'only', items: ['bundled:sample'] }, { name: 'ordinary', items: ['sample'] }] });
  assert.equal(moved.status, 200, moved.text);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Asample/archive')).status, 200);
  assert.deepEqual((await f.catalog()).layout.sections.map((section: any) => section.name), ['ordinary']);
  assert.equal((await f.request('POST', '/api/projects/bundled%3Aarchive/sample/unarchive')).status, 200);
  assert.equal((await f.catalog()).projects.find((p: any) => p.id === 'bundled:sample').section, 'unsorted');
});

test('mixed layout conflicts are refused before moving ordinary folders or saving embedded placement', async t => {
  const f = await fixture(t), before = (await f.catalog()).layout;
  const conflict = path.join(f.projects, 'projects/blocked/sample'); await fs.mkdir(conflict, { recursive: true });
  const refused = await f.request('PUT', '/api/layout', { ...before, sections: [{ name: 'blocked', items: ['sample', 'bundled:sample'] }] });
  assert.equal(refused.status, 409, refused.text);
  assert.deepEqual((await f.catalog()).layout, before);
  await fs.access(path.join(f.projects, 'projects/core/sample')); assert.deepEqual(await fs.readdir(conflict), []);
});

test('only embedded deletion is refused and origin-qualified aliases cannot bypass it', async t => {
  const f = await fixture(t);
  for (const id of ['bundled%3Asample', 'bundled%3Aarchive/archived']) {
    const deleted = await f.request('POST', `/api/projects/${id}/delete`);
    assert.equal(deleted.status, 409, deleted.text); assert.match(deleted.json.error, /cannot be deleted/);
  }
  await assert.rejects(f.server.panel.deleteProject(await f.bundled()), /cannot be deleted/);
  await f.request('POST', '/api/projects/bundled%3Asample/archive');
  assert.equal((await f.request('POST', '/api/projects/bundled%3Asample/delete')).status, 409);
  assert.equal((await f.catalog()).projects.find((p: any) => p.id === 'sample').canDelete, true);
  if (process.platform === 'win32') {
    const before = (await buildInventory(f.core)).fingerprint;
    const deleted = await f.request('POST', '/api/projects/sample/delete');
    assert.equal(deleted.status, 200, deleted.text);
    assert.ok((await f.catalog()).archived.some((p: any) => p.key === 'bundled:sample'));
    assert.equal((await buildInventory(f.core)).fingerprint, before, 'ordinary same-name deletion never touches its embedded counterpart');
  }
  await fs.access(f.source);
});

test('personal settings seed effective manifests once and source updates preserve edits with explicit reconciliation', async t => {
  const f = await fixture(t), raw = await f.bundled(), settings = await readProjectRunSettings(f.core, f.workspace, raw);
  await saveProjectRunSettings(f.core, f.workspace, raw, { display: 'desktop', inputs: ['keyboard'], flat: true }, settings.revision);
  const effective = await prepareEmbeddedProject(f.core, f.workspace, f.projects, raw);
  assert.deepEqual(effective.manifest!.inputs, ['keyboard']); assert.equal(effective.runDefaults!.flat, true);
  await f.save({ ...effective.manifest!, name: 'Keep this edit', inputs: ['mouse'] });
  await f.write(path.join(f.source, 'new-file.js'), 'export const updated = true;');
  const p = await f.bundled(); assert.ok(p.sourceUpdate);
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, p), /preserved/);
  const rejected = await f.request('POST', '/api/projects/bundled%3Asample/keep-working-sources', { revision: 'stale', confirm: true });
  assert.equal(rejected.status, 409);
  const kept = await f.request('POST', '/api/projects/bundled%3Asample/keep-working-sources', { revision: p.sourceUpdate!.revision, confirm: true });
  assert.equal(kept.status, 200, kept.text); assert.equal(kept.json.sourceUpdate, null);
  assert.equal(kept.json.manifest.name, 'Keep this edit'); assert.deepEqual(kept.json.manifest.inputs, ['mouse']);
  const other = path.join(f.root, 'other-projects'); await fs.mkdir(other);
  const otherCatalog = await discoverProjectCatalog(f.core, f.workspace, other);
  assert.equal(otherCatalog.projects.find(p => p.key === 'bundled:sample')!.project.manifest!.name, 'sample');
  // An upstream default-section move must not manufacture a new user/deployment identity.
  assert.equal((await f.request('PUT', '/api/layout', { ...(await f.catalog()).layout, sections: [{ name: 'custom', items: ['bundled:sample', 'sample'] }] })).status, 200);
  await fs.rename(f.source, path.join(f.core, 'embedded/projects/archive/sample'));
  const relocated = await f.bundled();
  assert.equal(relocated.key, 'bundled:sample'); assert.equal(relocated.section, 'custom'); assert.equal(relocated.workingRoot, effective.workingRoot);
  assert.equal(relocated.manifest!.name, 'Keep this edit'); assert.ok(relocated.sourceUpdate);
  const accepted = await f.request('POST', '/api/projects/bundled%3Asample/keep-working-sources', { revision: relocated.sourceUpdate!.revision, confirm: true });
  assert.equal(accepted.status, 200, accepted.text); assert.equal(accepted.json.manifest.name, 'Keep this edit');
});

test('working state and cooperating operation locks reject malformed, interrupted and linked state without replacement', async t => {
  const f = await fixture(t), raw = await f.bundled();
  const p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, raw);
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const holder = withEmbeddedProjectLock(f.core, f.projects, p, async () => { entered(); await gate; });
  await ready;
  try {
    assert.equal((await f.save({ ...p.manifest!, name: 'Blocked' })).status, 409);
    assert.equal((await f.request('POST', '/api/projects/bundled%3Asample/archive')).status, 409);
    const script = `import {withEmbeddedProjectLock} from ${JSON.stringify(new URL('../src/embedded-project-state.ts', import.meta.url).href)};
      try { await withEmbeddedProjectLock(${JSON.stringify(f.core)},${JSON.stringify(f.projects)},${JSON.stringify(p)},async()=>{throw new Error('Lock bypassed');}); process.exitCode=7; }
      catch(error) { if(error.status===409)console.log('blocked');else throw error; }`;
    const child = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { cwd: REPO });
    assert.equal(child.stdout.trim(), 'blocked', 'independent processes share the operation lock');
  } finally { release(); await holder; }
  const root = embeddedProjectRoot(f.core, f.workspace, f.projects, p);
  const state = path.join(root, 'state.json'); await fs.writeFile(state, '{bad');
  assert.ok((await f.bundled()).stateProblem);
  assert.equal((await f.save({ ...p.manifest!, name: 'Blocked' })).status, 409);
  assert.equal(await fs.readFile(state, 'utf8'), '{bad');
  const preserved = `${root}-preserved`; await fs.rename(root, preserved);
  await fs.symlink(f.source, root, process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok((await f.bundled()).stateProblem);
  const product = await fs.readFile(path.join(f.source, 'xrb-project.json'), 'utf8');
  assert.equal((await f.save({ ...p.manifest!, name: 'Must not reach linked source' })).status, 409);
  assert.equal(await fs.readFile(path.join(f.source, 'xrb-project.json'), 'utf8'), product);
  assert.equal(await fs.readFile(path.join(preserved, 'state.json'), 'utf8'), '{bad');
});

test('embedded publication and web packaging use neutral adapters and finalized generation output', async t => {
  const f = await fixture(t), before = (await buildInventory(f.core)).fingerprint;
  let published = '', packaged = '', setupCalls = 0;
  f.server.panel.publishers = { found: [{ dir: f.workspace, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [],
    status: async () => ({ state: 'unpublished', selectedUrl: '' }), publish: async input => { published = input.app; return { url: 'https://example.test/sample/' }; },
    unpublish: async () => ({}) } }], problems: [] };
  f.server.panel.packagers = { found: [{ dir: f.workspace, packager: { name: 'fixture', target: 'webxr', standalone: true, identityFields: [], validate: () => [],
    setupStatus: async () => ({ state: setupCalls ? 'ready' : 'setup-required' }), setup: async () => { setupCalls++; },
    build: async input => { packaged = input.app; return { file: 'fixture.zip', sizeBytes: 100 }; } } }], problems: [] };
  assert.equal((await f.request('GET', '/api/projects/bundled%3Asample/package/setup-status')).json.state, 'setup-required');
  await assert.rejects(fs.access(path.join(f.projects, '.xrb')), 'prerequisite status discovery stays read-only');
  const setup = await f.request('POST', '/api/projects/bundled%3Asample/package-setup', { acceptTerms: true });
  assert.equal(setup.status, 202, setup.text);
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(setup.json.id)!)).state, 'done'); assert.equal(setupCalls, 1);
  let p = (await f.catalog()).projects.find((p: any) => p.id === 'bundled:sample');
  const saved = await f.save({ ...p.manifest, publication: { id: randomUUID(), enabled: true, publisher: 'fixture', slug: 'sample' } }, p.manifestMtimeMs);
  assert.equal(saved.status, 200, saved.text);
  let response = await f.request('POST', '/api/projects/bundled%3Asample/build-web');
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!)).state, 'done');
  response = await f.request('POST', '/api/projects/bundled%3Asample/publish', {});
  assert.equal(response.status, 202, response.text);
  let done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'done', done.error ?? '');
  assert.match(published, /r-[a-zA-Z0-9]{6}[\\/]out$/); assert.match(await fs.readFile(path.join(published, 'index.html'), 'utf8'), /xrb-app-icon/);
  response = await f.request('POST', '/api/projects/bundled%3Asample/package', {});
  assert.equal(response.status, 202, response.text);
  done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'done', done.error ?? '');
  assert.match(packaged, /package-inputs/); assert.match(await fs.readFile(path.join(packaged, 'index.html'), 'utf8'), /xrb-app-icon/);
  await f.request('POST', '/api/projects/bundled%3Asample/archive');
  p = (await f.catalog()).archived.find((p: any) => p.id === 'bundled:archive/sample');
  assert.equal(p.manifest.publication.id, saved.json.manifest.publication.id);
  assert.equal((await buildInventory(f.core)).fingerprint, before);
});

test('native runs use immutable effective output and retain their project operation lease until idle', async t => {
  const f = await fixture(t);
  await f.write(path.join(f.source, 'xrb-project.json'), { name: 'Native sample', kind: 'app', entry: 'dist', host: { args: ['--fixture-option=on'] } });
  await f.write(path.join(f.core, 'native/host/build/Release/xrb-host.exe'), 'synthetic host; launch is intercepted');
  const before = (await buildInventory(f.core)).fingerprint;
  let launched: any;
  const runner = f.server.panel.runner;
  runner.start = async request => {
    launched = request;
    Object.defineProperty(runner, 'busy', { configurable: true, value: true });
    Object.defineProperty(runner, 'projectId', { configurable: true, value: request.projectId });
  };
  try {
    const started = await f.request('POST', '/api/projects/bundled%3Asample/run', { mode: 'built' });
    assert.equal(started.status, 200, started.text);
    const p = await f.bundled(), output = await effectiveProjectOutput(f.core, f.workspace, p);
    assert.equal(launched.entryDir, output.entry); assert.ok(launched.hostArgs.includes('--fixture-option=on'));
    await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, p), /busy|operation lock/);
    Reflect.deleteProperty(runner, 'busy'); Reflect.deleteProperty(runner, 'projectId'); runner.emit('state', { phase: 'idle' });
    const lock = path.join(f.projects, '.xrb/embedded-locks', `${path.basename(embeddedProjectRoot(f.core, f.workspace, f.projects, p))}.lock`);
    for (let i = 0; i < 100 && await fs.lstat(lock).catch(() => null); i++) await sleep(10);
    assert.equal((await prepareEmbeddedProject(f.core, f.workspace, f.projects, p)).dir, p.dir);
    assert.equal((await buildInventory(f.core)).fingerprint, before);
  } finally {
    Reflect.deleteProperty(runner, 'busy'); Reflect.deleteProperty(runner, 'projectId'); runner.emit('state', { phase: 'idle' });
  }
});

test('normal scripted builds keep editable inputs, frozen installation and pinned output across rebuild failure', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  await f.write(path.join(f.source, 'xrb-project.json'), { name: 'sample', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build', dev: 'dev' } });
  await f.write(path.join(f.core, 'embedded/package.json'), { name: 'public-fixture', private: true, packageManager: 'pnpm@9.15.9' });
  await f.write(path.join(f.core, 'embedded/pnpm-workspace.yaml'), "packages:\n  - 'projects/*/*'\n");
  await f.write(path.join(f.core, 'embedded/pnpm-lock.yaml'), "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  projects/core/sample: {}\n");
  await f.write(path.join(f.source, 'package.json'), { name: 'sample', private: true, type: 'module', scripts: { build: 'node build.mjs', dev: 'node dev.mjs' } });
  await f.write(path.join(f.source, 'src.txt'), 'first');
  await f.write(path.join(f.source, 'build.mjs'), "import fs from 'node:fs/promises'; const text=await fs.readFile('src.txt','utf8'); if(text==='fail')throw new Error('fixture failed'); await fs.mkdir('dist',{recursive:true}); await fs.writeFile('dist/index.html','<html><head></head><body>'+text+'</body></html>');");
  const before = (await buildInventory(f.core)).fingerprint;
  const start = f.server.panel.jobs.start.bind(f.server.panel.jobs);
  f.server.panel.jobs.start = (kind, id, title, body, ...rest) => start(kind, id, title, ctx => body({ ...ctx, async run(_command, args, options) {
    assert.ok(String(options?.cwd).startsWith(path.join(f.projects, '.xrb/embedded-projects')));
    if (args.join(' ').includes('install')) {
      assert.match(args.join(' '), /--frozen-lockfile/); assert.match(args.join(' '), /--ignore-scripts/); return;
    }
    const code = await runProcess(process.execPath, ['build.mjs'], ctx.line, options);
    if (code !== 0) throw new Error('fixture build failed');
  } }), ...rest);
  let response = await f.request('POST', '/api/projects/bundled%3Asample/rebuild-app');
  let done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'done', done.error ?? '');
  const p = await f.bundled(), first = await effectiveProjectOutput(f.core, f.workspace, p);
  await fs.writeFile(path.join(p.dir, 'src.txt'), 'edited');
  response = await f.request('POST', '/api/projects/bundled%3Asample/rebuild-app');
  done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'done', done.error ?? '');
  assert.match(await fs.readFile(path.join((await effectiveProjectOutput(f.core, f.workspace, await f.bundled())).entry, 'index.html'), 'utf8'), /edited/);
  assert.match((await f.request('GET', `/preview/bundled%3Asample/@${first.generation}/`)).text, /first/);
  await fs.writeFile(path.join(p.dir, 'src.txt'), 'fail');
  response = await f.request('POST', '/api/projects/bundled%3Asample/rebuild-app');
  done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'failed');
  await assert.rejects(effectiveProjectOutput(f.core, f.workspace, await f.bundled()));
  assert.match((await f.request('GET', `/preview/bundled%3Asample/@${first.generation}/`)).text, /first/);
  assert.equal(await fs.readFile(path.join(p.dir, 'src.txt'), 'utf8'), 'fail');
  // Real dependency preparation (empty public dependency graph), fake browser process only.
  let dev: any;
  f.server.panel.runner.startPreview = async (request, mode) => { dev = { request, mode }; };
  const preview = await f.request('POST', '/api/projects/bundled%3Asample/preview', { mode: 'dev' });
  assert.equal(preview.status, 200, preview.text); assert.equal(dev.mode, 'dev');
  assert.equal(dev.request.projectDir, p.dir); assert.equal(dev.request.devScript, 'dev');
  assert.equal(dev.request.devEnv.XRB_CORE, f.core); assert.equal(dev.request.devEnvIsolated, true);
  const previous = process.env.npm_config_userconfig;
  process.env.npm_config_userconfig = 'ambient-must-not-leak';
  try {
    assert.equal(devProcessEnvironment({ XRB_CORE: f.core }, true).npm_config_userconfig, undefined);
    assert.equal(devProcessEnvironment({ XRB_CORE: f.core }).npm_config_userconfig, 'ambient-must-not-leak');
  } finally { if (previous === undefined) delete process.env.npm_config_userconfig; else process.env.npm_config_userconfig = previous; }
  assert.equal((await buildInventory(f.core)).fingerprint, before);
});

test('real browser shows normal compact tabs and mixed sections for embedded projects, with only Delete disabled', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await fixture(t);
  f.server.panel.publishers = { found: [{ dir: f.workspace, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [], status: async () => ({ state: 'unpublished', selectedUrl: '' }), publish: async () => ({ url: '' }), unpublish: async () => ({}) } }], problems: [] };
  await withBrowser(async ({ navigate, evaluate, send }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(f.server.url, `!!document.querySelector('.project-workflow-tabs')`);
    const until = async (expression: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); } assert.fail(expression); };
    await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').click()`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.project-workflow-tabs [role="tab"]'),x=>x.textContent)`), ['Develop', 'Publish', 'Build']);
    assert.equal(await evaluate(`!!document.querySelector('#bundled-run-settings, #bundled-copy, .bundled-sec')`), false);
    assert.equal(await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').draggable`), true);
    const geometry = await evaluate(`({height:document.querySelector('.project-hero').getBoundingClientRect().height,icon:document.querySelector('.project-hero .icon-btn').getBoundingClientRect().width})`);
    assert.equal(geometry.icon, 26); assert.ok(geometry.height < 500, JSON.stringify(geometry));
    await evaluate(`document.querySelector('#settings [data-choice="host:"]').click()`);
    for (let i = 0; i < 100 && (await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.target === 'webxr'; i++) await sleep(50);
    assert.notEqual((await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.target, 'webxr', 'normal platform controls persist effective settings');
    await evaluate(`document.querySelector('[data-surface="publish"]').click()`);
    await until(`!!document.querySelector('[name="publication.slug"]')`);
    for (let i = 0; i < 100 && !(await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication?.publisher; i++) await sleep(50);
    await sleep(350);
    await evaluate(`const slug=document.querySelector('[name="publication.slug"]');slug.value='browser-sample';slug.dispatchEvent(new Event('change',{bubbles:true}))`);
    for (let i = 0; i < 100 && (await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication?.slug !== 'browser-sample'; i++) await sleep(50);
    assert.equal((await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication.slug, 'browser-sample');
    assert.equal(JSON.parse(await fs.readFile(path.join(f.source, 'xrb-project.json'), 'utf8')).publication, undefined);
    await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:300}))`);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="delete"]').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="archive"]').hidden`), false);
    await evaluate(`document.querySelector('#ctx-menu [data-act="archive"]').click()`);
    await until(`document.querySelector('.proj[data-id="bundled:sample"]')===null`);
    await evaluate(`document.querySelector('.nav-tabs [data-view="archive"]').click()`);
    await until(`!!document.querySelector('.proj[data-id="bundled:archive/sample"]')`);
    await evaluate(`document.querySelector('.proj[data-id="bundled:archive/sample"]').click()`);
    await until(`!!document.querySelector('[data-surface="publish"]')`);
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1000, deviceScaleFactor: 1, mobile: false });
    assert.ok(await evaluate(`document.querySelector('.project-hero').getBoundingClientRect().width <= innerWidth`));
  });
});
