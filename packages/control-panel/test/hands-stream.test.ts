import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandStream, validHandFrame } from '../ui/hands-stream.js';
import { HandInput } from '../../sdk/src/hands.ts';
import { HandFrameIngress } from '../../sdk/src/hand-source.ts';

const empty = () => ({ type: 2, version: 2, seq: 1, hostTimeMs: 10, captureTimeMs: 10, trackingHz: 60, capabilities: { pinch: false, grab: false, palm: false }, hands: [] });
test('Hands admission is profile-gated, epoch-fenced, ordered and reset on disposal', () => {
  let time = 50, cleared = 0;
  const input = new HandInput(), ingress = new HandFrameIngress(input, 'native');
  const stream = createHandStream({ ingress, now: () => time, clear: () => cleared++ });
  assert.equal(stream.beginSession({ epoch: 'one' }), false);
  stream.setReady(true); assert.equal(stream.beginSession({ epoch: 'one' }), true);
  const event = { epoch: 'one', sequence: 1, frame: empty(), capturePageMs: 40 };
  assert.equal(stream.pushFrame(event), true);
  assert.equal(stream.pushFrame(event), false);
  assert.equal(stream.pushFrame({ ...event, epoch: 'retired', sequence: 2 }), false);
  assert.equal(stream.pushFrame({ ...event, sequence: 2, capturePageMs: 39 }), false);
  assert.equal(stream.metrics().handCount, 0); assert.equal(stream.metrics().frameAgeMs, 10);
  assert.equal(stream.beginSession({ epoch: 'two' }), true);
  assert.equal(stream.pushFrame(event), false);
  assert.equal(stream.metrics().trackingFps, null);
  assert.equal(stream.pushFrame({ ...event, epoch: 'two' }), true);
  time += 1100; assert.equal(stream.metrics().trackingFps, 0);
  stream.clearSession(); assert.equal(stream.active, false); assert.equal(stream.metrics().handCount, null);
  stream.dispose(); stream.dispose(); assert.ok(cleared >= 3);
  assert.equal(stream.beginSession({ epoch: 'three' }), false);
});
test('Hands admission rejects malformed/nonfinite decoded frames', () => {
  assert.ok(validHandFrame(empty()));
  for (const frame of [null, {}, { ...empty(), captureTimeMs: NaN }, { ...empty(), trackingHz: Infinity }, { ...empty(), capabilities: null }, { ...empty(), hands: [{ id: 1 }] }]) assert.equal(!!validHandFrame(frame), false);
});
