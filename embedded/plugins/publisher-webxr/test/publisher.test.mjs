import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createProductionPublisher, verifyHosting } from '../src/production.mjs';
import { config, fixture, git, id, log } from './fixture.mjs';

test('configured production engine retains service and route metadata', () => {
  const publisher = createProductionPublisher(config, {storageRoot:path.resolve('unused-test-cache'),associationsFile:path.resolve('unused-test-associations.json')});
  assert.equal(publisher.name, 'production-web');
  assert.equal(publisher.label, 'Production');
  assert.equal(publisher.origin, 'https://example.test');
  assert.deepEqual(publisher.validate({ id: id('1'), slug: 'my-app' }), []);
  assert.deepEqual(publisher.validate({ id: id('1'), slug: '' }), []);
  assert.ok(publisher.validate({ id: id('1'), slug: '../other' }).length);
});

test('local output publishing requires expected branch hosting, path and domain', () => {
  const live = { build_type: 'legacy', source: { branch: 'main', path: '/docs' }, html_url: 'https://example.test/', cname: 'example.test', https_enforced: true };
  const target = { branch: 'main', sitePath: '/docs', origin: 'https://example.test' };
  assert.doesNotThrow(() => verifyHosting(target, live));
  assert.throws(() => verifyHosting(target, { ...live, build_type: 'workflow' }), /directly through Pages/);
  assert.throws(() => verifyHosting(target, { ...live, source: { branch: 'other', path: '/docs' } }), /main\/docs/);
  assert.throws(() => verifyHosting(target, { ...live, source: { branch: 'main', path: '/' } }), /main\/docs/);
  assert.throws(() => verifyHosting(target, { ...live, html_url: 'https://other.example/' }), /origin/);
  assert.throws(() => verifyHosting(target, { ...live, https_enforced: false }), /HTTPS/);
});

test('installation and status are read-only, publication refuses a source that has not cut over', async (t) => {
  const f = await fixture(t, { ready: false });
  const publication = { id: id('1'), slug: 'new-app' };
  assert.equal((await f.plugin.status(publication)).state, 'unpublished');
  await assert.rejects(f.plugin.publish({ app: f.app, publication, log }), /branch deployment not ready/);
  assert.equal(git(f.root, '--git-dir', f.remote, 'branch', '--list', 'apps'), '');
});

test('a main /docs target changes only the Pages subtree', async (t) => {
  const docsConfig = { ...config, branch: 'main', sitePath: '/docs' };
  const f = await fixture(t, { config: docsConfig });
  const publication = { id: id('1'), slug: 'docs-app' };
  await f.plugin.publish({ app: f.app, publication, log });
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:source.txt'), 'Project source stays here');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:docs/index.html'), 'Root stays here');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:docs/legacy/index.html'), 'Legacy app');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:docs/apps/docs-app/index.html'), '<html>New app</html>');
  assert.equal((await f.plugin.status(publication)).state, 'published');
  assert.equal(f.deployments.length, 1, 'Pages is awaited only after pushing the output commit');
});

test('non-fast-forward replays only the selected route against fresh public main', async (t) => {
  let tries = 0;
  const f = await fixture(t, { config: { ...config, branch: 'main', sitePath: '/docs' }, beforePush: async ({ seed }) => {
    if (tries++ !== 0) return;
    git(seed, 'checkout', '-b', 'main');
    await fs.writeFile(path.join(seed, 'source.txt'), 'A newer unrelated source edit');
    git(seed, 'add', 'source.txt'); git(seed, 'commit', '-m', 'concurrent source edit');
    git(seed, 'push', 'origin', 'main');
  } });
  const publication = { id: id('1'), slug: 'first-app' };
  await f.plugin.publish({ app: f.app, publication, log });
  assert.ok(tries >= 2, 'initial publication must be rejected and retried');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:source.txt'), 'A newer unrelated source edit');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:docs/apps/first-app/index.html'), '<html>New app</html>');
  assert.equal(f.deployments.length, 1, 'only the successful commit may deploy');
});

test('publish preserves root and other routes; republish and unpublish isolate one identity', async (t) => {  const f = await fixture(t);
  const first = { id: id('1'), slug: 'first-app' }, second = { id: id('2'), slug: 'second-app' };
  await f.plugin.publish({ app: f.app, publication: first, log });
  await f.plugin.publish({ app: f.app, publication: second, log });
  assert.equal((await f.plugin.status(first)).state, 'published');
  await assert.rejects(f.plugin.publish({ app: f.app, publication: { ...second, slug: first.slug }, log }), /belongs to another/);
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:CNAME'), 'example.test');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:index.html'), 'Root stays here');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:legacy/index.html'), 'Legacy app');
  await fs.writeFile(path.join(f.app, 'index.html'), '<html>Updated app</html>');
  await f.plugin.publish({ app: f.app, publication: first, log });
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/first-app/index.html'), '<html>Updated app</html>');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/second-app/index.html'), '<html>New app</html>');
  await f.plugin.unpublish({ publication: first, log });
  assert.equal((await f.plugin.status(first)).state, 'unpublished');
  assert.equal((await f.plugin.status(second)).state, 'published');
  assert.ok(!git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'apps').includes('apps/first-app/'));
});

test('root publication owns only its files and preserves named routes', async (t) => {
  const f = await fixture(t);
  const named = { id: id('1'), slug: 'named-app' }, root = { id: id('2'), slug: '' };
  await f.plugin.publish({ app: f.app, publication: named, log });
  await fs.mkdir(path.join(f.app, 'assets'));
  await fs.writeFile(path.join(f.app, 'assets', 'app.js'), 'root asset');
  await f.plugin.publish({ app: f.app, publication: root, log });
  assert.equal((await f.plugin.status(root)).state, 'published');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/index.html'), '<html>New app</html>');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/named-app/index.html'), '<html>New app</html>');
  const inventory = JSON.parse(git(f.root, '--git-dir', f.remote, 'show', 'apps:.xrb-publications.json'));
  assert.deepEqual(inventory.publications.find((item) => item.id === root.id).files.sort(), ['.xrb-publication.json', 'assets/app.js', 'index.html']);
  await fs.writeFile(path.join(f.app, 'index.html'), '<html>Updated root</html>');
  await f.plugin.publish({ app: f.app, publication: root, log });
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/index.html'), '<html>Updated root</html>');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/named-app/index.html'), '<html>New app</html>');
  const moved = { ...root, slug: 'moved-root' };
  await f.plugin.publish({ app: f.app, publication: moved, log });
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/moved-root/index.html'), '<html>Updated root</html>');
  assert.ok(!git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'apps').includes('apps/index.html'));
  await f.plugin.publish({ app: f.app, publication: root, log });
  assert.ok(!git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'apps').includes('apps/moved-root/index.html'));
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/named-app/index.html'), '<html>New app</html>');
  await f.plugin.unpublish({ publication: root, log });
  assert.equal((await f.plugin.status(root)).state, 'unpublished');
  assert.equal((await f.plugin.status(named)).state, 'published');
  const files = git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'apps');
  assert.ok(!files.includes('apps/index.html'));
  assert.ok(!files.includes('apps/assets/app.js'));
  assert.ok(files.includes('apps/named-app/index.html'));
});

test('root publication refuses named-route and unrelated-file collisions', async (t) => {
  const f = await fixture(t);
  const named = { id: id('1'), slug: 'named-app' }, root = { id: id('2'), slug: '' };
  await f.plugin.publish({ app: f.app, publication: named, log });
  await fs.mkdir(path.join(f.app, 'named-app'));
  await fs.writeFile(path.join(f.app, 'named-app', 'nested.js'), 'collision');
  await assert.rejects(f.plugin.publish({ app: f.app, publication: root, log }), /overlaps named route/);
  await fs.rm(path.join(f.app, 'named-app'), { recursive: true });
  git(f.seed, 'fetch', 'origin', 'apps');
  git(f.seed, 'checkout', '-B', 'apps', 'origin/apps');
  await fs.writeFile(path.join(f.seed, 'apps', 'unowned.txt'), 'do not replace');
  git(f.seed, 'add', 'apps/unowned.txt'); git(f.seed, 'commit', '-m', 'external app-root file'); git(f.seed, 'push', 'origin', 'apps');
  await fs.writeFile(path.join(f.app, 'unowned.txt'), 'replacement');
  await assert.rejects(f.plugin.publish({ app: f.app, publication: root, log }), /exists without an ownership record/);
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:apps/unowned.txt'), 'do not replace');
});

test('a route move retires the old route and associations follow active ownership', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' };
  const fingerprint = Array(32).fill('AB').join(':');
  await fs.writeFile(f.associationsFile, JSON.stringify({ version: 1, records: [
    { publicationId: publication.id, packageId: 'com.example.first', fingerprints: [fingerprint] },
    { publicationId: id('2'), packageId: 'com.example.unpublished', fingerprints: [fingerprint] },
  ] }));
  await f.plugin.publish({ app: f.app, publication, log });
  let links = JSON.parse(git(f.root, '--git-dir', f.remote, 'show', 'apps:.well-known/assetlinks.json'));
  assert.deepEqual(links.map((link) => link.target.package_name), ['com.example.first']);
  await f.plugin.publish({ app: f.app, publication: { ...publication, slug: 'renamed-app' }, log });
  assert.equal((await f.plugin.status({ ...publication, slug: 'renamed-app' })).state, 'published');
  assert.ok(!git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'apps').includes('apps/first-app/'));
  await f.plugin.unpublish({ publication: { ...publication, slug: 'renamed-app' }, log });
  links = JSON.parse(git(f.root, '--git-dir', f.remote, 'show', 'apps:.well-known/assetlinks.json'));
  assert.deepEqual(links, []);
});

test('existing public associations are not silently overwritten', async (t) => {
  const f = await fixture(t);
  const publication = { id: id('1'), slug: 'first-app' };
  await f.plugin.publish({ app: f.app, publication, log });
  git(f.seed, 'fetch', 'origin', 'apps');
  git(f.seed, 'checkout', '-B', 'apps', 'origin/apps');
  await fs.writeFile(path.join(f.seed, '.well-known', 'assetlinks.json'), '[{"unexpected":true}]\n');
  git(f.seed, 'add', '.well-known/assetlinks.json'); git(f.seed, 'commit', '-m', 'external associations');
  git(f.seed, 'push', 'origin', 'apps');
  await assert.rejects(f.plugin.publish({ app: f.app, publication, log }), /associations differ/);
  assert.equal(f.deployments.length, 1, 'nothing was dispatched for the rejected change');
});

test('invalid build files never leave the machine', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.app, '.env'), 'SECRET');
  await assert.rejects(f.plugin.publish({ app: f.app, publication: { id: id('1'), slug: 'first-app' }, log }), /private or excluded/);
  assert.equal(git(f.root, '--git-dir', f.remote, 'branch', '--list', 'apps'), '');
});

test('failed deployment reverts only the output commit and redeploys the baseline', async (t) => {
  const f = await fixture(t, { failFirstDeploy: true, config: { ...config, branch: 'main', sitePath: '/docs' } });
  const publication = { id: id('1'), slug: 'first-app' };
  await assert.rejects(f.plugin.publish({ app: f.app, publication, log }), /Pages deployment failed/);
  assert.equal(f.deployments.length, 2, 'baseline must be redeployed after the failure');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:source.txt'), 'Project source stays here');
  assert.equal((await f.plugin.status(publication)).state, 'unpublished');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'main:docs/index.html'), 'Root stays here');
});

test('verification failure reverts the publication commit and restores the seed site', async (t) => {
  const f = await fixture(t);
  f.setVisible(false);
  const publication = { id: id('1'), slug: 'first-app' };
  await assert.rejects(f.plugin.publish({ app: f.app, publication, log }), (error) =>
    /timed out verifying/.test(error.message) && !/rollback failed/.test(error.message), 'rollback must be verified');
  assert.equal(git(f.root, '--git-dir', f.remote, 'show', 'apps:CNAME'), 'example.test');
  assert.ok(!git(f.root, '--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'apps').includes('apps/first-app/'));
});
