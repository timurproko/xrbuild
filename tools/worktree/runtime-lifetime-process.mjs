// Isolated destructive-process probes. Authority is inherited ONLY through the actual packaged runner.
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const [role, encoded] = process.argv.slice(2), config = JSON.parse(Buffer.from(encoded, 'base64url'));
const boundary = await import(config.boundaryModuleUrl);
const self = fileURLToPath(import.meta.url);
function connect(name) {
  const socket = net.connect(config.port, '127.0.0.1'); socket.setEncoding('utf8');
  socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
  socket.once('connect', () => socket.write(JSON.stringify({ role: name, pid: process.pid }) + '\n'));
  return socket;
}
if (role === 'mutator') {
  const socket = connect('mutator'); let input = '';
  socket.on('data', chunk => { input += chunk; if (!input.includes('finish\n')) return;
    fs.writeFileSync(config.target + '/source.txt', 'tracked cleanup child mutation\n');
    socket.end(); process.exit(0);
  });
} else if (role === 'controller') {
  const socket = connect('controller');
  // Deliberate adverse fixture: a participating destructive descendant survives this controller.
  void boundary.executeCleanupCommand(process.execPath, [self, 'mutator', encoded], { cwd: config.root, protectTarget: true, timeoutMs: 30_000 }).catch(() => {});
  socket.on('data', chunk => { if (chunk.includes('exit\n')) process.exit(0); });
} else if (role === 'holder') {
  process.on('message', message => {
    if (message === 'suspend') { process.send({ suspended: true }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 14_000); process.send({ resumed: true }); }
    if (message === 'die') process.exit(73);
  });
  try {
    if (config.xrController) {
      const { inspectRuntimeLocalRemoval } = await import('./runtime-removal-adapter.mjs');
      const { executeOwnershipCommand } = await import('./ownership-exclusion.mjs');
      const { loadPinnedRuntime } = await import('./proposed-a1-fixture.mjs');
      const { executeGit } = await import('./portable-context.mjs');
      const runtime = await loadPinnedRuntime();
      const dependencies = { root: config.root, target: config.target, approvedSnapshot: config.approved, runtime,
        runtimeOptions: { dataDir: config.dataDir }, execute: executeGit,
        identify: cwd => executeGit(cwd, ['remote', 'get-url', 'origin']) === config.remote ? 'timurproko/xrbuild' : 'foreign/repository',
        remove: (_root, _target, scope, snapshot) => executeOwnershipCommand(scope, snapshot, process.execPath, [self, 'mutator', encoded]) };
      const preflight = await inspectRuntimeLocalRemoval({ ...dependencies, phase: 'preflight' });
      if (preflight.results[0].disposition !== 'eligible') throw Error(JSON.stringify(preflight));
      const result = await inspectRuntimeLocalRemoval({ ...dependencies, phase: 'execute' });
      if (result.results[0].disposition !== 'removed') throw Error(JSON.stringify(result));
    } else await boundary.executeUnclaimedWorktreeCleanup(config.approved, process.execPath,
      [self, config.descendant ? 'controller' : 'mutator', encoded], { dataDir: config.dataDir, cwd: config.root, timeoutMs: 30_000 });
    process.send({ settled: 'finished' });
  } catch (error) { process.send({ settled: 'blocked', code: error.code, reason: error.message }); }
  process.disconnect();
} else throw Error('Unknown isolated lifetime role');
