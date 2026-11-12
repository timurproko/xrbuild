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
  const stale = await f.save(previous.manifest, previous.manifestMtimeMs, previous.manifestRevision);
  assert.equal(stale.status, 409, 'content revision rejects stale edits even with identical Windows timestamps');
  assert.equal(stale.json.details.stale, 'manifest', 'clients may rebase only explicitly classified revision conflicts');
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

test('source updates automatically adopt current bytes, preserve personal state and keep pinned output across section relocation', async t => {
  const f = await fixture(t), raw = await f.bundled(), settings = await readProjectRunSettings(f.core, f.workspace, raw);
  await saveProjectRunSettings(f.core, f.workspace, raw, { display: 'desktop', inputs: ['keyboard'], flat: true, monitor: 2, fullscreen: true }, settings.revision);
  const effective = await prepareEmbeddedProject(f.core, f.workspace, f.projects, raw);
  assert.deepEqual(effective.manifest!.inputs, ['keyboard']); assert.equal(effective.runDefaults!.flat, true);
  const publication = { id: randomUUID(), enabled: true, publisher: 'fixture', slug: 'my-sample' };
  // Saving publication needs a registered adapter, but refresh never calls it or invents new identity.
  f.server.panel.publishers = { found: [{ dir: f.workspace, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [], status: async () => ({ state: 'unpublished', selectedUrl: '' }), publish: async () => ({ url: '' }), unpublish: async () => ({}) } }], problems: [] };
  assert.equal((await f.save({ ...effective.manifest!, name: 'Keep this edit', inputs: ['mouse'], publication })).status, 200);
  await f.write(path.join(effective.dir, 'recordings/session.jsonl'), 'user recording');
  await f.write(path.join(effective.dir, '.env.local'), 'user secret');
  const icon = defaultIcon(16, 'red'); assert.equal((await f.request('PUT', '/api/projects/bundled%3Asample/icon', icon)).status, 200);
  const built = await f.request('POST', '/api/projects/bundled%3Asample/build-web');
  assert.equal((await f.server.panel.jobs.wait(f.server.panel.jobs.get(built.json.id)!)).state, 'done');
  const previous = await effectiveProjectOutput(f.core, f.workspace, await f.bundled());
  await f.write(path.join(f.source, 'new-file.js'), 'export const updated = true;');
  await f.write(path.join(f.source, 'dist/index.html'), '<html><head></head><body>latest installed app</body></html>');
  const stateRoot = embeddedProjectRoot(f.core, f.workspace, f.projects, effective), stateBefore = await fs.readFile(path.join(stateRoot, 'state.json'), 'utf8');
  const visible = (await f.request('GET', '/api/projects/bundled%3Asample')).json;
  assert.equal(visible.sourceUpdate, undefined);
  assert.equal(await fs.readFile(path.join(stateRoot, 'state.json'), 'utf8'), stateBefore, 'browsing never refreshes');
  const retired = await f.request('POST', '/api/projects/bundled%3Asample/keep-working-sources', { revision: 'old', confirm: true });
  assert.equal(retired.status, 410); assert.equal(await fs.readFile(path.join(stateRoot, 'state.json'), 'utf8'), stateBefore);
  const updated = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.notEqual(updated.workingRoot, effective.workingRoot);
  assert.match(await fs.readFile(path.join(updated.dir, 'dist/index.html'), 'utf8'), /latest installed app/);
  assert.equal(await fs.readFile(path.join(updated.dir, 'new-file.js'), 'utf8'), 'export const updated = true;');
  assert.equal(updated.manifest!.name, 'Keep this edit'); assert.deepEqual(updated.manifest!.inputs, ['mouse']);
  assert.equal(updated.manifest!.publication!.id, publication.id); assert.equal(updated.runDefaults!.flat, true);
  assert.equal(updated.manifest!.plugins!.desktop.monitor, 2); assert.equal(updated.manifest!.plugins!.desktop.fullscreen, true);
  assert.equal(await fs.readFile(path.join(updated.dir, 'recordings/session.jsonl'), 'utf8'), 'user recording');
  assert.equal(await fs.readFile(path.join(updated.dir, '.env.local'), 'utf8'), 'user secret');
  assert.deepEqual(await fs.readFile(path.join(updated.dir, updated.manifest!.icon!)), icon);
  await fs.access(effective.dir); // previous generation is preserved, not cleaned
  await assert.rejects(effectiveProjectOutput(f.core, f.workspace, updated), /another project|sources changed/);
  assert.match((await f.request('GET', `/preview/bundled%3Asample/@${previous.generation}/`)).text, /fixture/);
  assert.equal((await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled())).dir, updated.dir, 'restarts do not refresh again');
  const other = path.join(f.root, 'other-projects'); await fs.mkdir(other);
  assert.equal((await discoverProjectCatalog(f.core, f.workspace, other)).projects.find(p => p.key === 'bundled:sample')!.project.manifest!.name, 'sample');
  assert.equal((await f.request('PUT', '/api/layout', { ...(await f.catalog()).layout, sections: [{ name: 'custom', items: ['bundled:sample', 'sample'] }] })).status, 200);
  await fs.rename(f.source, path.join(f.core, 'embedded/projects/archive/sample'));
  const relocated = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.equal(relocated.key, 'bundled:sample'); assert.equal(relocated.section, 'custom');
  assert.ok(relocated.dir.endsWith(path.join('projects/archive/sample')));
  assert.equal(relocated.manifest!.name, 'Keep this edit'); assert.equal(relocated.manifest!.publication!.id, publication.id);
  assert.match((await f.request('GET', `/preview/bundled%3Asample/@${previous.generation}/`)).text, /fixture/);
});

test('known baselines update additions and deletions, retain compatible edits and refuse real conflicts without changing state', async t => {
  const f = await fixture(t);
  for (const [name, value] of Object.entries({ 'upstream.txt': 'old', 'local.txt': 'base', 'same.txt': 'base', 'removed.txt': 'remove' })) await f.write(path.join(f.source, name), value);
  const p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await f.write(path.join(p.dir, 'local.txt'), 'my edit'); await f.write(path.join(p.dir, 'same.txt'), 'identical');
  await f.write(path.join(f.source, 'upstream.txt'), 'new'); await f.write(path.join(f.source, 'same.txt'), 'identical');
  await fs.unlink(path.join(f.source, 'removed.txt')); await f.write(path.join(f.source, 'added/nested.txt'), 'new file');
  const updated = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  for (const [name, value] of Object.entries({ 'upstream.txt': 'new', 'local.txt': 'my edit', 'same.txt': 'identical', 'added/nested.txt': 'new file' })) assert.equal(await fs.readFile(path.join(updated.dir, name), 'utf8'), value);
  await assert.rejects(fs.access(path.join(updated.dir, 'removed.txt')));
  await f.write(path.join(f.source, 'local.txt'), 'conflicting upstream');
  const record = path.join(embeddedProjectRoot(f.core, f.workspace, f.projects, updated), 'state.json'), before = await fs.readFile(record, 'utf8');
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /local.txt.*conflicting local changes/);
  assert.equal(await fs.readFile(record, 'utf8'), before); assert.equal(await fs.readFile(path.join(updated.dir, 'local.txt'), 'utf8'), 'my edit');
  // Resolve the genuine conflict to current installed content, then retry normally.
  await f.write(path.join(updated.dir, 'local.txt'), 'conflicting upstream');
  const resolved = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.equal(await fs.readFile(path.join(resolved.dir, 'local.txt'), 'utf8'), 'conflicting upstream');
});

test('legacy snapshots adopt current code and retain their complete previous tree and personal choices', async t => {
  const f = await fixture(t);
  const p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.equal((await f.save({ ...p.manifest!, name: 'My legacy name', inputs: ['keyboard'], host: { recordHands: 'session.jsonl' } })).status, 200);
  const record = path.join(embeddedProjectRoot(f.core, f.workspace, f.projects, p), 'state.json');
  const saved = JSON.parse(await fs.readFile(record, 'utf8')); saved.version = 1; delete saved.baseline; delete saved.outputKey;
  saved.inputs = '0'.repeat(64); // Old Keep sources could advance this without updating the generation marker.
  await fs.writeFile(record, JSON.stringify(saved));
  await f.write(path.join(p.dir, 'unknown-user-edit.txt'), 'must be retained');
  await f.write(path.join(p.dir, 'recordings/legacy.jsonl'), 'recording');
  await f.write(path.join(p.dir, 'session.jsonl'), 'named recording');
  await f.write(path.join(f.source, 'dist/index.html'), '<html><head></head><body>latest legacy upgrade</body></html>');
  const updated = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.equal(updated.manifest!.name, 'My legacy name'); assert.deepEqual(updated.manifest!.inputs, ['keyboard']);
  assert.match(await fs.readFile(path.join(updated.dir, 'dist/index.html'), 'utf8'), /latest legacy upgrade/);
  assert.equal(await fs.readFile(path.join(p.dir, 'unknown-user-edit.txt'), 'utf8'), 'must be retained');
  assert.equal(await fs.readFile(path.join(updated.dir, 'recordings/legacy.jsonl'), 'utf8'), 'recording');
  assert.equal(await fs.readFile(path.join(updated.dir, 'session.jsonl'), 'utf8'), 'named recording');
  const next = JSON.parse(await fs.readFile(record, 'utf8')); assert.equal(next.version, 2); assert.ok(next.previous.includes(saved.working));
  assert.equal((await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled())).dir, updated.dir);
  // Ambiguous legacy build/source declarations cannot be safely overwritten.
  next.version = 1; delete next.baseline; delete next.outputKey; await fs.writeFile(record, JSON.stringify(next));
  await f.write(path.join(updated.dir, 'xrb-project.json'), { ...updated.manifest, entry: 'custom-output' });
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /xrb-project.json:entry.*conflicting/);
  assert.equal(JSON.parse(await fs.readFile(record, 'utf8')).working, next.working);
});

test('shared SDK changes refresh working generations and settings saves rebase onto new source declarations', async t => {
  const f = await fixture(t), p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await f.write(path.join(f.core, 'packages/sdk/src/new.ts'), 'export const current = true;');
  const updated = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.notEqual(updated.dir, p.dir, 'shared inputs invalidate the installed-input baseline');
  await f.write(path.join(f.source, 'xrb-project.json'), { ...updated.manifest, entry: 'site' });
  await f.write(path.join(f.source, 'site/index.html'), '<html><head></head><body>new entry</body></html>');
  const saved = await f.save({ ...updated.manifest!, name: 'Rename during update' });
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.manifest.entry, 'site');
  assert.equal(saved.json.manifest.name, 'Rename during update');
});

test('source update revalidates concurrent input edits and rejects unsafe links without losing the previous generation', async t => {
  const f = await fixture(t); await f.write(path.join(f.source, 'source.txt'), 'base');
  const p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await f.write(path.join(f.source, 'source.txt'), 'latest');
  const record = path.join(embeddedProjectRoot(f.core, f.workspace, f.projects, p), 'state.json'), before = await fs.readFile(record, 'utf8');
  const copy = fs.copyFile; let injected = false;
  fs.copyFile = async (from, to, ...rest) => {
    await copy(from, to, ...rest);
    if (!injected && String(from) === path.join(f.source, 'source.txt')) { injected = true; await f.write(path.join(p.dir, 'new-concurrent-edit.txt'), 'local edit'); }
  };
  try { await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /changed during update/); }
  finally { fs.copyFile = copy; }
  assert.ok(injected); assert.equal(await fs.readFile(record, 'utf8'), before);
  assert.equal(await fs.readFile(path.join(p.dir, 'new-concurrent-edit.txt'), 'utf8'), 'local edit');
  await fs.link(path.join(p.dir, 'source.txt'), path.join(p.dir, 'linked.txt'));
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /link/);
  assert.equal(await fs.readFile(record, 'utf8'), before);
});

test('directory replacements update safely and upstream directory deletion cannot discard a new local file', async t => {
  const f = await fixture(t);
  await f.write(path.join(f.source, 'switch'), 'old file'); await f.write(path.join(f.source, 'removed-dir/original.txt'), 'base');
  const p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await fs.unlink(path.join(f.source, 'switch')); await f.write(path.join(f.source, 'switch/child.txt'), 'now a directory');
  const updated = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  assert.equal(await fs.readFile(path.join(updated.dir, 'switch/child.txt'), 'utf8'), 'now a directory');
  await f.write(path.join(updated.dir, 'removed-dir/local.txt'), 'local addition');
  await fs.rm(path.join(f.source, 'removed-dir'), { recursive: true });
  const state = path.join(embeddedProjectRoot(f.core, f.workspace, f.projects, p), 'state.json'), before = await fs.readFile(state, 'utf8');
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /removed-dir.*conflicting/);
  assert.equal(await fs.readFile(state, 'utf8'), before); assert.equal(await fs.readFile(path.join(updated.dir, 'removed-dir/local.txt'), 'utf8'), 'local addition');
});

test('source updates detect new personal files appearing after preservation and corrupt source baselines', async t => {
  const f = await fixture(t), p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await f.write(path.join(f.source, 'new.txt'), 'latest');
  const state = path.join(embeddedProjectRoot(f.core, f.workspace, f.projects, p), 'state.json'), before = await fs.readFile(state, 'utf8');
  const write = fs.writeFile; let injected = false;
  fs.writeFile = async (file, ...args) => {
    await write(file, ...args);
    if (!injected && String(file).endsWith('source-baseline.json')) { injected = true; await f.write(path.join(p.dir, 'recordings/new.jsonl'), 'new recording'); }
  };
  try { await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /Personal files changed/); }
  finally { fs.writeFile = write; }
  assert.ok(injected); assert.equal(await fs.readFile(state, 'utf8'), before);
  assert.equal(await fs.readFile(path.join(p.dir, 'recordings/new.jsonl'), 'utf8'), 'new recording');
  const baseline = path.join(path.dirname(p.workingRoot!), 'source-baseline.json');
  await fs.writeFile(baseline, '{}');
  assert.match((await f.bundled()).stateProblem!, /baseline/);
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /baseline/);
  assert.equal(await fs.readFile(baseline, 'utf8'), '{}'); assert.equal(await fs.readFile(state, 'utf8'), before);
});

test('refresh refuses interrupted or foreign generation markers and changed isolated manager configuration', async t => {
  const f = await fixture(t), p = await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  const work = path.dirname(p.workingRoot!), marker = path.join(work, '.xrb-working.json');
  const original = await fs.readFile(marker, 'utf8'), record = path.join(embeddedProjectRoot(f.core, f.workspace, f.projects, p), 'state.json'), before = await fs.readFile(record, 'utf8');
  await f.write(path.join(f.source, 'new.txt'), 'latest');
  for (const changed of [{ ...JSON.parse(original), status: 'working' }, { ...JSON.parse(original), workspace: f.workspace }]) {
    await fs.writeFile(marker, JSON.stringify(changed));
    await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /incomplete|another project/);
    assert.equal(await fs.readFile(record, 'utf8'), before);
  }
  await fs.writeFile(marker, original);
  await fs.writeFile(path.join(work, 'user.npmrc'), 'unexpected configuration');
  await assert.rejects(prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled()), /configuration changed/);
  assert.equal(await fs.readFile(record, 'utf8'), before);
  assert.equal(await fs.readFile(path.join(work, 'user.npmrc'), 'utf8'), 'unexpected configuration');
});

test('icon jobs and independent copies consume newly installed source rather than old working files', async t => {
  const f = await fixture(t);
  await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await f.write(path.join(f.core, 'native/host/build/Release/xrb-host.exe'), 'synthetic host; rendering is intercepted');
  await f.write(path.join(f.source, 'dist/index.html'), '<html><head></head><body>current icon input</body></html>');
  let rendered = false;
  const start = f.server.panel.jobs.start.bind(f.server.panel.jobs);
  f.server.panel.jobs.start = (kind, id, title, body, ...rest) => start(kind, id, title, ctx => body({ ...ctx, async run(_command, args) {
    const app = args[args.indexOf('--app') + 1], output = args[args.indexOf('--out') + 1];
    assert.match(await fs.readFile(path.join(app, 'index.html'), 'utf8'), /current icon input/);
    await fs.writeFile(output, defaultIcon(16, 'green')); rendered = true;
  } }), ...rest);
  const job = f.server.panel.renderIcon(await f.bundled()), done = await f.server.panel.jobs.wait(job);
  assert.equal(done.state, 'done', done.error ?? ''); assert.ok(rendered);
  await f.write(path.join(f.source, 'new-copy.txt'), 'current copy source');
  const copy = await f.request('POST', '/api/projects/bundled%3Asample/copy', { folder: 'latest-copy' });
  assert.equal(copy.status, 201, copy.text);
  assert.equal(await fs.readFile(path.join(f.projects, 'projects/unsorted/latest-copy/new-copy.txt'), 'utf8'), 'current copy source');
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

test('embedded publication and web packaging refresh installed sources and use neutral finalized inputs', async t => {
  const f = await fixture(t);
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
  await f.write(path.join(f.source, 'dist/index.html'), '<html><head></head><body>current publication source</body></html>');
  response = await f.request('POST', '/api/projects/bundled%3Asample/publish', {});
  assert.equal(response.status, 202, response.text);
  let done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'done', done.error ?? '');
  assert.match(published, /r-[a-zA-Z0-9]{6}[\\/]out$/); assert.match(await fs.readFile(path.join(published, 'index.html'), 'utf8'), /current publication source/);
  await f.write(path.join(f.source, 'dist/index.html'), '<html><head></head><body>current package source</body></html>');
  const before = (await buildInventory(f.core)).fingerprint;
  response = await f.request('POST', '/api/projects/bundled%3Asample/package', {});
  assert.equal(response.status, 202, response.text);
  done = await f.server.panel.jobs.wait(f.server.panel.jobs.get(response.json.id)!); assert.equal(done.state, 'done', done.error ?? '');
  assert.match(packaged, /package-inputs/); assert.match(await fs.readFile(path.join(packaged, 'index.html'), 'utf8'), /current package source/);
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
    await f.write(path.join(f.source, 'dist/index.html'), '<html><head></head><body>latest native source</body></html>');
    const currentRun = await f.request('POST', '/api/projects/bundled%3Asample/run', { mode: 'built' });
    assert.equal(currentRun.status, 200, currentRun.text);
    assert.match(await fs.readFile(path.join(launched.entryDir, 'index.html'), 'utf8'), /latest native source/);
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
  await f.write(path.join(f.source, 'new-after-pull.js'), 'export const newest = true;');
  const refreshedPreview = await f.request('POST', '/api/projects/bundled%3Asample/preview', { mode: 'dev' });
  assert.equal(refreshedPreview.status, 200, refreshedPreview.text);
  assert.notEqual(dev.request.projectDir, p.dir);
  assert.equal(await fs.readFile(path.join(dev.request.projectDir, 'new-after-pull.js'), 'utf8'), 'export const newest = true;');
  assert.equal(await fs.readFile(path.join(dev.request.projectDir, 'src.txt'), 'utf8'), 'fail', 'compatible user source edits remain active');
});

test('Apps UI has no routine source-update explanation or acknowledgement control', async () => {
  const app = await fs.readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /sourceUpdate|keep-working-sources|Keep my working sources|Installed sources changed/);
  assert.match(app, /project-workflow-tabs/);
});

test('real browser shows normal embedded workflows after an installed update without source-review UI', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await fixture(t);
  await prepareEmbeddedProject(f.core, f.workspace, f.projects, await f.bundled());
  await f.write(path.join(f.source, 'new-after-pull.js'), 'new installed browser input');
  f.server.panel.publishers = { found: [{ dir: f.workspace, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [], status: async () => ({ state: 'unpublished', selectedUrl: '' }), publish: async () => ({ url: '' }), unpublish: async () => ({}) } }], problems: [] };
  await withBrowser(async ({ navigate, evaluate, send }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(f.server.url, `!!document.querySelector('.project-workflow-tabs')`);
    const until = async (expression: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); } assert.fail(expression); };
    await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').click()`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.project-workflow-tabs [role="tab"]'),x=>x.textContent)`), ['Develop', 'Publish', 'Build']);
    assert.equal(await evaluate(`!!document.querySelector('#bundled-run-settings, #bundled-copy, .bundled-sec, #keep-working-sources')`), false);
    assert.equal(await evaluate(`document.querySelector('.project-hero').textContent.includes('Installed sources changed')`), false);
    assert.equal(await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').draggable`), true);
    const geometry = await evaluate(`({height:document.querySelector('.project-hero').getBoundingClientRect().height,icon:document.querySelector('.project-hero .icon-btn').getBoundingClientRect().width})`);
    assert.equal(geometry.icon, 26); assert.ok(geometry.height < 500, JSON.stringify(geometry));
    await evaluate(`document.querySelector('#settings [data-choice="host:"]').click()`);
    for (let i = 0; i < 100 && (await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.target === 'webxr'; i++) await sleep(50);
    assert.notEqual((await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.target, 'webxr', 'normal platform controls persist effective settings');
    // The API write can finish before the browser's platform-save continuation.
    // Reload persisted settings before testing the separate publisher-selection action.
    await navigate(f.server.url, `!!document.querySelector('.proj[data-id="bundled:sample"]')`);
    await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').click()`);
    await evaluate(`document.querySelector('[data-surface="publish"]').click()`);
    await until(`!!document.querySelector('[name="publication.slug"]')`);
    for (let i = 0; i < 100 && !(await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication?.publisher; i++) await sleep(50);
    await sleep(350);
    const initialPublication = (await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication;
    assert.ok(initialPublication, await evaluate(`document.body.innerText`));
    assert.equal(initialPublication.slug, 'sample', 'automatic publisher selection never persists the bundled namespace in the slug');
    assert.equal(await evaluate(`document.querySelector('[name="publication.slug"]').value`), 'sample');
    await evaluate(`const slug=document.querySelector('[name="publication.slug"]');slug.value='browser-sample';slug.dispatchEvent(new Event('change',{bubbles:true}))`);
    for (let i = 0; i < 100 && (await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication?.slug !== 'browser-sample'; i++) await sleep(50);
    assert.equal((await f.request('GET', '/api/projects/bundled%3Asample')).json.manifest.publication.slug, 'browser-sample');
    assert.equal(JSON.parse(await fs.readFile(path.join(f.source, 'xrb-project.json'), 'utf8')).publication, undefined);
    await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:300}))`);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="delete"]').hidden`), true);
    assert.equal(await evaluate(`!!document.querySelector('#ctx-menu [data-act="cache"], #bundled-cache-review, #bundled-cache-content, [data-cache-close]')`), false);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('dialog')).some(dialog => dialog.textContent.includes('Build cache'))`), false);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="archive"]').hidden`), false);
    await evaluate(`document.querySelector('.proj[data-id="sample"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:400}))`);
    assert.deepEqual(await evaluate(`(() => { const button = document.querySelector('#ctx-menu [data-act="delete"]'); return { hidden: button.hidden, disabled: button.disabled, tooltip: button.dataset.tooltip ?? '' }; })()`), { hidden: false, disabled: false, tooltip: '' });
    assert.equal(await evaluate(`!!document.querySelector('#ctx-menu [data-act="cache"]')`), false);
    await evaluate(`document.querySelector('.proj[data-id="bundled:sample"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:300}))`);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="delete"]').hidden`), true);
    await evaluate(`document.querySelector('#ctx-menu [data-act="archive"]').click()`);
    await until(`document.querySelector('.proj[data-id="bundled:sample"]')===null`);
    await evaluate(`document.querySelector('.nav-tabs [data-view="archive"]').click()`);
    await until(`!!document.querySelector('.proj[data-id="bundled:archive/sample"]')`);
    await evaluate(`document.querySelector('.proj[data-id="bundled:archive/sample"]').click()`);
    await until(`document.querySelector('[name="publication.slug"]')?.value === 'browser-sample'`);
    assert.equal((await f.request('GET', '/api/projects/bundled%3Aarchive/sample')).json.manifest.publication.slug, 'browser-sample', 'archive does not rewrite an explicit slug');
    await evaluate(`document.querySelector('.proj[data-id="bundled:archive/sample"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:300}))`);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="delete"]').hidden`), true);
    assert.equal(await evaluate(`!!document.querySelector('#ctx-menu [data-act="cache"]')`), false);
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="archive"]').textContent`), 'Unarchive');
    assert.equal(await evaluate(`document.querySelector('#ctx-menu [data-act="archive"]').hidden`), false);
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1000, deviceScaleFactor: 1, mobile: false });
    assert.ok(await evaluate(`document.querySelector('.project-hero').getBoundingClientRect().width <= innerWidth`));
  });
});
