import test from 'node:test';
import assert from 'node:assert/strict';
import { openRecordingArchive } from '../src/live/recording/archive.ts';
import { recordingCsv } from '../src/live/recording/csv.ts';
import { exportClip } from '../src/live/recording/format.ts';
import { exportDepthClip, compressPacket } from '../src/live/recording/depth-format.ts';
import { PairRecorder, exportPair } from '../src/live/multiview/recording.ts';
import { clip } from './recording-helpers.ts';
import { depthClip, depthMetadata, depthInput } from './depth-recording-helpers.ts';
import { plane } from './reconstruction-helpers.ts';
import { inputFixture } from './calibration-helpers.ts';

test('existing pose CSV and RGB observations replay unchanged without a live camera or inference', async () => {
  const csv = recordingCsv([{ timeMs: 30, space: 'camera-metric', hands: [{ id: 9, handedness: null, joints: Array.from({ length: 21 }, (_, x) => x === 4 ? null : { x: x / 100, y: .2, z: 1 }) }] }], '2026-11-26T00:00:00Z');
  const poses = await openRecordingArchive(new Blob([csv]));
  const pose = (await poses.tracks[0].frame(0)).pose;
  assert.equal(pose.space, 'camera-metric'); assert.equal(pose.hands[0].joints[4], null); assert.equal(pose.hands[0].joints[5]!.x, .05);
  const rgb = await openRecordingArchive(exportClip(await clip()));
  assert.equal(rgb.tracks[0].times.length, 3); assert.equal((await rgb.tracks[0].frame(1)).pose.hands.length, 0);
  assert.ok((await rgb.tracks[0].frame(0)).png);
});
test('existing RGB-D packets decode independently without hand-surface reconstruction', async () => {
  const raw = await depthClip(false), archive = await openRecordingArchive(exportDepthClip(raw));
  const frame = await archive.tracks[0].frame(0);
  assert.ok(frame.packet?.rgbBytes); assert.equal(frame.pose.hands.length, 0);
  assert.deepEqual(frame.metadata, raw.frames[0].meta);
});
test('paired recording remains two independently playable original streams without fusion or benchmarks', async () => {
  const spatial = inputFixture(), clock = { now: 100 };
  const recorder = new PairRecorder(() => {}, { now: () => clock.now, utc: () => '2026-11-26T00:00:00Z', id: () => 'archive-pair', encode: compressPacket, timer: () => 0 as any, clearTimer: () => {} });
  const metadata = (side: 'a' | 'b') => ({ ...depthMetadata(false), calibration: spatial.sources[side], source: { kind: 'native-rgbd' as const, id: `rgbd:${spatial.sources[side].serial}:run-${side}`, label: 'Archive codec sample' } });
  recorder.start(metadata('a'), metadata('b'), { a: 0, b: 0 });
  for (let sequence = 1; sequence <= 2; sequence++) {
    clock.now = 100 + sequence * 33;
    for (const side of ['a', 'b'] as const) recorder.capture(side, plane(sequence, 1000, { meta: { runId: `run-${side}` } }), depthInput(sequence, false));
    while (recorder.snapshot().inFlight) await new Promise(resolve => setTimeout(resolve, 1));
  }
  clock.now = 300; const pair = await recorder.stop(); assert.ok(pair);
  const archive = await openRecordingArchive(exportPair(pair)); assert.equal(archive.tracks.length, 2);
  assert.ok((await archive.tracks[1].frame(1)).packet); assert.equal(archive.tracks[0].times.length, 2);
});
test('invalid or oversized archives are rejected before playback', async () => {
  await assert.rejects(openRecordingArchive(new Blob()), /limit/);
  await assert.rejects(openRecordingArchive(new Blob(['not a recording'])), /Invalid recording/);
});
