// Actual artifact/process integration; no lock/claim records, ownership booleans or expected outcomes are mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadPinnedRuntime } from './proposed-a1-fixture.mjs';
import { repository, liveOwner } from './proposed-runtime-worker.mjs';
import { executeGit } from './portable-context.mjs';

export async function runLifetimeScenario(scenario) {
  if (!['holder-suspension', 'holder-death', 'tracked-descendant'].includes(scenario)) throw Error('Unknown lifetime probe');
  const runtime = await loadPinnedRuntime(), box = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'xr-child-lifetime-')));
  const sockets = new Map(), arrivals = new Map(); let holder, owner, childPid, holderClosed, completed = false;
  const server = net.createServer(socket => {
    socket.setEncoding('utf8'); let input = '';
    socket.on('error', error => { if (error.code !== 'ECONNRESET') socket.destroy(error); });
    socket.on('data', chunk => { input += chunk; const end = input.indexOf('\n'); if (end < 0) return;
      const record = JSON.parse(input.slice(0, end)); sockets.set(record.role, socket);
      if (record.role === 'mutator') childPid = record.pid;
      arrivals.get(record.role)?.(record);
    });
  });
  const waitRole = role => sockets.has(role) ? Promise.resolve() : new Promise(resolve => arrivals.set(role, resolve));
  const messages = [], waiters = [];
  const waitMessage = predicate => {
    const existing = messages.find(predicate); if (existing) return Promise.resolve(existing);
    return new Promise(resolve => waiters.push({ predicate, resolve }));
  };
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const f = repository(box), dataDir = path.join(box, 'isolated-data'), approved = await runtime.snapshot.captureWorktreeCleanupSnapshot(f.target);
    owner = await liveOwner(f.root, runtime);
    const identity = { sessionId: 'lifetime-peer', sessionFile: path.join(box, 'peer.jsonl') };
    fs.writeFileSync(identity.sessionFile, JSON.stringify({ type: 'session', version: 3, id: identity.sessionId, cwd: f.root }) + '\n');
    const options = { dataDir, runtimeId: 'lifetime-peer-runtime', lockTimeoutMs: 50 };
    await owner.call('register', { identity, options });
    const config = { root: f.root, target: f.target, dataDir, approved, boundaryModuleUrl: runtime.boundaryModuleUrl,
      port: server.address().port, descendant: scenario === 'tracked-descendant' };
    holder = spawn(process.execPath, [fileURLToPath(new URL('./runtime-lifetime-process.mjs', import.meta.url)), 'holder', Buffer.from(JSON.stringify(config)).toString('base64url')], {
      cwd: f.root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    holderClosed = once(holder, 'close');
    let errors = ''; holder.stderr.on('data', bytes => { errors += bytes; });
    holder.on('message', message => { messages.push(message); for (const waiter of waiters) if (waiter.predicate(message)) waiter.resolve(message); });
    const timed = promise => Promise.race([promise, delay(30_000, undefined, { ref: false }).then(() => { throw Error(`Lifetime probe deadline: ${errors}`); })]);
    await timed(waitRole('mutator')); // A real destructive child has started inside the package reservation.
    const claimAttempt = async () => {
      try { await owner.call('attach', { identity, options, target: f.target }); return 'acquired'; }
      catch (error) { return error.code; }
    };
    assert.equal(await claimAttempt(), 'worktree-claim-busy');
    let settled, stoppedHolder = false;
    if (scenario === 'holder-suspension') {
      holder.send('suspend'); await timed(waitMessage(message => message.suspended));
      await delay(11_500); // Beyond the obsolete stale lease, not a longer production lease or polling exclusion.
      assert.equal(await claimAttempt(), 'worktree-claim-busy');
      sockets.get('mutator').write('finish\n');
      await timed(waitMessage(message => message.resumed)); settled = await timed(waitMessage(message => message.settled));
      assert.equal(settled.settled, 'finished');
      await timed(holderClosed); stoppedHolder = true;
      assert.equal(await claimAttempt(), 'acquired', 'Only actual child close and normal holder completion release authority');
      await owner.call('detach', { identity, options });
    } else {
      if (scenario === 'holder-death') { holder.send('die'); const [code] = await timed(holderClosed); assert.equal(code, 73); stoppedHolder = true; await delay(11_500); }
      else {
        await timed(waitRole('controller')); sockets.get('controller').write('exit\n');
        settled = await timed(waitMessage(message => message.settled));
        assert.equal(settled.code, 'worktree-cleanup-child-unverifiable'); await timed(holderClosed); stoppedHolder = true;
      }
      assert.equal(await claimAttempt(), 'worktree-claim-busy', 'Parent death/return never grants another editing claim while a descendant survives');
      const closed = new Promise(resolve => sockets.get('mutator').once('close', resolve)); sockets.get('mutator').write('finish\n'); await timed(closed);
      assert.equal(await claimAttempt(), 'worktree-claim-busy', 'Orphaned intent is retained for verified recovery, never evicted by age/dead PID');
    }
    // Child TCP closes during exit; bounded teardown liveness is NOT editing/deletion authority.
    for (let n = 0; n < 100; n++) {
      try { process.kill(childPid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
      if (n === 99) throw Error('Known fixture child has not exited'); await delay(20);
    }
    assert.equal(fs.readFileSync(path.join(f.target, 'source.txt'), 'utf8'), 'tracked cleanup child mutation\n');
    completed = true;
    return { scenario, revision: runtime.revision, packageSha256: runtime.packageSha256, stoppedHolder,
      targetPreserved: fs.existsSync(f.target), unrelatedPreserved: fs.existsSync(f.unrelated),
      localRefsPreserved: executeGit(f.root, ['show-ref', '--heads']) === f.localRefs,
      remoteRefsPreserved: executeGit(f.remote, ['show-ref']) === f.remoteRefs,
      takeoverPrevented: true, destructiveChildActuallyRan: true, liveAdoption: 'disabled', releasedCompatibility: 'unverified' };
  } finally {
    if (owner) await owner.stop();
    for (const socket of sockets.values()) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    // All successful probes await their exact fixture children. A failed probe retains its box for diagnosis.
    if (completed) fs.rmSync(box, { recursive: true, force: true });
    runtime.dispose();
  }
}
