import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { discoverPublishers, publicationUrl } from '../src/publishers.ts';
import { newPublicationId, normalizePublicationSlug, publicationProblems, verifyBuildReceipt, writeBuildReceipt } from '../src/publication.ts';
const roots: string[] = [];
async function root() { const r = await mkdtemp(path.join(os.tmpdir(), 'xrb-pub-')); roots.push(r); return r; }
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
async function plugin(workspace: string, name: string, body: string, declaration: unknown = './publisher.mjs') {
  const dir = path.join(workspace, 'plugins', name); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: name, type: 'publisher', version: '0.1.0' }));
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, xrBuild: { publisher: declaration } })); await writeFile(path.join(dir, 'publisher.mjs'), body);
}
const valid = (name = 'web') => `export const publisher={name:'${name}',label:'Example host',origin:'https://example.test',routePrefix:'apps',validate(){return []},async status(){return {state:'unpublished',selectedUrl:''}},async publish(){return {}},async unpublish(){return {}}}`;
describe('publisher discovery', () => {
  it('discovers enabled workspace publishers and builds named and root routes', async () => { const w = await root(); await plugin(w, 'one', valid()); const d = await discoverPublishers(w); assert.deepEqual(d.problems, []); assert.deepEqual(d.found.map((x) => [x.publisher.name, x.publisher.label]), [['web', 'Example host']]); assert.equal(publicationUrl(d.found[0]!.publisher, 'demo'), 'https://example.test/apps/demo/'); assert.equal(publicationUrl(d.found[0]!.publisher, ''), 'https://example.test/apps/'); });
  it('reports malformed and duplicate declarations', async () => { const w = await root(); await plugin(w, 'one', valid()); await plugin(w, 'two', valid()); await plugin(w, 'bad', valid('bad'), 4); const d = await discoverPublishers(w); assert.equal(d.found.length, 1); assert.match(d.problems.join('\n'), /must be a module path|already loaded/); });
  it('ignores disabled plugins', async () => { const w = await root(); await plugin(w, 'one', valid()); await writeFile(path.join(w, 'xrb-plugins.json'), JSON.stringify({ disabled: ['one'] })); assert.equal((await discoverPublishers(w)).found.length, 0); });
  it('one publisher plugin structurally controls multiple destinations', async () => {
    const w = await root(), dir = path.join(w, 'plugins', 'webxr'); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ xrBuild: { publishers: [{ module: './local.mjs', setting: 'localhost' }, { module: './production.mjs', setting: 'production' }] } }));
    await writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: 'WebXR', type: 'publisher', version: '0.1.0', settings: [{ key: 'localhost', label: 'Localhost', type: 'boolean', default: true }, { key: 'production', label: 'Production', type: 'boolean', default: true }] }));
    await writeFile(path.join(dir, 'local.mjs'), valid('local-test')); await writeFile(path.join(dir, 'production.mjs'), valid('production-web'));
    assert.deepEqual((await discoverPublishers(w)).found.map((item) => item.publisher.name), ['local-test', 'production-web']);
    await writeFile(path.join(w, 'xrb-plugins.json'), JSON.stringify({ disabled: [], settings: { webxr: { localhost: true, production: false } } }));
    assert.deepEqual((await discoverPublishers(w)).found.map((item) => item.publisher.name), ['local-test']);
  });
});
describe('publication identity', () => {
  it('normalizes slugs, accepts the publisher root and creates stable IDs', () => { assert.equal(normalizePublicationSlug(' Demo-App '), 'demo-app'); assert.deepEqual(publicationProblems({ enabled: true, publisher: 'web', id: newPublicationId(), slug: '', routes: { web: '' } }), []); assert.match(newPublicationId(), /^[0-9a-f-]{36}$/); });
  for (const slug of ['../x', 'a/b', '-bad', 'bad-', 'two--dashes', 'UPPER']) it(`rejects invalid slug ${slug}`, () => { assert.notDeepEqual(publicationProblems({ enabled: true, publisher: 'web', id: newPublicationId(), slug }), []); });
});
describe('build receipts', () => {
  it('survives restart and rejects changed output or another checkout', async () => { const w = await root(), app = path.join(w, 'dist'); await mkdir(app); await writeFile(path.join(app, 'index.html'), 'one'); await writeBuildReceipt(w, 'p', 10, app); assert.equal((await verifyBuildReceipt(w, 'p', 10, app)).files, 1); const other = await root(), otherApp = path.join(other, 'dist'); await mkdir(otherApp); await writeFile(path.join(otherApp, 'index.html'), 'one'); await assert.rejects(verifyBuildReceipt(w, 'p', 10, otherApp), /settings changed/); await writeFile(path.join(app, 'index.html'), 'two'); await assert.rejects(verifyBuildReceipt(w, 'p', 10, app), /changed after Build/); });
  it('rejects setting changes and links', async (t) => { const w = await root(), app = path.join(w, 'dist'); await mkdir(app); await writeFile(path.join(app, 'index.html'), 'one'); await writeBuildReceipt(w, 'p', 10, app); await assert.rejects(verifyBuildReceipt(w, 'p', 11, app), /settings changed/); try { await symlink(path.join(app, 'index.html'), path.join(app, 'link')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') return t.skip('symlink privilege unavailable'); throw error; } await assert.rejects(writeBuildReceipt(w, 'p2', 10, app), /contains a link/); });
  it('invalidates a legacy context-bearing receipt once and keeps new receipts context-free', async () => { const w = await root(), app = path.join(w, 'dist'), legacy = { distributionChoice: 'host:', cameraProjection: 'orthographic' }; await mkdir(app); await writeFile(path.join(app, 'index.html'), 'one'); await writeBuildReceipt(w, 'p', 10, app, legacy); await assert.rejects(verifyBuildReceipt(w, 'p', 10, app), /build context changed/); const receipt = await writeBuildReceipt(w, 'p', 10, app); assert.equal(receipt.context, undefined); assert.equal((await verifyBuildReceipt(w, 'p', 10, app)).context, undefined); });
});
