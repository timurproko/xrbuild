// The hand-signal spec limits, checked by replaying rig recordings through the default pipeline
// (test/replay.ts). Tune with `node test/tune.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HandInput, KP } from '../src/hands.ts';
import { decodeMessage, type HandsMessage, type Vec3 } from '../src/protocol.ts';
import { handsMessage, openHand } from './fixtures.ts';
import { readHandsRecording } from './recording.ts';
import { replayAccuracy, replayPinch, replayStop } from './replay.ts';

const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const RECORDING = readHandsRecording(DATA + 'rig-2026-10-08.hands');
const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;

test('fingertip at display time: <= 7 mm RMS, <= 14 mm p95 (30 ms lead)', () => {
  const a = replayAccuracy(RECORDING);
  console.log(`fingertip error ${mm(a.errorRms)} RMS, ${mm(a.errorP95)} p95 over ${a.samples} samples`);
  assert.ok(a.samples > 3000, `too few samples: ${a.samples}`);
  assert.ok(a.errorRms <= 0.007, `error RMS ${mm(a.errorRms)}`);
  assert.ok(a.errorP95 <= 0.014, `error p95 ${mm(a.errorP95)}`);
});

test('still hand: jitter < 1 mm RMS and not above the raw stream, in every recording', () => {
  for (const file of readdirSync(DATA).filter((f) => f.endsWith('.hands'))) {
    const a = replayAccuracy(readHandsRecording(DATA + file));
    console.log(`${file}: still jitter ${mm(a.stillJitter)}, raw ${mm(a.rawStillJitter)}`);
    assert.ok(a.stillJitter < 0.001, `${file}: still jitter ${mm(a.stillJitter)}`);
    assert.ok(a.stillJitter <= a.rawStillJitter, `${file}: still jitter ${mm(a.stillJitter)} above raw ${mm(a.rawStillJitter)}`);
  }
});

test('stop at 0.5 m/s: overshoot <= 5 mm, within 2 mm of the stop after <= 100 ms', () => {
  const s = replayStop();
  console.log(`overshoot ${mm(s.overshoot)}, settled after ${s.settleMs.toFixed(0)} ms`);
  assert.ok(s.overshoot <= 0.005, `overshoot ${mm(s.overshoot)}`);
  assert.ok(s.settleMs <= 100, `settle ${s.settleMs} ms`);
});

test('recorded pinches: one start and one end each, <= 2 tracking frames after the threshold', () => {
  const p = replayPinch(RECORDING);
  console.log(`pinches: ${p.reference} by distance, ${p.starts} starts, ${p.ends} ends, delay ${p.maxStartDelay}/${p.maxEndDelay} frames`);
  assert.ok(p.starts >= 5, 'the recording has pinches');
  assert.equal(p.starts, p.ends);
  assert.ok(p.starts <= p.reference, 'never more pinches than distance crossings');
  assert.ok(p.maxStartDelay <= 2, `start delay ${p.maxStartDelay} frames`);
  assert.ok(p.maxEndDelay <= 2, `end delay ${p.maxEndDelay} frames`);
});

test('pinch strength rises monotonically from 0 (8 cm) to 1, and the pinch starts at 1', () => {
  const input = new HandInput({ smoothing: false });
  let last = -1, startedAt = -1;
  input.on((e) => { if (e.type === 'pinchstart') startedAt = last; });
  for (let i = 0; i <= 40; i++) {
    const d = 0.08 - (0.08 * i) / 40;
    const kp = openHand([0, 0, 0.2]);
    kp[KP.INDEX_TIP] = [kp[KP.THUMB_TIP][0] + d, kp[KP.THUMB_TIP][1], kp[KP.THUMB_TIP][2]] as Vec3;
    const t = 1000 + i * 16;
    input.push(decodeMessage(handsMessage([{ id: 2, keypoints: kp }], t)) as HandsMessage, t);
    const h = input.sample(t)[0];
    if (i === 0) assert.equal(h.pinchStrength, 0);
    assert.ok(h.pinchStrength >= last, `strength fell at ${d.toFixed(3)} m`);
    last = h.pinchStrength;
  }
  assert.equal(last, 1);
  assert.equal(startedAt, 1, 'pinch starts once strength is 1');
});

test('tip and pinch point follow the predicted keypoints', () => {
  const input = new HandInput();
  input.push(decodeMessage(handsMessage([{ id: 1 }], 1000)) as HandsMessage, 1000);
  const h = input.sample(1010)[0];
  assert.deepEqual(h.tip, h.keypoints[KP.INDEX_TIP]);
  assert.deepEqual(h.pinchPoint, [0, 1, 2].map((a) => (h.keypoints[KP.THUMB_TIP][a] + h.keypoints[KP.INDEX_TIP][a]) / 2));
});
