import assert from 'node:assert/strict';
import test from 'node:test';
import { handProfile } from '../src/hand-profile.ts';
import { prepareHandFrame, HandFrameIngress } from '../src/hand-source.ts';
import { HandInput } from '../src/hands.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { projectToPanel } from '../src/pointer.ts';
import { DEFAULT_DISPLAY } from '../src/host.ts';
import { handsMessage } from './fixtures.ts';
const frame = () => decodeMessage(handsMessage([{ id: 1, grabbing: true, pinch: true }, { id: 2 }], 10)) as HandsMessage;
const close = (a: number[], b: number[]) => a.forEach((n, i) => assert.ok(Math.abs(n - b[i]) < 1e-7, `${a} != ${b}`));
test('identity preserves every frame bit/object; scale uses original own wrist before mm translation', () => {
  const raw = frame(); raw.hands[0].keypoints[1][0] = -0;
  assert.equal(prepareHandFrame(raw, handProfile()), raw); assert.ok(Object.is(prepareHandFrame(raw).hands[0].keypoints[1][0], -0));
  for (const [i, hand] of raw.hands.entries()) {
    hand.keypoints[0] = [i + .1, .2, .3]; hand.keypoints[8] = [i + .2, .4, .6];
    hand.pinchPositions = [[i + .2, .4, .6]]; hand.grabPosition = [i + .2, .4, .6];
    hand.palm[0] = [i + .2, .4, .6];
  }
  const before = structuredClone(raw), result = prepareHandFrame(raw, handProfile({ sizeFactor: .5, offsetMm: { x: 10, y: -20, z: 30 } }));
  assert.deepEqual(raw, before);
  for (const [i, h] of result.hands.entries()) {
    close(h.keypoints[0], [i + .11, .18, .33]); close(h.keypoints[8], [i + .16, .28, .48]);
    close(h.pinchPositions[0], h.keypoints[8]); close(h.grabPosition, h.keypoints[8]); close(h.palm[0], h.keypoints[8]);
    assert.deepEqual(h.palm.slice(1), raw.hands[i].palm.slice(1));
    for (const k of ['id', 'handedness', 'pinch', 'grabbing', 'scores']) assert.deepEqual(h[k], raw.hands[i][k]);
  }
  assert.deepEqual(result.capabilities, raw.capabilities); assert.equal(result.captureTimeMs, raw.captureTimeMs);
});
test('native V1 and V2 retain capability and gesture decisions', () => {
  for (const version of [1, 2]) {
    const bytes = handsMessage([{ id: 1, grabbing: true, pinch: true }], 10); new DataView(bytes).setUint8(1, version);
    const raw = decodeMessage(bytes) as HandsMessage, next = prepareHandFrame(raw, handProfile({ sizeFactor: .8 }));
    assert.deepEqual(next.capabilities, raw.capabilities); assert.deepEqual(next.hands[0].pinch, raw.hands[0].pinch);
    assert.equal(next.hands[0].grabbing, raw.hands[0].grabbing); assert.deepEqual(next.hands[0].scores, raw.hands[0].scores);
  }
});
test('skeleton-only optional positions remain unsupported and both ingress paths adjust before sampling', () => {
  for (const source of ['native', 'webxr'] as const) {
    const raw = frame(); raw.capabilities = { pinch: false, grab: false, palm: false };
    const p = handProfile({ offsetMm: { x: 100 } });
    const changed = prepareHandFrame(raw, p); assert.equal(changed.hands[0].grabPosition, raw.hands[0].grabPosition);
    assert.equal(changed.hands[0].palm, raw.hands[0].palm); assert.equal(changed.hands[0].pinchPositions, raw.hands[0].pinchPositions);
    const input = new HandInput({ smoothing: false, prediction: false }), ingress = new HandFrameIngress(input, source);
    ingress.profile = p; ingress.push(source, raw, 10);
    close(input.sample(10)[0].keypoints[8], changed.hands[0].keypoints[8]);
    assert.notDeepEqual(input.sample(10)[0].keypoints[8], raw.hands[0].keypoints[8]);
    assert.deepEqual(projectToPanel([0, 0, .6], input.sample(10)[0].keypoints[8], DEFAULT_DISPLAY), projectToPanel([0, 0, .6], changed.hands[0].keypoints[8], DEFAULT_DISPLAY));
  }
});
