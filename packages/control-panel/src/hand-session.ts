import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readBody, sendJson } from './http.ts';
import { prepareHandSession, type SessionSelectionRequest } from './hand-session-selection.ts';
import { validHandProviderKey } from './hands-state.ts';
import { reserveHandAcquisition } from './hand-acquisition.ts';
import { LiveHands } from './hands-live.ts';
const secret = () => randomBytes(32).toString('hex');
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export interface SessionDependencies {
  prepare(request: SessionSelectionRequest): ReturnType<typeof prepareHandSession>;
  acquire(): () => void;
  origin(): string;
  reserve?: typeof reserveHandAcquisition;
  spawn?: typeof spawn;
  platform?: string;
  testScope?: string;
  heartbeatMs?: number;
}
type Phase = 'not-started' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
interface Running {
  id: string; epoch: string; owner: string; token: string; phase: Phase; reason: string; heartbeat: number;
  source?: Awaited<ReturnType<typeof prepareHandSession>>['source']; url?: string; child?: ChildProcessWithoutNullStreams;
  pid?: number; ended: boolean; cancelled: boolean; preparing: boolean; live?: LiveHands; release?: () => void; stop?: Promise<void>;
}
/** One process-owned session; no durable capabilities, camera auto-start or adoption by another tab. */
export class HandSessions {
  private pages = new Map<string, number>();
  private current: Running | null = null;
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  private deps: SessionDependencies;
  constructor(deps: SessionDependencies) {
    this.deps = deps;
    this.timer = setInterval(() => { const s = this.current; if (s && this.busy && Date.now() - s.heartbeat > (deps.heartbeatMs ?? 5000)) void this.stop(s, 'Owning Hands page heartbeat expired'); }, 100);
    this.timer.unref();
  }
  get busy() { return !!this.current && (!this.current.ended || this.current.preparing); }
  get preparing() { return this.current?.preparing ?? false; }
  get live() { return this.current && this.busy ? this.current.live ?? null : null; }
  status(owner = '') {
    const s = this.current, owns = !!s && s.owner === owner;
    return { phase: s?.phase ?? 'not-started', reason: s?.reason ?? '', source: s?.source ?? null, busy: this.busy, owns,
      sessionId: s?.id ?? null, ...(owns && this.busy ? { profile: s?.live?.envelope } : {}),
      delivery: s?.live?.delivery, deliveryState: s?.live?.deliveryState };
  }
  private authorize(req: IncomingMessage) {
    const origin = this.deps.origin();
    if (req.headers.host !== new URL(origin).host || req.headers.origin !== origin || req.headers['sec-fetch-site'] !== 'same-origin' || req.headers['x-xrb-hands'] !== '1') throw new HttpError(403, 'Hands session requires the exact panel origin and same-origin fetch');
  }
  async handle(req: IncomingMessage, res: ServerResponse) {
    this.authorize(req);
    const action = new URL(req.url!, this.deps.origin()).pathname.replace('/api/hands/session', '');
    if (this.closed) throw new HttpError(503, 'Hands sessions are shutting down');
    if (action === '/bootstrap' && req.method === 'POST') {
      for (const [key, expiry] of this.pages) if (expiry < Date.now() && key !== this.current?.owner) this.pages.delete(key);
      if (this.pages.size >= 32) throw new HttpError(429, 'Too many Hands pages');
      const capability = secret(); this.pages.set(capability, Date.now() + 60000);
      return sendJson(res, 200, { capability, ...this.status() });
    }
    const owner = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!this.pages.has(owner) || this.pages.get(owner)! < Date.now()) throw new HttpError(403, 'Hands page capability is missing or expired');
    this.pages.set(owner, Date.now() + 60000);
    if (!action && req.method === 'GET') return sendJson(res, 200, this.status(owner));
    if (req.method !== 'POST') throw new HttpError(405, 'Hands operation not allowed');
    let body: Record<string, unknown>;
    try { body = JSON.parse((await readBody(req, 16384)).toString()); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'Invalid Hands session body'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid Hands session body');
    if (!action) {
      if (!validHandProviderKey(body.provider) || typeof body.revision !== 'string' || typeof body.registryRevision !== 'string') throw new HttpError(400, 'Saved provider and revisions required');
      const result = await this.start(owner, body as unknown as SessionSelectionRequest);
      return sendJson(res, 200, result);
    }
    const s = this.current;
    if (!s || s.owner !== owner || body.sessionId !== s.id) throw new HttpError(403, 'This page does not own that Hands session');
    if (action === '/stop') { await this.stop(s); return sendJson(res, 200, this.status(owner)); }
    if (action === '/heartbeat') { if (this.busy && !s.cancelled) s.heartbeat = Date.now(); return sendJson(res, 200, this.status(owner)); }
    if (action === '/ack') { if (!s.cancelled && this.busy) s.live?.acknowledge(body.profile); return sendJson(res, 200, this.status(owner)); }
    throw new HttpError(404, 'Unknown Hands operation');
  }
  private async start(owner: string, request: SessionSelectionRequest) {
    if ((this.deps.platform ?? process.platform) !== 'win32') throw new HttpError(409, 'Standalone native Hands sessions currently support Windows x64 only. WebXR requires an explicit app XR session.');
    if (this.busy) throw new HttpError(409, 'A Hands session owns acquisition. Stop it in its owning page first.');
    const release = this.deps.acquire();
    const s: Running = { id: randomUUID(), epoch: secret(), owner, token: secret(), phase: 'starting', reason: '', heartbeat: Date.now(), ended: false, cancelled: false, preparing: true, release };
    this.current = s;
    let reservation: Awaited<ReturnType<typeof reserveHandAcquisition>> | null = null;
    try {
      const prepared = await this.deps.prepare(request);
      if (s.cancelled || this.closed) throw new Error('Hands Start cancelled');
      s.source = prepared.source; s.live = new LiveHands(prepared.profile, prepared.revision, s.id);
      // Reserve before DLL create, reject legacy hosts, then transfer under the native transition gate.
      reservation = await (this.deps.reserve ?? reserveHandAcquisition)(prepared.helperExe, 'Hands provider session', { checkLegacyHost: true, ...(this.deps.testScope ? { testScope: this.deps.testScope } : {}) });
      if (s.cancelled || this.closed) throw new Error('Hands Start cancelled');
      const child = (this.deps.spawn ?? spawn)(path.join(path.dirname(prepared.workerExe), 'xrb-provider-supervisor.exe'), [prepared.workerExe, String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
      s.child = child; let buffer = '', handoff: Promise<void> | null = null;
      child.stdin.on('error', () => {}); child.stderr.resume();
      child.on('error', () => { s.reason = 'Provider supervisor is unavailable. Rebuild the host.'; });
      child.on('close', () => { void (async () => {
        if (s.pid) {
          let dead = false; const deadline = performance.now() + 2000;
          while (performance.now() < deadline) {
            try { process.kill(s.pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') { dead = true; break; } }
            await pause(20);
          }
          if (!dead) { s.phase = 'failed'; s.reason = 'Cannot verify worker death; restart the panel before reacquisition'; return; }
        }
        s.ended = true; s.live?.close();
        if (!s.cancelled) { s.phase = 'failed'; s.reason ||= 'Provider worker exited unexpectedly'; }
        if (!s.preparing) { s.release?.(); s.release = undefined; }
      })(); });
      child.stdout.setEncoding('utf8').on('data', (text: string) => {
        buffer += text;
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          if (line.length > 4096) { void this.stop(s, 'Provider output exceeded its bound'); return; }
          if (!line.startsWith('@provider ')) continue;
          try {
            const event = JSON.parse(line.slice(10));
            if (event.phase === 'acquiring' && Number.isSafeInteger(event.pid) && !handoff) {
              s.pid = event.pid; handoff = reservation!.handoff(event.pid); handoff.catch(() => { s.reason = 'Native acquisition handoff failed'; void this.stop(s, s.reason); });
            }
            if (event.phase === 'failed' && !s.cancelled) { s.reason = String(event.reason || 'Provider failed').slice(0, 1024).replaceAll(s.token, '[redacted]').replaceAll(reservation!.ticket, '[redacted]'); void this.stop(s, s.reason); }
            if (event.phase === 'running' && typeof event.url === 'string' && !s.cancelled) {
              const endpoint = new URL(event.url);
              if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/hands' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password || !endpoint.port) throw new Error();
              s.url = endpoint.href;
            }
          } catch { if (!s.cancelled) { s.reason = 'Invalid provider session event'; void this.stop(s, s.reason); } }
        }
        if (buffer.length > 4096) void this.stop(s, 'Provider output exceeded its bound');
      });
      const bootstrap = { version: 1, runtimeName: prepared.runtimeName, pluginPath: prepared.pluginPath, config: prepared.config, parentPid: process.pid, token: s.token, epoch: s.epoch, origin: this.deps.origin(), ticket: reservation.ticket, ...(this.deps.testScope ? { testScope: this.deps.testScope } : {}) };
      const serialized = JSON.stringify(bootstrap); if (Buffer.byteLength(serialized) > 16384) throw new Error('Provider configuration exceeds the bounded bootstrap');
      child.stdin.write(serialized + '\n');
      const deadline = Date.now() + 30000;
      while (!s.url) { if (s.cancelled || s.ended || s.reason || Date.now() > deadline) throw new Error(s.reason || 'Provider Start cancelled or timed out'); await pause(10); }
      if (handoff) await handoff;
      if (s.cancelled || s.ended) throw new Error(s.reason || 'Hands Start cancelled');
      s.phase = 'running';
      return { ...this.status(owner), epoch: s.epoch, url: s.url, observer: s.token, profile: s.live.envelope };
    } catch (e) {
      await reservation?.close(); reservation = null; s.preparing = false;
      await this.stop(s, s.cancelled && !s.reason ? '' : (e as Error).message);
      throw new HttpError(409, s.reason || 'Hands Start cancelled');
    } finally { await reservation?.close(); s.preparing = false; if (s.ended) { s.release?.(); s.release = undefined; } }
  }
  private stop(s: Running, reason = ''): Promise<void> {
    if (s.stop) return s.stop;
    s.cancelled = true; s.token = ''; s.live?.close(); s.reason ||= reason; s.phase = 'stopping';
    return s.stop = (async () => {
      const preparingBy = Date.now() + 31000;
      while (s.preparing && !s.child && Date.now() < preparingBy) await pause(20);
      if (s.preparing && !s.child) { s.phase = 'failed'; s.reason = 'Hands preparation has not drained; wait before reacquisition'; return; }
      if (s.child && !s.ended) {
        s.child.stdin.end('{"stop":true}\n');
        const deadline = Date.now() + 6000;
        while (!s.ended && Date.now() < deadline) await pause(20);
        if (!s.ended) s.child.kill(); // Only our launcher; closing its job contains only our worker.
        const killedBy = Date.now() + 2000;
        while (!s.ended && Date.now() < killedBy) await pause(20);
        if (!s.ended) { s.phase = 'failed'; s.reason = 'Cannot verify worker death; restart the panel before reacquisition'; return; }
      }
      // During asynchronous preparation, Start's cancellation check must drain before ownership is free.
      if (!s.child && !s.preparing) { s.ended = true; s.release?.(); s.release = undefined; }
      s.phase = s.reason ? 'failed' : 'stopped';
    })();
  }
  async close() { this.closed = true; clearInterval(this.timer); if (this.current) await this.stop(this.current); this.pages.clear(); }
}
