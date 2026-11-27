import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { HandMeshProcess } from './hand-mesh-process.ts';
import { meshPacket, readMeshPacket, decodeMeshResult, encodeMeshResult, validMeshFrame, validMeshCapabilities, meshMaxAge, MESH_CAPABILITIES, MESH_PREPARATION_STEPS, MESH_MAX_BYTES, MESH_MAX_SOURCE_AGE_MS,
  type MeshFrame, type MeshRuntime, type MeshState } from '../../sdk/src/hand-mesh-protocol.ts';
import type { HandMeshPlugin } from './hand-mesh-plugins.ts';
import { handMeshSettings, handMeshAppliedSettings, meshPreparationAllowance } from './hand-mesh-contract.ts';

type Target = { plugin: HandMeshPlugin | null; values: Record<string, unknown>; generation: number; savedRevision: string | null; failure?: string };
type Stage = { plugin: HandMeshPlugin; owned: HandMeshProcess | null; bytes: Buffer; generation: number; values: Record<string, unknown>;
  ready: boolean; preparing: boolean; retired: boolean; validation: AbortController; draining?: Promise<void> };
const superseded = new Error('Mesh control superseded');
/** Cancellation wins even when a passive launch validator has not yet returned. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(superseded);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
type Work = { frame: MeshFrame; response: http.ServerResponse; at: number; maxAgeMs: number; stage: Stage; timers: ReturnType<typeof setTimeout>[]; done: () => void };
const failureReasons: Record<string, string> = { 'configuration-rejected': 'Mesh configuration rejected', 'preparation-failed': 'Mesh preparation failed',
  'runtime-unavailable': 'Mesh runtime unavailable; prepare explicitly', 'unsupported-setting': 'Mesh setting unsupported' };
const coreReasons = new Set([...Object.values(failureReasons), 'Mesh preparation timed out', 'Mesh live configuration timed out', 'Processor does not support live configuration; relaunch', 'Previous mesh cleanup is not verified; retry cleanup']);
type Ack = { stage: Stage; target: Target; type: 'ready' | 'configured'; resolve: () => void; reject: (e: Error) => void };
export interface MeshRunOptions { startupMs?: number; connectMs?: number; supervisor?: string; beforeProcessor?: () => Promise<boolean> }
/** Stable authenticated run gateway; only its optional, contained processor is replaceable. */
export class HandMeshRun {
  status = 'Starting';
  readonly server: http.Server;
  descriptor: MeshRuntime | null = null;
  private readonly runId = randomUUID();
  private data: MeshState = { runId: this.runId, phase: 'Stopped', reason: null, progress: null, requestedGeneration: 0, appliedGeneration: null,
    drawingGeneration: null, savedRevision: null, owner: null, id: null };
  private stage: Stage | null = null;
  private desired: Target | null = null;
  private pendingTarget: Target | null = null;
  private control: Promise<void> | null = null;
  private ack: Ack | null = null;
  private closed = false;
  private stopping: Promise<void> | null = null;
  private openingReject: (() => void) | null = null;
  private current: Work | null = null;
  private pending: Work | null = null;
  private epoch = '';
  private modernConsumer: boolean | null = null;
  private retired = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastSequence = -1;
  private lastRequest = 0;
  private deliveredGeneration: number | null = null;
  private deliveredAt = -Infinity;
  private appStartedAtLeastOnce = false;
  private openedAt = 0;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private watchStartup(plugin: HandMeshPlugin | null) {
    if (this.startupTimer) this.cancel(this.startupTimer);
    const budget = this.options.startupMs ?? Math.max(90000, (plugin ? meshPreparationAllowance(plugin.declaration) : 0) + 60000);
    this.startupTimer = this.later(() => { if (!this.epoch) this.failRun('app startup timeout before mesh connection'); }, Math.max(0, budget - (performance.now() - this.openedAt)));
  }
  private changed: (status: string) => void;
  private origins: () => string[];
  private options: MeshRunOptions;
  constructor(origins: () => string[], changed: (status: string) => void = () => {}, options: MeshRunOptions = {}) {
    this.origins = origins; this.changed = changed; this.options = options;
    this.server = http.createServer((req, res) => { void this.request(req, res).catch(() => { if (!res.headersSent) res.writeHead(400); res.end(); }); });
    this.server.requestTimeout = 3000; this.server.headersTimeout = 3000;
  }
  /** The age limit the viewer last asked for (its mesh hold). */
  private viewerMaxAgeMs = MESH_MAX_SOURCE_AGE_MS;
  state(): MeshState { return { ...this.data, drawingGeneration: performance.now() - this.deliveredAt <= this.viewerMaxAgeMs ? this.data.drawingGeneration : null }; }
  private setStatus(value: string) { if (this.status !== value) { this.status = value; this.changed(value); } }
  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, ms); this.timers.add(timer); return timer;
  }
  private cancel(timer: ReturnType<typeof setTimeout>) { clearTimeout(timer); this.timers.delete(timer); }
  appStarted(): void {
    if (this.closed || this.appStartedAtLeastOnce) return;
    this.appStartedAtLeastOnce = true;
    this.later(() => { if (!this.epoch) this.failRun('rebuild/relaunch the app to connect mesh drawing'); }, this.options.connectMs ?? 30000);
  }
  private watchConsumer() {
    this.later(() => {
      if (this.closed) return;
      if (performance.now() - this.lastRequest > 2000) this.failRun('mesh view disconnected');
      else this.watchConsumer();
    }, 1000);
  }
  async start(plugin: HandMeshPlugin | null, settings: unknown = {}, savedRevision: string | null = null): Promise<MeshRuntime> {
    if (this.descriptor || this.closed) throw new Error('Mesh run already started or stopped');
    if (plugin && (!plugin.available || !plugin.program)) throw new Error('Mesh plugin unavailable');
    if (plugin) { handMeshSettings(plugin.declaration, settings); meshPreparationAllowance(plugin.declaration); }
    await new Promise<void>((resolve, reject) => {
      this.openingReject = () => reject(new Error('Mesh start cancelled'));
      const error = (cause: Error) => { this.openingReject = null; reject(cause); };
      this.server.once('error', error);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.removeListener('error', error); this.openingReject = null;
        if (this.closed) { this.server.close(); reject(new Error('Mesh start cancelled')); } else resolve();
      });
    });
    if (this.closed) { this.server.close(); throw new Error('Mesh start cancelled'); }
    const address = this.server.address(); if (!address || typeof address === 'string') throw new Error('No mesh endpoint');
    const descriptor: MeshRuntime = { version: 1, url: `http://127.0.0.1:${address.port}`, token: randomBytes(32).toString('hex') }; this.descriptor = descriptor;
    this.openedAt = performance.now();
    this.configure(plugin, settings, savedRevision);
    return descriptor;
  }
  /** Persist first; delivery is optional and asynchronous. No provider/session acquisition happens here. */
  configure(plugin: HandMeshPlugin | null, settings: unknown = {}, savedRevision: string | null = null, retry = false): void {
    if (this.closed) throw new Error('Mesh run stopped');
    const values = plugin ? handMeshSettings(plugin.declaration, settings) : {};
    if (plugin) meshPreparationAllowance(plugin.declaration);
    if (plugin && (!plugin.available || !plugin.program)) throw new Error('Mesh plugin unavailable');
    const old = this.desired;
    if (!retry && old?.plugin?.owner === plugin?.owner && old?.plugin?.id === plugin?.id
      && JSON.stringify(old?.values) === JSON.stringify(values) && JSON.stringify(old?.plugin?.declaration) === JSON.stringify(plugin?.declaration)) {
      this.data.savedRevision = savedRevision; if (old) old.savedRevision = savedRevision; return;
    }
    if (this.openedAt) this.watchStartup(plugin);
    const generation = this.data.requestedGeneration + 1;
    const target: Target = { plugin, values, generation, savedRevision }; this.desired = target; this.pendingTarget = target;
    this.data = { ...this.data, requestedGeneration: generation, savedRevision, drawingGeneration: null, progress: null, step: null, reason: null, phase: 'Preparing' };
    this.deliveredGeneration = null;
    this.reply(this.current); this.reply(this.pending); this.pending = null;
    const stage = this.stage;
    const samePlugin = stage && plugin && stage.plugin.owner === plugin.owner && stage.plugin.id === plugin.id
      && JSON.stringify(stage.plugin.declaration) === JSON.stringify(plugin.declaration);
    this.setStatus(plugin ? 'Preparing' : stage ? 'Stopping mesh' : 'Preparing');
    if (stage && !stage.retired && (!plugin || !stage.ready && stage.preparing
      || !samePlugin && (!stage.ready || this.modernConsumer !== false && stage.plugin.declaration.version === 2))) {
      // None, replacement and any changed setting interrupt cold/device preparation now, not at its ACK deadline.
      void this.drain(stage).catch(() => this.cleanupFailed());
    }
    this.kickControl();
  }
  retry(): void { const d = this.desired; if (d) this.configure(d.plugin, d.values, d.savedRevision, true); }
  /** An unavailable saved choice must not leave old mesh masquerading as the new selection. */
  unavailable(savedRevision: string, reason = 'Selected mesh plugin is unavailable'): void {
    this.configure(null, {}, savedRevision, true); this.desired!.failure = reason; this.data.appliedGeneration = null; this.data.phase = 'Failed'; this.data.reason = reason; this.setStatus(`Skeleton fallback: ${reason}`);
  }
  private kickControl() {
    if (this.control || this.closed) return;
    // Install the serialization barrier before status callbacks can submit a reentrant control.
    const control = Promise.resolve().then(() => this.controls()); this.control = control;
    void control.finally(() => { if (this.control === control) this.control = null; if (this.pendingTarget && !this.closed) this.kickControl(); });
  }
  private async controls(): Promise<void> {
    while (this.pendingTarget && !this.closed) {
      const target = this.pendingTarget; this.pendingTarget = null;
      let stage: Stage | null = null;
      try {
        if (this.current) await new Promise<void>(resolve => { const old = this.current!.done; this.current!.done = () => { old(); resolve(); }; });
        if (this.closed) return;
        if (target.generation !== this.data.requestedGeneration) continue;
        stage = this.stage;
        if (stage && !stage.retired && (this.modernConsumer === false || stage.plugin.declaration.version === 1) && target.plugin) {
          this.data.phase = this.modernConsumer === false ? 'Ready' : 'Failed'; this.data.reason = 'Saved; rebuild/relaunch for live mesh configuration'; this.setStatus(`Skeleton fallback: ${this.data.reason}`); continue;
        }
        const same = stage && target.plugin && stage.plugin.owner === target.plugin.owner && stage.plugin.id === target.plugin.id
          && JSON.stringify(stage.plugin.declaration) === JSON.stringify(target.plugin.declaration) && !stage.retired;
        if (!same) {
          if (stage) await this.drain(stage);
          if (this.closed) return;
          if (target.generation !== this.data.requestedGeneration) continue;
          if (!target.plugin) {
            this.data.owner = this.data.id = null;
            if (target.failure) { this.data.phase = 'Failed'; this.data.reason = target.failure; this.data.appliedGeneration = null; this.setStatus(`Skeleton fallback: ${target.failure}`); continue; }
            this.data.appliedGeneration = target.generation;
            if (target.generation === this.data.requestedGeneration) { this.data.phase = 'Ready'; this.setStatus('None'); }
            continue;
          }
          stage = { plugin: target.plugin, owned: null, bytes: Buffer.alloc(0), generation: target.generation, values: target.values, ready: false, preparing: true, retired: false, validation: new AbortController() };
          this.stage = stage; this.data.owner = target.plugin.owner; this.data.id = target.plugin.id;
          this.setStatus(target.plugin.declaration.version === 1 ? 'Starting' : 'Preparing');
          const signal = stage.validation.signal;
          // Cross-consumer cleanup gates only optional processing, never the gateway or skeleton owner.
          if (this.options.beforeProcessor && !await abortable(this.options.beforeProcessor(), signal)) throw new Error('Previous mesh cleanup is not verified; retry cleanup');
          if (this.closed || stage.retired) throw superseded;
          const launch = await abortable(target.plugin.launch ? target.plugin.launch(signal) : Promise.resolve({ program: target.plugin.program!, cwd: path.dirname(target.plugin.program!) }), signal);
          if (this.closed || stage.retired) throw superseded;
          const spawningStage = stage;
          stage.owned = await abortable(HandMeshProcess.start(this.options.supervisor, launch.program, target.plugin.declaration.args, launch.cwd,
            () => this.closed || spawningStage.retired, owned => { spawningStage.owned = owned; }), signal);
          if (this.closed || stage.retired) { await stage.owned.stop(); throw superseded; }
          const child = stage.owned.child, currentStage = stage;
          child.stdout.on('data', (chunk: Buffer) => this.output(currentStage, chunk));
          child.once('error', () => this.failStage(currentStage, 'mesh containment/program unavailable; Rebuild the host'));
          child.stdin.on('error', () => { if (!currentStage.retired) this.failStage(currentStage, 'sidecar pipe closed'); });
          child.once('exit', () => { if (!currentStage.retired && !this.closed) this.failStage(currentStage, 'sidecar exited'); });
          await this.expectAck(stage, target, 'ready', () => child.stdin.write(meshPacket({ type: 'start', version: target.plugin!.declaration.version,
            owner: target.plugin!.owner, id: target.plugin!.id, settingsVersion: target.plugin!.declaration.settingsVersion, settings: target.values,
            ...(target.plugin!.declaration.version === 2 ? { runId: this.runId, settingsGeneration: target.generation, savedRevision: target.savedRevision, capabilities: target.plugin!.declaration.capabilities } : {}),
            limits: { hands: 2, vertices: 16384, triangles: 32768, bytes: MESH_MAX_BYTES }, ownerLoss: 'exit-on-stdin-end' })), meshPreparationAllowance(target.plugin.declaration));
        } else {
          const active = stage!;
          if (!active.plugin.declaration.capabilities?.includes('live-configure-v1')) throw new Error('Processor does not support live configuration; relaunch');
          const reprepare = active.plugin.declaration.settings.some(s => s.changeMode !== 'live' && active.values[s.key] !== target.values[s.key]);
          active.ready = false; active.preparing = reprepare;
          await this.expectAck(active, target, 'configured', () => active.owned!.child.stdin.write(meshPacket({ type: 'configure', version: 2,
            runId: this.runId, owner: active.plugin.owner, id: active.plugin.id, settingsVersion: active.plugin.declaration.settingsVersion,
            settingsGeneration: target.generation, savedRevision: target.savedRevision, settings: target.values, mode: reprepare ? 'reprepare' : 'live' })), reprepare ? meshPreparationAllowance(active.plugin.declaration) : 2000, reprepare);
        }
        if (this.closed || !stage || stage.retired) continue;
        stage.generation = target.generation; stage.values = target.values; stage.ready = true; stage.preparing = false;
        this.data.appliedGeneration = target.generation;
        if (target.generation === this.data.requestedGeneration) { this.data.phase = 'Ready'; this.data.reason = null; this.data.progress = null; this.data.step = null; this.setStatus('Ready; app mesh not started'); this.pump(); }
      } catch (error) {
        if (this.closed) return;
        if (error === superseded || target.generation !== this.data.requestedGeneration) {
          if (stage) { try { await this.drain(stage); } catch { this.cleanupFailed(); } }
          continue;
        }
        this.data.phase = 'Failed'; this.data.reason = error instanceof Error && coreReasons.has(error.message) ? error.message : 'Mesh preparation or configuration failed';
        this.setStatus(`Skeleton fallback: ${this.data.reason}`);
        if (stage) { try { await this.drain(stage); } catch { this.cleanupFailed(); } }
      }
    }
  }
  private expectAck(stage: Stage, target: Target, type: Ack['type'], send: () => void, timeout: number, preparation = type === 'ready'): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = this.later(() => { if (this.ack === ack) { this.ack = null; reject(new Error(preparation ? 'Mesh preparation timed out' : 'Mesh live configuration timed out')); } }, timeout);
      const ack: Ack = { stage, target, type, resolve: () => { this.cancel(timer); this.ack = null; resolve(); }, reject: error => { this.cancel(timer); this.ack = null; reject(error); } };
      this.ack = ack;
      try { send(); } catch { ack.reject(new Error('Sidecar control pipe closed')); }
    });
  }
  private headers(res: http.ServerResponse) { res.setHeader('x-xrb-mesh-status', this.status); res.setHeader('x-xrb-mesh-state', JSON.stringify(this.state())); }
  private reply(work: Work | null, bytes?: Uint8Array) {
    if (!work || work.response.writableEnded || work.response.destroyed) return;
    this.headers(work.response);
    if (bytes) { work.response.writeHead(200, { 'content-type': 'application/octet-stream' }); work.response.end(bytes); }
    else { work.response.writeHead(204); work.response.end(); }
  }
  private finishWork() {
    const work = this.current; this.current = null;
    if (work) { for (const t of work.timers) this.cancel(t); work.done(); }
  }
  private pump() {
    const stage = this.stage;
    if (!stage?.ready || stage.retired || this.current || !this.pending || this.closed || this.data.phase !== 'Ready') return;
    this.current = this.pending; this.pending = null; const work = this.current;
    if (stage.plugin.declaration.version === 2) {
      const f = work.frame;
      work.frame = { type: 'frame', epoch: f.epoch, sequence: f.sequence, revision: f.revision, sentMs: f.sentMs, sampleMs: f.sampleMs,
        version: 2, runId: this.runId, settingsGeneration: stage.generation,
        hands: f.hands.map(({ id, handedness, keypoints, observations }) => ({ id, handedness, keypoints,
          ...(stage.plugin.declaration.capabilities?.includes('final-pose-observations-v1') ? { observations } : {}) })) };
    } else {
      const f = work.frame;
      work.frame = { type: 'frame', epoch: f.epoch, sequence: f.sequence, revision: f.revision, sentMs: f.sentMs, sampleMs: f.sampleMs,
        hands: f.hands.map(({ id, handedness, keypoints }) => ({ id, handedness, keypoints })) };
    }
    stage.owned?.child.stdin.write(meshPacket(work.frame));
    work.timers.push(this.later(() => { if (this.current === work) { this.setStatus('Skeleton fallback: mesh is late'); this.reply(work); } }, work.maxAgeMs));
    work.timers.push(this.later(() => { if (this.current === work) this.failStage(stage, 'sidecar frame timeout'); }, 2000));
  }
  private output(stage: Stage, chunk: Buffer) {
    if (this.closed || stage.retired || this.stage !== stage) return;
    if (stage.bytes.length + chunk.length > MESH_MAX_BYTES * 2) { this.failStage(stage, 'oversized sidecar output'); return; }
    stage.bytes = Buffer.concat([stage.bytes, chunk]);
    try {
      while (stage.bytes.length >= 12) {
        const size = 12 + stage.bytes.readUInt32LE(4) + stage.bytes.readUInt32LE(8);
        if (size > MESH_MAX_BYTES) throw new Error('oversized'); if (stage.bytes.length < size) return;
        const packet = stage.bytes.subarray(0, size); stage.bytes = stage.bytes.subarray(size);
        const { meta, payload } = readMeshPacket(packet);
        if (meta.type === 'preparing' || meta.type === 'failed') {
          if (stage.plugin.declaration.version !== 2 || meta.version !== 2 || payload.length || meta.runId !== this.runId
            || meta.owner !== stage.plugin.owner || meta.id !== stage.plugin.id || meta.settingsVersion !== stage.plugin.declaration.settingsVersion
            || !Number.isSafeInteger(meta.settingsGeneration)) throw new Error('preparation identity');
          const ack = this.ack;
          if (!ack || ack.stage !== stage || meta.settingsGeneration !== ack.target.generation) continue;
          if (meta.type === 'failed') {
            if (!Object.hasOwn(failureReasons, meta.reason)) throw new Error('failure reason');
            ack.reject(new Error(failureReasons[meta.reason])); continue;
          }
          if (!stage.plugin.declaration.capabilities?.includes('preparation-progress-v1') || meta.progress !== null
            && (typeof meta.progress !== 'number' || !Number.isFinite(meta.progress) || meta.progress < 0 || meta.progress > 1)
            || meta.step !== undefined && meta.step !== null && !MESH_PREPARATION_STEPS.includes(meta.step)) throw new Error('preparation progress');
          if (meta.settingsGeneration === this.data.requestedGeneration) {
            this.data.phase = 'Preparing'; this.data.progress = meta.progress; this.data.step = meta.step ?? null;
            this.changed(this.status); // Status readers can inspect progress, without extending the ACK deadline.
          }
          continue;
        }
        if (meta.type === 'ready' || meta.type === 'configured') {
          const ack = this.ack;
          if (stage.plugin.declaration.version === 2) {
            const required = ['type', 'version', 'runId', 'owner', 'id', 'settingsVersion', 'settingsGeneration', 'settings', ...(meta.type === 'ready' ? ['capabilities'] : [])];
            if (required.some(key => !Object.hasOwn(meta, key))) throw new Error('incomplete ack');
            if (meta.version !== 2 || meta.runId !== this.runId || meta.owner !== stage.plugin.owner || meta.id !== stage.plugin.id
              || meta.settingsVersion !== stage.plugin.declaration.settingsVersion || !Number.isSafeInteger(meta.settingsGeneration) || payload.length) throw new Error('ack identity');
            if (!ack || ack.stage !== stage || meta.settingsGeneration !== ack.target.generation) continue; // stale/duplicate ACK cannot advance state
            if (meta.type !== ack.type || JSON.stringify(handMeshAppliedSettings(stage.plugin.declaration, meta.settings)) !== JSON.stringify(ack.target.values)) throw new Error('ack values');
            if (meta.type === 'ready' && (!validMeshCapabilities(meta.capabilities) || meta.capabilities.length !== stage.plugin.declaration.capabilities!.length
              || !meta.capabilities.every((c: typeof MESH_CAPABILITIES[number]) => stage.plugin.declaration.capabilities!.includes(c)))) throw new Error('capabilities');
          } else if (!ack || ack.stage !== stage || !Object.hasOwn(meta, 'type') || !Object.hasOwn(meta, 'version')
            || meta.type !== 'ready' || meta.version !== 1) throw new Error('legacy ack');
          this.ack?.resolve(); continue;
        }
        const result = decodeMeshResult(packet), work = this.current;
        if (!work || work.stage !== stage || result.epoch !== work.frame.epoch || result.sequence !== work.frame.sequence || result.revision !== work.frame.revision
          || result.meshes.some(m => !work.frame.hands.some(h => h.id === m.id))) throw new Error('association');
        if (stage.plugin.declaration.version === 2 && (result.version !== 2 || result.runId !== this.runId || result.settingsGeneration !== work.frame.settingsGeneration)) throw new Error('settings association');
        if (result.epoch === this.epoch && performance.now() - work.at <= work.maxAgeMs && (stage.generation === this.data.requestedGeneration || this.modernConsumer === false) && this.data.phase === 'Ready') {
          if (!this.data.reason) this.setStatus('Running');
          if (result.meshes.length) { this.deliveredGeneration = stage.generation; this.deliveredAt = work.at; }
          this.reply(work, encodeMeshResult({ ...result, ...(this.modernConsumer ? { version: 2 as const, runId: this.runId, settingsGeneration: stage.generation } : { version: undefined }) }));
        } else { this.setStatus(this.data.phase === 'Preparing' ? 'Preparing' : 'Skeleton fallback: mesh is late'); this.reply(work); }
        this.finishWork(); if (!this.pendingTarget) this.pump();
      }
    } catch { this.failStage(stage, 'invalid sidecar output'); }
  }
  private async request(req: http.IncomingMessage, res: http.ServerResponse) {
    const origin = req.headers.origin, descriptor = this.descriptor;
    if (this.closed || !descriptor || !origin || !this.origins().includes(origin)) { res.writeHead(403); res.end(); return; }
    res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin'); res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-expose-headers', 'x-xrb-mesh-status, x-xrb-mesh-state');
    // Newer browsers ask before a page reaches another local port (Private Network Access); this stream is meant for it.
    if (req.method === 'OPTIONS') { if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('access-control-allow-private-network', 'true'); res.setHeader('access-control-allow-methods', 'POST'); res.setHeader('access-control-allow-headers', 'authorization, content-type'); res.writeHead(204); res.end(); return; }
    const token = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? ''), expected = Buffer.from(descriptor.token);
    if (req.method !== 'POST' || token.length !== expected.length || !timingSafeEqual(token, expected)) { res.writeHead(403); res.end(); return; }
    let bytes = Buffer.alloc(0);
    for await (const chunk of req) { if (bytes.length + chunk.length > 16384) { res.writeHead(413); res.end(); return; } bytes = Buffer.concat([bytes, chunk]); }
    const frame: unknown = JSON.parse(bytes.toString('utf8')); if (!validMeshFrame(frame)) { res.writeHead(400); res.end(); return; }
    if (req.url === '/connect') {
      if (this.retired.has(frame.epoch) || this.retired.size >= 64) { res.writeHead(409); res.end(); return; }
      if (this.epoch && this.epoch !== frame.epoch) this.retired.add(this.epoch);
      if (!this.epoch) this.watchConsumer(); this.epoch = frame.epoch; this.lastSequence = -1; this.lastRequest = performance.now();
      this.data.drawingGeneration = this.deliveredGeneration = null; this.reply(this.pending); this.pending = null;
      this.modernConsumer = frame.protocolVersion === 2 && MESH_CAPABILITIES.every(c => frame.capabilities?.includes(c)); this.headers(res);
      if (this.modernConsumer) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ protocolVersion: 2, capabilities: [...MESH_CAPABILITIES], runId: this.runId, settingsGeneration: this.data.requestedGeneration, state: this.state() })); }
      else { res.writeHead(204); res.end(); } return;
    }
    if (req.url !== '/frame' || frame.epoch !== this.epoch || frame.sequence <= this.lastSequence) { res.writeHead(409); res.end(); return; }
    this.lastSequence = frame.sequence; this.lastRequest = performance.now();
    if (this.modernConsumer && (frame.version !== 2 || frame.runId !== this.runId || frame.settingsGeneration !== this.data.requestedGeneration)) { this.headers(res); res.writeHead(204); res.end(); return; }
    if (!frame.hands.length) this.deliveredGeneration = null;
    this.viewerMaxAgeMs = meshMaxAge(frame);
    this.data.drawingGeneration = this.modernConsumer && frame.hands.length > 0 && performance.now() - this.deliveredAt <= this.viewerMaxAgeMs && frame.drawingGeneration === this.data.appliedGeneration && frame.drawingGeneration === this.deliveredGeneration
      && frame.drawingGeneration === this.data.requestedGeneration ? frame.drawingGeneration! : null;
    const stage = this.stage;
    if (stage?.plugin.declaration.capabilities?.includes('final-pose-observations-v1') && (!this.modernConsumer || frame.hands.some(h => !h.observations))) this.setStatus('Skeleton fallback: rebuild/relaunch for observation support');
    else if (stage?.ready && this.data.phase === 'Ready') {
      this.reply(this.pending); this.pending = { frame, response: res, at: performance.now(), maxAgeMs: meshMaxAge(frame), stage, timers: [], done: () => {} }; this.pump(); return;
    }
    this.headers(res); res.writeHead(204); res.end();
  }
  private failStage(stage: Stage, reason: string) {
    if (stage.retired || this.closed) return;
    this.data.phase = 'Failed'; this.data.reason = reason; this.data.drawingGeneration = null; this.setStatus(`Skeleton fallback: ${reason}`);
    if (this.ack?.stage === stage) this.ack.reject(new Error(reason));
    this.reply(this.current); this.reply(this.pending); this.pending = null; this.finishWork();
    void this.drain(stage).catch(() => { this.data.reason = 'Mesh child cleanup failed; retry cleanup'; this.setStatus(`Skeleton fallback: ${this.data.reason}`); });
  }
  private cleanupFailed(): void {
    this.data.phase = 'Failed'; this.data.reason = 'Mesh child cleanup failed; retry cleanup'; this.pendingTarget = null;
    this.setStatus(`Skeleton fallback: ${this.data.reason}`);
  }
  private drain(stage: Stage): Promise<void> {
    if (stage.draining) return stage.draining;
    stage.retired = true; stage.ready = false; stage.validation.abort(superseded);
    if (this.ack?.stage === stage) this.ack.reject(superseded);
    if (this.current?.stage === stage) { this.reply(this.current); this.finishWork(); }
    if (this.pending?.stage === stage) { this.reply(this.pending); this.pending = null; }
    const operation = (async () => { await stage.owned?.stop(meshPacket({ type: 'stop' })); if (this.stage === stage) this.stage = null; })();
    stage.draining = operation;
    void operation.catch(() => { if (stage.draining === operation) stage.draining = undefined; });
    return operation;
  }
  private failRun(reason: string) { this.data.phase = 'Failed'; this.data.reason = reason; this.setStatus(`Skeleton fallback: ${reason}`); void this.stop(false).catch(() => {}); }
  stop(stopped = true): Promise<void> {
    if (this.stopping) return this.stopping;
    this.closed = true; this.descriptor = null; this.pendingTarget = null;
    this.openingReject?.(); this.openingReject = null;
    if (this.ack) this.ack.reject(new Error('Mesh stopped'));
    for (const t of this.timers) clearTimeout(t); this.timers.clear();
    this.reply(this.current); this.reply(this.pending); this.pending = null; this.finishWork();
    this.server.closeAllConnections(); this.server.close(); if (stopped) this.setStatus('Stopping');
    const operation = (async () => {
      if (this.stage) await this.drain(this.stage);
      this.data.drawingGeneration = null;
      if (stopped) { this.data.phase = 'Stopped'; this.setStatus('Stopped'); }
    })();
    this.stopping = operation;
    void operation.catch(() => { if (this.stopping === operation) this.stopping = null; this.data.phase = 'Failed'; this.data.reason = 'Mesh child cleanup failed; retry cleanup'; this.setStatus(`Skeleton fallback: ${this.data.reason}`); });
    return operation;
  }
}
