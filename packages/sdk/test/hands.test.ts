import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { HandInput, KP, type HandEvent } from '../src/hands.ts';
import { decodeMessage, type HandsMessage, type Vec3 } from '../src/protocol.ts';
import { handsMessage, openHand } from './fixtures.ts';
import { readHandsRecording } from './recording.ts';

const RECORDING = fileURLToPath(new URL('./data/rig-2026-10-08.hands', import.meta.url));
const msg = (hands: Parameters<typeof handsMessage>[0], t: number) => decodeMessage(handsMessage(hands, t)) as HandsMessage;

/** Seeded Gaussian noise so the tests are deterministic. */
function noise(seed = 1) {
  let s = seed;
  const u = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) || 1e-9;
  return (sigma: number) => sigma * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** RMS deviation from a centred moving average (removes slow drift, keeps jitter). */
function jitterRms(samples: Vec3[], half = 7): number {
  let sum = 0, n = 0;
  for (let i = half; i < samples.length - half; i++) {
    const avg = [0, 1, 2].map((a) => samples.slice(i - half, i + half + 1).reduce((s, p) => s + p[a], 0) / (2 * half + 1));
    sum += (samples[i][0] - avg[0]) ** 2 + (samples[i][1] - avg[1]) ** 2 + (samples[i][2] - avg[2]) ** 2;
    n++;
  }
  return Math.sqrt(sum / Math.max(n, 1));
}

test('hands from separate providers coexist when their frames arrive independently', () => {
  const input = new HandInput();
  input.push(msg([{ id: 0 }], 1000), 1000);
  input.push(msg([{ id: 1 }], 1010), 1010);
  assert.deepEqual(input.sample(1020).map((hand) => hand.id).sort(), [0, 1]);
  input.push(msg([{ id: 0 }], 1005), 1005);  // asynchronous providers can report out of order
  assert.equal(input.sample(1020).find((hand) => hand.id === 1)?.coasting, false);
});

test('a still hand from the rig recording renders with < 3 mm RMS fingertip jitter', () => {
  const frames = readHandsRecording(RECORDING);
  // Still windows: 1 s with one hand present throughout and < 3 cm total fingertip travel.
  const input = new HandInput();
  const raw: Vec3[][] = [], rendered: Vec3[][] = [];
  let curRaw: Vec3[] = [], curOut: Vec3[] = [];
  for (const f of frames) {
    input.push(f, f.captureTimeMs);
    const hands = input.sample(f.captureTimeMs + 15);  // typical capture -> display delay
    const h = f.hands.find((x) => x.id === hands[0]?.id);
    if (hands.length === 1 && h && !hands[0].coasting) {
      curRaw.push(h.keypoints[KP.INDEX_TIP]);
      curOut.push(hands[0].keypoints[KP.INDEX_TIP]);
      if (curRaw.length === 55) {
        const xs = curRaw.map((p) => p[0]), ys = curRaw.map((p) => p[1]), zs = curRaw.map((p) => p[2]);
        const travel = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
        if (travel < 0.03) { raw.push(curRaw); rendered.push(curOut); }
        curRaw = []; curOut = [];
      }
    } else { curRaw = []; curOut = []; }
  }
  assert.ok(raw.length >= 3, `need still windows in the recording, found ${raw.length}`);
  const rawJ = raw.map((w) => jitterRms(w)), outJ = rendered.map((w) => jitterRms(w));
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`still windows ${raw.length}: raw jitter ${(mean(rawJ) * 1000).toFixed(2)} mm, rendered ${(mean(outJ) * 1000).toFixed(2)} mm RMS`);
  assert.ok(mean(outJ) < 0.003, `rendered jitter ${(mean(outJ) * 1000).toFixed(2)} mm`);
  assert.ok(mean(outJ) <= mean(rawJ), 'smoothing never makes it worse');
});

test('a hand moving at 1 m/s lags its true position by at most 3 cm', () => {
  const input = new HandInput();
  const n = noise(7);
  const hz = 55, latencyMs = 15;
  let maxErr = 0;
  for (let i = 0; i < 120; i++) {
    const t = 1000 + (i * 1000) / hz;
    const x = -0.3 + ((t - 1000) / 1000) * 1.0;  // 1 m/s along x
    input.push(msg([{ id: 1, at: [x + n(0.002), 0.05 + n(0.002), 0.15 + n(0.002)] }], t), t);
    const display = t + latencyMs;
    const truth = -0.3 + ((display - 1000) / 1000) * 1.0;
    const wrist = input.sample(display)[0].keypoints[KP.WRIST];
    if (i > 30) maxErr = Math.max(maxErr, Math.abs(wrist[0] - truth));
  }
  console.log(`max error at 1 m/s: ${(maxErr * 100).toFixed(2)} cm`);
  assert.ok(maxErr <= 0.03, `max error ${(maxErr * 100).toFixed(2)} cm`);
});

test('one pinchstart and one pinchend per pinch, even with a noisy distance', () => {
  const input = new HandInput();
  const events: string[] = [];
  input.on((e: HandEvent) => events.push(e.type));
  const n = noise(3);
  const distances = [...Array(20).fill(0.05), ...Array(30).fill(0.02), ...Array(20).fill(0.05)];
  distances.forEach((d, i) => {
    const kp = openHand([0, 0, 0.2]);
    kp[KP.INDEX_TIP] = [kp[KP.THUMB_TIP][0] + d + n(0.003), kp[KP.THUMB_TIP][1], kp[KP.THUMB_TIP][2]];
    const t = 1000 + i * 18;
    input.push(msg([{ id: 3, keypoints: kp }], t), t);
    input.sample(t);
  });
  assert.deepEqual(events.filter((e) => e.startsWith('pinch')), ['pinchstart', 'pinchend']);
});

test('native pinch flags count as pinches only with nativePinch', () => {
  for (const [nativePinch, expected] of [[true, ['appear', 'pinchstart', 'pinchend']], [false, ['appear']]] as const) {
    const input = new HandInput({ nativePinch });
    const events: string[] = [];
    input.on((e) => events.push(e.type));
    [false, true, true, false].forEach((p, i) => input.push(msg([{ id: 4, pinch: p }], 1000 + i * 16), 1000 + i * 16));
    assert.deepEqual(events, expected);
  }
});

test('a short dropout keeps the hand, a long one loses it exactly once', () => {
  const input = new HandInput({ graceMs: 150 });
  const events: string[] = [];
  input.on((e) => events.push(e.type));
  input.push(msg([{ id: 9 }], 1000), 1000);
  input.push(msg([], 1080), 1080);  // the host keeps sending results; this one lacks the hand
  assert.equal(input.sample(1100).length, 1, 'still there 100 ms later');
  assert.ok(input.sample(1100)[0].coasting);
  input.push(msg([{ id: 9 }], 1120), 1120);
  assert.equal(input.sample(1260).length, 1);
  assert.equal(input.sample(1300).length, 0, 'gone after 180 ms');
  input.sample(1400);
  assert.deepEqual(events, ['appear', 'lost']);
});

test('hands with too few confident keypoints are ignored', () => {
  const input = new HandInput();
  input.push(msg([{ id: 5, score: 0 }], 1000), 1000);
  assert.equal(input.sample(1000).length, 0);
});
