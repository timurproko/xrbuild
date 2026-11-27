// Test-owned process helpers: CI may omit XRB_TEST_ROOT or supply a relative one.
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function meshFixtureDirectory(prefix: string, parent = process.env.XRB_TEST_ROOT ?? '.artifacts'): Promise<string> {
  const absolute = path.resolve(parent);
  await fs.mkdir(absolute, { recursive: true });
  return fs.mkdtemp(path.join(absolute, prefix));
}

/** Read a complete fixture line (or exact byte count), rejecting startup exit/EOF/error instead of hanging. */
export function meshFixtureOutput(child: ChildProcess, options: { bytes?: number; timeoutMs?: number } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout, stderr = child.stderr;
    if (!stdout) { reject(new Error('Fixture has no stdout pipe')); return; }
    let output = Buffer.alloc(0), diagnostic = '';
    const cleanup = () => {
      clearTimeout(timer); stdout.removeListener('data', data); stdout.removeListener('end', ended); stdout.removeListener('error', error);
      child.removeListener('close', closed); child.removeListener('error', error); stderr?.removeListener('data', errors);
      stderr?.resume(); // A fixture diagnostic must never back-pressure a child after successful startup.
    };
    const fail = (reason: string) => { cleanup(); reject(new Error(`${reason}${diagnostic ? `: ${diagnostic.trim()}` : ''}`)); };
    const error = (cause: Error) => fail(`Fixture error before output: ${cause.message}`);
    const ended = () => fail('Fixture stdout ended before expected output');
    const closed = (code: number | null, signal: NodeJS.Signals | null) => fail(`Fixture exited before expected output (${code ?? signal ?? 'unknown'})`);
    const errors = (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString('utf8')).slice(-4096); };
    const data = (bytes: Buffer) => {
      if (output.length + bytes.length > 4096) { fail('Fixture output exceeded bound'); return; }
      output = Buffer.concat([output, bytes]);
      const length = options.bytes ?? (output.indexOf(10) < 0 ? 0 : output.indexOf(10) + 1);
      if (length && output.length >= length) { cleanup(); resolve(output.subarray(0, length)); }
    };
    const timer = setTimeout(() => fail('Fixture startup output timed out'), options.timeoutMs ?? 5000);
    stdout.on('data', data); stdout.once('end', ended); stdout.once('error', error);
    child.once('close', closed); child.once('error', error); stderr?.on('data', errors);
    if (stdout.readableEnded || stdout.destroyed || child.exitCode !== null || child.signalCode !== null) closed(child.exitCode, child.signalCode);
  });
}

/** Terminate only this spawned fixture, close its owned pipes and join it on every assertion/failure path. */
export function stopMeshFixture(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const pipes = () => { child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); };
    const cleanup = () => { clearTimeout(timer); child.removeListener('close', closed); child.removeListener('error', error); };
    const closed = () => { cleanup(); resolve(); };
    const error = () => { /* Failed spawn still produces close; keep waiting for resource release. */ };
    const timer = setTimeout(() => {
      child.kill('SIGKILL'); pipes(); cleanup(); reject(new Error('Owned test fixture did not close after termination'));
    }, 5000);
    child.once('close', closed); child.on('error', error);
    child.kill(); pipes();
    if (child.exitCode !== null || child.signalCode !== null) closed();
  });
}
