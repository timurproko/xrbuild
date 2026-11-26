import { randomUUID } from 'node:crypto';
import { type HandProfile } from '../../sdk/src/hand-profile.ts';
import { type HandProfileEnvelope, MSG_SET_HAND_PROFILE, MSG_HAND_PROFILE_ACK, encodeProfileControl, decodeProfileControl, matchesProfileAck } from '../../sdk/src/hand-profile-control.ts';
export const HAND_PROFILE_ACK_TIMEOUT_MS = 3000;
export class LiveHands {
  envelope: HandProfileEnvelope;
  delivery = 'Applying';
  deliveryState: 'pending' | 'applied' | 'failed' = 'pending';
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  constructor(profile: HandProfile, revision: string, runId = randomUUID()) {
    this.envelope = { version: 1, runId, sequence: 0, revision, profile }; this.armDeadline();
  }
  private clearDeadline(): void { if (this.deadline) clearTimeout(this.deadline); this.deadline = null; }
  private armDeadline(): void {
    this.clearDeadline(); const expected = this.envelope;
    this.deadline = setTimeout(() => {
      this.deadline = null;
      if (!this.closed && this.envelope === expected && this.deliveryState === 'pending')
        this.fail('Saved; the app has not acknowledged the hand profile. Retry Apply or rebuild/relaunch the app.');
    }, HAND_PROFILE_ACK_TIMEOUT_MS);
    this.deadline.unref();
  }
  update(profile: HandProfile, revision: string): void {
    if (this.closed) return;
    this.envelope = { ...this.envelope, sequence: this.envelope.sequence + 1, revision, profile }; this.delivery = 'Applying'; this.deliveryState = 'pending'; this.armDeadline();
  }
  acknowledge(value: unknown): boolean {
    if (this.closed || !matchesProfileAck(value, this.envelope)) return false;
    this.clearDeadline(); this.delivery = 'Applied'; this.deliveryState = 'applied'; return true;
  }
  fail(message: string): void {
    if (this.closed || this.deliveryState === 'applied') return;
    this.clearDeadline(); this.delivery = message; this.deliveryState = 'failed';
  }
  close(): void { this.closed = true; this.clearDeadline(); }
}
/** Read-only acknowledgement subscription for the entire native run, including launch sequence zero.
 * The host retains the latest ack for late subscribers. Reconnect never sends a profile or starts input.
 */
export function observeHandProfile(url: string, live: LiveHands, Socket: typeof WebSocket = WebSocket): () => void {
  let closed = false, socket: WebSocket | null = null, timer: ReturnType<typeof setTimeout> | null = null, delay = 250;
  const retry = () => {
    if (closed || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, delay); timer.unref(); delay = Math.min(4000, delay * 2);
  };
  const connect = () => {
    if (closed) return;
    try {
      const s = new Socket(url); socket = s; s.binaryType = 'arraybuffer';
      s.onopen = () => { if (!closed && socket === s) delay = 250; };
      s.onmessage = event => {
        if (!closed && socket === s && event.data instanceof ArrayBuffer) live.acknowledge(decodeProfileControl(event.data, MSG_HAND_PROFILE_ACK));
      };
      s.onerror = () => {}; // onclose retries; a transient disconnect cannot fabricate an acknowledgement.
      s.onclose = () => { if (!closed && socket === s) { socket = null; retry(); } };
    } catch { retry(); }
  };
  connect();
  return () => { closed = true; if (timer) clearTimeout(timer); socket?.close(); socket = null; };
}
/** Resolves only after an SDK acknowledgement relayed by the owning authenticated host. */
export function sendHandProfile(url: string, envelope: HandProfileEnvelope, Socket: typeof WebSocket = WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new Socket(url); ws.binaryType = 'arraybuffer';
    const finish = (error?: Error) => { clearTimeout(timer); ws.onclose = null; ws.close(); error ? reject(error) : resolve(); };
    const timer = setTimeout(() => finish(new Error('Saved; live delivery was not acknowledged. Rebuild/relaunch the app or retry Apply.')), 3000);
    ws.onopen = () => ws.send(encodeProfileControl(MSG_SET_HAND_PROFILE, envelope));
    ws.onmessage = event => {
      if (event.data instanceof ArrayBuffer && matchesProfileAck(decodeProfileControl(event.data, MSG_HAND_PROFILE_ACK), envelope)) finish();
    };
    ws.onerror = () => finish(new Error('Saved; cannot reach the running app. Retry Apply or relaunch.'));
    ws.onclose = () => finish(new Error('Saved; the running app disconnected before applying. Retry Apply or relaunch.'));
  });
}
