import assert from 'node:assert/strict';
import test from 'node:test';
import { handProfile } from '../src/hand-profile.ts';
import { HandProfileReceiver, profileEnvelope, encodeProfileControl, decodeProfileControl, MSG_HAND_PROFILE } from '../src/hand-profile-control.ts';
import { previewHandScope } from '../src/hand-profile-preview.ts';
import { appLaunchUrl, appResumeUrl } from '../src/launch-context.ts';
const runId = 'fixture-run-1234567890';
const envelope = (sequence = 0, profile = handProfile()) => ({ version: 1, runId, revision: 'a'.repeat(64), sequence, profile });
test('full run-bound profile application is ordered, atomic and distinguishes geometry from appearance', () => {
  const changes: boolean[] = [], acks: number[] = [];
  const receiver = new HandProfileReceiver(runId, (_, changed) => changes.push(changed), e => acks.push(e.sequence));
  receiver.receive(envelope()); assert.deepEqual(changes, []); receiver.flush();
  receiver.receive(envelope(1, handProfile({ appearance: { opacity: .5 } }))); receiver.flush();
  receiver.receive(envelope(3, handProfile({ sizeFactor: .8 }))); receiver.receive(envelope(2)); receiver.flush();
  assert.deepEqual(changes, [false, false, true]);
  assert.equal(receiver.receive(envelope(3, handProfile({ sizeFactor: .8 }))), false); // Re-ack, never reset.
  assert.equal(receiver.receive({ ...envelope(4), runId: 'foreign-run-123456789' }), false);
  assert.equal(receiver.receive(envelope(4, { ...handProfile(), sizeFactor: 2 })), false);
  receiver.close(); assert.equal(receiver.receive(envelope(5)), false); receiver.flush();
  assert.deepEqual(changes, [false, false, true]); assert.deepEqual(acks, [0, 1, 3, 3]);
});
test('profile control codec is bounded, separate from HANDS and rejects invalid envelope versions/order fields', () => {
  const e = envelope(); assert.deepEqual(profileEnvelope(decodeProfileControl(encodeProfileControl(MSG_HAND_PROFILE, e), MSG_HAND_PROFILE)), e);
  assert.equal(decodeProfileControl(encodeProfileControl(2, e), MSG_HAND_PROFILE), null);
  assert.throws(() => encodeProfileControl(MSG_HAND_PROFILE, 'x'.repeat(9000)), /oversized/);
  for (const bad of [{ ...e, sequence: NaN }, { ...e, sequence: 1.2 }, { ...e, sequence: -1 }, { ...e, runId: 'bad' }, { ...e, version: 2 }]) assert.throws(() => profileEnvelope(bad));
});
test('browser profile scope remains bound across trusted nested/resume navigation', () => {
  const root = 'http://127.0.0.1:5180/preview/launcher/?xrb-preview-panel=http://127.0.0.1:5180&xrb-preview-token=token-123456789012&xrb-preview-session=session-1234567890&xrb-preview-route=/preview/launcher/&xrb-project=core/launcher&xrb-hand-project=core/launcher';
  const first = appLaunchUrl('http://127.0.0.1:5180/preview/second/', { returnUrl: root });
  const nested = appLaunchUrl('http://127.0.0.1:5180/preview/third/', { returnUrl: first });
  for (const href of [root, first, nested, appResumeUrl(first, 'perspective')]) {
    const scope = previewHandScope(new URL(href).search)!;
    assert.equal(scope.runId, 'session-1234567890'); assert.equal(scope.endpoint.searchParams.get('project'), 'core/launcher');
  }
  assert.equal(previewHandScope('?xrb-preview-panel=https://foreign.example&xrb-preview-token=token-123456789012'), null);
});
