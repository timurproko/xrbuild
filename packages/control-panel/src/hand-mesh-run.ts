import http from 'node:http';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { meshPacket, readMeshPacket, decodeMeshResult, encodeMeshResult, validMeshFrame, validMeshCapabilities, MESH_CAPABILITIES, MESH_MAX_BYTES, type MeshFrame, type MeshRuntime } from '../../sdk/src/hand-mesh-protocol.ts';
import type { HandMeshPlugin } from './hand-mesh-plugins.ts';
import { handMeshSettings } from './hand-mesh-contract.ts';

type Work = { frame: MeshFrame; response: http.ServerResponse; at: number };
/** Run-owned optional service. No wait in the host input path; failures affect mesh only. */
export class HandMeshRun {
  status = 'Starting';
  readonly server: http.Server;
  descriptor: MeshRuntime | null = null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private protocol: 1 | 2 = 1;
  private needsObservations = false;
  private modernConsumer = false;
  private runId = randomUUID();
  private closed = false;
  private stopping: Promise<void> | null = null;
  private current: Work | null = null;
  private pending: Work | null = null;
  private epoch = '';
  private retired = new Set<string>();
  private bytes = Buffer.alloc(0);
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastSequence = -1;
  private lastRequest = 0;
  private appStartedAtLeastOnce = false;
  private connectTimeoutMs: number;
  private startupTimeoutMs: number;
  /** The host has spawned; allow its document/SDK to load before diagnosing an old client. */
  appStarted(): void {
    if (this.closed || this.appStartedAtLeastOnce) return;
    this.appStartedAtLeastOnce = true;
    this.later(() => { if (!this.epoch) this.fail('rebuild/relaunch the app to connect mesh drawing'); }, this.connectTimeoutMs);
  }
  private watchConsumer() {
    this.later(() => {
      if (this.closed) return;
      if (performance.now() - this.lastRequest > 2000) this.fail('mesh view disconnected');
      else this.watchConsumer();
    }, 1000);
  }
  private changed: (status: string) => void;
  private origins: () => string[];
  constructor(origins: () => string[], changed: (status: string) => void = () => {}, timings: { startupMs?: number; connectMs?: number } = {}) {
    this.origins = origins; this.changed = changed;
    this.startupTimeoutMs = timings.startupMs ?? 90000;
    this.connectTimeoutMs = timings.connectMs ?? 30000;
    this.server = http.createServer((req, res) => { void this.request(req, res).catch(() => { if (!res.headersSent) res.writeHead(400); res.end(); }); });
    this.server.requestTimeout = 3000; this.server.headersTimeout = 3000;
  }
  private setStatus(value: string) { if (this.status !== value) { this.status = value; this.changed(value); } }
  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, ms); this.timers.add(timer); return timer;
  }
  async start(plugin: HandMeshPlugin, settings: unknown): Promise<MeshRuntime> {
    if (!plugin.available || !plugin.program) throw new Error('Mesh plugin unavailable');
    const values = handMeshSettings(plugin.declaration, settings);
    this.protocol = plugin.declaration.version;
    this.needsObservations = !!plugin.declaration.capabilities?.includes('final-pose-observations-v1');
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', () => { this.server.removeListener('error', reject); resolve(); }); });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('No mesh endpoint');
    this.descriptor = { version: 1, url: `http://127.0.0.1:${address.port}`, token: randomBytes(32).toString('hex') };
    const child = spawn(plugin.program, plugin.declaration.args, { cwd: path.dirname(plugin.program), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', PYTHONSTARTUP: '', HF_HUB_OFFLINE: '1' } });
    this.child = child;
    child.stdin.on('error', () => this.fail('sidecar pipe closed'));
    child.stderr.resume(); // Never forward untrusted logs or credentials to the panel.
    child.stdout.on('data', (chunk: Buffer) => this.output(chunk));
    child.once('error', () => this.fail('sidecar could not start'));
    child.once('exit', () => { if (!this.closed) this.fail('sidecar exited'); });
    child.stdin.write(meshPacket({ type: 'start', version: this.protocol,
      ...(this.protocol === 2 ? { runId: this.runId, settingsGeneration: 1, capabilities: plugin.declaration.capabilities } : {}), owner: plugin.owner, id: plugin.id, settingsVersion: plugin.declaration.settingsVersion, settings: values,
      limits: { hands: 2, vertices: 16384, triangles: 32768, bytes: MESH_MAX_BYTES }, ownerLoss: 'exit-on-stdin-end' }));
    this.later(() => { if (!this.ready) this.fail('sidecar ready timeout'); }, 10000);
    // Covers dev preparation plus host/document loading, even if no app-start notification arrives.
    this.later(() => { if (!this.epoch) this.fail('app startup timeout before mesh connection'); }, this.startupTimeoutMs);
    return this.descriptor;
  }
  private reply(work: Work | null, bytes?: Uint8Array) {
    if (!work || work.response.writableEnded || work.response.destroyed) return;
    if (bytes) { work.response.writeHead(200, { 'content-type': 'application/octet-stream' }); work.response.end(bytes); }
    else { work.response.setHeader('x-xrb-mesh-status', this.status); work.response.writeHead(204); work.response.end(); }
  }
  private pump() {
    if (!this.ready || this.current || !this.pending || this.closed) return;
    this.current = this.pending; this.pending = null;
    const work = this.current;
    const frame = this.protocol === 2 ? { ...work.frame, version: 2, runId: this.runId, settingsGeneration: 1 } : {
      type: 'frame', epoch: work.frame.epoch, sequence: work.frame.sequence, revision: work.frame.revision, sentMs: work.frame.sentMs, sampleMs: work.frame.sampleMs,
      hands: work.frame.hands.map(({ id, handedness, keypoints }) => ({ id, handedness, keypoints })),
    };
    this.child?.stdin.write(meshPacket(frame));
    this.later(() => { if (this.current === work) { this.setStatus('Skeleton fallback: mesh is late'); this.reply(work); } }, 33);
    this.later(() => { if (this.current === work) this.fail('sidecar frame timeout'); }, 2000);
  }
  private output(chunk: Buffer) {
    if (this.closed) return;
    if (this.bytes.length + chunk.length > MESH_MAX_BYTES) { this.fail('oversized sidecar output'); return; }
    this.bytes = Buffer.concat([this.bytes, chunk]);
    try {
      while (this.bytes.length >= 12) {
        const size = 12 + this.bytes.readUInt32LE(4) + this.bytes.readUInt32LE(8);
        if (size > MESH_MAX_BYTES) throw new Error('oversized');
        if (this.bytes.length < size) return;
        const packet = this.bytes.subarray(0, size); this.bytes = this.bytes.subarray(size);
        const { meta } = readMeshPacket(packet);
        if (meta.type === 'ready' && meta.version === this.protocol && !this.ready) {
          if (this.protocol === 2 && (!validMeshCapabilities(meta.capabilities) || meta.runId !== this.runId || meta.settingsGeneration !== 1)) throw new Error('capabilities');
          this.ready = true; this.setStatus('Ready; app mesh not started'); this.pump();
          continue;
        }
        const result = decodeMeshResult(packet), work = this.current;
        if (!work || result.epoch !== work.frame.epoch || result.sequence !== work.frame.sequence || result.revision !== work.frame.revision
          || result.meshes.some(m => !work.frame.hands.some(h => h.id === m.id))) throw new Error('association');
        if (this.protocol === 2 && (result.version !== 2 || result.runId !== this.runId || result.settingsGeneration !== 1)) throw new Error('settings association');
        this.current = null;
        if (result.epoch === this.epoch && performance.now() - work.at <= 33) { this.setStatus('Running'); this.reply(work, this.modernConsumer ? encodeMeshResult({ ...result, version: 2, runId: this.runId, settingsGeneration: 1 }) : encodeMeshResult({ ...result, version: undefined })); }
        else { this.setStatus('Skeleton fallback: mesh is late'); this.reply(work); }
        this.pump();
      }
    } catch { this.fail('invalid sidecar output'); }
  }
  private async request(req: http.IncomingMessage, res: http.ServerResponse) {
    const origin = req.headers.origin;
    if (this.closed || !this.descriptor || !origin || !this.origins().includes(origin)) { res.writeHead(403); res.end(); return; }
    res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin'); res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-expose-headers', 'x-xrb-mesh-status');
    if (req.method === 'OPTIONS') { res.setHeader('access-control-allow-methods', 'POST'); res.setHeader('access-control-allow-headers', 'authorization, content-type'); res.writeHead(204); res.end(); return; }
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (req.method !== 'POST' || token.length !== this.descriptor.token.length || !timingSafeEqual(Buffer.from(token), Buffer.from(this.descriptor.token))) { res.writeHead(403); res.end(); return; }
    let bytes = Buffer.alloc(0);
    for await (const chunk of req) { if (bytes.length + chunk.length > 16384) { res.writeHead(413); res.end(); return; } bytes = Buffer.concat([bytes, chunk]); }
    const frame: unknown = JSON.parse(bytes.toString('utf8'));
    if (!validMeshFrame(frame)) { res.writeHead(400); res.end(); return; }
    if (req.url === '/connect') {
      if (this.retired.has(frame.epoch) || this.retired.size >= 64) { res.writeHead(409); res.end(); return; }
      if (this.epoch && this.epoch !== frame.epoch) this.retired.add(this.epoch);
      if (!this.epoch) this.watchConsumer();
      this.epoch = frame.epoch; this.lastSequence = -1; this.lastRequest = performance.now();
      this.reply(this.pending); this.pending = null;
      this.modernConsumer = frame.protocolVersion === 2 && MESH_CAPABILITIES.every(c => frame.capabilities?.includes(c));
      if (this.modernConsumer) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ protocolVersion: 2, capabilities: [...MESH_CAPABILITIES], runId: this.runId, settingsGeneration: 1 }));
      } else { res.writeHead(204); res.end(); }
      return;
    }
    if (req.url !== '/frame' || frame.epoch !== this.epoch || frame.sequence <= this.lastSequence) { res.writeHead(409); res.end(); return; }
    this.lastSequence = frame.sequence; this.lastRequest = performance.now();
    if (frame.drawingStatus === 'Running' || frame.drawingStatus?.startsWith('Skeleton fallback:')) this.setStatus(frame.drawingStatus);
    if (this.needsObservations && (!this.modernConsumer || frame.hands.some(h => !h.observations))) {
      this.setStatus('Skeleton fallback: rebuild/relaunch for observation support'); res.writeHead(204); res.end(); return;
    }
    if (!this.ready) { res.setHeader('x-xrb-mesh-status', this.status); res.writeHead(204); res.end(); return; }
    this.reply(this.pending); this.pending = { frame, response: res, at: performance.now() }; this.pump();
  }
  private fail(reason: string) { this.setStatus(`Skeleton fallback: ${reason}`); void this.stop(false).catch(() => this.setStatus('Skeleton fallback: mesh child cleanup failed')); }
  stop(stopped = true): Promise<void> {
    if (this.stopping) return this.stopping;
    this.closed = true; this.descriptor = null; this.ready = false;
    if (stopped) this.setStatus('Stopped');
    for (const t of this.timers) clearTimeout(t); this.timers.clear();
    this.reply(this.current); this.reply(this.pending); this.current = this.pending = null;
    this.server.closeAllConnections(); this.server.close();
    const child = this.child; this.child = null;
    this.stopping = (async () => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const done = () => { clearTimeout(timer); resolve(); };
        child.once('exit', done);
        timer = setTimeout(() => {
          child.kill();
          timer = setTimeout(() => reject(new Error('Mesh child did not exit after termination')), 2000);
        }, 2000);
        child.stdin.end(meshPacket({ type: 'stop' }));
      });
    })();
    return this.stopping;
  }
}
