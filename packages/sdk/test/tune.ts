// Hand signal tuning: prints replay metrics for a grid of filter settings.
//   node test/tune.ts [recording.hands ...]
// Defaults to every recording in test/data. Compare rows against the hand-signal limits
// (error <= 7 mm RMS / 14 mm p95, still jitter < 1 mm and <= raw, overshoot <= 5 mm, settle <= 100 ms).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HAND_INPUT, type HandInputOptions } from '../src/hands.ts';
import { readHandsRecording } from './recording.ts';
import { replayAccuracy, replayPinch, replayStop } from './replay.ts';

const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(DATA).filter((f) => f.endsWith('.hands')).map((f) => DATA + f);

const grid: [string, HandInputOptions][] = [
  ['defaults', {}],
  ['v0.1 (before the hand-signal tuning)', {
    smoothing: { minCutoff: 1.5, beta: 4, dCutoff: 1 }, predictionVelocity: 'filter', pinchEnterFrames: 3, pinchExitFrames: 5, nativePinch: true,
  }],
  ['no smoothing, no prediction', { smoothing: false, prediction: false }],
];
for (const v of [0, 0.02, 0.05, 0.08]) grid.push([`prediction min speed ${v}`, { predictionMinSpeed: v }]);
for (const hz of [5, 12]) grid.push([`velocity cutoff ${hz} Hz`, { velocityCutoffHz: hz }]);
for (const minCutoff of [1, 1.5, 2.5])
  for (const beta of [20, 40, 80])
    grid.push([`minCutoff ${minCutoff}, beta ${beta}`, { smoothing: { ...DEFAULT_HAND_INPUT.smoothing, minCutoff, beta } }]);

const mm = (m: number) => (m * 1000).toFixed(1).padStart(5);
for (const file of files) {
  const frames = readHandsRecording(file);
  console.log(`\n${file.split(/[\\/]/).pop()} (${frames.length} frames)`);
  console.log('setting'.padEnd(44), 'err rms  p95  still  raw | overshoot settle | pinch ref/start/end delay');
  for (const [name, opts] of grid) {
    const a = replayAccuracy(frames, opts);
    const s = replayStop(opts);
    const p = replayPinch(frames, opts);
    console.log(
      name.padEnd(44),
      `${mm(a.errorRms)} ${mm(a.errorP95)} ${mm(a.stillJitter)} ${mm(a.rawStillJitter)} |`,
      `${mm(s.overshoot)}    ${String(Math.round(s.settleMs)).padStart(4)} |`,
      `${p.reference}/${p.starts}/${p.ends} ${p.maxStartDelay}+${p.maxEndDelay}`,
    );
  }
}
