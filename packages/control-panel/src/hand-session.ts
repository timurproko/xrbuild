import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readBody, sendJson } from './http.ts';
import { prepareHandSession, type SessionSelectionRequest } from './hand-session-selection.ts';
import { validHandProviderKey } from './hands-state.ts';
import { reserveHandAcquisition } from './hand-acquisition.ts';
import { LiveHands } from './hands-live.ts';
import type { HandMeshRun } from './hand-mesh-run.ts';
const secret = () => randomBytes(32).toString('hex');
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
/** The helper checks creation identity and waits on an exact handle; it never kills the queried PID. */
const joinOwnedWorker = (exe: string, pid: number, birth: string) => new Promise<boolean>(resolve => {
  execFile(exe, ['--join', String(pid), birth], { windowsHide: true, timeout: 6500, maxBuffer: 1024 }, error => resolve(!error));
});
export interface SessionDependencies {
  prepare(request: SessionSelectionRequest): ReturnType<typeof prepareHandSession>;
  acquire(): () => void;
  /** Optional, synchronous owner allocation; processor preparation must remain asynchronous. */
  mesh?(prepared: Awaited<ReturnType<typeof prepareHandSession>>): HandMeshRun;
  origin(): string;
  reserve?: typeof reserveHandAcquisition;
  spawn?: typeof spawn;
  platform?: string;
  testScope?: string;
  heartbeatMs?: number;
  verifyWorker?: typeof joinOwnedWorker;
}
type Phase = 'not-started' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
interface Running {
  id: string; epoch: string; owner: string; token: string; phase: Phase; reason: string; heartbeat: number; diagnostic?: string;
  source?: Awaited<ReturnType<typeof prepareHandSession>>['source']; url?: string; child?: ChildProcessWithoutNullStreams;
  pid?: number; birth?: string; joined?: boolean; supervisor?: string; launcherClosed?: boolean; verification?: Promise<boolean>; retryAfter?: number; cleanupReason?: string; ended: boolean; cancelled: boolean; preparing: boolean; drainTimedOut?: boolean; live?: LiveHands; release?: () => void; stop?: Promise<void>;
}
/** One process-owned session; no durable capabilities, camera auto-start or adoption by another tab. */
export class HandSessions {
  private pages = new Map<string, number>();
  private continuities = new Map<string, { owner: string; document: string }>();
  private current: Running | null = null;
  private meshes = new Map<HandMeshRun, Promise<void> | null>();
  private sessionMesh: { session: Running; run: HandMeshRun } | null = null;
  private meshReason = '';
  get meshRun(): HandMeshRun | null { const m = this.sessionMesh; return m && !m.session.cancelled && !m.session.ended ? m.run : null; }
  get meshStatus(): string { return this.meshRun?.status ?? this.meshReason; }
  private retireMesh(): Promise<void> {
    const m = this.sessionMesh; this.sessionMesh = null;
    if (m) this.meshes.set(m.run, null);
    return Promise.all([...this.meshes].map(async ([run, work]) => {
      if (!work) {
        work = run.stop().then(() => { this.meshes.delete(run); }).catch(() => {
          this.meshes.set(run, null); this.meshReason = 'Skeleton fallback: mesh cleanup failed; retry cleanup';
        });
        this.meshes.set(run, work);
      }
      await work;
    })).then(() => {});
  }
  private closed = false;
  private closing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval>;
  private deps: SessionDependencies;
  constructor(deps: SessionDependencies) {
    this.deps = deps;
    this.timer = setInterval(() => { const s = this.current; if (s && this.busy && performance.now() - s.heartbeat > (deps.heartbeatMs ?? 5000) && performance.now() >= (s.retryAfter ?? 0)) void this.stop(s, 'Owning Hands page heartbeat expired'); }, 100);
    this.timer.unref();
  }
  get busy() { return !!this.current && (!this.current.ended || this.current.preparing); }
  get preparing() { return this.current?.preparing ?? false; }
  get live() { return this.current && this.busy ? this.current.live ?? null : null; }
  status(owner = '') {
    const s = this.current, owns = !!s && s.owner === owner;
    return { supported: (this.deps.platform ?? process.platform) === 'win32', phase: s?.phase ?? 'not-started', reason: [s?.reason, this.busy && s?.cleanupReason].filter(Boolean).join('; '), source: s?.source ?? null, busy: this.busy, owns,
      sessionId: s?.id ?? null, diagnostic: s?.diagnostic ?? '',
      meshCleanupPending: !this.meshRun && this.meshes.size > 0, meshStatus: this.meshStatus,
      ...(owns && this.busy && !s?.cancelled ? { handMeshRuntime: this.meshRun?.descriptor ?? null } : {}),
      cleanupPending: this.busy && !!s && (owns || s.cancelled || s.phase === 'failed' || performance.now() - s.heartbeat > (this.deps.heartbeatMs ?? 5000)),
      takeoverAvailable: this.busy && !!s && !owns && !s.cancelled && s.phase !== 'failed' && performance.now() - s.heartbeat <= (this.deps.heartbeatMs ?? 5000), ...(owns && this.busy ? { profile: s?.live?.envelope } : {}),
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
      let body: Record<string, unknown>;
      try { body = JSON.parse((await readBody(req, 16384)).toString()); } catch { throw new HttpError(400, 'Invalid Hands page bootstrap'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid Hands page bootstrap');
      const document = typeof body.document === 'string' && /^[a-f0-9-]{36}$/.test(body.document) ? body.document : '';
      const previous = typeof body.continuity === 'string' ? this.continuities.get(body.continuity) : undefined;
      if (previous && document && (previous.document === document || body.reload === true)) {
        // Rotate proof and capability; a reload can retire only the session bound to this tab proof.
        this.continuities.delete(body.continuity as string); this.pages.delete(previous.owner);
        if (this.current && this.busy && (this.current.owner === previous.owner || this.current.cancelled || this.current.phase === 'failed')) await this.stop(this.current, 'Owning Hands page reloaded or renewed');
      }
      for (const [key, expiry] of this.pages) if (expiry < performance.now() && key !== this.current?.owner) this.pages.delete(key);
      for (const [proof, page] of this.continuities) if (!this.pages.has(page.owner)) this.continuities.delete(proof);
      if (this.pages.size >= 32) throw new HttpError(429, 'Too many Hands pages');
      const capability = secret(), continuity = secret(); this.pages.set(capability, performance.now() + 60000);
      if (document) this.continuities.set(continuity, { owner: capability, document });
      return sendJson(res, 200, { capability, continuity, ...this.status(capability) });
    }
    const owner = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!this.pages.has(owner) || this.pages.get(owner)! < performance.now()) {
      throw new HttpError(403, 'Hands page capability is missing or expired', { code: 'hands-page-capability-expired' });
    }
    this.pages.set(owner, performance.now() + 60000);
    if (!action && req.method === 'GET') return sendJson(res, 200, this.status(owner));
    if (req.method !== 'POST') throw new HttpError(405, 'Hands operation not allowed');
    let body: Record<string, unknown>;
    try { body = JSON.parse((await readBody(req, 16384)).toString()); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'Invalid Hands session body'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid Hands session body');
    if (action === '/status') return sendJson(res, 200, this.status(owner));
    if (!action) {
      if (!validHandProviderKey(body.provider) || typeof body.revision !== 'string' || typeof body.registryRevision !== 'string') throw new HttpError(400, 'Saved provider and revisions required');
      const result = await this.start(owner, body as unknown as SessionSelectionRequest, typeof body.takeoverSessionId === 'string' ? body.takeoverSessionId : undefined);
      return sendJson(res, 200, result);
    }
    const s = this.current;
    if (action === '/recover') {
      if (!s || body.sessionId !== s.id) throw new HttpError(409, 'Hands ownership changed; refresh before recovery');
      if (s.owner !== owner && !s.cancelled && s.phase !== 'failed' && performance.now() - s.heartbeat <= (this.deps.heartbeatMs ?? 5000)) throw new HttpError(403, 'A different live Hands page requires explicit takeover');
      await this.stop(s); return sendJson(res, 200, this.status(owner));
    }
    if (!s || s.owner !== owner || body.sessionId !== s.id) throw new HttpError(403, 'This page does not own that Hands session');
    if (action === '/stop') { await this.stop(s, typeof body.reason === 'string' ? body.reason.slice(0, 512) : ''); return sendJson(res, 200, this.status(owner)); }
    if (action === '/heartbeat') { if (this.busy && !s.cancelled) s.heartbeat = performance.now(); return sendJson(res, 200, this.status(owner)); }
    if (action === '/ack') { if (!s.cancelled && this.busy) s.live?.acknowledge(body.profile); return sendJson(res, 200, this.status(owner)); }
    throw new HttpError(404, 'Unknown Hands operation');
  }
  private async start(owner: string, request: SessionSelectionRequest, takeoverSessionId?: string) {
    if ((this.deps.platform ?? process.platform) !== 'win32') throw new HttpError(409, 'Standalone native Hands sessions currently support Windows x64 only. WebXR requires an explicit app XR session.');
    const previous = this.current;
    if (takeoverSessionId && previous?.id !== takeoverSessionId) throw new HttpError(409, 'Hands ownership changed; review the new owner before takeover');
    if (this.busy && previous) {
      if (previous.preparing && previous.cancelled) throw new HttpError(409, 'Previous Hands preparation is still draining; retry cleanup before Start', { code: 'hands-cleanup-pending' });
      if (previous.owner !== owner && !previous.cancelled && previous.phase !== 'failed' && performance.now() - previous.heartbeat <= (this.deps.heartbeatMs ?? 5000) && takeoverSessionId !== previous.id)
        throw new HttpError(409, 'Another live Hands page owns acquisition; use Take over to stop it first.', { code: 'hands-live-owner', sessionId: previous.id });
      await this.stop(previous, takeoverSessionId ? 'Hands acquisition explicitly taken over by another page' : 'Previous Hands session recovered before Start');
      if (this.current !== previous) throw new HttpError(409, 'Hands ownership changed during recovery; review the new owner');
      if (this.busy) throw new HttpError(409, previous.cleanupReason || previous.reason || 'Owned Hands cleanup is still pending', { code: 'hands-cleanup-pending' });
    }
    const release = this.deps.acquire();
    const s: Running = { id: randomUUID(), epoch: secret(), owner, token: secret(), phase: 'starting', reason: '', heartbeat: performance.now(), ended: false, cancelled: false, preparing: true, release };
    this.current = s;
    let reservation: Awaited<ReturnType<typeof reserveHandAcquisition>> | null = null;
    try {
      const prepared = await this.deps.prepare(request);
      if (s.cancelled || this.closed) throw new Error('Hands Start cancelled');
      s.source = prepared.source; s.live = new LiveHands(prepared.profile, prepared.revision, s.id, 'Hands session');
      // Even a previous optional tree's slow cleanup must not delay the new skeleton worker.
      void this.retireMesh().then(() => {
        if (s.cancelled || this.closed || this.current !== s) return;
        if (this.meshes.size) { this.meshReason = 'Skeleton fallback: mesh cleanup failed; retry cleanup'; return; }
        if (this.deps.mesh) {
          try {
            const run = this.deps.mesh(prepared); this.sessionMesh = { session: s, run }; this.meshReason = '';
            if (s.phase === 'running') run.appStarted();
          } catch { this.meshReason = 'Skeleton fallback: mesh runtime unavailable'; }
        }
      });
      // Reserve before DLL create, reject legacy hosts, then transfer under the native transition gate.
      reservation = await (this.deps.reserve ?? reserveHandAcquisition)(prepared.helperExe, 'Hands provider session', { checkLegacyHost: true, ...(this.deps.testScope ? { testScope: this.deps.testScope } : {}) });
      if (s.cancelled || this.closed) throw new Error('Hands Start cancelled');
      const supervisor = path.join(path.dirname(prepared.workerExe), 'xrb-provider-supervisor.exe');
      const child = (this.deps.spawn ?? spawn)(supervisor, [prepared.workerExe, String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
      s.child = child; s.supervisor = supervisor; const observer = s.token, ticket = reservation.ticket; let buffer = '', handoff: Promise<void> | null = null;
      child.stdin.on('error', () => {}); child.stderr.resume();
      child.on('error', () => { s.reason = 'Provider supervisor is unavailable. Rebuild the host.'; });
      child.on('close', () => {
        s.launcherClosed = true;
        if (!s.cancelled) { s.cancelled = true; s.token = ''; s.phase = 'failed'; s.reason ||= 'Provider worker exited unexpectedly'; }
        s.live?.close();
        if (this.sessionMesh?.session === s) void this.retireMesh();
        void this.verifyEnded(s);
      });
      child.stdout.setEncoding('utf8').on('data', (text: string) => {
        buffer += text;
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          if (line.length > 4096) { void this.stop(s, 'Provider output exceeded its bound'); return; }
          if (!line.startsWith('@provider ')) continue;
          try {
            const event = JSON.parse(line.slice(10));
            if (typeof event.diagnostic === 'string' && /^Rejected [a-z-]+; joint (?:n\/a|\d{1,2}); count \d{1,16} frames, \d{1,16} hands$/.test(event.diagnostic)) s.diagnostic = event.diagnostic;
            if (event.phase === 'spawned' && Number.isSafeInteger(event.pid) && event.pid > 0 && typeof event.birth === 'string' && /^[1-9]\d{0,19}$/.test(event.birth)) { s.pid = event.pid; s.birth = event.birth; }
            if (event.phase === 'joined' && Number.isSafeInteger(event.pid) && (!s.pid || s.pid === event.pid)) s.joined = true;
            if (event.phase === 'teardown-failed') { s.reason ||= 'Owned worker teardown could not be verified; acquisition remains blocked'; s.phase = 'failed'; }
            if (event.phase === 'acquiring' && Number.isSafeInteger(event.pid) && !handoff) {
              if (s.pid && s.pid !== event.pid) throw new Error('Worker identity changed');
              s.pid = event.pid; handoff = reservation!.handoff(event.pid); handoff.catch(() => { s.reason = 'Native acquisition handoff failed'; void this.stop(s, s.reason); });
            }
            if (event.phase === 'failed') { s.reason = String(event.reason || 'Provider failed').replaceAll(observer, '[redacted]').replaceAll(ticket, '[redacted]').slice(0, 1024); if (!s.cancelled) void this.stop(s, s.reason); }
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
      const deadline = performance.now() + 30000;
      while (!s.url) { if (s.cancelled || s.ended || s.reason || performance.now() > deadline) throw new Error(s.reason || 'Provider Start cancelled or timed out'); await pause(10); }
      if (handoff) await handoff;
      if (s.cancelled || s.ended) throw new Error(s.reason || 'Hands Start cancelled');
      s.phase = 'running';
      this.meshRun?.appStarted(); // Attachment allowance starts after provider startup, not mesh readiness.
      return { ...this.status(owner), epoch: s.epoch, url: s.url, observer: s.token, profile: s.live.envelope };
    } catch (e) {
      await reservation?.close(); reservation = null; s.preparing = false;
      await this.stop(s, s.cancelled && !s.reason ? '' : (e as Error).message);
      throw new HttpError(409, s.reason || 'Hands Start cancelled');
    } finally { await reservation?.close(); s.preparing = false; this.finishDrained(s); }
  }
  /** Only positive death evidence is durable. Failed checks are shared in-flight, then retired for retry. */
  private verifyEnded(s: Running): Promise<boolean> {
    if (s.ended) return Promise.resolve(true);
    if (!s.launcherClosed) return Promise.resolve(false);
    if (s.verification) return s.verification;
    const attempt = Promise.resolve().then(async () => {
      const dead = s.joined || !s.pid || !!(s.birth && s.supervisor && await (this.deps.verifyWorker ?? joinOwnedWorker)(s.supervisor, s.pid, s.birth));
      if (dead) { s.ended = true; s.cleanupReason = undefined; this.finishDrained(s); return true; }
      this.unverified(s); return false;
    }).catch(() => { this.unverified(s); return false; }).finally(() => {
      if (s.verification === attempt) s.verification = undefined;
    });
    return s.verification = attempt;
  }
  private unverified(s: Running): void {
    s.phase = 'failed'; s.cleanupReason = 'Owned worker death is not yet verified; Retry cleanup will check again';
  }
  /** Late preparation/death still completes ownership cleanup, independent of the attempt that timed out. */
  private finishDrained(s: Running): void {
    if (s.preparing || s.child && !s.ended) return;
    s.ended = true;
    if (s.drainTimedOut) s.reason = 'Cancelled Hands preparation has drained; Start is available again';
    if (s.cancelled) s.phase = s.reason ? 'failed' : 'stopped';
    s.release?.(); s.release = undefined;
  }
  private stop(s: Running, reason = ''): Promise<void> {
    s.reason ||= reason;
    if (s.stop) return s.stop;
    s.cancelled = true; s.token = ''; s.live?.close(); s.reason ||= reason; s.phase = 'stopping';
    const meshCleanup = this.retireMesh();
    const attempt = (async () => {
      const preparingBy = performance.now() + 31000;
      while (s.preparing && !s.child && performance.now() < preparingBy) await pause(20);
      if (s.preparing && !s.child) { s.drainTimedOut = true; s.phase = 'failed'; s.reason = 'Hands preparation has not drained; wait before reacquisition'; return; }
      if (s.child && !s.ended) {
        if (!s.launcherClosed) {
          if (!s.child.stdin.writableEnded && !s.child.stdin.destroyed) s.child.stdin.end('{"stop":true}\n');
          const deadline = performance.now() + 13000;
          while (!s.ended && !s.launcherClosed && performance.now() < deadline) await pause(20);
          if (!s.ended && !s.launcherClosed) s.child.kill(); // Only our launcher/job, never a queried PID.
          const killedBy = performance.now() + 2000;
          while (!s.ended && !s.launcherClosed && performance.now() < killedBy) await pause(20);
        }
        if (!s.ended && !await this.verifyEnded(s)) { this.unverified(s); return; }
      }
      // During asynchronous preparation, Start's cancellation check must drain before ownership is free.
      if (!s.child) this.finishDrained(s);
      s.phase = s.reason ? 'failed' : 'stopped';
      await meshCleanup;
    })().catch(() => { this.unverified(s); }).finally(() => {
      if (s.stop === attempt) s.stop = undefined;
      if (!s.ended || s.preparing) s.retryAfter = performance.now() + 1000;
    });
    return s.stop = attempt;
  }
  async close() {
    if (this.closing) return this.closing;
    this.closed = true; clearInterval(this.timer);
    const attempt = (async () => {
      // Server/panel restart may memoize close: it must never resolve an unsuccessful drain.
      while (this.current && this.busy) {
        await this.stop(this.current);
        if (this.busy) await pause(1000);
      }
      do { await this.retireMesh(); if (this.meshes.size) await pause(1000); } while (this.meshes.size);
      this.pages.clear(); this.continuities.clear();
    })().finally(() => { if (this.closing === attempt) this.closing = null; });
    return this.closing = attempt;
  }
}
