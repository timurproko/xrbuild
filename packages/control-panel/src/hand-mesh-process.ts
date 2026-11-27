// Native ownership is deliberately separate from processor packets. Worker stderr never reaches this channel.
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function meshProcessBootstrap(program: string, args: string[], cwd: string, job: string): Buffer {
  if (!path.isAbsolute(program) || !path.isAbsolute(cwd) || args.length > 16) throw new Error('Invalid mesh process bootstrap');
  const parts = [Buffer.alloc(8)]; parts[0].writeUInt32LE(process.pid, 0); parts[0].writeUInt32LE(args.length, 4);
  for (const value of [job, cwd, program, ...args]) {
    if (value.includes('\0')) throw new Error('Invalid mesh process argument');
    const text = Buffer.from(value, 'utf8'), size = Buffer.alloc(4); size.writeUInt32LE(text.length); parts.push(size, text);
  }
  const body = Buffer.concat(parts), size = Buffer.alloc(4); size.writeUInt32LE(body.length);
  if (body.length > 65536) throw new Error('Mesh bootstrap exceeds bound');
  return Buffer.concat([size, body]);
}
const delay = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms).unref(); });
export class HandMeshProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly job = `Local\\xrb-mesh-${randomUUID()}`;
  pid = 0;
  birth = '0';
  private joined = false;
  private closed = false;
  private stopping: Promise<void> | null = null;
  private close: Promise<void>;
  private supervisor: string;
  constructor(supervisor: string, program: string, args: string[], cwd: string) {
    this.supervisor = supervisor;
    const bootstrap = meshProcessBootstrap(program, args, cwd, this.job); // Validate before any process exists.
    this.child = spawn(supervisor, [], { cwd, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', PYTHONSTARTUP: '', HF_HUB_OFFLINE: '1' } });
    const child = this.child;
    this.close = new Promise(resolve => { child.once('close', () => { this.closed = true; resolve(); }); });
    child.on('error', () => {}); child.stdin.on('error', () => {});
    let text = '';
    child.stderr.on('data', (bytes: Buffer) => {
      text += bytes.toString('utf8');
      if (text.length > 4096) { child.kill(); return; }
      for (;;) {
        const end = text.indexOf('\n'); if (end < 0) break;
        const line = text.slice(0, end); text = text.slice(end + 1);
        try {
          const m = JSON.parse(line);
          if (!Number.isSafeInteger(m.pid) || m.pid <= 0 || typeof m.birth !== 'string' || !/^[1-9][0-9]{0,19}$/.test(m.birth)) throw new Error();
          if (m.phase === 'spawned' && !this.pid) { this.pid = m.pid; this.birth = m.birth; }
          else if (m.phase === 'joined' && m.pid === this.pid && m.birth === this.birth) this.joined = true;
          else throw new Error();
        } catch { child.kill(); }
      }
    });
    child.stdin.write(bootstrap);
  }
  static async start(supervisor: string | undefined, program: string, args: string[], cwd: string, cancelled = () => false): Promise<HandMeshProcess> {
    if (process.platform !== 'win32' || !supervisor || !path.isAbsolute(supervisor)) throw new Error('Mesh containment unavailable; Rebuild the host');
    const stat = await fs.lstat(supervisor);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Mesh supervisor is unsafe; Rebuild the host');
    if (cancelled()) throw new Error('Mesh start cancelled');
    return new HandMeshProcess(supervisor, program, args, cwd);
  }
  stop(packet?: Uint8Array): Promise<void> {
    if (this.stopping) return this.stopping;
    const operation = (async () => {
      if (!this.closed) {
        if (!this.child.stdin.destroyed) this.child.stdin.end(packet);
        await Promise.race([this.close, delay(7500)]);
        if (!this.closed) { this.child.kill(); await Promise.race([this.close, delay(2000)]); }
      }
      if (!this.closed) throw new Error('Mesh supervisor did not exit');
      if (!this.joined) {
        const verified = await new Promise<boolean>(resolve => {
          execFile(this.supervisor, ['--verify', this.job, String(this.pid), this.birth], { windowsHide: true, timeout: 11000 }, error => resolve(!error));
        });
        if (!verified) throw new Error('Mesh process tree cleanup could not be verified');
      }
    })();
    this.stopping = operation;
    void operation.catch(() => { if (this.stopping === operation) this.stopping = null; }); // Retry failed verification, never cache failed cleanup as success.
    return operation;
  }
}
