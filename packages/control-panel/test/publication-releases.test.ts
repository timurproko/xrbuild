import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { freePort } from '../src/host-runner.ts';
import { launch, type PanelServer } from '../src/server.ts';
import { normalizeReleaseCatalog, releaseCapabilityProblem } from '../src/publishers.ts';
import { compareVersions, highestVersion, publicationProblems, suggestedVersion, versionProblem } from '../src/publication.ts';

let repo: string;
let port: number;
let panel: PanelServer;
const ID = '11111111-1111-4111-8111-111111111111';

async function write(rel: string, data: string) {
  await fs.mkdir(path.dirname(path.join(repo, rel)), { recursive: true });
  await fs.writeFile(path.join(repo, rel), data);
}
function request(method: string, urlPath: string, body?: unknown) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined) headers['content-type'] = 'application/json';
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let json: any = null; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ } resolve({ status: res.statusCode ?? 0, json }); });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
const waitJob = async (id: number) => panel.panel.jobs.wait(panel.panel.jobs.get(id)!);
const state = () => fs.readFile(path.join(repo, 'plugins/releases/state.json'), 'utf8').then(JSON.parse);
const buildCount = () => fs.readFile(path.join(repo, 'projects/Apps/versioned/builds.txt'), 'utf8').then((text) => text.length, () => 0);

/**
 * A release-capable fixture publisher: an in-memory-like catalog persisted to state.json, a revision derived from
 * its content and a verified live marker. It records every operation so tests can see what the panel asked for.
 */
const RELEASE_PUBLISHER = `import fs from 'node:fs/promises'; import path from 'node:path'; import {createHash} from 'node:crypto'; import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const file=path.join(here,'state.json');
const read=async()=>JSON.parse(await fs.readFile(file,'utf8').catch(()=>'{"releases":[],"live":null,"requested":null,"calls":[],"legacy":false}'));
const save=(s)=>fs.writeFile(file,JSON.stringify(s));
const revision=(s)=>createHash('sha256').update(JSON.stringify([s.releases,s.live,s.requested])).digest('hex').slice(0,16);
const url=(slug)=>'https://releases.example.test/apps/'+slug+'/';
export const publisher={name:'release-fixture',origin:'https://releases.example.test',routePrefix:'apps',validate(){return []},
 async status(p){const s=await read();const live=s.live!==null||s.legacy;return {state:live?'published':'unpublished',selectedUrl:url(p.slug),deployedUrl:live?url(p.slug):undefined,deployedSlug:live?p.slug:undefined}},
 async publish(){throw new Error('legacy publish must not be used for a release-capable publisher')},
 async unpublish(o){const s=await read();s.live=null;s.legacy=false;s.requested=null;s.calls.push(['unpublish']);await save(s);o.log('unpublished');return {}},
 releases:{
  async catalog(){const s=await read();return {revision:revision(s),releases:s.releases.map(r=>({releaseId:r.releaseId,version:r.version,digest:r.digest,createdMs:r.createdMs})),requestedReleaseId:s.requested,liveReleaseId:s.live,legacyLive:s.legacy&&s.live===null}},
  async publish(o){const s=await read();if(o.expectedRevision!==revision(s))throw new Error('stale release decision');const html=await fs.readFile(path.join(o.app,'index.html'),'utf8');const digest=createHash('sha256').update(html).digest('hex');const releaseId='rel-'+(s.releases.length+1);s.releases.push({releaseId,version:o.version,digest,createdMs:Date.now(),html});s.requested=releaseId;s.live=releaseId;s.legacy=false;s.calls.push(['publish',o.publication.id,o.publication.slug,o.version,o.expectedRevision,o.card]);await save(s);o.log('released '+o.version);return {url:url(o.publication.slug),releaseId,version:o.version}},
  async activate(o){const s=await read();if(o.expectedRevision!==revision(s))throw new Error('stale release decision');const r=s.releases.find(r=>r.releaseId===o.releaseId);if(!r)throw new Error('unknown release');s.requested=r.releaseId;s.live=r.releaseId;s.calls.push(['activate',o.publication.id,o.publication.slug,o.releaseId,o.expectedRevision]);await save(s);o.log('activated');return {url:url(o.publication.slug),releaseId:r.releaseId,version:r.version}},
  async delete(o){const s=await read();if(o.expectedRevision!==revision(s))throw new Error('stale release decision');const r=s.releases.find(r=>r.releaseId===o.releaseId);if(!r)throw new Error('unknown release');if(s.live===r.releaseId||s.requested===r.releaseId)throw new Error('release is deployed');s.releases=s.releases.filter(x=>x.releaseId!==o.releaseId);s.calls.push(['delete',o.publication.id,o.publication.slug,o.releaseId,o.expectedRevision]);await save(s);o.log('deleted');return {}},
 }};`;

before(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-releases-'));
  const manifest = { name: 'Versioned', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' }, platform: 'station', plugins: { station: { id: 'com.example.versioned', title: 'Versioned', version: '7.7.7' } },
    publication: { enabled: true, publisher: 'release-fixture', id: ID, slug: 'versioned' } };
  await write('projects/Apps/versioned/xrb-project.json', JSON.stringify(manifest));
  await write('projects/Apps/versioned/package.json', JSON.stringify({ scripts: { build: 'node build.mjs' } }));
  await write('projects/Apps/versioned/build.mjs', `import fs from 'node:fs/promises'; await fs.mkdir('dist',{recursive:true}); await fs.appendFile('builds.txt','x'); const n=(await fs.readFile('builds.txt','utf8')).length; await fs.writeFile('dist/index.html','<h1>build '+n+'</h1>');`);
  await write('projects/Apps/legacy/xrb-project.json', JSON.stringify({ name: 'Legacy', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' }, publication: { enabled: true, publisher: 'legacy-fixture', id: '22222222-2222-4222-8222-222222222222', slug: 'legacy' } }));
  await write('projects/Apps/legacy/package.json', JSON.stringify({ scripts: { build: 'node build.mjs' } }));
  await write('projects/Apps/legacy/build.mjs', `import fs from 'node:fs/promises'; await fs.mkdir('dist',{recursive:true}); await fs.writeFile('dist/index.html','<h1>legacy</h1>');`);
  await write('projects/Tests/check/xrb-project.json', JSON.stringify({ name: 'Check', kind: 'test', entry: '.' }));
  await write('projects/Tests/check/index.html', 'check');
  await write('plugins/releases/xrb-plugin.json', JSON.stringify({ title: 'Releases', type: 'publisher', version: '0.1.0' }));
  await write('plugins/releases/package.json', JSON.stringify({ name: 'releases', xrBuild: { publisher: './publisher.mjs' } }));
  await write('plugins/releases/publisher.mjs', RELEASE_PUBLISHER);
  await write('plugins/legacy/xrb-plugin.json', JSON.stringify({ title: 'Legacy', type: 'publisher', version: '0.1.0' }));
  await write('plugins/legacy/package.json', JSON.stringify({ name: 'legacy', xrBuild: { publisher: './publisher.mjs' } }));
  await write('plugins/legacy/publisher.mjs', `export const publisher={name:'legacy-fixture',origin:'https://legacy.example.test',routePrefix:'apps',validate(){return []},async status(p){return {state:'unpublished',selectedUrl:'https://legacy.example.test/apps/'+p.slug+'/'}},async publish(o){o.log('legacy publish');return {url:'https://legacy.example.test/apps/'+o.publication.slug+'/'}},async unpublish(){return {}}};`);
  await write('plugins/incomplete/xrb-plugin.json', JSON.stringify({ title: 'Incomplete', type: 'publisher', version: '0.1.0' }));
  await write('plugins/incomplete/package.json', JSON.stringify({ name: 'incomplete', xrBuild: { publisher: './publisher.mjs' } }));
  await write('plugins/incomplete/publisher.mjs', `export const publisher={name:'incomplete-fixture',origin:'https://incomplete.example.test',validate(){return []},async status(){return {state:'unpublished',selectedUrl:''}},async publish(){return {}},async unpublish(){return {}},releases:{async catalog(){return {revision:'1',releases:[]}}}};`);
  port = await freePort();
  // These fixtures own the publisher inventory; do not inherit the installed public publishers.
  const r = await launch({ port, open: false, repo, workspace: repo });
  assert.equal(r.result, 'started');
  panel = r.server!;
  panel.panel.awaitPublicationStatus = true;
  panel.panel.publicationStatusMaxAgeMs = 0;
});

after(async () => { await panel.close(); await fs.rm(repo, { recursive: true, force: true }); });

test('release capability validation: legacy publishers load unchanged, incomplete declarations are reported', () => {
  assert.deepEqual(panel.panel.publishers.found.map((f) => f.publisher.name).sort(), ['legacy-fixture', 'release-fixture']);
  assert.match(panel.panel.publishers.problems.join('\n'), /incomplete-fixture: releases capability is incomplete: missing publish, activate, delete/);
  assert.equal(releaseCapabilityProblem({}), null);
  assert.equal(releaseCapabilityProblem({ releases: 4 }), 'releases must be an object with catalog, publish, activate and delete');
  assert.throws(() => normalizeReleaseCatalog({ revision: 'r', releases: [{ releaseId: '../x', version: '1.0.0', digest: 'a'.repeat(64), createdMs: 1 }] }), /malformed/);
  assert.throws(() => normalizeReleaseCatalog({ revision: 'r', releases: [{ releaseId: 'a', version: '1.0', digest: 'a'.repeat(64), createdMs: 1 }] }), /malformed/);
  assert.throws(() => normalizeReleaseCatalog({ revision: 'r', releases: [], liveReleaseId: 'ghost' }), /unknown release/);
  assert.throws(() => normalizeReleaseCatalog({ revision: '', releases: [] }), /malformed/);
  const ok = normalizeReleaseCatalog({ revision: 'r1', releases: [{ releaseId: 'a', version: null, digest: 'b'.repeat(64), createdMs: 5 }], liveReleaseId: 'a' });
  assert.deepEqual(ok, { revision: 'r1', releases: [{ releaseId: 'a', version: null, digest: 'b'.repeat(64), createdMs: 5 }], requestedReleaseId: null, liveReleaseId: 'a', legacyLive: false });
  assert.equal(normalizeReleaseCatalog({ revision: 'r1', releases: [{ releaseId: 'a', version: '1.0.0', digest: 'b'.repeat(64), createdMs: 5, url: 'https://example.test/.xrb-releases/x/a/' }] }).releases[0]!.url, 'https://example.test/.xrb-releases/x/a/', 'a preview URL is kept');
  assert.throws(() => normalizeReleaseCatalog({ revision: 'r1', releases: [{ releaseId: 'a', version: '1.0.0', digest: 'b'.repeat(64), createdMs: 5, url: 'http://insecure.test/' }] }), /malformed/, 'only HTTPS preview URLs are accepted');
});

test('publication versions are stable three-part versions scoped to a publisher, independent of package versions', () => {
  assert.equal(versionProblem('0.1.0'), null);
  for (const bad of ['1.0', 'v1.0.0', '1.0.0-beta', '1.0.0.0', '', 7]) assert.ok(versionProblem(bad), `rejects ${String(bad)}`);
  assert.equal(compareVersions('1.2.10', '1.2.9'), 1);
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(highestVersion([null, '0.1.0', '0.3.0', '0.2.5']), '0.3.0');
  assert.equal(suggestedVersion([]), '0.1.0');
  assert.equal(suggestedVersion([null]), '0.1.0', 'a legacy release is not an invented version');
  assert.equal(suggestedVersion(['0.3.0', '0.1.0']), '0.3.1', 'the highest retained version wins even when an older one is live');
  const base = { enabled: true, publisher: 'web', id: ID, slug: 'demo' };
  assert.deepEqual(publicationProblems({ ...base, versions: { web: '1.2.3' } }), []);
  assert.match(publicationProblems({ ...base, versions: { web: '1.2' } })[0]!.message, /three-part/);
  assert.match(publicationProblems({ ...base, versions: { 'Bad Name': '1.2.3' } })[0]!.message, /publisher name/);
  assert.match(publicationProblems({ ...base, versions: [] })[0]!.message, /must map/);
});

test('release listing, versioned publish and update carry immutable validated decisions through publication jobs', async () => {
  const initial = (await request('GET', '/api/projects/versioned')).json;
  assert.equal(initial.publication.publishers.find((item: { name: string }) => item.name === 'release-fixture').releases, true);
  assert.equal(initial.publication.publishers.find((item: { name: string }) => item.name === 'legacy-fixture').releases, false);
  assert.deepEqual(initial.publication.releases.catalog.releases, []);
  assert.equal(initial.publication.releases.nextVersion, '0.1.0');
  assert.equal(initial.publication.status.state, 'unpublished');
  const revision = initial.publication.releases.catalog.revision;

  assert.equal((await request('POST', '/api/projects/versioned/publish', {})).status, 400, 'a release-capable publisher needs a version');
  assert.equal((await request('POST', '/api/projects/versioned/publish', { version: '1.0' })).status, 400);
  const stale = await request('POST', '/api/projects/versioned/publish', { version: '0.1.0', expectedRevision: 'not-current' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.details.stale, 'release-catalog');
  assert.equal((await request('POST', '/api/projects/check/publish', { version: '0.1.0' })).status, 409, 'non-app projects cannot publish');
  assert.equal((await request('POST', '/api/projects/legacy/publish', { version: '0.1.0' })).status, 409, 'a legacy publisher receives no versioned request');
  const legacy = await request('POST', '/api/projects/legacy/publish', {});
  assert.equal(legacy.status, 202);
  assert.equal(legacy.json.operation, 'publish');
  assert.equal(legacy.json.release, null);
  assert.equal((await waitJob(legacy.json.id)).state, 'done', 'legacy publishers keep their unversioned workflow');

  const first = await request('POST', '/api/projects/versioned/publish', { version: '0.1.0', expectedRevision: revision });
  assert.equal(first.status, 202);
  assert.equal(first.json.operation, 'publish', 'no deployment yet: Publish');
  assert.deepEqual(first.json.release, { version: '0.1.0', expectedRevision: revision });
  assert.deepEqual(first.json.publication.versions, undefined);
  const firstJob = await waitJob(first.json.id);
  assert.equal(firstJob.state, 'done', firstJob.error ?? '');
  assert.deepEqual((firstJob.result as { releaseId: string; version: string }).version, '0.1.0');
  assert.equal(await buildCount(), 1);
  let s = await state();
  const card = { name: 'Versioned', description: '', icon: { default: true, color: 'blue', shape: 'sphere', model: false } };
  assert.deepEqual(s.calls.filter((c: unknown[]) => c[0] === 'publish'), [['publish', ID, 'versioned', '0.1.0', revision, card]], 'the publisher gets the identity, version, validated revision and the launcher card');
  assert.deepEqual(initial.card, card, 'the project API carries the same card contract for local previews');

  const after1 = (await request('GET', '/api/projects/versioned')).json;
  assert.equal(after1.publication.status.state, 'published');
  assert.equal(after1.publication.releases.catalog.liveReleaseId, 'rel-1');
  assert.equal(after1.publication.releases.nextVersion, '0.1.1', 'success suggests the next patch');
  assert.deepEqual(after1.manifest.plugins.station, { id: 'com.example.versioned', title: 'Versioned', version: '7.7.7' }, 'package settings stay independent');
  assert.equal((await request('POST', '/api/projects/versioned/publish', { version: '0.1.0' })).status, 409, 'a retained version cannot be reused');
  assert.equal((await request('POST', '/api/projects/versioned/publish', { version: '0.0.9' })).status, 409, 'a lower version is refused');

  // A saved draft is remembered per publisher and shown while it still exceeds retained history.
  const drafted = await request('PUT', '/api/projects/versioned/manifest', { manifest: { ...after1.manifest, publication: { ...after1.manifest.publication, versions: { 'release-fixture': '0.2.0' } } }, mtimeMs: after1.manifestMtimeMs });
  assert.equal(drafted.status, 200);
  assert.equal(drafted.json.publication.releases.nextVersion, '0.2.0');
  const badDraft = await request('PUT', '/api/projects/versioned/manifest', { manifest: { ...drafted.json.manifest, publication: { ...drafted.json.manifest.publication, versions: { 'release-fixture': 'two' } } }, mtimeMs: drafted.json.manifestMtimeMs });
  assert.equal(badDraft.status, 400);
  assert.equal(badDraft.json.fields[0].field, 'publication.versions.release-fixture');

  const second = await request('POST', '/api/projects/versioned/publish', { version: '0.2.0', expectedRevision: after1.publication.releases.catalog.revision });
  assert.equal(second.status, 202);
  assert.equal(second.json.operation, 'update', 'an existing deployment is updated in place');
  assert.equal((await waitJob(second.json.id)).state, 'done');
  assert.equal(await buildCount(), 2, 'Update rebuilds current source');
  s = await state();
  assert.equal(s.live, 'rel-2');
  assert.equal(s.releases.length, 2, 'previous releases are retained');
  assert.ok(!s.calls.some((c: string[]) => c[0] === 'unpublish'), 'Update never unpublishes');
  const after2 = (await request('GET', '/api/projects/versioned')).json;
  assert.equal(after2.publication.releases.nextVersion, '0.2.1', 'a consumed draft falls back to the next patch');
  assert.equal(after2.publication.status.deployedUrl, 'https://releases.example.test/apps/versioned/', 'the canonical URL is unchanged');
});

test('confirmed activation deploys a retained release without rebuilding and refuses stale, foreign or live selections', async () => {
  const project = (await request('GET', '/api/projects/versioned')).json;
  const catalog = project.publication.releases.catalog;
  assert.equal(catalog.liveReleaseId, 'rel-2');
  const builds = await buildCount();
  assert.equal((await request('POST', '/api/projects/versioned/activate', { releaseId: '../x', confirm: true })).status, 400);
  assert.equal((await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-9', confirm: true })).status, 409, 'a release this identity does not own is refused');
  const live = await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-2', confirm: true, expectedRevision: catalog.revision });
  assert.equal(live.status, 409);
  assert.equal(live.json.details.alreadyLive, true, 'the live release needs no deployment');
  const stale = await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-1', confirm: true, expectedRevision: 'old' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.details.stale, 'release-catalog');
  const unconfirmed = await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-1', expectedRevision: catalog.revision });
  assert.equal(unconfirmed.status, 409);
  assert.equal(unconfirmed.json.details.needsConfirm, 'activate');
  assert.equal((await state()).live, 'rel-2', 'nothing changed before confirmation');
  assert.equal((await request('POST', '/api/projects/legacy/activate', { releaseId: 'rel-1', confirm: true })).status, 409, 'legacy publishers have no activation');

  const activation = await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-1', confirm: true, expectedRevision: catalog.revision });
  assert.equal(activation.status, 202);
  assert.equal(activation.json.operation, 'activate');
  assert.deepEqual(activation.json.release, { releaseId: 'rel-1', expectedRevision: catalog.revision });
  const job = await waitJob(activation.json.id);
  assert.equal(job.state, 'done', job.error ?? '');
  assert.equal(await buildCount(), builds, 'activation never rebuilds current source');
  const s = await state();
  assert.equal(s.live, 'rel-1');
  assert.deepEqual(s.calls.at(-1), ['activate', ID, 'versioned', 'rel-1', catalog.revision]);
  const after = (await request('GET', '/api/projects/versioned')).json;
  assert.equal(after.publication.releases.catalog.liveReleaseId, 'rel-1');
  assert.equal(after.publication.releases.nextVersion, '0.2.1', 'after a rollback the suggestion still follows the highest retained version');
  assert.equal((await request('POST', '/api/projects/versioned/publish', { version: '0.1.5' })).status, 409, 'a new version must exceed the highest retained version, not just the live one');

  // A decision validated against an older catalog is a conflict once the catalog moved, never an overwrite.
  const outdated = await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-2', confirm: true, expectedRevision: catalog.revision });
  assert.equal(outdated.status, 409);
  assert.equal(outdated.json.details.stale, 'release-catalog');
  assert.equal((await state()).live, 'rel-1');
});

test('a static app keeps publishing after a draft version edit while changed or unrecorded output is still refused', async () => {
  await write('projects/Apps/static/xrb-project.json', JSON.stringify({ name: 'Static', kind: 'app', target: 'webxr', entry: 'dist', publication: { enabled: true, publisher: 'release-fixture', id: '33333333-3333-4333-8333-333333333333', slug: 'static' } }));
  await write('projects/Apps/static/dist/index.html', '<h1>static</h1>');
  const unrecorded = await request('POST', '/api/projects/static/publish', { version: '5.0.0' });
  assert.equal(unrecorded.status, 202);
  assert.equal((await waitJob(unrecorded.json.id)).state, 'failed', 'output that no successful build recorded is refused');
  assert.equal((await fetch(`${panel.url}preview/static/`)).status, 200, 'the preview finalizes and records the static output');
  const before = (await request('GET', '/api/projects/static')).json;
  const drafted = await request('PUT', '/api/projects/static/manifest', { manifest: { ...before.manifest, publication: { ...before.manifest.publication, versions: { 'release-fixture': '5.4.0' } } }, mtimeMs: before.manifestMtimeMs });
  assert.equal(drafted.status, 200);
  const published = await request('POST', '/api/projects/static/publish', { version: '5.4.0' });
  assert.equal(published.status, 202);
  const job = await waitJob(published.json.id);
  assert.equal(job.state, 'done', `${job.error}: a manifest-only change does not stale unchanged static output`);
  await write('projects/Apps/static/dist/index.html', '<h1>edited without a build</h1>');
  const changed = await request('POST', '/api/projects/static/publish', { version: '5.5.0' });
  assert.equal((await waitJob(changed.json.id)).state, 'failed', 'changed output without a build is refused');
});

test('unpublish keeps release history available for a later confirmed activation', async () => {
  const retained = (await request('GET', '/api/projects/versioned')).json.publication.releases.catalog.releases.length;
  const removed = await request('POST', '/api/projects/versioned/unpublish', { confirm: true });
  assert.equal(removed.status, 202);
  assert.equal((await waitJob(removed.json.id)).state, 'done');
  const project = (await request('GET', '/api/projects/versioned')).json;
  assert.equal(project.publication.status.state, 'unpublished');
  assert.equal(project.publication.releases.catalog.liveReleaseId, null);
  assert.equal(project.publication.releases.catalog.releases.length, retained, 'retained history survives Unpublish');
  const restore = await request('POST', '/api/projects/versioned/activate', { releaseId: 'rel-2', confirm: true, expectedRevision: project.publication.releases.catalog.revision });
  assert.equal(restore.status, 202);
  assert.equal((await waitJob(restore.json.id)).state, 'done');
  assert.equal((await request('GET', '/api/projects/versioned')).json.publication.status.state, 'published');
});

test('confirmed deletion removes a retained release that is not live and refuses live, stale, unknown or unconfirmed requests', async () => {
  const project = (await request('GET', '/api/projects/versioned')).json;
  const catalog = project.publication.releases.catalog;
  const live = catalog.liveReleaseId;
  assert.ok(live, 'a release is live before the deletion test');
  const other = catalog.releases.find((r: { releaseId: string }) => r.releaseId !== live).releaseId;
  assert.equal((await request('POST', '/api/projects/versioned/delete-release', { releaseId: '../x', confirm: true })).status, 400);
  assert.equal((await request('POST', '/api/projects/versioned/delete-release', { releaseId: 'rel-9', confirm: true })).status, 409, 'a release this identity does not own is refused');
  const liveRefused = await request('POST', '/api/projects/versioned/delete-release', { releaseId: live, confirm: true, expectedRevision: catalog.revision });
  assert.equal(liveRefused.status, 409);
  assert.equal(liveRefused.json.details.live, true, 'the live release cannot be deleted');
  const stale = await request('POST', '/api/projects/versioned/delete-release', { releaseId: other, confirm: true, expectedRevision: 'old' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.details.stale, 'release-catalog');
  const unconfirmed = await request('POST', '/api/projects/versioned/delete-release', { releaseId: other, expectedRevision: catalog.revision });
  assert.equal(unconfirmed.status, 409);
  assert.equal(unconfirmed.json.details.needsConfirm, 'delete-release');
  assert.equal((await request('POST', '/api/projects/legacy/delete-release', { releaseId: 'rel-1', confirm: true })).status, 409, 'legacy publishers have no release history to delete from');
  assert.equal((await state()).releases.length, catalog.releases.length, 'nothing changed before confirmation');

  const deletion = await request('POST', '/api/projects/versioned/delete-release', { releaseId: other, confirm: true, expectedRevision: catalog.revision });
  assert.equal(deletion.status, 202);
  assert.equal(deletion.json.operation, 'delete-release');
  assert.deepEqual(deletion.json.release, { releaseId: other, expectedRevision: catalog.revision });
  const job = await waitJob(deletion.json.id);
  assert.equal(job.state, 'done', job.error ?? '');
  const s = await state();
  assert.ok(!s.releases.some((r: { releaseId: string }) => r.releaseId === other), 'the publisher removed the release');
  assert.equal(s.live, live, 'the live release is untouched');
  assert.deepEqual(s.calls.at(-1), ['delete', ID, 'versioned', other, catalog.revision]);
  const after = (await request('GET', '/api/projects/versioned')).json;
  assert.deepEqual(after.publication.releases.catalog.releases.map((r: { releaseId: string }) => r.releaseId), catalog.releases.map((r: { releaseId: string }) => r.releaseId).filter((id: string) => id !== other));
  assert.equal(after.publication.releases.catalog.liveReleaseId, live);
  assert.notEqual(after.publication.releases.catalog.revision, catalog.revision, 'deletion moves the catalog revision');
});
