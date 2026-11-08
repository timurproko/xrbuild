import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { catalogRevision, normalizeCatalog } from '../src/production.mjs';
import { normalizeInventory as launcherInventory } from './launcher-contract.mjs';
import { config, fixture, git, id, log } from './fixture.mjs';

const show = (f, file) => git(f.root, '--git-dir', f.remote, 'show', `${config.branch}:${file}`);
const tree = (f) => git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', config.branch);
const head = (f) => git(f.root, '--git-dir', f.remote, 'rev-parse', config.branch);
const inventoryOf = (f) => JSON.parse(show(f, '.xrb-publications.json'));
const catalogFile = (publication) => `.xrb-releases/${publication.id}/catalog.json`;
const catalogOf = (f, publication) => JSON.parse(show(f, catalogFile(publication)));
const setApp = (f, html) => fs.writeFile(path.join(f.app, 'index.html'), html);
/** Pushes an external edit of the content branch from the seed clone (another writer). */
function externalEdit(f, edit) {
  git(f.seed, 'fetch', 'origin', config.branch);
  git(f.seed, 'checkout', '-B', config.branch, `origin/${config.branch}`);
  return Promise.resolve(edit(f.seed)).then(() => { git(f.seed, 'add', '-A'); git(f.seed, 'commit', '-m', 'external edit'); git(f.seed, 'push', 'origin', config.branch); });
}

test('catalog documents fail closed and the revision follows retained releases and the decision only', () => {
  const publication = { id: id('1'), slug: 'demo' };
  const release = { releaseId: 'abc-0123456789ab', version: '0.1.0', contentHash: 'a'.repeat(64), indexHash: 'b'.repeat(64), createdMs: 5, slug: 'demo' };
  const catalog = normalizeCatalog({ version: 1, publicationId: publication.id, releases: [release], requested: { releaseId: release.releaseId, at: 6 } }, publication.id);
  assert.equal(catalog.releases.length, 1);
  assert.throws(() => normalizeCatalog({ version: 2, publicationId: publication.id, releases: [], requested: null }, publication.id), /corrupt or unsupported/);
  assert.throws(() => normalizeCatalog({ version: 1, publicationId: id('2'), releases: [], requested: null }, publication.id), /corrupt or unsupported/, 'another identity cannot own this catalog');
  assert.throws(() => normalizeCatalog({ version: 1, publicationId: publication.id, releases: [{ ...release, releaseId: '../escape' }], requested: null }, publication.id), /invalid/);
  assert.throws(() => normalizeCatalog({ version: 1, publicationId: publication.id, releases: [{ ...release, version: '1.0' }], requested: null }, publication.id), /invalid/);
  assert.throws(() => normalizeCatalog({ version: 1, publicationId: publication.id, releases: [release, { ...release, releaseId: 'abd-0123456789ab' }], requested: null }, publication.id), /duplicate versions/);
  assert.throws(() => normalizeCatalog({ version: 1, publicationId: publication.id, releases: [release], requested: { releaseId: 'zzz-0123456789ab', at: 1 } }, publication.id), /decision is invalid/);
  const same = catalogRevision({ ...catalog, releases: catalog.releases.map((r) => ({ ...r, createdMs: 99 })) });
  assert.equal(same, catalogRevision(catalog), 'timestamps do not move the revision');
  assert.notEqual(catalogRevision({ ...catalog, requested: null }), catalogRevision(catalog), 'a changed decision moves the revision');
  assert.notEqual(catalogRevision({ ...catalog, releases: [] }), catalogRevision(catalog), 'a changed release set moves the revision');
});

test('versioned publish retains an immutable snapshot, updates in place and keeps the active inventory Launcher-compatible', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' }, other = { id: id('2'), slug: 'second-app' };
  await f.plugin.publish({ app: f.app, publication: other, log });
  const empty = await f.plugin.releases.catalog(publication);
  assert.deepEqual(empty, { revision: catalogRevision(normalizeCatalog(null, publication.id)), releases: [], requestedReleaseId: null, liveReleaseId: null, legacyLive: false });
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '1.0', expectedRevision: empty.revision, log }), /stable three-part/);
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: 'outdated', log }), /release history changed/);
  assert.equal(f.deployments.length, 1, 'rejected decisions deploy nothing');

  const card = { name: 'First App', description: 'Spins a cube.', icon: { default: true, color: 'amber', shape: 'sphere', model: true } };
  const first = await f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: empty.revision, card, log });
  assert.equal(first.version, '0.1.0');
  assert.deepEqual(inventoryOf(f).publications.find((item) => item.id === publication.id).card, card, 'the deployment record carries the launcher card');
  assert.deepEqual(launcherInventory(inventoryOf(f)).find((item) => item.id === publication.id).card, card, 'the Launcher keeps the card from the version-1 inventory');
  assert.equal(first.url, 'https://example.test/apps/first-app/');
  assert.match(first.releaseId, /^[a-z0-9]+-[0-9a-f]{12}$/);
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>New app</html>');
  assert.equal(show(f, `.xrb-releases/${publication.id}/${first.releaseId}/index.html`), '<html>New app</html>', 'the retained snapshot holds the validated output');
  const inventory = inventoryOf(f);
  const record = inventory.publications.find((item) => item.id === publication.id);
  assert.equal(record.releaseId, first.releaseId);
  assert.equal(record.version, '0.1.0');
  assert.deepEqual(launcherInventory(inventory).map((item) => item.slug).sort(), ['first-app', 'second-app'], 'Launcher parses the version-1 inventory and sees only active apps');
  assert.ok(!tree(f).split('\n').some((file) => file.startsWith('apps/.xrb-releases')), 'release storage stays out of the app routes');
  let catalog = await f.plugin.releases.catalog(publication);
  assert.equal(catalog.liveReleaseId, first.releaseId);
  assert.equal(catalog.requestedReleaseId, first.releaseId);
  assert.equal(catalog.releases[0].digest, record.contentHash);
  assert.equal(catalog.releases[0].url, `https://example.test/.xrb-releases/${publication.id}/${first.releaseId}/`, 'each retained release is previewable at its public archive');
  assert.equal(await f.fetch(catalog.releases[0].url).then((r) => r.text()), '<html>New app</html>', 'the archive serves the exact retained output');
  assert.equal((await f.plugin.status(publication)).state, 'published');

  await setApp(f, '<html>Updated app</html>');
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log }), /already retained with different output/);
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.0.9', expectedRevision: catalog.revision, log }), /does not exceed/);
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>New app</html>', 'refusals change nothing');
  const second = await f.plugin.releases.publish({ app: f.app, publication, version: '0.2.0', expectedRevision: catalog.revision, card: { name: '' }, log });
  assert.equal(inventoryOf(f).publications.find((item) => item.id === publication.id).card, undefined, 'a malformed card is never stored; the record carries no card rather than a broken one');
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>Updated app</html>');
  assert.equal(show(f, 'apps/second-app/index.html'), '<html>New app</html>', 'unrelated routes stay');
  assert.equal(show(f, 'index.html'), 'Root stays here');
  assert.equal(show(f, `.xrb-releases/${publication.id}/${first.releaseId}/index.html`), '<html>New app</html>', 'the previous release is retained');
  catalog = await f.plugin.releases.catalog(publication);
  assert.deepEqual(catalog.releases.map((r) => r.version), ['0.1.0', '0.2.0']);
  assert.equal(catalog.liveReleaseId, second.releaseId);
  assert.equal(inventoryOf(f).publications.length, 2, 'archived releases are not inventory entries');

  // Identical content under the same version is a safe retry, not a new release.
  const retry = await f.plugin.releases.publish({ app: f.app, publication, version: '0.2.0', expectedRevision: catalog.revision, log });
  assert.equal(retry.releaseId, second.releaseId);
  assert.equal((await f.plugin.releases.catalog(publication)).releases.length, 2);

  // History is publisher-authoritative: a fresh process with an empty cache recovers it.
  const restarted = await fixtureRestart(f);
  const recovered = await restarted.releases.catalog(publication);
  assert.deepEqual(recovered.releases.map((r) => r.version), ['0.1.0', '0.2.0']);
  assert.equal(recovered.liveReleaseId, second.releaseId);
  assert.equal(recovered.revision, catalog.revision);
});

async function fixtureRestart(f) {
  const { createProductionPublisher } = await import('../src/production.mjs');
  const fetch = f.fetch;
  return createProductionPublisher(config, { storageRoot: path.join(f.root, 'cache-2'), remoteUrl: f.remote, associationsFile: f.associationsFile, fetch, sleep: async () => {}, hostingReady: async () => {}, deployment: { deploy: async () => ({ link: 'https://example.test/builds/restart' }) } });
}

test('the first versioned update of a legacy deployment keeps its exact bytes as a selectable legacy release', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'legacy-app' };
  await f.plugin.publish({ app: f.app, publication, log });
  let catalog = await f.plugin.releases.catalog(publication);
  assert.deepEqual(catalog.releases, []);
  assert.equal(catalog.legacyLive, true, 'an unversioned live deployment is Legacy, never an invented version');
  assert.equal(catalog.liveReleaseId, null);
  const legacyHash = inventoryOf(f).publications[0].contentHash;

  await setApp(f, '<html>Versioned app</html>');
  const release = await f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log });
  catalog = await f.plugin.releases.catalog(publication);
  assert.deepEqual(catalog.releases.map((r) => r.version), [null, '0.1.0']);
  const legacy = catalog.releases[0];
  assert.equal(legacy.digest, legacyHash, 'the legacy release is the previously verified bytes');
  assert.equal(show(f, `.xrb-releases/${publication.id}/${legacy.releaseId}/index.html`), '<html>New app</html>');
  assert.equal(show(f, 'apps/legacy-app/index.html'), '<html>Versioned app</html>');
  assert.equal(catalog.liveReleaseId, release.releaseId);
  assert.equal(catalog.legacyLive, false);

  await assert.rejects(f.plugin.publish({ app: f.app, publication, log }), /versioned release history/, 'the unversioned path cannot bypass history');
  await f.plugin.releases.activate({ publication, releaseId: legacy.releaseId, expectedRevision: catalog.revision, log });
  assert.equal(show(f, 'apps/legacy-app/index.html'), '<html>New app</html>', 'the legacy release is restorable');
  assert.equal((await f.plugin.releases.catalog(publication)).liveReleaseId, legacy.releaseId);
});

test('legacy bytes that do not match their inventory record are never migrated', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'tampered' };
  await f.plugin.publish({ app: f.app, publication, log });
  await externalEdit(f, (seed) => fs.writeFile(path.join(seed, 'apps', 'tampered', 'index.html'), '<html>Someone edited the route</html>'));
  const catalog = await f.plugin.releases.catalog(publication);
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log }), /do not match its inventory record/);
  assert.equal(show(f, 'apps/tampered/index.html'), '<html>Someone edited the route</html>', 'nothing was replaced');
  assert.ok(!tree(f).includes('.xrb-releases/'), 'no release history was created');
});

test('activation deploys exact historical bytes at the unchanged canonical URL and refuses stale, foreign or corrupt selections', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' }, other = { id: id('2'), slug: 'second-app' };
  const fingerprint = Array(32).fill('AB').join(':');
  await fs.writeFile(f.associationsFile, JSON.stringify({ version: 1, records: [{ publicationId: publication.id, packageId: 'com.example.first', fingerprints: [fingerprint] }] }));
  await f.plugin.publish({ app: f.app, publication: other, log });
  let catalog = await f.plugin.releases.catalog(publication);
  const v1 = await f.plugin.releases.publish({ app: f.app, publication, version: '1.0.0', expectedRevision: catalog.revision, log });
  await setApp(f, '<html>v2</html>');
  catalog = await f.plugin.releases.catalog(publication);
  const v2 = await f.plugin.releases.publish({ app: f.app, publication, version: '2.0.0', expectedRevision: catalog.revision, log });
  await setApp(f, '<html>v3</html>');
  catalog = await f.plugin.releases.catalog(publication);
  const v3 = await f.plugin.releases.publish({ app: f.app, publication, version: '3.0.0', expectedRevision: catalog.revision, log });
  catalog = await f.plugin.releases.catalog(publication);
  const associations = show(f, '.well-known/assetlinks.json');
  const deployments = f.deployments.length;

  await assert.rejects(f.plugin.releases.activate({ publication, releaseId: 'zzz-000000000000', expectedRevision: catalog.revision, log }), /not retained for this publication/);
  await assert.rejects(f.plugin.releases.activate({ publication: other, releaseId: v1.releaseId, expectedRevision: null, log }), /not retained for this publication/, 'another identity cannot activate this release');
  await assert.rejects(f.plugin.releases.activate({ publication, releaseId: v1.releaseId, expectedRevision: 'stale', log }), /release history changed/);
  const liveAgain = await f.plugin.releases.activate({ publication, releaseId: v3.releaseId, expectedRevision: catalog.revision, log });
  assert.equal(liveAgain.releaseId, v3.releaseId);
  assert.equal(f.deployments.length, deployments, 'the live release needs no deployment');

  const before = head(f);
  const rollback = await f.plugin.releases.activate({ publication, releaseId: v1.releaseId, expectedRevision: catalog.revision, log });
  assert.equal(rollback.version, '1.0.0');
  assert.equal(rollback.url, 'https://example.test/apps/first-app/');
  assert.notEqual(head(f), before);
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>New app</html>', 'exact v1 bytes are live again');
  assert.equal(show(f, 'apps/second-app/index.html'), '<html>New app</html>', 'unrelated routes are untouched');
  assert.equal(show(f, '.well-known/assetlinks.json'), associations, 'associations are preserved');
  assert.equal(show(f, 'index.html'), 'Root stays here');
  catalog = await f.plugin.releases.catalog(publication);
  assert.equal(catalog.liveReleaseId, v1.releaseId);
  assert.deepEqual(catalog.releases.map((r) => r.version), ['1.0.0', '2.0.0', '3.0.0'], 'rollback retains every release');
  assert.equal((await f.plugin.status(publication)).state, 'published');
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '2.5.0', expectedRevision: catalog.revision, log }), /does not exceed the highest retained version 3\.0\.0/);

  // A tampered archive is detected before it reaches the route.
  await externalEdit(f, (seed) => fs.writeFile(path.join(seed, '.xrb-releases', publication.id, v2.releaseId, 'index.html'), '<html>tampered</html>'));
  catalog = await f.plugin.releases.catalog(publication);
  await assert.rejects(f.plugin.releases.activate({ publication, releaseId: v2.releaseId, expectedRevision: catalog.revision, log }), /corrupt; refusing to deploy/);
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>New app</html>');
  await externalEdit(f, (seed) => fs.writeFile(path.join(seed, '.xrb-releases', publication.id, 'catalog.json'), '{"version":1,"publicationId":"x","releases":[],"requested":null}'));
  await assert.rejects(f.plugin.releases.catalog(publication), /corrupt or unsupported/, 'a corrupt catalog fails closed');
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '4.0.0', expectedRevision: null, log }), /corrupt or unsupported/, 'history is never silently reset');
});

test('Unpublish keeps release history and the decision can be restored at the validated destination', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' };
  let catalog = await f.plugin.releases.catalog(publication);
  const v1 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log });
  await f.plugin.unpublish({ publication, log });
  assert.equal((await f.plugin.status(publication)).state, 'unpublished');
  assert.ok(!tree(f).includes('apps/first-app/'));
  catalog = await f.plugin.releases.catalog(publication);
  assert.deepEqual(catalog.releases.map((r) => r.releaseId), [v1.releaseId], 'history survives Unpublish');
  assert.equal(catalog.requestedReleaseId, null, 'the deployment decision is withdrawn');
  assert.equal(catalog.liveReleaseId, null);
  assert.equal(show(f, `.xrb-releases/${publication.id}/${v1.releaseId}/index.html`), '<html>New app</html>', 'public archives remain');
  await f.plugin.releases.activate({ publication, releaseId: v1.releaseId, expectedRevision: catalog.revision, log });
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>New app</html>');
  assert.equal((await f.plugin.status(publication)).state, 'published');
  assert.equal((await f.plugin.releases.catalog(publication)).liveReleaseId, v1.releaseId);

  // Deleting: the deployed release is refused; a retained one that is not live disappears with its public archive.
  await setApp(f, '<html>Second app</html>');
  catalog = await f.plugin.releases.catalog(publication);
  const v2 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.2.0', expectedRevision: catalog.revision, log });
  catalog = await f.plugin.releases.catalog(publication);
  await assert.rejects(f.plugin.releases.delete({ publication, releaseId: v2.releaseId, expectedRevision: catalog.revision, log }), /deployed at the canonical route/);
  await assert.rejects(f.plugin.releases.delete({ publication, releaseId: v1.releaseId, expectedRevision: 'outdated', log }), /release history changed/);
  await assert.rejects(f.plugin.releases.delete({ publication, releaseId: 'zzz-0123456789ab', expectedRevision: catalog.revision, log }), /not retained/);
  const archive = catalog.releases.find((r) => r.releaseId === v1.releaseId).url;
  assert.equal((await f.fetch(archive)).status, 200, 'the archive serves before deletion');
  await f.plugin.releases.delete({ publication, releaseId: v1.releaseId, expectedRevision: catalog.revision, log });
  const after = await f.plugin.releases.catalog(publication);
  assert.deepEqual(after.releases.map((r) => r.releaseId), [v2.releaseId], 'only the deleted release left history');
  assert.notEqual(after.revision, catalog.revision, 'deletion moves the revision');
  assert.equal(after.liveReleaseId, v2.releaseId, 'the live route is unchanged');
  assert.ok(!tree(f).includes(`.xrb-releases/${publication.id}/${v1.releaseId}/index.html`), 'the snapshot is gone from the site');
  assert.equal((await f.fetch(archive)).status, 404, 'the public archive no longer serves');
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>Second app</html>');
});

test('a failed activation restores and verifies the previous release instead of labelling the candidate live', async (t) => {
  let failNext = false;
  const f = await fixture(t, { failDeploy: () => failNext });
  const publication = { id: id('1'), slug: 'first-app' };
  let catalog = await f.plugin.releases.catalog(publication);
  const v1 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log });
  await setApp(f, '<html>v2</html>');
  catalog = await f.plugin.releases.catalog(publication);
  const v2 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.2.0', expectedRevision: catalog.revision, log });
  catalog = await f.plugin.releases.catalog(publication);
  failNext = true;
  await assert.rejects(f.plugin.releases.activate({ publication, releaseId: v1.releaseId, expectedRevision: catalog.revision, log }), /Pages deployment failed/);
  failNext = false;
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>v2</html>', 'the previous decision is restored');
  const after = await f.plugin.releases.catalog(publication);
  assert.equal(after.liveReleaseId, v2.releaseId);
  assert.equal(after.requestedReleaseId, v2.releaseId);
  assert.deepEqual(after.releases.map((r) => r.releaseId), [v1.releaseId, v2.releaseId], 'both releases remain retained');

  // A failed update never becomes live either, and the previous release stays verified.
  await setApp(f, '<html>v3</html>');
  failNext = true;
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.3.0', expectedRevision: after.revision, log }), /Pages deployment failed/);
  failNext = false;
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>v2</html>');
  assert.equal((await f.plugin.releases.catalog(publication)).liveReleaseId, v2.releaseId);
  assert.equal((await f.plugin.status(publication)).state, 'published');
});

test('an interrupted candidate reports requested and unverified state without claiming Live', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' };
  let catalog = await f.plugin.releases.catalog(publication);
  const v1 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log });
  f.setVisible(false);
  catalog = await f.plugin.releases.catalog(publication);
  assert.equal(catalog.requestedReleaseId, v1.releaseId);
  assert.equal(catalog.liveReleaseId, null, 'an unverifiable route is not Live');
  assert.equal(catalog.legacyLive, false);
  assert.equal((await f.plugin.status(publication)).state, 'failed');
  f.setVisible(true);
  assert.equal((await f.plugin.releases.catalog(publication)).liveReleaseId, v1.releaseId);
});

test('a concurrent decision for the same identity conflicts while unrelated changes retry without force', async (t) => {
  let pushes = 0, armed = false;
  const publication = { id: id('1'), slug: 'first-app' }, other = { id: id('2'), slug: 'second-app' };
  const f = await fixture(t, { beforePush: async ({ seed }) => {
    pushes += 1;
    if (armed && pushes === 1) {
      // Another writer edits unrelated content: the publication replays onto fresh state.
      git(seed, 'fetch', 'origin', config.branch); git(seed, 'checkout', '-B', config.branch, `origin/${config.branch}`);
      await fs.writeFile(path.join(seed, 'legacy', 'index.html'), 'Legacy app, edited elsewhere');
      git(seed, 'add', '-A'); git(seed, 'commit', '-m', 'unrelated edit'); git(seed, 'push', 'origin', config.branch);
    }
  } });
  await f.plugin.publish({ app: f.app, publication: other, log });
  pushes = 0; armed = true;
  let catalog = await f.plugin.releases.catalog(publication);
  const v1 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log });
  assert.ok(pushes >= 2, 'the first push was rejected and replayed');
  assert.equal(show(f, 'legacy/index.html'), 'Legacy app, edited elsewhere');
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>New app</html>');
  assert.equal((await f.plugin.releases.catalog(publication)).liveReleaseId, v1.releaseId);

  // A newer decision for this identity (another panel activated v1 after we read the catalog) is a conflict.
  await setApp(f, '<html>v2</html>');
  catalog = await f.plugin.releases.catalog(publication);
  const v2 = await f.plugin.releases.publish({ app: f.app, publication, version: '0.2.0', expectedRevision: catalog.revision, log });
  const stale = catalog.revision;
  await assert.rejects(f.plugin.releases.activate({ publication, releaseId: v1.releaseId, expectedRevision: stale, log }), /release history changed/);
  assert.equal(show(f, 'apps/first-app/index.html'), '<html>v2</html>', 'the newer decision is not overwritten');
  assert.equal((await f.plugin.releases.catalog(publication)).liveReleaseId, v2.releaseId);
});

test('root publications retain releases and preserve named routes through update and activation', async (t) => {
  const f = await fixture(t);
  const named = { id: id('1'), slug: 'named-app' }, root = { id: id('2'), slug: '' };
  await f.plugin.publish({ app: f.app, publication: named, log });
  await fs.mkdir(path.join(f.app, 'assets'));
  await fs.writeFile(path.join(f.app, 'assets', 'app.js'), 'root asset');
  let catalog = await f.plugin.releases.catalog(root);
  const v1 = await f.plugin.releases.publish({ app: f.app, publication: root, version: '1.0.0', expectedRevision: catalog.revision, log });
  assert.equal(show(f, 'apps/index.html'), '<html>New app</html>');
  assert.equal(show(f, 'apps/named-app/index.html'), '<html>New app</html>');
  assert.deepEqual(inventoryOf(f).publications.find((item) => item.id === root.id).files.sort(), ['.xrb-publication.json', 'assets/app.js', 'index.html']);
  await setApp(f, '<html>Root v2</html>');
  await fs.rm(path.join(f.app, 'assets'), { recursive: true });
  catalog = await f.plugin.releases.catalog(root);
  await f.plugin.releases.publish({ app: f.app, publication: root, version: '1.1.0', expectedRevision: catalog.revision, log });
  assert.equal(show(f, 'apps/index.html'), '<html>Root v2</html>');
  assert.ok(!tree(f).includes('apps/assets/app.js'), 'retired root files leave the route');
  assert.equal(show(f, `.xrb-releases/${root.id}/${v1.releaseId}/assets/app.js`), 'root asset', 'the retained release keeps them');
  catalog = await f.plugin.releases.catalog(root);
  await f.plugin.releases.activate({ publication: root, releaseId: v1.releaseId, expectedRevision: catalog.revision, log });
  assert.equal(show(f, 'apps/index.html'), '<html>New app</html>');
  assert.equal(show(f, 'apps/assets/app.js'), 'root asset');
  assert.equal(show(f, 'apps/named-app/index.html'), '<html>New app</html>', 'named routes survive root activation');
  assert.equal((await f.plugin.status(named)).state, 'published');
  await fs.mkdir(path.join(f.app, 'named-app'));
  await fs.writeFile(path.join(f.app, 'named-app', 'x.js'), 'collision');
  catalog = await f.plugin.releases.catalog(root);
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication: root, version: '2.0.0', expectedRevision: catalog.revision, log }), /overlaps named route/);
  assert.equal((await f.plugin.releases.catalog(root)).releases.length, 2, 'a refused release leaves history unchanged');
});

test('unsafe artifacts and release-namespace collisions are refused before any change', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' };
  const catalog = await f.plugin.releases.catalog(publication);
  await fs.writeFile(path.join(f.app, '.env'), 'SECRET');
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log }), /private or excluded/);
  await fs.rm(path.join(f.app, '.env'));
  await fs.mkdir(path.join(f.app, '.xrb-releases'));
  await fs.writeFile(path.join(f.app, '.xrb-releases', 'x'), 'namespace squat');
  await assert.rejects(f.plugin.releases.publish({ app: f.app, publication, version: '0.1.0', expectedRevision: catalog.revision, log }), /private or excluded/);
  assert.equal(git(f.root, '--git-dir', f.remote, 'branch', '--list', config.branch), '', 'nothing left the machine');
  await assert.rejects(f.plugin.releases.catalog({ id: '../escape', slug: 'x' }), /publication ID is invalid/);
});
