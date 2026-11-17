// Isolated retry/failure transport probes. All ownership decisions and destructive children use the pinned public package.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPinnedRuntime, sourceRoot } from './proposed-a1-fixture.mjs';
import { repository, liveOwner } from './proposed-runtime-worker.mjs';
import { executeGit } from './portable-context.mjs';
import { disposeFixture } from './fixture-disposal.mjs';
import { inspectRuntimeLocalRemoval } from './runtime-removal-adapter.mjs';
import { executeScopedNonForceRemoval } from './published-removal.mjs';
import { executeOwnershipCommand } from './ownership-exclusion.mjs';
const git = (cwd, ...args) => executeGit(cwd, ['-c', 'commit.gpgsign=false', ...args]);

export async function runRetryScenario(scenario, cacheRoot = sourceRoot) {
  if (!['retry-interrupted', 'retry-lost-result', 'retry-prepared', 'retry-merged-prepared'].includes(scenario)) throw Error('Unknown retry probe');
  const runtime = await loadPinnedRuntime(cacheRoot), box = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'xr-retry-')));
  let peer, server; let finished = false;
  try {
    const complete = scenario === 'retry-merged-prepared', f = repository(box, complete), dataDir = path.join(box, 'isolated-data');
    const controller = new AbortController(), runtimeOptions = { dataDir, lockTimeoutMs: 50, signal: controller.signal };
    const approvedSnapshot = await runtime.snapshot.captureWorktreeCleanupSnapshot(f.target);
    let offline = false, commands = 0, capturedChildClosed = false;
    const dependencies = { root: f.root, target: f.target, approvedSnapshot, runtime, runtimeOptions, identify: f.identify,
      execute: (cwd, args, options) => { if (offline && args[0] === 'ls-remote') throw Error('Fixture remote unavailable'); return f.execute(cwd, args, options); },
      ...(complete ? { change: 'fixture', pr: 19, readPull: number => ({ number, state: 'closed', merged: true, merged_at: '2026-11-17T00:00:00Z', merge_commit_sha: f.mergeHead,
        head: { sha: f.head, ref: 'chore/task', repo: { full_name: 'timurproko/xrbuild' } }, base: { ref: 'main', repo: { full_name: 'timurproko/xrbuild' } },
        body: '```openspec-implementation\n{"version":1,"change":"fixture"}\n```' }) } : {}),
      remove: async (root, target, scope, snapshot) => {
        commands++;
        if (scenario === 'retry-interrupted') {
          server = net.createServer(socket => {
            socket.on('error', () => {}); socket.once('data', () => controller.abort());
          });
          await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
          try {
            // Deliberately noisy fixture stderr is not durable agent evidence or permission to expose child output.
            const code = `const net=require('node:net');process.stderr.write('synthetic-private-output');const c=net.connect(${server.address().port},'127.0.0.1',()=>c.write('ready'));setInterval(()=>{},1000);`;
            await executeOwnershipCommand(scope, snapshot, process.execPath, ['-e', code]);
          } finally { capturedChildClosed = true; }
        } else {
          await executeScopedNonForceRemoval(root, target, scope, snapshot);
          if (scenario === 'retry-lost-result') throw Object.assign(Error('Synthetic lost transport response'), { code: 'XRB_TEST_RESPONSE_LOST' });
        }
      } };
    const invoke = (phase, overrides = {}) => inspectRuntimeLocalRemoval({ ...dependencies, phase: complete ? `${phase}-complete` : phase, ...overrides });
    const preflight = await invoke('preflight');
    const directory = path.join(f.root, '.git', 'xrb-removal');
    const journalFile = () => path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.json')));
    const journal = () => fs.readFileSync(journalFile(), 'utf8');
    const prepared = journal(), attempts = [];
    if (scenario.endsWith('prepared')) {
      offline = true; attempts.push(await invoke('execute')); offline = false;
      const afterOffline = journal();
      fs.writeFileSync(path.join(f.target, 'retry.local'), 'preserve late ignored data');
      attempts.push(await invoke('execute')); fs.unlinkSync(path.join(f.target, 'retry.local')); // Only the fixture's own just-created synthetic input.
      peer = await liveOwner(f.root, runtime);
      const identity = { sessionId: 'retry-peer', sessionFile: path.join(box, 'peer.jsonl') };
      fs.writeFileSync(identity.sessionFile, JSON.stringify({ type: 'session', version: 3, id: identity.sessionId, cwd: f.root }) + '\n');
      const options = { dataDir, runtimeId: 'retry-peer-runtime' };
      await peer.call('register', { identity, options }); await peer.call('attach', { identity, options, target: f.target });
      attempts.push(await invoke('execute')); await peer.call('detach', { identity, options });
      const beforeRetry = journal(), result = await invoke('execute');
      finished = true;
      return { revision: runtime.revision, packageSha256: runtime.packageSha256, scenario, preflight, attempts, result, commands,
        preparedUnchanged: afterOffline === prepared && beforeRetry === prepared,
        journalPhase: JSON.parse(journal()).phase, targetRemoved: !fs.existsSync(f.target),
        localRefsPreserved: git(f.root, 'show-ref', '--heads') === f.localRefs, remoteRefsPreserved: git(f.remote, 'show-ref') === f.remoteRefs,
        unrelatedPreserved: fs.existsSync(f.unrelated) && git(f.unrelated, 'rev-parse', 'HEAD') === git(f.root, 'rev-parse', 'HEAD') };
    }
    const result = await invoke('execute'), failedJournal = journal(), afterFirstCommands = commands;
    // Use a fresh caller after interruption, never reuse the aborted signal as a false refusal mechanism.
    runtimeOptions.signal = undefined;
    const retry = await invoke('execute'), preflightRetry = fs.existsSync(f.target) ? await invoke('preflight') : null;
    let changedHead, recreated, freshApprovalRetry;
    if (scenario === 'retry-lost-result') {
      git(f.root, 'worktree', 'add', '--quiet', f.target, 'chore/task');
      recreated = await invoke('execute');
      const fresh = await runtime.snapshot.captureWorktreeCleanupSnapshot(f.target);
      freshApprovalRetry = await invoke('execute', { approvedSnapshot: fresh });
    } else {
      fs.writeFileSync(path.join(f.target, 'source.txt'), 'new owner published new content\n');
      git(f.target, 'add', '.'); git(f.target, 'commit', '--quiet', '-m', 'new published head'); git(f.target, 'push', '--quiet', 'origin', 'chore/task');
      changedHead = await invoke('execute');
      const fresh = await runtime.snapshot.captureWorktreeCleanupSnapshot(f.target);
      freshApprovalRetry = await invoke('preflight', { approvedSnapshot: fresh });
    }
    const beforeRefs = git(f.root, 'show-ref', '--heads'), beforeRemoteRefs = git(f.remote, 'show-ref');
    attempts.push(await invoke('execute'));
    finished = true;
    return { revision: runtime.revision, packageSha256: runtime.packageSha256, scenario, preflight, result, retry, preflightRetry,
      changedHead, recreated, freshApprovalRetry, attempts, commands, afterFirstCommands, capturedChildClosed,
      failedJournal: JSON.parse(failedJournal), journalUnchanged: journal() === failedJournal,
      targetPreserved: fs.existsSync(f.target), unrelatedPreserved: fs.existsSync(f.unrelated),
      localRefsPreserved: git(f.root, 'show-ref', '--heads') === beforeRefs, remoteRefsPreserved: git(f.remote, 'show-ref') === beforeRemoteRefs };
  } finally {
    if (peer) await peer.stop();
    if (server) await new Promise(resolve => server.close(resolve));
    runtime.dispose();
    if (finished) disposeFixture(box);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(JSON.stringify(await runRetryScenario(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(JSON.stringify({ code: error.code, error: error.message })); process.exitCode = 1; }
}
