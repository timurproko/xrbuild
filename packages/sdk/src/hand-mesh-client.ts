import type { Hand } from './hands.ts';
import { meshMotion, MESH_MAX_RESIDUAL_M } from './hand-mesh-motion.ts';
import { decodeMeshResult, MESH_MAX_SOURCE_AGE_MS, MESH_CAPABILITIES, validMeshCapabilities, validMeshState, unknownMeshObservations, MESH_MAX_BYTES, type MeshFrame, type MeshRuntime, type MeshState, type MeshSurface, type MeshDrawSurface } from './hand-mesh-protocol.ts';

export function meshRuntime(value: string | undefined): MeshRuntime | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value), u = new URL(v.url);
    if (v.version !== 1 || u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.username || u.password || u.pathname !== '/' || u.search || u.hash || !/^[a-f0-9]{64}$/.test(v.token)) return null;
    return { version: 1, url: u.origin, token: v.token };
  } catch { return null; }
}
/** Optional drawing transport, deliberately independent of HandInput/filter/gesture state. */
export class HandMeshClient {
  status = 'Starting';
  /** Why the first connection failed, for diagnostics (null while connecting or once connected). */
  connectError: string | null = null;
  private runtime: MeshRuntime;
  private fetcher: typeof fetch;
  private now: () => number;
  private closed = false;
  private connected = false;
  private protocol: 1 | 2 = 1;
  private runId = '';
  private settingsGeneration = 1;
  private configuration: MeshState | null = null;
  private drawing: { generation: number; frame: MeshFrame } | null = null;
  get state(): MeshState | null {
    if (!this.configuration) return null;
    const c = this.configuration, d = this.drawing, age = d ? this.sourceAge(d.frame) : Infinity;
    const current = !this.closed && d && age >= 0 && age <= MESH_MAX_SOURCE_AGE_MS && d.frame.revision === this.revision && c.phase === 'Ready'
      && c.drawingGeneration === d.generation && c.appliedGeneration === d.generation && c.requestedGeneration === d.generation;
    return { ...c, drawingGeneration: current ? d.generation : null };
  }
  private sampledAt = new WeakMap<MeshFrame, number>();
  private sourceAge(frame: MeshFrame): number { return this.now() - (this.sampledAt.get(frame) ?? -Infinity); }
  private epoch = crypto.randomUUID();
  private sequence = 0;
  private revision = 0;
  private generation = -1;
  private ids = '';
  private inFlight: MeshFrame | null = null;
  private pending: MeshFrame | null = null;
  private accepted: { frame: MeshFrame; meshes: MeshSurface[] } | null = null;
  private controller: AbortController | null = null;
  private topologies = new Map<number, MeshSurface>();
  constructor(runtime: MeshRuntime, fetcher = fetch, now = () => performance.now()) {
    this.runtime = runtime; this.fetcher = fetcher; this.now = now;
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 2000);
    void this.send('/connect', { ...this.frame([], 0), protocolVersion: 2, capabilities: [...MESH_CAPABILITIES] }, controller.signal).then(async r => {
      if (this.closed) return;
      if (!r.ok) throw new Error('mesh connection refused');
      if (r.status === 200) {
        const hello = await r.json();
        if (hello.protocolVersion !== 2 || !validMeshCapabilities(hello.capabilities) || typeof hello.runId !== 'string'
          || !/^[a-zA-Z0-9-]{1,80}$/.test(hello.runId) || !Number.isSafeInteger(hello.settingsGeneration) || hello.settingsGeneration < 0) throw new Error('mesh negotiation failed');
        this.protocol = 2; this.runId = hello.runId; this.settingsGeneration = hello.settingsGeneration;
        if (hello.state !== undefined) this.applyState(hello.state);
      }
      if (this.closed) return;
      this.connected = true; this.pump();
    }).catch(error => {
      if (this.closed) return;
      this.status = 'Skeleton fallback: mesh connection unavailable';
      this.connectError = controller.signal.aborted ? 'no reply within 2 s' : error instanceof Error ? error.message : String(error);
    }).finally(() => clearTimeout(timer));
  }
  private applyState(value: unknown): void {
    if (!validMeshState(value) || value.runId !== this.runId) throw new Error('Invalid mesh configuration state');
    if (value.requestedGeneration < this.settingsGeneration) return;
    if (value.requestedGeneration !== this.settingsGeneration) { this.settingsGeneration = value.requestedGeneration; this.invalidate(); }
    this.configuration = { ...value };
    if (value.phase !== 'Ready' || value.appliedGeneration !== value.requestedGeneration) { this.accepted = null; this.drawing = null; this.topologies.clear(); }
  }
  private frame(hands: Hand[], sampleMs: number): MeshFrame {
    const frame: MeshFrame = { type: 'frame', epoch: this.epoch, sequence: this.sequence++, revision: this.revision, sentMs: this.now(), sampleMs,
      ...(this.protocol === 2 ? { version: 2, runId: this.runId, settingsGeneration: this.settingsGeneration } : {}),
      hands: hands.slice(0, 2).map(h => ({ id: h.id, handedness: h.handedness, keypoints: h.keypoints.map(p => [...p]),
        ...(this.protocol === 2 ? { observations: h.observations ? structuredClone(h.observations) : unknownMeshObservations() } : {}) })) };
    this.sampledAt.set(frame, this.now()); return frame;
  }
  /** Empty acquisition invalidates meshes immediately, independent of the skeleton grace period. */
  observed(ids: number[]): void {
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (key !== this.ids) { this.ids = key; this.invalidate(); }
  }
  invalidate(): void { this.revision++; this.pending = null; this.accepted = null; this.drawing = null; this.topologies.clear(); }
  update(hands: Hand[], sampleMs: number, generation = 0, drawingEnabled = true): MeshDrawSurface[] {
    if (this.closed) return [];
    if (generation !== this.generation) { this.generation = generation; this.invalidate(); }
    const shown = hands.filter(h => !h.coasting).slice(0, 2);
    let meshes: MeshDrawSurface[] = [];
    const accepted = this.accepted, age = accepted ? this.sourceAge(accepted.frame) : Infinity;
    if (accepted && age >= 0 && age <= MESH_MAX_SOURCE_AGE_MS && accepted.frame.revision === this.revision) {
      for (const surface of accepted.meshes) {
        const hand = shown.find(h => h.id === surface.id), input = accepted.frame.hands.find(h => h.id === surface.id);
        const motion = hand && input ? meshMotion(input, hand) : null;
        if (motion && motion.residualM <= MESH_MAX_RESIDUAL_M) meshes.push({ ...surface, ...motion, sourceAgeMs: age });
      }
    }
    if (!shown.length) { this.accepted = null; this.topologies.clear(); }
    this.status = meshes.length ? 'Running' : this.configuration?.phase === 'Preparing' ? 'Preparing'
      : this.configuration?.reason ? `Skeleton fallback: ${this.configuration.reason}` : 'Skeleton fallback: mesh not ready or current';
    this.drawing = this.protocol === 2 && meshes.length && drawingEnabled && accepted
      ? { generation: this.settingsGeneration, frame: accepted.frame } : null;
    this.pending = this.frame(shown, sampleMs);
    if (this.protocol === 2) this.pending.drawingGeneration = this.drawing?.generation ?? null;
    this.pump();
    return meshes;
  }
  private send(route: string, frame: MeshFrame, signal: AbortSignal) {
    return this.fetcher(this.runtime.url + route, { method: 'POST', headers: { authorization: `Bearer ${this.runtime.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...frame, drawingStatus: this.status }), cache: 'no-store', signal });
  }
  private pump(): void {
    if (!this.connected || this.closed || this.inFlight || !this.pending) return;
    const frame = this.pending; this.pending = null; frame.sentMs = this.now(); this.inFlight = frame;
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 1000);
    void (async () => {
      const response = await this.send('/frame', frame, controller.signal);
      if (this.closed) return;
      const state = response.headers.get('x-xrb-mesh-state');
      if (this.protocol === 2 && state) { if (state.length > 4096) throw new Error('Oversized mesh state'); this.applyState(JSON.parse(state)); }
      if (response.status === 204) { this.status = response.headers.get('x-xrb-mesh-status') ?? 'Skeleton fallback: mesh is late'; return; }
      if (!response.ok || !response.body) throw new Error('mesh unavailable');
      const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
      while (true) {
        const r = await reader.read(); if (r.done) break;
        length += r.value.length; if (length > MESH_MAX_BYTES) { await reader.cancel(); throw new Error('oversized mesh'); } parts.push(r.value);
      }
      if (this.closed || frame.revision !== this.revision || this.sourceAge(frame) < 0 || this.sourceAge(frame) > MESH_MAX_SOURCE_AGE_MS
        || this.protocol === 2 && (frame.settingsGeneration !== this.settingsGeneration || this.configuration && (this.configuration.phase !== 'Ready' || this.configuration.appliedGeneration !== this.settingsGeneration))) return;
      const bytes = new Uint8Array(length); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
      const result = decodeMeshResult(bytes);
      if (this.protocol === 2 && (result.version !== 2 || result.runId !== this.runId || result.settingsGeneration !== frame.settingsGeneration)) throw new Error('wrong settings generation');
      if (result.epoch !== frame.epoch || result.sequence !== frame.sequence || result.revision !== frame.revision || result.meshes.some(m => !frame.hands.some(h => h.id === m.id))) throw new Error('wrong mesh association');
      for (const mesh of result.meshes) {
        const cached = this.topologies.get(mesh.id);
        if (cached?.topology === mesh.topology && cached.positions.length === mesh.positions.length) {
          if (mesh.indices.length && (mesh.indices.length !== cached.indices.length || mesh.indices.some((v, i) => v !== cached.indices[i]))) throw new Error('changed topology without a new version');
          mesh.indices = cached.indices;
        } else if (!mesh.indices.length) throw new Error('unknown mesh topology');
      }
      this.topologies = new Map(result.meshes.map(m => [m.id, m]));
      this.accepted = { frame, meshes: result.meshes };
    })().catch(() => { if (!this.closed) { this.accepted = null; this.drawing = null; this.status = 'Skeleton fallback: mesh unavailable or invalid'; } }).finally(() => {
      clearTimeout(timer); if (this.inFlight === frame) this.inFlight = null; if (!this.closed) this.pump();
    });
  }
  close(): void { this.closed = true; this.controller?.abort(); this.pending = null; this.accepted = null; this.drawing = null; this.topologies.clear(); }
}
