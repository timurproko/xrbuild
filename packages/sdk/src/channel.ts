// Client side of the host channel: one loopback WebSocket carrying eye poses,
// hand frames, input status, the view and the station's parameters. Freshness over completeness: only the newest
// message of each type is kept, older ones are simply replaced.
import {
  decodeMessage,
  encodePageFrame,
  encodeSetView,
  MSG_EYES,
  MSG_HANDS,
  MSG_PLATFORM,
  MSG_PROJECTION,
  MSG_STATUS,
  MSG_VIEW,
  type EyesMessage,
  type HandsMessage,
  type PagePerformance,
  type PlatformMessage,
  type ProjectionMessage,
  type StatusMessage,
  type ViewMessage,
} from './protocol.ts';
import type { HostInfo } from './host.ts';

/** The subset of WebSocket the channel uses (lets tests pass a fake). */
export interface SocketLike {
  binaryType: string;
  readyState: number;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: ArrayBuffer): void;
  close(): void;
}

export interface ChannelOptions {
  createSocket?: (url: string) => SocketLike;
  /** page clock, default performance.now */
  pageNow?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

type Listener<T> = (msg: T) => void;

const OPEN = 1;
const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 4000;

export class HostChannel {
  eyes: EyesMessage | null = null;
  hands: HandsMessage | null = null;
  status: StatusMessage | null = null;
  /** the host's current view (2D or 3D); null until the host said */
  view: ViewMessage | null = null;
  /** the station's parameters; null until the host sent them */
  platform: PlatformMessage | null = null;
  /** managed mono camera projection; null until the host sent it */
  projection: ProjectionMessage | null = null;
  connected = false;
  /** messages received per type since start, for diagnostics */
  readonly counts = { eyes: 0, hands: 0, status: 0, view: 0, platform: 0, projection: 0 };

  private socket: SocketLike | null = null;
  private closed = false;
  private retryMs = RECONNECT_MIN_MS;
  private retryHandle: unknown = null;
  private readonly listeners = {
    eyes: new Set<Listener<EyesMessage>>(), hands: new Set<Listener<HandsMessage>>(), status: new Set<Listener<StatusMessage>>(), view: new Set<Listener<ViewMessage>>(),
    platform: new Set<Listener<PlatformMessage>>(), projection: new Set<Listener<ProjectionMessage>>(),
  };
  private readonly createSocket: (url: string) => SocketLike;
  private readonly pageNow: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  private readonly host: HostInfo;

  constructor(host: HostInfo, options: ChannelOptions = {}) {
    this.host = host;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.pageNow = options.pageNow ?? (() => performance.now());
    this.setTimer = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimeout ?? ((h) => clearTimeout(h as number));
    this.connect();
  }

  onEyes(fn: Listener<EyesMessage>): () => void { this.listeners.eyes.add(fn); return () => this.listeners.eyes.delete(fn); }
  onHands(fn: Listener<HandsMessage>): () => void { this.listeners.hands.add(fn); return () => this.listeners.hands.delete(fn); }
  onPlatform(fn: Listener<PlatformMessage>): () => void { this.listeners.platform.add(fn); return () => this.listeners.platform.delete(fn); }
  onStatus(fn: Listener<StatusMessage>): () => void { this.listeners.status.add(fn); return () => this.listeners.status.delete(fn); }
  onView(fn: Listener<ViewMessage>): () => void { this.listeners.view.add(fn); return () => this.listeners.view.delete(fn); }
  onProjection(fn: Listener<ProjectionMessage>): () => void { this.listeners.projection.add(fn); return () => this.listeners.projection.delete(fn); }

  /** Converts a host timestamp (channel clock) to the page clock (performance.now). */
  hostToPage(hostTimeMs: number): number {
    return hostTimeMs - (this.host.hostNow() - this.pageNow());
  }

  /** Page heartbeat: reports the page's performance to the host and lets it notice a hung page. */
  sendHeartbeat(perf: PagePerformance): void {
    if (!this.socket || this.socket.readyState !== OPEN) return;
    this.socket.send(encodePageFrame(this.host.hostNow(), this.pageNow(), perf));
  }

  /** Asks the host for 3D (side by side) or 2D (mono); the host answers with a view message. */
  sendSetView(stereo: boolean): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(encodeSetView(this.host.hostNow(), stereo));
    return true;
  }

  close(): void {
    this.closed = true;
    if (this.retryHandle) this.clearTimer(this.retryHandle);
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }

  private connect(): void {
    if (this.closed) return;
    const s = this.createSocket(this.host.channel.url);
    this.socket = s;
    s.binaryType = 'arraybuffer';
    s.onopen = () => {
      this.connected = true;
      this.retryMs = RECONNECT_MIN_MS;
    };
    s.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) this.handle(ev.data);
    };
    s.onerror = () => {};
    s.onclose = () => {
      this.connected = false;
      if (this.socket !== s || this.closed) return;
      this.socket = null;
      this.retryHandle = this.setTimer(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RECONNECT_MAX_MS);
    };
  }

  private handle(data: ArrayBuffer): void {
    const msg = decodeMessage(data);
    if (!msg) return;
    if (msg.type === MSG_EYES) {
      this.eyes = msg as EyesMessage;
      this.counts.eyes++;
      for (const fn of this.listeners.eyes) fn(this.eyes);
    } else if (msg.type === MSG_HANDS) {
      this.hands = msg as HandsMessage;
      this.counts.hands++;
      for (const fn of this.listeners.hands) fn(this.hands);
    } else if (msg.type === MSG_STATUS) {
      this.status = msg as StatusMessage;
      this.counts.status++;
      for (const fn of this.listeners.status) fn(this.status);
    } else if (msg.type === MSG_VIEW) {
      this.view = msg as ViewMessage;
      this.counts.view++;
      for (const fn of this.listeners.view) fn(this.view);
    } else if (msg.type === MSG_PLATFORM) {
      this.platform = msg as PlatformMessage;
      this.counts.platform++;
      for (const fn of this.listeners.platform) fn(this.platform);
    } else if (msg.type === MSG_PROJECTION) {
      this.projection = msg as ProjectionMessage;
      this.counts.projection++;
      for (const fn of this.listeners.projection) fn(this.projection);
    }
  }
}
