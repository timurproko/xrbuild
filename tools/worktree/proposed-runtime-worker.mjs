// Disposable offline integration worker. Never imports installed A1 or uses the current session's data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPinnedRuntime, sourceRoot } from './proposed-a1-fixture.mjs';
import { executeGit } from './portable-context.mjs';
import { offlineLocalRemovalDeclaration, invokeOfflineRepositoryAdapter, inspectRuntimeLocalRemoval } from './runtime-removal-adapter.mjs';

const git = (cwd, ...args) => executeGit(cwd, ['-c', 'commit.gpgsign=false', ...args]);
async function liveChild(cwd) {
  const child = spawn(process.execPath, ['-e', "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));console.log('ready');"], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
  return { child, closed, async stop() { if (child.exitCode === null) child.stdin.end(); return await closed; } };
}
function repository(box) {
  const root = path.join(box, 'primary'), remote = path.join(box, 'remote.git'); fs.mkdirSync(root);
  git(root, 'init', '--quiet', '-b', 'main'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n.artifacts/\n.xrbuild/\n*.local\n');
  fs.writeFileSync(path.join(root, 'source.txt'), 'published fixture source\n');
  fs.mkdirSync(path.join(root, '.a1')); fs.writeFileSync(path.join(root, '.a1/worktree.json'), JSON.stringify(offlineLocalRemovalDeclaration()) + '\n');
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'offline adapter fixture');
  git(root, 'init', '--quiet', '--bare', remote); git(root, 'remote', 'add', 'origin', remote); git(root, 'push', '--quiet', 'origin', 'main');
  const target = path.join(root, '.worktrees/task'), unrelated = path.join(root, '.worktrees/unrelated');
  git(root, 'worktree', 'add', '--quiet', '-b', 'chore/task', target); git(root, 'push', '--quiet', 'origin', 'chore/task');
  git(root, 'worktree', 'add', '--quiet', '-b', 'chore/unrelated', unrelated);
  const calls = [], execute = (cwd, args, options) => { calls.push({ cwd, args: [...args] }); return executeGit(cwd, args, options); };
  const identify = cwd => git(cwd, 'remote', 'get-url', 'origin') === remote ? 'timurproko/xrbuild' : 'foreign/repository';
  return { root, target, unrelated, remote, calls, execute, identify };
}

export async function runProposedRuntimeScenario(scenario = 'new-owner', cacheRoot = sourceRoot) {
  if (!['new-owner', 'missing-generation', 'dirty-preflight', 'changed-declaration', 'late-content'].includes(scenario)) throw Error('Unknown offline scenario');
  const runtime = await loadPinnedRuntime(cacheRoot);
  const box = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'xr-runtime-sequence-'))), children = [];
  try {
    const f = repository(box), context = runtime.context, completion = runtime.completion;
    const shell = await liveChild(f.target), otherProcess = await liveChild(f.root); children.push(shell, otherProcess);
    const session = name => { const identity = { sessionId: name, sessionFile: path.join(box, `${name}.jsonl`) };
      fs.writeFileSync(identity.sessionFile, JSON.stringify({ type: 'session', version: 3, id: name, cwd: f.root }) + '\n'); return identity; };
    const first = session('first-session'), other = session('other-session'), dataDir = path.join(box, 'isolated-data');
    const options = { dataDir, runtimeId: 'first-runtime' }, otherOptions = { dataDir, runtimeId: 'other-runtime' };
    // Real PIDs and the pinned runtime's actual process-liveness implementation; no invented ownership/generation.
    await context.registerSessionRepositoryRuntime(first, options.runtimeId, { pid: process.pid, startIdentity: runtime.liveness.PID_LIVENESS_IDENTITY }, options);
    await context.registerSessionRepositoryRuntime(other, otherOptions.runtimeId, { pid: otherProcess.child.pid, startIdentity: runtime.liveness.PID_LIVENESS_IDENTITY }, otherOptions);
    await context.setSessionRepositoryContext(first, f.target, options);
    const events = [], dependencies = { execute: f.execute, identify: f.identify,
      readClaimState: snapshot => context.sessionWorktreeClaimState(snapshot.common, snapshot.admin, options) };
    const run = async (command, args, cwd) => {
      const attached = await context.readActiveSessionRepositoryContext(first, options);
      const event = { phase: args[1], command, args, cwd, attached: attached?.cwd ?? null, shellAlive: shell.child.exitCode === null };
      events.push(event);
      // Only the subprocess transport is replaced: eligibility/error JSON comes from actual XR code.
      const stdout = await invokeOfflineRepositoryAdapter(command, args, cwd, dependencies);
      event.report = JSON.parse(stdout); return stdout;
    };
    if (scenario === 'dirty-preflight') fs.writeFileSync(path.join(f.target, 'notes.local'), 'synthetic ignored content');
    let request, requestError;
    try { request = await completion.requestSessionWorktreeLocalRemoval(first, { ...options, run }); }
    catch (error) { requestError = { code: error.code, message: error.message }; }
    if (requestError) return { revision: runtime.revision, scenario, requestError, events,
      stillAttached: (await context.readActiveSessionRepositoryContext(first, options))?.cwd === f.target,
      targetPreserved: fs.existsSync(f.target), deletionCalls: f.calls.filter(call => call.args[0] === 'worktree' && call.args[1] === 'remove').length };
    const detached = await context.readActiveSessionRepositoryContext(first, options) === null;
    const afterDetachState = await context.sessionWorktreeClaimState(path.join(f.root, '.git'), git(f.target, 'rev-parse', '--absolute-git-dir'), options);
    if (scenario === 'new-owner') await context.setSessionRepositoryContext(other, f.target, otherOptions);
    if (scenario === 'changed-declaration') {
      const declaration = offlineLocalRemovalDeclaration(); declaration.localRemoval.execute.push('--changed');
      fs.writeFileSync(path.join(f.root, '.a1/worktree.json'), JSON.stringify(declaration) + '\n');
    }
    if (scenario === 'late-content') fs.writeFileSync(path.join(f.target, 'notes.local'), 'synthetic content after detach');
    const secondOwner = await context.readActiveSessionRepositoryContext(other, otherOptions);
    const ownerState = await context.sessionWorktreeClaimState(path.join(f.root, '.git'), git(f.target, 'rev-parse', '--absolute-git-dir'), options);
    // An actual child had cwd=target and remained alive through preflight/detach/acquisition. Settle only after exit.
    const shellExit = await shell.stop(), shellExitedBeforeSettlement = shell.child.exitCode !== null;
    const settled = await completion.settleSessionWorktreeCompletion(first, { ...options, run });
    const replay = await completion.settleSessionWorktreeCompletion(first, { ...options, run });
    const observed = await context.withSessionRepositoryObservation(first, value => ({ ...value, source: fs.readFileSync(path.join(value.cwd, 'source.txt'), 'utf8') }), options);
    const directExecution = scenario === 'new-owner' ? await inspectRuntimeLocalRemoval({ phase: 'execute', root: f.root, target: f.target, ...dependencies }) : null;
    const result = { revision: runtime.revision, scenario, mockedDependencies: runtime.mockedDependencies, request, events,
      preflightPassed: events[0]?.report?.results[0]?.disposition === 'eligible',
      preflightWhileOwned: events[0]?.attached === f.target && events[0]?.shellAlive === true,
      detached, afterDetachState, secondOwnerAcquired: secondOwner?.cwd === f.target, ownerState, shellExit, shellExitedBeforeSettlement,
      settled, replay, directExecution,
      targetPreserved: fs.existsSync(f.target) && fs.readFileSync(path.join(f.target, 'source.txt'), 'utf8') === 'published fixture source\n',
      unrelatedCheckoutPreserved: fs.existsSync(f.unrelated) && git(f.unrelated, 'rev-parse', 'HEAD') === git(f.root, 'rev-parse', 'HEAD'),
      bulkSweepCalls: events.filter(event => event.args.some(arg => arg === 'sweep')).length,
      deletionCalls: f.calls.filter(call => call.args[0] === 'worktree' && call.args[1] === 'remove').length,
      sessionUsableOutsideTarget: observed.cwd === f.root && observed.revision === 'unlinked' && observed.source === 'published fixture source\n',
      liveAdoption: 'disabled', releasedCompatibility: 'unverified' };
    await context.releaseSessionRepositoryRuntime(options.runtimeId, { pid: process.pid, startIdentity: runtime.liveness.PID_LIVENESS_IDENTITY }, options);
    await context.releaseSessionRepositoryRuntime(otherOptions.runtimeId, { pid: otherProcess.child.pid, startIdentity: runtime.liveness.PID_LIVENESS_IDENTITY }, otherOptions);
    return result;
  } finally {
    for (const child of children) await child.stop();
    runtime.dispose(); fs.rmSync(box, { recursive: true, force: true }); // Only tool-created disposable fixtures, after child exit.
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(JSON.stringify(await runProposedRuntimeScenario(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(JSON.stringify({ error: error.message, code: error.code })); process.exitCode = 1; }
}
