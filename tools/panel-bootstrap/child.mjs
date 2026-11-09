// Own logging before any external imports; detached server never inherits a bootstrap pipe.
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createLog, lineSink} from './runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = path.join(root, 'packages/control-panel/src/server.ts');
const log = createLog(process.env.XRB_STARTUP_LOG);
for (const stream of [process.stdout, process.stderr]) {
  const sink = lineSink(value => log.write(value));
  stream.write = (chunk, encoding, callback) => {
    sink.write(chunk);
    const done = typeof encoding === 'function' ? encoding : callback; if (done) queueMicrotask(done);
    return true;
  };
  process.on('exit', () => sink.end());
}
// Keep main's direct-entry guard and the original routing/shortcut recovery contracts.
process.argv = [process.execPath, server, ...process.argv.slice(3)];
try { await import(pathToFileURL(server).href); }
catch (error) { log.write(error.stack || String(error)); process.exitCode = 1; }
