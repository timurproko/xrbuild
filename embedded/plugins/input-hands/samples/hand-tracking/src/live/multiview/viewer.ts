// Source-only calibration controller for the following independent Calibration module.
// No product document imports this file. Fusion and browser hand acquisition are separate retained algorithms.
import { AutomaticMarkerCalibration, automaticMarkerObservation } from './automatic-calibration.ts';
import { calibrationMetadata, fitSpatialCalibration, importSpatialCalibration, exportSpatialCalibration, FIT_LIMITS, type SpatialCalibration, type TargetSample, type TargetPair } from './calibration.ts';
import { prepareGeometry, type Pixel } from '../rgbd/geometry.ts';
import { samplePoint, pairing, DEPTH_DEFAULTS } from '../rgbd/reconstruction.ts';
import { captureProfile, profileKey } from '../rgbd/profiles.ts';
import { validSerial, type Calibration, type Packet, type WireFrame } from '../rgbd/protocol.ts';
import { metadataHash } from '../recording/format.ts';
export const CALIBRATION_STORAGE = 'handtracking.fusion-calibrations.v1';
type Side = 'a' | 'b';
interface CameraChoice { serial: string; profile: string }
export interface CalibrationPort {
  /** The module supplies native transport + exclusive lease ownership; no hand model is required. */
  start(choice: CameraChoice & { markers: true; handInference: false }): Promise<void>;
  stop(): Promise<void>;
}
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void; flush?(): Promise<void> }
interface Current { packet: Packet & { meta: WireFrame }; calibration: Calibration; receivedPageMs: number; pageOriginMs: number }
interface Target { id: string; use: 'fit' | 'check'; a?: TargetSample; b?: TargetSample }
export class CameraCalibration {
  private ports: { a: CalibrationPort; b: CalibrationPort };
  private storage: Storage;
  private now: () => number;
  private generation = 0;
  private revision = 0;
  private selection: { a: CameraChoice; b: CameraChoice } | null = null;
  private phase: 'idle' | 'starting' | 'running' | 'stopping' | 'failed' = 'idle';
  private startWork: Promise<unknown> | null = null;
  private stopWork: Promise<void> | null = null;
  private automatic = new AutomaticMarkerCalibration();
  private fitting = false;
  private current: Partial<Record<Side, Current>> = {};
  private targets = new Map<string, Target>();
  private sources: Partial<Record<Side, Calibration>> = {};
  private result: SpatialCalibration | null = null;
  constructor(ports: { a: CalibrationPort; b: CalibrationPort }, storage: Storage, now = () => performance.now()) {
    this.ports = ports; this.storage = storage; this.now = now;
  }
  snapshot() { return { phase: this.phase, result: this.result, targets: this.targets.size, marker: this.automatic.snapshot(this.now()) }; }
  async start(choices: { a: CameraChoice; b: CameraChoice }): Promise<void> {
    if (this.phase !== 'idle' || this.stopWork) throw new Error('Stop calibration cameras first.');
    if (!validSerial(choices.a.serial) || !validSerial(choices.b.serial) || choices.a.serial === choices.b.serial) throw new Error('Choose two different camera serials.');
    for (const side of ['a', 'b'] as const) captureProfile(choices[side].profile);
    this.selection = structuredClone(choices);
    const generation = ++this.generation; this.phase = 'starting'; this.current = {}; this.automatic.reset(); this.result = null;
    const work = Promise.allSettled((['a', 'b'] as const).map(side => this.ports[side].start({ ...choices[side], markers: true, handInference: false })));
    this.startWork = work;
    try { const results = await work; const failed = results.find((value): value is PromiseRejectedResult => value.status === 'rejected'); if (failed) throw failed.reason; if (generation === this.generation) this.phase = 'running'; }
    catch (error) {
      if (generation === this.generation) { await Promise.allSettled([this.ports.a.stop(), this.ports.b.stop()]); this.phase = 'failed'; throw error; }
    } finally { if (this.startWork === work) this.startWork = null; }
  }
  stop(): Promise<void> {
    if (this.stopWork) return this.stopWork;
    if (this.phase === 'idle' && !this.startWork) return Promise.resolve();
    ++this.generation; this.selection = null; this.phase = 'stopping'; this.current = {}; this.automatic.reset(); this.fitting = false;
    const starting = this.startWork;
    this.stopWork = Promise.resolve().then(async () => {
      if (starting) await Promise.allSettled([this.ports.a.stop(), this.ports.b.stop()]);
      await starting?.catch(() => {});
      const results = await Promise.allSettled([this.ports.a.stop(), this.ports.b.stop()]);
      const failed = results.find((value): value is PromiseRejectedResult => value.status === 'rejected');
      this.phase = failed ? 'failed' : 'idle'; if (failed) throw failed.reason;
    }).finally(() => { this.stopWork = null; });
    return this.stopWork;
  }
  /** A native owner delivers packets; this controller never opens a camera on import or navigation. */
  async push(side: Side, value: Current): Promise<void> {
    if (this.phase !== 'running') return;
    if (value.calibration.serial !== this.selection?.[side].serial || profileKey(value.calibration.color) !== this.selection?.[side].profile) throw new Error('Calibration source/profile changed.');
    this.current[side] = value;
    if (!value.packet.meta.marker) return;
    this.automatic.push(side, automaticMarkerObservation(value.packet, value.calibration, value.receivedPageMs, value.pageOriginMs));
    if (!this.fitting && !this.result && !this.targets.size && this.automatic.snapshot(this.now()).ready) {
      const generation = this.generation, revision = this.revision; this.fitting = true;
      try { const result = await this.automatic.fit(this.now()); if (generation === this.generation && revision === this.revision && result.spatialQualified) this.result = result; }
      finally { if (generation === this.generation) this.fitting = false; }
    }
  }
  async addTarget(side: Side, id: string, use: 'fit' | 'check', pixel: Pixel): Promise<void> {
    const value = this.current[side];
    if (this.phase !== 'running' || !value || this.now() - value.receivedPageMs > 500) throw new Error('A current native camera target probe is required.');
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || !['fit', 'check'].includes(use)) throw new Error('Invalid static target.');
    const pair = pairing(value.packet.meta, DEPTH_DEFAULTS.maxPairSkewMs); if (pair.reason) throw new Error(pair.reason);
    const probe = samplePoint(value.packet, value.calibration, prepareGeometry(value.calibration), pixel);
    if (!probe.valid || !probe.point || !probe.pixel) throw new Error(probe.reason || 'Invalid target probe.');
    const previous = this.targets.get(id); if (previous?.[side] || previous && previous.use !== use) throw new Error('Remove the old target explicitly before replacing it.');
    if (!previous && this.targets.size >= 64) throw new Error('At most 64 target IDs.');
    const source = calibrationMetadata(value.calibration), other = this.sources[side === 'a' ? 'b' : 'a'];
    if (other?.serial === source.serial) throw new Error('Two distinct native camera serials are required.');
    const bound = this.sources[side], revision = this.revision, generation = this.generation;
    if (bound && await metadataHash(bound) !== await metadataHash(source)) throw new Error('Camera/profile changed. Clear the manual setup first.');
    if (revision !== this.revision || generation !== this.generation) throw new Error('Manual setup changed. Try the target again.');
    this.revision++; this.sources[side] = source;
    this.targets.set(id, { id, use, ...previous, [side]: { point: { ...probe.point }, pixel: { ...probe.pixel }, frameNumber: value.packet.meta.color.number,
      sourceTimeMs: value.packet.meta.color.timestampMs, clockDomain: value.packet.meta.color.domain, selectedPageMs: this.now(), pageOriginMs: value.pageOriginMs } });
    this.result = null;
  }
  clearTargets(): void { this.revision++; this.targets.clear(); this.sources = {}; this.result = null; }
  async fitManual(evidence: { staticTargetConfirmed: true; description: string; referenceUncertaintyM: number | null }): Promise<SpatialCalibration> {
    if (!this.sources.a || !this.sources.b || [...this.targets.values()].some(target => !target.a || !target.b)) throw new Error('Complete matching static targets for both cameras.');
    const generation = this.generation, revision = this.revision;
    const result = await fitSpatialCalibration({ sources: { a: this.sources.a, b: this.sources.b }, targets: [...this.targets.values()] as TargetPair[], limits: { ...FIT_LIMITS }, evidence });
    if (generation !== this.generation || revision !== this.revision) throw new Error('Calibration session changed.'); this.result = result; return result;
  }
  async import(file: Blob): Promise<SpatialCalibration> { if (this.targets.size) throw new Error('Clear the manual draft before importing another calibration.'); const generation = this.generation, revision = this.revision; const result = await importSpatialCalibration(file); if (generation !== this.generation || revision !== this.revision) throw new Error('Calibration session changed.'); this.revision++; this.result = result; return result; }
  export(): Blob { if (!this.result) throw new Error('No calibration result.'); return exportSpatialCalibration(this.result); }
  async saved(): Promise<SpatialCalibration[]> {
    const raw = this.storage.getItem(CALIBRATION_STORAGE); if (!raw) return [];
    if (raw.length > 524288) throw new Error('Calibration inventory exceeds its limit.');
    const parsed = JSON.parse(raw); if (parsed?.version !== 1 || !Array.isArray(parsed.values) || parsed.values.length > 8) throw new Error('Invalid stored calibrations; original data preserved.');
    const values: SpatialCalibration[] = [];
    for (const value of parsed.values) { if (typeof value !== 'string' || value.length > 65536) throw new Error('Invalid calibration record.'); values.push(await importSpatialCalibration(new Blob([value], { type: 'application/json' }))); }
    return values;
  }
  async save(): Promise<void> {
    if (!this.result?.spatialQualified) throw new Error('Calibration is provisional. Export it for review.');
    const result = this.result, generation = this.generation, previous = await this.saved();
    const values = [await exportSpatialCalibration(result).text(), ...await Promise.all(previous.filter(value => value.inputSha256 !== result.inputSha256).slice(0, 7).map(value => exportSpatialCalibration(value).text()))];
    if (generation !== this.generation || result !== this.result) throw new Error('Calibration session changed.');
    this.storage.setItem(CALIBRATION_STORAGE, JSON.stringify({ version: 1, values })); await this.storage.flush?.();
  }
}
