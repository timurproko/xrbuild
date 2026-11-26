import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { installCore, installerEnvironment } from '../../../tools/panel-bootstrap/runtime.mjs';
import { CORE_MARKER, WORKSPACE_MARKER, runUpdate, runUpdateCommand, UpdateFailure, type UpdateResult } from '../src/update.ts';
import { rebuildUpdatedSources, setupUpdatedCore } from '../src/update-runtime.ts';
import { JobRunner } from '../src/jobs.ts';
import { fixture } from './helpers/update-fixture.ts';

async function rejected(promise: Promise<unknown>): Promise<UpdateResult> {
  try { await promise; assert.fail('expected failed update'); }
  catch (error) { assert.ok(error instanceof UpdateFailure, String(error)); return error.result; }
}

async function publishGraph(core: Awaited<ReturnType<typeof fixture>>['core'], npmrc = false) {
  await fs.mkdir(path.join(core.publisher, 'packages/app'), { recursive: true });
  await fs.mkdir(path.join(core.publisher, 'tools/setup'), { recursive: true });
  await fs.writeFile(path.join(core.publisher, 'packages/app/package.json'), '{"name":"app","private":true}');
  await fs.writeFile(path.join(core.publisher, 'tools/setup/package.json'), '{"name":"setup","private":true}');
  await fs.writeFile(path.join(core.publisher, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - tools/*\n');
  await fs.writeFile(path.join(core.publisher, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  if (npmrc) await fs.writeFile(path.join(core.publisher, '.npmrc'), 'registry=https://example.invalid\n');
  return core.publish('package.json', '{"private":true,"packageManager":"pnpm@9.15.9"}');
}

test('changed public inputs use the existing pinned frozen hook-disabled installer; no private/native setup', async t => {
  const f = await fixture(t), commands: string[][] = [], setupRoots: string[] = [];
  const target = await publishGraph(f.core); let builds = 0;
  const result = await runUpdate(f.workspace.checkout, f.ctx, {
    core: f.core.checkout, git: f.runner, coreHostCurrent: async () => true, rebuild: async () => { builds++; return ['tracker']; },
    setupCore: async core => {
      setupRoots.push(core);
      await installCore(core, { write: (line: string) => f.ctx.line(line) }, async (_root: string, args: string[], log: { write: (line: string) => void }) => {
        commands.push(args); if (args[0] === '--version') log.write('9.15.9');
      });
    },
  });
  assert.equal(f.core.head(), target); assert.equal(result.coreDependencies, 'prepared'); assert.equal(builds, 1);
  assert.deepEqual(setupRoots, [f.core.checkout]); assert.deepEqual(commands[0], ['--version']);
  assert.ok(commands[1]!.includes('--frozen-lockfile')); assert.ok(commands[1]!.includes('--ignore-scripts')); assert.ok(commands[1]!.includes('--ignore-pnpmfile'));
  assert.ok(commands[1]!.some(arg => arg.startsWith('--config.userconfig=')));
  const sanitized = installerEnvironment({ GIT_CONFIG_COUNT: '1', NODE_OPTIONS: '--inspect', npm_config_registry: 'bad', PNPM_HOME: 'bad' });
  assert.equal(sanitized.GIT_CONFIG_COUNT, undefined); assert.equal(sanitized.NODE_OPTIONS, undefined); assert.equal(sanitized.npm_config_registry, undefined);
  assert.equal(f.lines.at(-1), result.lastLine); assert.match(result.lastLine, /Restart required/);
});

for (const problem of ['frozen-lock', 'network', 'local-config']) test(`post-pull ${problem} failure retains commits, fails honestly and retries at unchanged HEAD`, async t => {
  const f = await fixture(t), target = await publishGraph(f.core, problem === 'local-config');
  const workspaceTarget = await f.workspace.publish(); let fail = true, builds = 0;
  const manager = async (_root: string, args: string[], log: { write: (line: string) => void }) => {
    if (args[0] === '--version') { log.write('9.15.9'); return; }
    if (fail) throw new Error(problem === 'frozen-lock' ? 'ERR_PNPM_OUTDATED_LOCKFILE' : 'network unavailable');
  };
  const deps = { core: f.core.checkout, git: f.runner, coreHostCurrent: async () => true,
    rebuild: async () => { builds++; return ['tracker']; },
    setupCore: async (core: string) => installCore(core, { write: (line: string) => f.ctx.line(line) }, manager) };
  const jobs = new JobRunner(), job = jobs.start('update', null, 'update', ctx => runUpdate(f.workspace.checkout, ctx, deps));
  await jobs.wait(job);
  const result = job.result as UpdateResult;
  assert.equal(job.state, 'failed'); assert.equal(result.coreDependencies, 'failed'); assert.equal(builds, 0);
  assert.equal(f.core.head(), target); assert.equal(f.workspace.head(), workspaceTarget);
  assert.ok(result.repositories.every(repo => repo.pending)); assert.match(job.lines.at(-1)!, /Restart required.*did not restart/);
  assert.match(result.summary, problem === 'local-config' ? /manual review/ : problem === 'frozen-lock' ? /OUTDATED_LOCKFILE/ : /network unavailable/);
  await fs.access(path.join(f.core.checkout, '.git', CORE_MARKER)); await fs.access(path.join(f.workspace.checkout, '.git', WORKSPACE_MARKER));
  fail = false;
  // Config refusal requires a person's review, not automatic removal or a blind retry.
  if (problem === 'local-config') {
    assert.equal(await runUpdateCommand(f.workspace.checkout, f.ctx, deps), 1); assert.equal(builds, 0); return;
  }
  const retry = await runUpdate(f.workspace.checkout, f.ctx, deps);
  assert.equal(retry.state, 'updated'); assert.equal(retry.coreDependencies, 'prepared'); assert.equal(builds, 1);
  assert.ok(retry.repositories.every(repo => repo.from === repo.to && !repo.pending));
  assert.equal(await fs.stat(path.join(f.core.checkout, '.git', CORE_MARKER)).then(() => true, () => false), false);
});

test('build failure resumes for core-only and workspace-only changes without unnecessary installs', async t => {
  for (const role of ['core', 'workspace'] as const) await t.test(role, async t => {
    const f = await fixture(t); const target = await f[role].publish(); let fail = true, installs = 0, builds = 0;
    const deps = { core: f.core.checkout, git: f.runner, coreHostCurrent: async () => false,
      setupCore: async () => { installs++; },
      rebuild: async (pluginsOnly: boolean) => {
        assert.equal(pluginsOnly, false); builds++; if (fail) throw new Error('CMake failed'); return ['tracker'];
      } };
    const result = await rejected(runUpdate(f.workspace.checkout, f.ctx, deps));
    assert.equal(result.state, 'failed'); assert.equal(f[role].head(), target); assert.equal(installs, 0);
    assert.match(f.lines.at(-1)!, /Restart required/); assert.equal(result.repositories.find(repo => repo.role === role)!.pending, true);
    fail = false;
    const retry = await runUpdate(f.workspace.checkout, f.ctx, deps);
    assert.equal(retry.state, 'updated'); assert.deepEqual(retry.rebuilt, ['xrb-host', 'tracker']); assert.equal(builds, 2);
    assert.equal((await runUpdate(f.workspace.checkout, f.ctx, deps)).state, 'up-to-date'); assert.equal(builds, 2);
  });
});

test('fresh installer and native rebuild entry points use the fetched core paths and check child completion', async () => {
  const core = path.resolve('fixture-core'), workspace = path.join(core, '.xrbuild'), calls: unknown[] = [], lines: string[] = [];
  const ctx = { line: (line: string) => lines.push(line), run: async (...args: unknown[]) => { calls.push(args); } };
  await setupUpdatedCore(core, ctx);
  assert.deepEqual(calls, [[process.execPath, [path.join(core, 'tools/panel-bootstrap/update-setup.mjs')], { cwd: core }]]);
  assert.match(lines[0]!, /--frozen-lockfile --ignore-scripts --ignore-pnpmfile/);
  const rebuilt = await rebuildUpdatedSources(core, workspace, ctx, async (cmd, args, onLine, opts) => {
    assert.equal(cmd, process.execPath); assert.deepEqual(args, [path.join(core, 'packages/control-panel/src/update-rebuild.ts'), `--workspace=${workspace}`]);
    assert.equal(opts?.cwd, core); onLine('CMake build output'); onLine('XRB_UPDATE_REBUILD_RESULT ["xrb-host","tracker"]'); return 0;
  });
  assert.deepEqual(rebuilt, ['xrb-host', 'tracker']); assert.ok(lines.includes('CMake build output'));
  await assert.rejects(rebuildUpdatedSources(core, workspace, ctx, async () => 1), /exited with 1/);
  await assert.rejects(rebuildUpdatedSources(core, workspace, ctx, async () => 0), /valid completion/);
  await assert.rejects(rebuildUpdatedSources(core, workspace, ctx, async (_cmd, _args, onLine) => { onLine('XRB_UPDATE_REBUILD_RESULT bad'); return 0; }), /valid completion/);
});
