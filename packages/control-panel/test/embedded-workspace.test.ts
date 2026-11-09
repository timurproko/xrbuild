import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { runProcess, type JobContext } from '../src/jobs.ts';
import { embeddedWorkspacePlan, runEmbeddedWorkspace, embeddedStateRoot, EMBEDDED_LOCK, EMBEDDED_RECEIPT } from '../src/embedded-workspace.ts';
import { buildInventory } from '../src/embedded-inputs.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import { rebuildBundledProject, resolveProjectOutput, projectBuildRoot } from '../src/project-build.ts';
import { parseEmbeddedArgs } from '../../../tools/embedded/embedded.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/embedded-operations-')), core = path.join(root, 'core'), user = path.join(root, 'user'), embedded = path.join(core, 'embedded');
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const write = async (relative: string, value: unknown) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
  await write('core/embedded/package.json', { name: 'embedded-fixture', private: true, packageManager: 'pnpm@9.15.9', scripts: { prepare: 'node -e "process.exit(71)"', build: 'node -e "process.exit(72)"', test: 'node -e "process.exit(73)"' } });
  await write('core/embedded/pnpm-workspace.yaml', "packages:\n  - 'projects/*/*'\n  - 'plugins/*'\n  - 'plugins/*/*'\n");
  const packages = [
    ['plugins/shared', '@fixture/shared', {}, 'dist'],
    ['plugins/shared/worker', '@fixture/worker', { '@fixture/shared': 'workspace:*' }, 'dist'],
    ['projects/core/demo', 'demo', { '@fixture/worker': 'workspace:*' }, 'site'],
    ['plugins/unused', 'unused', {}, 'dist'],
  ] as const;
  for (const [relative, name, dependencies, out] of packages) {
    await write(`core/embedded/${relative}/package.json`, { name, version: '1.0.0', private: true, type: 'module', exports: `./${out}/index.js`, dependencies,
      scripts: { build: name === 'demo' ? 'node -e "process.exit(74)"' : 'node build.mjs', ...(name === 'demo' ? { compile: 'node build.mjs', precompile: 'node -e "process.exit(75)"', postcompile: 'node -e "process.exit(76)"' } : {}), test: 'node test.mjs' } });
    const dependency = Object.keys(dependencies)[0];
    await write(`core/embedded/${relative}/build.mjs`, `import fs from 'node:fs/promises'; import {spawnSync} from 'node:child_process';
      ${dependency ? `import {text} from '${dependency}';` : `const text = 'fresh';`}
      if (spawnSync('git', ['rev-parse','--show-toplevel'], {encoding:'utf8'}).status === 0) throw new Error('Ambient repository');
      await fs.mkdir('${out}', {recursive:true}); await fs.writeFile('${out}/index.js', 'export const text = '+JSON.stringify(text+' built')+';');
      await fs.writeFile('${out}/index.html', '<html><head></head><body>'+text+' built</body></html>');`);
    await write(`core/embedded/${relative}/test.mjs`, `import assert from 'node:assert/strict'; import {text} from './${out}/index.js'; assert.match(text, /^fresh(?: built)+$/);`);
    await write(`core/embedded/${relative}/${out}/index.html`, 'stale packaged output');
  }
  await write('core/embedded/projects/core/demo/xrb-project.json', { name: 'Demo', kind: 'app', entry: 'site', scripts: { build: 'compile' } });
  await write('core/embedded/pnpm-lock.yaml', "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  plugins/shared: {}\n  plugins/unused: {}\n  plugins/shared/worker:\n    dependencies:\n      '@fixture/shared':\n        specifier: workspace:*\n        version: link:..\n  projects/core/demo:\n    dependencies:\n      '@fixture/worker':\n        specifier: workspace:*\n        version: link:../../../plugins/shared/worker\n");
  await write('user/plugins/unselected/package.json', { name: 'unselected', scripts: { build: 'node -e "process.exit(77)"' } });
  await write('user/config/preserve.json', { value: 'unchanged' });
  const calls: Array<{ args: string[]; cwd: string }> = [], lines: string[] = [];
  const ctx: JobContext = { line(line) { lines.push(line); }, async run(command, args, options) {
    const cwd = String(options?.cwd); calls.push({ args, cwd });
    assert.ok(cwd.startsWith(path.join(user, 'build'))); assert.equal(options?.env?.XRB_CORE, core);
    assert.equal(options?.env?.npm_config_enable_pre_post_scripts, 'false');
    const testRoot = String(options?.env?.XRB_TEST_ROOT);
    assert.equal(path.basename(path.dirname(testRoot)), 'tests');
    assert.match(path.basename(testRoot), /^[a-f0-9]{16}$/);
    assert.ok(testRoot.startsWith(path.join(user, 'build')));
    assert.ok(!testRoot.startsWith(core));
    const code = await runProcess(command, args, line => lines.push(line), options);
    assert.equal(code, 0, lines.join('\n'));
  } };
  return { root, core, user, embedded, write, calls, lines, ctx };
}

test('real frozen setup/build/test uses a separate graph, builds prerequisites and preserves sources/user data', { timeout: 60000 }, async t => {
  const f = await fixture(t), before = (await buildInventory(f.core)).fingerprint;
  await fs.chmod(path.join(f.embedded, 'package.json'), 0o444);
  const plan = await embeddedWorkspacePlan(f.core), names = plan.packages.map(pkg => pkg.name);
  assert.ok(names.indexOf('@fixture/shared') < names.indexOf('@fixture/worker'));
  assert.ok(names.indexOf('@fixture/worker') < names.indexOf('demo'));
  assert.equal(plan.packages.find(pkg => pkg.name === 'demo')!.build, 'compile');
  const setup = await runEmbeddedWorkspace(f.core, f.user, 'setup', f.ctx);
  assert.equal(setup.built, 0); assert.equal(setup.tested, 0);
  await assert.rejects(fs.access(path.join(setup.workspace, 'projects/core/demo/site')));
  const result = await runEmbeddedWorkspace(f.core, f.user, 'test', f.ctx);
  assert.equal(result.packages, 4); assert.equal(result.built, 4); assert.equal(result.tested, 4);
  assert.notEqual(result.workspace, setup.workspace);
  assert.match(await fs.readFile(path.join(result.workspace, 'projects/core/demo/site/index.html'), 'utf8'), /fresh built built built/);
  assert.equal((await buildInventory(f.core)).fingerprint, before);
  assert.equal(await fs.readFile(path.join(f.user, 'config/preserve.json'), 'utf8'), '{"value":"unchanged"}');
  await assert.rejects(fs.access(path.join(f.user, 'node_modules')));
  assert.equal(JSON.parse(await fs.readFile(path.join(result.root, EMBEDDED_RECEIPT), 'utf8')).status, 'complete');
  await assert.rejects(fs.access(path.join(result.root, EMBEDDED_LOCK)));
  t.diagnostic(f.lines.join('\n'));
});

test('canonical plugin-owned samples register independently without a plugin-root package or arbitrary deep glob', async t => {
  const f = await fixture(t), declaration = path.join(f.embedded, 'pnpm-workspace.yaml'), lock = path.join(f.embedded, 'pnpm-lock.yaml');
  const original = await fs.readFile(declaration, 'utf8');
  await fs.writeFile(declaration, original + "  - 'plugins/*/samples/*'\n");
  await f.write('core/embedded/plugins/owner/samples/diagnostic/package.json', { name: '@fixture/diagnostic', private: true });
  await fs.appendFile(lock, '  plugins/owner/samples/diagnostic: {}\n');
  const plan = await embeddedWorkspacePlan(f.core);
  assert.equal(plan.packages.find(pkg => pkg.name === '@fixture/diagnostic')!.relative, 'plugins/owner/samples/diagnostic');
  assert.equal(plan.packages.length, 5);
  await fs.writeFile(declaration, original + "  - 'plugins/**'\n");
  await assert.rejects(embeddedWorkspacePlan(f.core), /Canonical/);
});

test('project rebuild uses shared graph/install helpers and builds only transitive local prerequisites', { timeout: 60000 }, async t => {
  const f = await fixture(t), before = (await buildInventory(f.core)).fingerprint;
  const p = (await discoverProjectCatalog(f.core, f.user)).projects.find(item => item.key === 'bundled:demo')!.project;
  await rebuildBundledProject(f.core, f.user, p, f.ctx);
  const result = await resolveProjectOutput(f.core, f.user, p);
  assert.equal(result.problem, null); assert.match(await fs.readFile(path.join(result.entry!, 'index.html'), 'utf8'), /fresh built built built/);
  const commands = f.calls.filter(call => call.args.join(' ').includes(' run '));
  assert.equal(commands.length, 3); assert.ok(commands.every(call => !call.cwd.endsWith('unused')));
  const cache = projectBuildRoot(f.core, f.user, p), working = (await fs.readdir(cache)).find(name => name.startsWith('w-'))!;
  await assert.rejects(fs.access(path.join(cache, working, 'workspace/plugins/unused/dist')));
  assert.equal((await buildInventory(f.core)).fingerprint, before);
});

test('ambiguous, missing, implicit, cyclic and escaped package declarations fail before cache writes', async t => {
  const f = await fixture(t), file = path.join(f.embedded, 'plugins/shared/package.json'), original = await fs.readFile(file, 'utf8'), pkg = JSON.parse(original);
  for (const invalid of [
    { ...pkg, name: 'demo' },
    { ...pkg, dependencies: { missing: 'workspace:*' } },
    { ...pkg, dependencies: { demo: '^1.0.0' } },
    { ...pkg, dependencies: { demo: 'workspace:*' } },
    { ...pkg, dependencies: { outside: 'file:../../../../outside' } },
    { ...pkg, packageManager: 'pnpm@8.0.0' },
    { ...pkg, pnpm: { overrides: {} } },
    { ...pkg, devEngines: { packageManager: { name: 'pnpm', version: '8.0.0' } } },
    { ...pkg, dependenciesMeta: { demo: { injected: true } } },
    { ...pkg, dependencies: { outside: 'git+ssh://git@example.test/repository' } },
    { ...pkg, dependencies: { outside: 'https://user:password@example.test/package.tgz' } },
    { ...pkg, dependencies: { outside: 'https://localhost/private.tgz' } },
  ]) {
    await fs.writeFile(file, JSON.stringify(invalid));
    await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'test', f.ctx));
    assert.equal(f.calls.length, 0); await assert.rejects(fs.access(embeddedStateRoot(f.core, f.user)));
  }
  await fs.writeFile(file, original);
  await f.write('core/embedded/plugins/shared/pnpm-workspace.yaml', "packages:\n - '../*'\n");
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'test', f.ctx), /Nested/);
  await fs.unlink(path.join(f.embedded, 'plugins/shared/pnpm-workspace.yaml'));
  await f.write('core/embedded/.npmrc', 'ignore-scripts=false');
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'test', f.ctx), /configuration/);
  assert.equal(f.calls.length, 0);
});

test('lockfile links, importers, aliases and filesystem resolutions cannot bypass source declarations', async t => {
  const f = await fixture(t), file = path.join(f.embedded, 'pnpm-lock.yaml'), original = await fs.readFile(file, 'utf8');
  for (const changed of [
    original.replace('version: link:..', 'version: link:../../../../outside'),
    original.replace('specifier: workspace:*', 'specifier: ^1.0.0'),
    original.replace('autoInstallPeers: true', 'autoInstallPeers: false'),
    original.replace('version: link:..', 'extra: true\n        version: link:..'),
    original.replace('  .: {}', '  .: {}\n  ../outside: {}'),
    `${original}\nimporters: {}\n`,
    original.replace('importers:', 'importers: &items') + '\nextra: *items\n',
    `${original}\npackages:\n  fixture@1.0.0:\n    resolution: {directory: ../outside, type: directory}\n`,
    `${original}\npackages:\n  fixture@1.0.0:\n    resolution: {tarball: file:../outside.tgz}\n`,
    `${original}\nsnapshots:\n  fixture@1.0.0:\n    dependencies:\n      outside: link:../outside\n`,
  ]) {
    await fs.writeFile(file, changed);
    await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'setup', f.ctx));
    assert.equal(f.calls.length, 0); await assert.rejects(fs.access(embeddedStateRoot(f.core, f.user)));
  }
  await fs.writeFile(file, original);
  assert.equal((await embeddedWorkspacePlan(f.core)).packages.length, 4);
});

test('installation cannot hand an escaped dependency link to build scripts', async t => {
  const f = await fixture(t); let calls = 0;
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'build', { line() {}, async run(_cmd, _args, options) {
    calls++;
    await fs.symlink(outside, path.join(String(options!.cwd), 'escaped'), process.platform === 'win32' ? 'junction' : 'dir');
  } }), /link escapes/);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(embeddedStateRoot(f.core, f.user), EMBEDDED_RECEIPT), 'utf8')).status, 'failed');
  assert.deepEqual(await fs.readdir(outside), []);
});

test('failed operations retain working state, preserve foreign locks and reject source changes and unsafe roots', async t => {
  const f = await fixture(t), root = embeddedStateRoot(f.core, f.user);
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'build', { line() {}, async run() { throw new Error('fixture failure'); } }), /fixture failure/);
  const receipt = JSON.parse(await fs.readFile(path.join(root, EMBEDDED_RECEIPT), 'utf8'));
  assert.equal(receipt.status, 'failed'); assert.ok((await fs.readdir(root)).some(name => name.startsWith('w-')));
  await fs.writeFile(path.join(root, EMBEDDED_LOCK), 'foreign');
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'setup', f.ctx), /lock exists/);
  assert.equal(await fs.readFile(path.join(root, EMBEDDED_LOCK), 'utf8'), 'foreign'); await fs.unlink(path.join(root, EMBEDDED_LOCK));
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'setup', { line() {}, async run() { await f.write('core/embedded/changed.txt', 'changed'); } }), /changed during operation/);
  await assert.rejects(runEmbeddedWorkspace(f.core, f.core, 'setup', f.ctx), /outside product/);
  const target = path.join(f.root, 'outside'); await fs.mkdir(target);
  await fs.rename(root, `${root}-preserved`); await fs.symlink(target, root, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runEmbeddedWorkspace(f.core, f.user, 'setup', f.ctx), /link|root|directory/);
  assert.deepEqual(await fs.readdir(target), []); assert.equal(f.calls.length, 0);
});

test('independent workspace operations serialize through the core-scoped lock', async t => {
  const f = await fixture(t), ready = path.join(f.root, 'ready'); await fs.mkdir(ready);
  const script = `import fs from 'node:fs/promises'; import path from 'node:path'; import {runEmbeddedWorkspace} from ${JSON.stringify(import.meta.resolve('../src/embedded-workspace.ts'))};
    const [core,user,ready,id] = process.argv.slice(1); await fs.writeFile(path.join(ready,id),'ready');
    while ((await fs.readdir(ready)).length < 3) await new Promise(r=>setTimeout(r,10));
    try { await runEmbeddedWorkspace(core,user,'setup',{line(){},async run(){await new Promise(r=>setTimeout(r,600));}}); console.log('done'); }
    catch(error) { if (!/lock exists/.test(error.message)) throw error; console.log('locked'); }`;
  const results = await Promise.all([1, 2, 3].map(id => promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, f.core, f.user, ready, String(id)], { timeout: 15000 })));
  assert.equal(results.filter(result => result.stdout.trim() === 'done').length, 1);
  await assert.rejects(fs.access(path.join(embeddedStateRoot(f.core, f.user), EMBEDDED_LOCK)));
});

test('CLI rejects ambiguous options, skips only absent roots explicitly, and core/CI select a separate workspace', async t => {
  assert.equal(parseEmbeddedArgs(['--help']), null);
  for (const args of [['publish'], ['test', '--workspace=a', '--workspace=b'], ['test', '--unknown'], ['setup', '--core=']]) assert.throws(() => parseEmbeddedArgs(args));
  const f = await fixture(t), cli = path.join(REPO, 'tools/embedded/embedded.ts'), absent = path.join(f.root, 'absent'); await fs.mkdir(absent);
  const result = await promisify(execFile)(process.execPath, [cli, 'test', `--core=${absent}`, '--if-present']); assert.match(result.stdout, /explicitly skipped/);
  await promisify(execFile)(process.execPath, [cli, 'setup', `--core=${f.core}`, `--workspace=${f.user}`]);
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'setup', `--core=${f.core}`]), /explicit writable/);
  await fs.unlink(path.join(f.embedded, 'pnpm-lock.yaml'));
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'setup', `--core=${f.core}`, `--workspace=${f.user}`, '--if-present']));
  const coreWorkspace = await fs.readFile(path.join(REPO, 'pnpm-workspace.yaml'), 'utf8');
  assert.doesNotMatch(coreWorkspace, /embedded|\.xrbuild/);
  const scripts = JSON.parse(await fs.readFile(path.join(REPO, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.test, /test:embedded/);
  const ci = await fs.readFile(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /templates\/\|embedded\/\|/); assert.match(ci, /pnpm test:embedded --if-present --workspace=\.artifacts\/embedded-ci/);
});
