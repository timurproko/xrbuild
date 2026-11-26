import { randomUUID } from 'node:crypto';
import { type HandProfile } from '../../sdk/src/hand-profile.ts';
import { type HandProfileEnvelope, MSG_SET_HAND_PROFILE, MSG_HAND_PROFILE_ACK, encodeProfileControl, decodeProfileControl, matchesProfileAck } from '../../sdk/src/hand-profile-control.ts';
export class LiveHands {
  envelope: HandProfileEnvelope;
  delivery = 'Applying';
  constructor(profile: HandProfile, revision: string, runId = randomUUID()) { this.envelope = { version: 1, runId, sequence: 0, revision, profile }; }
  update(profile: HandProfile, revision: string): void {
    this.envelope = { ...this.envelope, sequence: this.envelope.sequence + 1, revision, profile }; this.delivery = 'Applying';
  }
  acknowledge(value: unknown): boolean {
    if (!matchesProfileAck(value, this.envelope)) return false;
    this.delivery = 'Applied'; return true;
  }
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
