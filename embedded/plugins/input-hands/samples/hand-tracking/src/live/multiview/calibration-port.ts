import { RGBD, framePacket, validateFramePlanes, validateCalibration, validateDevices, record, requireValue, clockSample, type Device, type Calibration, type Packet, type WireFrame } from '../rgbd/protocol.ts';
import { captureProfile, profileKey, matchingProfiles } from '../rgbd/profiles.ts';

type Current = { packet: Packet & { meta: WireFrame }; calibration: Calibration; receivedPageMs: number; pageOriginMs: number };
interface Pending { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
/** Native RGB/depth transport only: no estimator, worker, hand reconstruction or fusion dependency. */
export class CalibrationCamera {
  private socket: WebSocket | null = null;
  private generation = 0;
  private pending: Pending | null = null;
  private stopPending: Pending | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pings = new Map<number, number>();
  private pingId = 0;
  private stopId = 0;
  private sequence = 0;
  private runEpoch = 0;
  private processing = false;
  private runId = '';
  private choice: { serial: string; profile: string } | null = null;
  private calibration: Calibration | null = null;
  private inventory: Device[] = [];
  private phase = 'disconnected';
  constructor(callbacks: { frame(value: Current): Promise<void>; failed(error: Error): void }, Socket: typeof WebSocket = WebSocket, now = () => performance.now()) { this.callbacks = callbacks; this.Socket = Socket; this.now = now; }
  private callbacks: { frame(value: Current): Promise<void>; failed(error: Error): void };
  private Socket: typeof WebSocket;
  private now: () => number;
  snapshot() { return { phase: this.phase, devices: structuredClone(this.inventory) }; }
  private wait(timeout: number): { pending: Pending; work: Promise<void> } {
    let pending!: Pending;
    const work = new Promise<void>((resolve, reject) => { pending = { resolve: () => { clearTimeout(pending.timer); resolve(); }, reject: error => { clearTimeout(pending.timer); reject(error); }, timer: setTimeout(() => pending.reject(new Error('Native camera response timed out.')), timeout) }; });
    return { pending, work };
  }
  async connect(endpoint: { url: string; token: string }): Promise<void> {
    if (this.socket) throw new Error('Disconnect the current camera service first.');
    const url = new URL(endpoint.url);
    if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.pathname !== '/bridge' || url.search || url.hash || url.username || url.password || !/^[a-f0-9]{64}$/.test(endpoint.token)) throw new Error('Invalid authenticated loopback bridge.');
    const generation = ++this.generation, socket = new this.Socket(url.href, [RGBD.protocol, `auth.${endpoint.token}`]);
    this.socket = socket; this.phase = 'connecting'; socket.binaryType = 'arraybuffer';
    const wait = this.wait(6000); this.pending = wait.pending;
    socket.onopen = () => { if (generation !== this.generation) return; try { this.send({ type: 'list' }); this.pingTimer = setInterval(() => this.ping(), 2000); this.ping(); } catch (error) { this.fail(error); } };
    socket.onmessage = event => { if (generation !== this.generation) return; try { this.message(event.data); } catch (error) { this.fail(error); } };
    socket.onerror = () => { if (generation === this.generation) this.fail(new Error('Native bridge connection failed.')); };
    socket.onclose = () => { if (generation === this.generation && this.socket) this.fail(new Error('Native bridge disconnected.')); };
    try { await wait.work; } catch (error) { this.disconnect(); throw error; } finally { if (this.pending === wait.pending) this.pending = null; }
  }
  private send(value: unknown) { if (!this.socket || this.socket.readyState !== 1 || this.socket.bufferedAmount > 4096) throw new Error('Native control channel is unavailable or backpressured.'); this.socket.send(JSON.stringify(value)); }
  private ping() { try { if (this.pings.size >= 4) throw new Error('Native clock responses stalled.'); const id = ++this.pingId, now = this.now(); this.pings.set(id, now); this.send({ type: 'ping', id, clientSendPageMs: now }); } catch (error) { this.fail(error); } }
  private fail(error: unknown) {
    const reason = error instanceof Error ? error : new Error(String(error));
    this.pending?.reject(reason); this.stopPending?.reject(reason); this.disconnect(); this.phase = 'failed'; this.callbacks.failed(reason);
  }
  private message(data: unknown) {
    if (data instanceof ArrayBuffer) {
      const packet = framePacket(data);
      if (packet.meta.runId !== this.runId || this.phase !== 'running') { this.send({ type: 'ack', runId: packet.meta.runId, sequence: packet.meta.sequence }); return; }
      requireValue(!this.processing && packet.meta.sequence > this.sequence && !!this.calibration && !!this.choice, 'Out-of-order calibration frame');
      validateFramePlanes(packet, this.choice!.profile); this.sequence = packet.meta.sequence;
      const generation = this.generation, runId = this.runId, epoch = this.runEpoch; this.processing = true;
      void this.callbacks.frame({ packet, calibration: this.calibration!, receivedPageMs: this.now(), pageOriginMs: performance.timeOrigin }).then(() => {
        if (generation === this.generation && epoch === this.runEpoch && this.phase === 'running' && this.runId === runId) this.send({ type: 'ack', runId, sequence: packet.meta.sequence });
      }).catch(error => { if (generation === this.generation && epoch === this.runEpoch) this.fail(error); }).finally(() => { if (generation === this.generation && epoch === this.runEpoch) this.processing = false; });
      return;
    }
    requireValue(typeof data === 'string' && data.length <= 524288, 'Native control size/type');
    const message = record(JSON.parse(data));
    if (message.type === 'connected') { requireValue(message.version === 1, 'Native protocol version'); return; }
    if (message.type === 'devices') { requireValue(this.phase === 'connecting', 'Unexpected device inventory'); validateDevices(message); this.inventory = message.devices; this.phase = 'connected'; this.pending?.resolve(); return; }
    if (message.type === 'started') {
      requireValue(this.phase === 'starting' && !!this.choice, 'Unexpected native start'); validateCalibration(message.calibration);
      requireValue(message.calibration.serial === this.choice!.serial && profileKey(message.calibration.color) === this.choice!.profile && typeof message.runId === 'string' && message.runId.length > 0 && message.runId.length <= 128, 'Native source/profile changed');
      this.calibration = message.calibration; this.runId = message.runId; this.phase = 'running'; this.pending?.resolve(); return;
    }
    if (message.type === 'stopped') { if (message.id === this.stopId && this.phase === 'stopping') { this.phase = 'connected'; this.stopPending?.resolve(); } else if (message.fatal === true) this.fail(new Error('Native stream stopped.')); return; }
    if (message.type === 'error') throw new Error(typeof message.message === 'string' ? message.message : 'Native acquisition failed.');
    if (message.type === 'pong') {
      requireValue(Number.isSafeInteger(message.id), 'Native clock ID'); const sent = this.pings.get(message.id as number); this.pings.delete(message.id as number);
      if (sent === undefined) return;
      clockSample(sent, message.bridgeReceiveMs as number, message.bridgeSendMs as number, this.now());
      if (message.nativeClock != null) { const value = record(message.nativeClock); requireValue([value.offsetMs, value.uncertaintyMs, value.rttMs].every(n => typeof n === 'number' && Number.isFinite(n)) && (value.uncertaintyMs as number) >= 0 && (value.rttMs as number) >= 0, 'Native clock sample'); }
      return;
    }
    throw new Error('Unknown native calibration message.');
  }
  async start(choice: { serial: string; profile: string; markers: boolean; handInference: false }): Promise<void> {
    if (this.phase !== 'connected') throw new Error('Connect two cameras first.');
    captureProfile(choice.profile);
    if (!matchingProfiles(this.inventory.find(device => device.serial === choice.serial)).includes(choice.profile)) throw new Error('Select an available camera and exact profile.');
    ++this.runEpoch; this.processing = false;
    this.choice = { serial: choice.serial, profile: choice.profile }; this.sequence = 0; this.runId = ''; this.calibration = null; this.phase = 'starting';
    const wait = this.wait(16000); this.pending = wait.pending;
    try { try { this.send({ type: 'start', serial: choice.serial, profile: choice.profile, markerCalibration: choice.markers }); } catch (error) { wait.pending.reject(error as Error); } await wait.work; }
    finally { if (this.pending === wait.pending) this.pending = null; }
  }
  async stop(): Promise<void> {
    if (this.stopPending) return;
    if (!this.socket || !['starting', 'running'].includes(this.phase)) return;
    ++this.runEpoch; this.processing = false;
    this.pending?.reject(new Error('Calibration start cancelled.')); this.phase = 'stopping'; this.runId = ''; this.calibration = null;
    const wait = this.wait(5000); this.stopPending = wait.pending;
    try { try { this.send({ type: 'stop', id: ++this.stopId }); } catch (error) { wait.pending.reject(error as Error); } await wait.work; }
    catch (error) { this.disconnect(); throw error; }
    finally { this.stopPending = null; }
  }
  disconnect() {
    ++this.generation; ++this.runEpoch; if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = null; this.pings.clear();
    this.pending?.reject(new Error('Calibration disconnected.')); this.pending = null;
    this.stopPending?.reject(new Error('Calibration disconnected.')); this.stopPending = null;
    const socket = this.socket; this.socket = null; if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.close(); }
    this.phase = 'disconnected'; this.runId = ''; this.choice = null; this.calibration = null; this.processing = false;
  }
}
