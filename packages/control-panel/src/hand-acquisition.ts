// Native OS ownership, not a workspace lock or heartbeat lease. Helpers never start input.
import { randomBytes } from 'node:crypto';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { LineSplitter } from './jobs.ts';

/** The existing metadata-only option is safe on old hosts; never probe with an unknown flag. */
export function checkHandAcquisitionHost(exe: string, run: typeof execFile = execFile): Promise<void> {
  return new Promise((resolve, reject) => {
    run(exe, ['--list-plugins'], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      let capable = false;
      try {
        const line = String(stdout).split(/\r?\n/).find(value => value.startsWith('@plugins '));
        capable = !error && !!line && JSON.parse(line.slice(9)).handAcquisition === 1;
      } catch { /* Malformed, old or unavailable hosts fail closed before reservation/startup. */ }
      if (capable) resolve(); else reject(new Error('This native host cannot safely share hand acquisition. Rebuild the host before running Hand.'));
    });
  });
}

export interface HandAcquisitionReservation {
  readonly ticket: string;
  handoff(pid: number): Promise<void>;
  close(): Promise<void>;
}
export async function reserveHandAcquisition(exe: string, label: string, options: { testScope?: string; checkLegacyHost?: boolean } = {}): Promise<HandAcquisitionReservation> {
  const ticket = randomBytes(32).toString('hex');
  const child: ChildProcessWithoutNullStreams = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let phase = 'starting', reason = '', ended = false;
  let wake: (() => void) | null = null;
  const notify = () => { wake?.(); wake = null; };
  const output = new LineSplitter(line => {
    if (!line.startsWith('@acquisition ') || line.length > 4096) return;
    try {
      const event = JSON.parse(line.slice(13));
      if (!['reserved', 'transferred', 'failed', 'busy'].includes(event.phase)) return;
      phase = event.phase;
      reason = typeof event.reason === 'string' ? event.reason.slice(0, 1024) : '';
      notify();
    } catch { phase = 'failed'; reason = 'Invalid acquisition helper response'; notify(); }
  });
  let lineBytes = 0;
  child.stdout.setEncoding('utf8').on('data', (text: string) => {
    // No unbounded partial lines, even if the helper protocol fails.
    for (const line of text.split(/(?<=\n)/)) { lineBytes += line.length; if (lineBytes > 16384) { phase = 'failed'; reason = 'Oversized acquisition helper response'; void stop(); notify(); return; } if (line.endsWith('\n')) lineBytes = 0; }
    output.push(text);
  });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  child.on('error', () => { phase = 'failed'; reason = 'Hand acquisition helper is unavailable. Rebuild the host before running Hand.'; notify(); });
  child.on('close', () => { ended = true; output.flush(); notify(); });
  async function wait(expected: string, timeout: number) {
    const deadline = performance.now() + timeout;
    while (phase !== expected) {
      if (ended || phase === 'failed' || phase === 'busy') throw new Error(reason || 'Hand acquisition reservation ended before handoff');
      const left = deadline - performance.now();
      if (left <= 0) throw new Error('Hand acquisition reservation timed out; no competing provider was started');
      await new Promise<void>(resolve => { const timer = setTimeout(() => { wake = null; resolve(); }, left); wake = () => { clearTimeout(timer); resolve(); }; });
    }
  }
  async function stop() {
    child.stdin.end();
    if (ended) return;
    const closed = once(child, 'close').then(() => true, () => true);
    const timer = setTimeout(() => child.kill(), 5500);
    try { await closed; } finally { clearTimeout(timer); }
  }
  child.stdin.write(JSON.stringify({ version: 1, label: label.slice(0, 255), ticket, ...options }) + '\n');
  try { await wait('reserved', 5000); }
  catch (error) { await stop(); throw error; }
  return {
    ticket,
    async handoff(pid) {
      if (!Number.isSafeInteger(pid) || pid <= 0 || ended || phase !== 'reserved') throw new Error('Invalid acquisition handoff process');
      child.stdin.write(JSON.stringify({ pid }) + '\n');
      try { await wait('transferred', 7000); } finally { await stop(); }
    },
    close: stop,
  };
}
