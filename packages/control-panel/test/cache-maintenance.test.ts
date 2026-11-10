import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { runEmbeddedWorkspace, embeddedStateRoot, EMBEDDED_LOCK } from '../src/embedded-workspace.ts';
import { setupEmbeddedServices } from '../src/service-artifacts.ts';
import { reviewWorkingCache, cleanWorkingCache } from '../src/cache-maintenance.ts';
import { Panel } from '../src/panel.ts';
import { EventHub } from '../src/http.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import { rebuildBundledProject, requireProjectOutput, projectPreviewRoute } from '../src/project-build.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/cache-maintenance-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const write = async (file: string, data: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof data === 'string' ? data : JSON.stringify(data)); };
  await write(path.join(core, 'embedded/package.json'), { name: 'cache-fixture', private: true, packageManager: 'pnpm@9.15.9' });
  await write(path.join(core, 'embedded/pnpm-workspace.yaml'), "packages:\n  - 'projects/*/*'\n");
  await write(path.join(core, 'embedded/pnpm-lock.yaml'), "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n");
  const ctx = { line() {}, async run() {} }, scope = { core, workspace };
  const first = await runEmbeddedWorkspace(core, workspace, 'setup', ctx);
  const protectedWork = await runEmbeddedWorkspace(core, workspace, 'setup', ctx);
  await write(path.join(path.dirname(protectedWork.workspace), 'KEEP'), 'preserve fixture evidence');
  const service = await setupEmbeddedServices(core, workspace, ctx);
  const current = await runEmbeddedWorkspace(core, workspace, 'setup', ctx);
  const unknown = path.join(first.root, 'w-AAAAAA'); await write(path.join(unknown, 'user-data.txt'), 'unowned');
  await write(path.join(workspace, 'config/projects/keep/run.json'), { private: 'preserve' });
  await write(path.join(first.root, 'r-retained/runtime.bin'), 'published runtime');
  return { root, core, workspace, scope, first, protectedWork, service, current, unknown, ctx, write };
}

test('explicit cache cleanup removes only reviewed owned obsolete work and preserves published/current/KEEP/unknown/config state', async t => {
  const f = await fixture(t), first = path.dirname(f.first.workspace);
  // Pnpm-style internal junctions are unlinked, never followed during quarantine/removal.
  await f.write(path.join(first, 'store/package.txt'), 'generated dependency');
  await fs.symlink(path.join(first, 'store'), path.join(first, 'workspace/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const review = await reviewWorkingCache(f.scope);
  assert.equal(review.problem, null); assert.deepEqual(review.candidates.map(item => item.name), [path.basename(first)]);
  assert.ok(review.retained.some(item => /published service/.test(item.reason)));
  assert.ok(review.retained.some(item => /protected/.test(item.reason)));
  assert.ok(review.retained.some(item => /unknown/.test(item.reason)));
  const removed = await cleanWorkingCache(f.scope, { revision: review.revision, generations: review.candidates.map(item => item.name), confirm: true });
  assert.deepEqual(removed.removed, [path.basename(first)]); await assert.rejects(fs.access(first));
  assert.equal(await fs.readFile(path.join(f.unknown, 'user-data.txt'), 'utf8'), 'unowned');
  assert.equal(await fs.readFile(path.join(path.dirname(f.protectedWork.workspace), 'KEEP'), 'utf8'), 'preserve fixture evidence');
  assert.ok(await fs.stat(f.service.runtime)); assert.ok(await fs.stat(f.current.workspace));
  assert.equal(await fs.readFile(path.join(f.first.root, 'r-retained/runtime.bin'), 'utf8'), 'published runtime');
  assert.equal(await fs.readFile(path.join(f.workspace, 'config/projects/keep/run.json'), 'utf8'), '{"private":"preserve"}');
});

test('stale reviews, arbitrary paths, locks and changed/protected generations fail without deleting data', async t => {
  const f = await fixture(t), review = await reviewWorkingCache(f.scope), name = review.candidates[0].name;
  await f.write(path.join(f.first.root, name, 'changed.txt'), 'new data');
  await assert.rejects(cleanWorkingCache(f.scope, { revision: review.revision, generations: [name], confirm: true }), /stale/);
  const current = await reviewWorkingCache(f.scope);
  for (const generations of [['../outside'], ['r-retained'], [path.basename(path.dirname(f.current.workspace))], ['w-AAAAAA']])
    await assert.rejects(cleanWorkingCache(f.scope, { revision: current.revision, generations, confirm: true }));
  await assert.rejects(cleanWorkingCache(f.scope, { revision: current.revision, generations: [name], confirm: false }), /Confirm/);
  await f.write(path.join(embeddedStateRoot(f.core, f.workspace), EMBEDDED_LOCK), 'foreign');
  await assert.rejects(cleanWorkingCache(f.scope, { revision: current.revision, generations: [name], confirm: true }), /stale|unsafe/);
  assert.equal(await fs.readFile(path.join(f.first.root, EMBEDDED_LOCK), 'utf8'), 'foreign');
  assert.equal(await fs.readFile(path.join(f.first.root, name, 'changed.txt'), 'utf8'), 'new data');
});

test('external links and preservation markers stop reclamation, and the panel refuses active consumers', async t => {
  const f = await fixture(t), first = path.dirname(f.first.workspace), outside = path.join(f.root, 'outside');
  await f.write(path.join(outside, 'keep.txt'), 'outside');
  await fs.symlink(outside, path.join(first, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  const review = await reviewWorkingCache(f.scope);
  assert.equal(review.candidates.length, 0); assert.ok(review.retained.some(item => /outside/.test(item.reason)));
  const panel = new Panel(f.core, f.workspace, new EventHub());
  let release!: () => void;
  const job = panel.jobs.start('web-build', null, 'active', () => new Promise<void>(resolve => { release = resolve; }));
  assert.throws(() => panel.cleanupWorkingCache(undefined, { revision: review.revision, generations: [], confirm: true }), /Stop apps/);
  release(); await panel.jobs.wait(job);
  await f.write(path.join(f.workspace, '.artifacts/KEEP'), 'preserve all user evidence');
  assert.match((await reviewWorkingCache(f.scope)).problem!, /KEEP/);
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'outside');
});

test('cache APIs retain explicit review and confirmation while pinned output stays readable without browser controls', async t => {
  const f = await fixture(t), embedded = path.join(f.core, 'embedded'), source = path.join(embedded, 'projects/core/demo');
  await f.write(path.join(source, 'xrb-project.json'), { name: 'Cache demo', kind: 'app', target: 'webxr', entry: 'dist', scripts: { build: 'build' } });
  await f.write(path.join(source, 'package.json'), { name: 'demo', private: true, scripts: { build: 'node build.mjs' } });
  await f.write(path.join(source, 'build.mjs'), '// synthetic fixture build');
  await f.write(path.join(source, 'dist/index.html'), '<html>packaged output</html>');
  await f.write(path.join(embedded, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .: {}
  projects/core/demo: {}
`);
  await fs.mkdir(path.join(f.workspace, 'projects'), { recursive: true });
  const p = (await discoverProjectCatalog(f.core, f.workspace)).projects.find(item => item.key === 'bundled:demo')!.project;
  const ctx = { line() {}, async run(_command: string, args: string[], options: any) { if (args.join(' ').includes(' run ')) { await fs.mkdir(path.join(options.cwd, 'dist')); await fs.writeFile(path.join(options.cwd, 'dist/index.html'), '<html><head></head><body>cached output</body></html>'); } } };
  await rebuildBundledProject(f.core, f.workspace, p, ctx); const pinned = await requireProjectOutput(f.core, f.workspace, p);
  await rebuildBundledProject(f.core, f.workspace, p, ctx);
  const review = await reviewWorkingCache({ ...f.scope, project: p }); assert.equal(review.candidates.length, 1);
  const old = path.join(path.dirname(pinned.entry), '..', review.candidates[0].name);
  const server = createServer({ repo: f.core, workspace: f.workspace, port: await freePort() });
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  try {
    const url = new URL('/api/projects/bundled%3Ademo/cache', server.url);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const current = await response.json() as typeof review;
    assert.equal(current.revision, review.revision);
    assert.deepEqual(current.candidates, review.candidates);
    const cleanup = async (confirm: boolean) => {
      const response = await fetch(url, { method: 'DELETE', headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' }, body: JSON.stringify({ revision: current.revision, generations: [current.candidates[0].name], confirm }) });
      assert.equal(response.status, 202, await response.clone().text());
      const job = await response.json() as { id: string };
      return server.panel.jobs.wait(server.panel.jobs.get(job.id)!);
    };
    const refused = await cleanup(false);
    assert.equal(refused.state, 'failed'); assert.match(refused.error!, /Confirm/);
    assert.ok(await fs.stat(old));
    const removed = await cleanup(true);
    assert.equal(removed.state, 'done', removed.error ?? '');
    await assert.rejects(fs.access(old));
    assert.equal((await fetch(server.url + projectPreviewRoute(p, pinned).slice(1))).status, 200);
    assert.equal(await fs.readFile(path.join(f.workspace, 'config/projects/keep/run.json'), 'utf8'), '{"private":"preserve"}');
  } finally { await server.close(); }
});
