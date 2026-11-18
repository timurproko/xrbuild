import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { routeRepositoryPaths, remoteIdentity, provisionTaskPrivate, verifyTaskCore, verifyPrivateRepository, repositoryInventory, recordTestedRepositories, verifyTestedRepositories, publicRepositorySummary } from './repository-task.mjs';
const REPO = path.resolve(import.meta.dirname, '../..');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
async function fixture(t) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/repository-task-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const seed = path.join(root, 'seed'), privateSeed = path.join(root, 'private-seed'), coreRemote = path.join(root, 'core-origin'), privateRemote = path.join(root, 'private-origin');
  for (const dir of [seed, privateSeed]) {
    await fs.mkdir(dir); git(dir, 'init', '-b', 'main'); git(dir, 'config', 'user.name', 'Fixture'); git(dir, 'config', 'user.email', 'fixture@example.test');
    await fs.writeFile(path.join(dir, '.gitignore'), '.xrbuild/\n.artifacts/\n'); await fs.writeFile(path.join(dir, 'README.md'), 'Disposable repository fixture\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'fixture: initial source');
  }
  // Fixture origins are created without pushing or merging any main branch.
  git(seed, 'clone', '--bare', '--no-hardlinks', seed, coreRemote); git(privateSeed, 'clone', '--bare', '--no-hardlinks', privateSeed, privateRemote);
  git(seed, 'remote', 'add', 'origin', coreRemote); git(seed, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const core = path.join(root, 'task'); git(seed, 'worktree', 'add', '-b', 'feat/repository-fixture', core);
  const options = { core, coreRemote, privateRemote, privateBranch: 'feat/repository-fixture', allowLocal: true, paths: ['packages/sdk/src/core.ts', '.xrbuild/projects/unsorted/example/index.html'] };
  return { root, seed, privateSeed, options, main: git(seed, 'rev-parse', 'main') };
}

test('owner matrix routes core/embedded/private/paired without a private-to-public staging path', () => {
  assert.equal(remoteIdentity('https://code.example.test/space/core.git', false, true), remoteIdentity('git@code.example.test:space/core.git', false, true));
  assert.notEqual(remoteIdentity('ssh://first@code.example.test/repository'), remoteIdentity('ssh://second@code.example.test/repository'));
  for (const paths of [['native/host/src/main.cpp'], ['embedded/plugins/example/xrb-plugin.json']]) assert.equal(routeRepositoryPaths(paths).scope, 'core');
  assert.equal(routeRepositoryPaths(['.xrbuild/projects/unsorted/example/index.html']).scope, 'private');
  const paired = routeRepositoryPaths(['packages/sdk/src/core.ts', '.xrbuild/plugins/input-example/src/input.cpp']);
  assert.equal(paired.scope, 'paired'); assert.deepEqual(paired.core, ['packages/sdk/src/core.ts']);
  assert.equal(routeRepositoryPaths(['.artifacts/repositories.json']).scope, 'local');
  for (const paths of [['../outside'], ['.git/config'], ['.xrbuild/.git/config'], ['D:/outside'], ['/outside'], ['.xrbuild/../outside'], ['.XRBUILD/plugins/example'], ['.xrbuild./plugins/example'], ['.xrbuild /plugins/example']]) assert.throws(() => routeRepositoryPaths(paths));
});

test('provisioning is opt-in by owner scope, verifies remotes and creates independent task storage', async t => {
  const f = await fixture(t);
  assert.equal((await provisionTaskPrivate({ ...f.options, paths: ['embedded/projects/core/example/xrb-project.json'], privateRemote: undefined })).status, 'not-needed');
  await assert.rejects(fs.access(path.join(f.options.core, '.xrbuild')));
  const result = await provisionTaskPrivate(f.options);
  assert.equal(result.status, 'provisioned'); assert.equal(result.instructionsRequiredBeforeEdits, true);
  assert.equal(result.private.branch, f.options.privateBranch); assert.notEqual(result.private.common, result.core.common);
  assert.equal(git(result.private.root, 'rev-parse', '--is-shallow-repository'), 'false');
  await assert.rejects(fs.access(path.join(result.private.common, 'objects/info/alternates')));
  await fs.writeFile(path.join(result.private.root, 'preserve.txt'), 'uncommitted');
  await assert.rejects(provisionTaskPrivate(f.options), /already exists/);
  assert.equal(await fs.readFile(path.join(result.private.root, 'preserve.txt'), 'utf8'), 'uncommitted');
  assert.equal(git(f.seed, 'branch', '--show-current'), 'main'); assert.equal(git(f.seed, 'rev-parse', 'main'), f.main);
  assert.equal(git(f.seed, 'status', '--porcelain'), '');
});

test('LFS provisioning leaves pointers untouched, creates no relative hook tree, and fingerprints large materialized bytes without filters', async t => {
  const f = await fixture(t), pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 34603008\n`;
  await fs.writeFile(path.join(f.privateSeed, '.gitattributes'), 'binary.dat filter=lfs diff=lfs merge=lfs -text\n');
  await fs.writeFile(path.join(f.privateSeed, 'binary.dat'), pointer);
  git(f.privateSeed, '-c', 'filter.lfs.process=', '-c', 'filter.lfs.clean=', '-c', 'filter.lfs.required=false', 'add', '.gitattributes', 'binary.dat');
  git(f.privateSeed, 'commit', '-m', 'fixture: LFS pointer');
  git(f.options.privateRemote, 'fetch', f.privateSeed, 'main:refs/heads/main');
  const cloned = await provisionTaskPrivate(f.options), root = cloned.private.root;
  assert.equal(await fs.readFile(path.join(root, 'binary.dat'), 'utf8'), pointer);
  await assert.rejects(fs.access(path.join(root, 'dev/null')));
  git(root, 'config', 'filter.lfs.process', 'this-filter-must-never-run'); git(root, 'config', 'filter.lfs.required', 'true');
  const before = await repositoryInventory(f.options);
  await fs.writeFile(path.join(root, 'binary.dat'), Buffer.alloc(33 * 1024 * 1024, 1));
  const after = await repositoryInventory(f.options);
  assert.equal(after.repositories.private.head, before.repositories.private.head);
  assert.notEqual(after.repositories.private.work, before.repositories.private.work);
  await assert.rejects(fs.access(path.join(root, 'dev/null')));
});

test('staged index content cannot alias an identical working tree or dirty status', async t => {
  const f = await fixture(t), options = { ...f.options, paths: ['packages/sdk/src/core.ts'] }, file = path.join(f.options.core, 'README.md');
  const original = await fs.readFile(file);
  const state = async value => { await fs.writeFile(file, value); git(options.core, 'add', 'README.md'); await fs.writeFile(file, original); return repositoryInventory(options); };
  const a = await state('staged A\n'), b = await state('staged B\n');
  assert.equal(a.repositories.core.head, b.repositories.core.head); assert.notEqual(a.repositories.core.work, b.repositories.core.work);
  assert.equal(git(f.seed, 'rev-parse', 'main'), f.main);
});

test('missing access, wrong remotes, primary roots and linked/shared private stores fail without fallback', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyTaskCore(f.seed, f.options.coreRemote, true), /linked task/);
  await assert.rejects(provisionTaskPrivate({ ...f.options, coreRemote: f.options.privateRemote }), /Core remote/);
  await assert.rejects(provisionTaskPrivate({ ...f.options, privateRemote: f.options.coreRemote }), /must differ/);
  const inaccessible = path.join(f.root, 'not-a-repository'); await fs.mkdir(inaccessible);
  await assert.rejects(provisionTaskPrivate({ ...f.options, privateRemote: inaccessible }), /operation failed/);
  const other = await fixture(t), result = await provisionTaskPrivate(other.options);
  git(result.private.root, 'remote', 'set-url', 'origin', other.options.coreRemote);
  await assert.rejects(verifyPrivateRepository(result.core, other.options.privateRemote, other.options.privateBranch, true), /Private remote/);
  git(result.private.root, 'remote', 'set-url', 'origin', other.options.privateRemote);
  const alternate = path.join(result.private.common, 'objects/info/alternates'); await fs.mkdir(path.dirname(alternate), { recursive: true }); await fs.writeFile(alternate, path.join(other.privateSeed, '.git/objects'));
  await assert.rejects(verifyPrivateRepository(result.core, other.options.privateRemote, other.options.privateBranch, true), /alternates/);
  await fs.unlink(alternate);
  git(result.private.root, 'config', 'lfs.storage', path.join(other.privateSeed, '.git/lfs'));
  await assert.rejects(verifyPrivateRepository(result.core, other.options.privateRemote, other.options.privateBranch, true), /LFS storage/);
  git(result.private.root, 'config', '--unset', 'lfs.storage');
  await fs.link(path.join(other.privateSeed, 'README.md'), path.join(result.private.common, 'objects/info/fixture-hardlink'));
  await assert.rejects(verifyPrivateRepository(result.core, other.options.privateRemote, other.options.privateBranch, true), /unlinked/);
});

test('tested handoffs bind exact dirty/untracked work and reject unmerged dependencies and changed heads', async t => {
  const f = await fixture(t); await provisionTaskPrivate(f.options);
  const inventory = await repositoryInventory(f.options);
  const tested = { confirm: 'record-tested-revisions', results: Object.fromEntries(Object.entries(inventory.repositories).map(([role, repo]) => [role, { head: repo.head, work: repo.work, result: 'passed' }])) };
  const record = await recordTestedRepositories(f.options, tested);
  assert.equal((await verifyTestedRepositories(f.options, record)).valid, true);
  assert.deepEqual(publicRepositorySummary(record), { scope: 'paired', coreRequired: true, privateRequired: true, tested: true, dependency: 'not-required', delivery: 'manual' });
  const publicText = JSON.stringify(publicRepositorySummary(record)); assert.ok(!publicText.includes('private-origin')); assert.ok(!publicText.includes(f.options.core)); assert.ok(!publicText.includes(record.repositories.private.head));
  await assert.rejects(verifyTestedRepositories({ ...f.options, paths: ['embedded/other.ts', '.xrbuild/projects/example/index.html'] }, record), /not applicable/);
  const privateRoot = path.join(f.options.core, '.xrbuild');
  git(privateRoot, 'remote', 'set-url', 'origin', f.privateSeed);
  await assert.rejects(verifyTestedRepositories({ ...f.options, privateRemote: f.privateSeed }, record), /changed/);
  git(privateRoot, 'remote', 'set-url', 'origin', f.options.privateRemote);
  const dependent = await repositoryInventory({ ...f.options, paths: ['.xrbuild/projects/example/index.html'], requiredCore: f.main });
  assert.equal(dependent.scope, 'private'); assert.equal(dependent.repositories.core.head, f.main); assert.equal(dependent.dependency, 'merged');
  await fs.writeFile(path.join(f.options.core, '.xrbuild/new-source.txt'), 'new source');
  await assert.rejects(verifyTestedRepositories(f.options, record), /changed/);
  await assert.rejects(recordTestedRepositories(f.options, tested), /stale/);
  await assert.rejects(recordTestedRepositories({ ...f.options, requiredCore: 'f'.repeat(40) }, tested), /not verified merged/);
  await fs.writeFile(path.join(f.options.core, 'README.md'), 'Changed task revision\n');
  git(f.options.core, 'add', 'README.md'); git(f.options.core, 'commit', '-m', 'fixture: changed task revision');
  await assert.rejects(verifyTestedRepositories(f.options, record), /changed/);
  assert.equal(git(f.seed, 'rev-parse', 'main'), f.main);
});

test('CLI writes ignored create-only records, redacts private config, and binds tested work without repository mutations', async t => {
  const f = await fixture(t), cli = path.join(import.meta.dirname, 'repository-task.mjs');
  git(f.options.core, 'remote', 'set-url', 'origin', 'https://example.test/core.git');
  const file = path.join(f.options.core, '.artifacts/repository-config.json'); await fs.mkdir(path.dirname(file));
  const config = { core: f.options.core, coreRemote: 'https://example.test/core.git', privateRemote: 'https://example.test/PRIVATE_HANDOFF_SENTINEL.git', paths: ['embedded/plugins/demo/index.ts'] };
  await fs.writeFile(file, JSON.stringify(config));
  const run = command => execFileSync(process.execPath, [cli, command, '--config=.artifacts/repository-config.json'], { cwd: f.options.core, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.doesNotMatch(run('inventory'), /PRIVATE_HANDOFF_SENTINEL|example\.test/);
  const record = path.join(f.options.core, '.artifacts/repository-inventory.json'), bytes = await fs.readFile(record, 'utf8'), inventory = JSON.parse(bytes);
  assert.throws(() => run('inventory'), /already exists/); assert.equal(await fs.readFile(record, 'utf8'), bytes);
  await fs.writeFile(file, JSON.stringify({ ...config, tested: { confirm: 'record-tested-revisions', results: { core: { result: 'passed', head: inventory.repositories.core.head, work: inventory.repositories.core.work } } } }));
  assert.equal(JSON.parse(run('record')).tested, true); assert.equal(JSON.parse(run('verify')).valid, true);
  await fs.writeFile(path.join(f.options.core, 'new-state.txt'), 'Changed untracked fixture state');
  assert.throws(() => run('verify'), /changed/);
  assert.equal(git(f.seed, 'rev-parse', 'main'), f.main);
});

test('instruction matrix and prerequisite order are explicit without overwriting predecessor changes', async () => {
  const read = file => fs.readFile(path.join(REPO, file), 'utf8');
  const [instructions, delivery, agents, rules] = await Promise.all([
    '.claude/CLAUDE.md', '.claude/skills/change-delivery/SKILL.md', 'AGENTS.md', 'docs/delivery-rules.md',
  ].map(read));
  assert.match(instructions, /audited source snapshot/); assert.match(instructions, /never enroll private packages/i);
  assert.match(agents, /Generic engine code and approved public modules under `embedded\/` belong to the core PR/);
  assert.match(agents, /Private-only work belongs to a private PR/);
  assert.match(agents, /Paired work needs separate PRs/);
  assert.match(delivery, /Shared delivery rules.*delivery-rules\.md/);
  assert.match(rules, /Implementation approval, green CI and an earlier or standing preference MUST NOT authorize merge/);
  assert.match(rules, /Agents and repository controllers MUST NOT arm implementation auto-merge/);
  const prerequisites = await fs.readFile(path.join(REPO, 'openspec/changes/bundled-extensions/prerequisites.md'), 'utf8');
  assert.match(prerequisites, /user-workspace-public-core.*split-private-workspace.*bundled-extensions/s);
  assert.match(prerequisites, /bot.*finalization/i); assert.match(prerequisites, /never.*overwrite.*predecessor/i);
});

test('accepted contract checkpoints require approval, historical preservation and ordinary bot delivery', async () => {
  const read = file => fs.readFile(path.join(REPO, file), 'utf8');
  const [instructions, delivery, context, governance, checkpoint] = await Promise.all([
    '.claude/CLAUDE.md', '.claude/skills/change-delivery/SKILL.md', 'openspec/config.yaml',
    'docs/pr-delivery-governance.md', 'docs/spec-baseline-reconciliation.md',
  ].map(read));
  for (const entry of [instructions, context, governance]) {
    assert.match(entry, /spec-baseline-reconciliation\.md/);
    assert.match(entry, /explicitly.*approved/i);
    assert.match(entry, /bot-finalized and maintainer-merged/);
  }
  assert.match(delivery, /baseline reconciliation.*spec-baseline-reconciliation\.md/);
  assert.match(delivery, /selected change's prerequisite ledger/);
  assert.match(checkpoint, /unverified requirement blocks the checkpoint; a successful syntax check alone is not contract acceptance/);
  assert.match(checkpoint, /user-workspace-public-core[\s\S]*split-private-workspace[\s\S]*bundled-extensions[\s\S]*restore-embedded-project-workflows/);
  assert.match(checkpoint, /Do not edit or archive historical plans, change their task completion/);
  assert.match(checkpoint, /Only the normal trusted repository bot synchronizes and archives/);
  assert.match(checkpoint, /After that actual merge[\s\S]*update only the successor's own prerequisite ledger/);
  assert.match(checkpoint, /PR #4 remains blocked/);
  assert.match(checkpoint, /No private workflow activation/);
});

test('every checkpoint requirement has public evidence before and after bot archival', async () => {
  const change = 'reconcile-public-spec-baseline', changes = path.join(REPO, 'openspec/changes');
  const archived = (await fs.readdir(path.join(changes, 'archive'))).filter(name => name.endsWith(`-${change}`));
  const candidates = [path.join(changes, change), ...archived.map(name => path.join(changes, 'archive', name))];
  const found = [];
  for (const candidate of candidates) {
    try { if ((await fs.stat(path.join(candidate, 'specs'))).isDirectory()) found.push(candidate); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  assert.equal(found.length, 1, 'exactly one active or bot-archived checkpoint must exist');
  const evidence = await fs.readFile(path.join(REPO, 'docs/spec-baseline-reconciliation.md'), 'utf8');
  let requirements = 0;
  for (const capability of await fs.readdir(path.join(found[0], 'specs'))) {
    const delta = await fs.readFile(path.join(found[0], 'specs', capability, 'spec.md'), 'utf8');
    if (capability === 'ci-validation') {
      const predecessor = await fs.readFile(path.join(changes, 'split-private-workspace/specs/ci-validation/spec.md'), 'utf8');
      const scenarios = text => [...text.matchAll(/^#### Scenario: (.+)$/gm)].map(([, name]) => name.trim()).sort();
      assert.deepEqual(scenarios(delta), scenarios(predecessor), 'post-sync CI scenarios must not invalidate the unchanged predecessor');
      assert.match(delta, /Ready public embedded-module, shared-contract, dependency and relevant compiler changes SHALL select/);
      assert.match(delta, /unexpectedly skip SHALL NOT produce a successful required aggregate/);
    }
    for (const [, requirement] of delta.matchAll(/^### Requirement: (.+)$/gm)) {
      assert.ok(evidence.includes(`| ${capability} | ${requirement.trim()} |`), `${capability}/${requirement} lacks an evidence row`);
      requirements++;
    }
  }
  assert.equal(requirements, 26, 'the approved checkpoint has a bounded 26-requirement scope');
  for (const [, file] of evidence.matchAll(/`((?:src|test)\/[^`]+)`/g)) {
    await fs.access(path.join(REPO, 'packages/control-panel', file));
  }
});
