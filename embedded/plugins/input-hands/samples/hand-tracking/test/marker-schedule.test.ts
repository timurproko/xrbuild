import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { CameraCalibration } from '../src/live/multiview/viewer.ts';
import { metricCalibration, plane } from './reconstruction-helpers.ts';

const native = () => readFileSync(new URL('../bridge/capture.cpp', import.meta.url), 'utf8');
const header = () => readFileSync(new URL('../bridge/marker-schedule.hpp', import.meta.url), 'utf8');
const nativeRunner = process.env.XRB_MARKER_SCHEDULE_TEST_EXE;
function nativeFrames(offset: number, fps = 30): Map<number, number> {
  return new Map(execFileSync(nativeRunner!, [String(offset), String(fps)], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).map(line => {
    const [frame, at] = line.split(',').map(Number); return [frame, at] as const;
  }));
}
const choices = { a: { serial: 'camera-a', profile: '640x480@30' }, b: { serial: 'camera-b', profile: '640x480@30' } };

/** Fake devices with actual independent start times, not retimestamped detections. */
async function collect(offsetMs: number, schedule: 'elapsed' | 'reported-clock', domain = 'System Time', fps = 30) {
  let now = 1000;
  const port = { async start() {}, async stop() {} };
  const controller = new CameraCalibration({ a: port, b: port }, { getItem: () => null, setItem() { assert.fail('No automatic Save'); } }, () => now);
  await controller.start({ a: { ...choices.a, profile: `640x480@${fps}` }, b: { ...choices.b, profile: `640x480@${fps}` } }, 'marker');
  const events = (['a', 'b'] as const).flatMap(side => Array.from({ length: 100 }, (_, n) => ({ side, frame: n + 1, at: 1000 + n * (1000 / fps) + (side === 'b' ? offsetMs : 0) }))).sort((a, b) => a.at - b.at);
  const selected = schedule === 'reported-clock' && nativeRunner ? { a: nativeFrames(0, fps), b: nativeFrames(offsetMs, fps) } : null;
  const previous = { a: -Infinity, b: -Infinity }, originalTimes = new Map<string, number>();
  for (const event of events) {
    // Prefer the compiled production helper. The hardware-free JS policy vectors
    // and native wiring assertions remain runnable where no C++ compiler exists.
    const bucket = Math.floor(event.at / 211);
    if (selected) {
      if (!selected[event.side].has(event.frame)) continue;
      assert.equal(event.at, selected[event.side].get(event.frame));
    } else if (schedule === 'elapsed' ? event.at - previous[event.side] < 200 : bucket === previous[event.side]) continue;
    previous[event.side] = schedule === 'elapsed' ? event.at : bucket;
    originalTimes.set(`${event.side}:${event.frame}`, event.at);
    const stamp = { number: event.frame, timestampMs: event.at, domain, sensorTimestampUs: null, readoutTimestampUs: null, actualExposureUs: null };
    const packet = plane(event.frame, 1000, { meta: {
      profile: `640x480@${fps}`,
      nativeReceiveMs: event.at, nativeAlignedMs: event.at + 1, nativeSendMs: event.at + 2,
      bridgeReceiveMs: event.at + 3, bridgeSendMs: event.at + 4,
      color: { ...stamp }, depth: { ...stamp }, alignedDepth: { ...stamp },
      marker: { version: 1, family: 'tag36h11', detector: 'apriltag-3.4.5', colorFrame: event.frame,
        detections: [{ id: 42, hamming: 0, margin: 30, corners: [{ x: 260, y: 180 }, { x: 380, y: 180 }, { x: 380, y: 300 }, { x: 260, y: 300 }] }] },
    } });
    now = event.at + 5;
    const calibration = metricCalibration(); calibration.serial = choices[event.side].serial; calibration.color.fps = calibration.depth.fps = fps;
    await controller.push(event.side, { packet, calibration, receivedPageMs: now, pageOriginMs: 100000 });
  }
  const state = controller.snapshot(); await controller.stop();
  return { state, originalTimes };
}

test('native marker detection uses actual color-clock buckets, not a per-process elapsed timer', () => {
  assert.match(native(), /markerSchedule\.due\(color\.get_timestamp\(\)\)/);
  assert.doesNotMatch(native(), /lastMarker|received\s*-.*[Mm]arker/);
  assert.match(header(), /interval_ms = 211\.0/);
  assert.match(header(), /std::floor\(color_timestamp_ms \/ interval_ms\)/);
  assert.match(native(), /MarkerSchedule::self_test\(\)/);
  const runtime = readFileSync(new URL('../bridge/runtime.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /'marker-schedule\.hpp'/, 'staged runtimes must bind the changed scheduling source');
});

test('compiled native scheduling self-test and phase vectors match the policy', { skip: !nativeRunner }, () => {
  assert.match(execFileSync(nativeRunner!, [], { encoding: 'utf8', windowsHide: true }), /self-test passed/);
  for (const [fps, offset] of [[30, 0], [30, 100], [30, 116], [20, 40], [15, 50]]) {
    const actual = nativeFrames(offset, fps), expected = new Map<number, number>(); let previous = -Infinity;
    for (let n = 0; n < 100; n++) { const at = 1000 + n * (1000 / fps) + offset, bucket = Math.floor(at / 211); if (bucket !== previous) expected.set(n + 1, at); previous = bucket; }
    assert.deepEqual(actual, expected);
  }
});

test('phase-offset native packets complete calibration without changing their timestamps or qualification gates', async () => {
  const old = await collect(100, 'elapsed');
  assert.equal(old.state.result, null); assert.equal(old.state.marker.paired, 0, 'old independent 200 ms detector phases reproduce the deadlock');
  const unqualifiedClock = await collect(100, 'reported-clock', 'Hardware Clock');
  assert.equal(unqualifiedClock.state.result, null); assert.equal(unqualifiedClock.state.marker.paired, 0);
  for (const [fps, offset] of [[30, 0], [30, 100], [30, 116], [20, 40], [15, 50]]) {
    const { state, originalTimes } = await collect(offset, 'reported-clock', 'System Time', fps);
    const result = state.result;
    assert.ok(result, `${fps} Hz / offset ${offset} must reach a result`); assert.equal(result.spatialQualified, true);
    assert.equal(result.fit.samples, 32); assert.equal(result.check.samples, 16);
    for (const target of result.input.targets) {
      assert.ok(Math.abs(target.a.sourceTimeMs - target.b.sourceTimeMs) <= 40);
      assert.ok(Math.abs(target.a.selectedPageMs - target.b.selectedPageMs) <= 150);
      for (const side of ['a', 'b'] as const) assert.equal(target[side].sourceTimeMs, originalTimes.get(`${side}:${target[side].frameNumber}`));
    }
    assert.ok(result.input.targets[44].a.selectedPageMs - result.input.targets[0].a.selectedPageMs >= 1800);
    assert.equal(result.temporalAlignment, null); assert.equal(result.fusionEnabled, false); assert.equal(result.physicalValidation, 'operator-required');
  }
});
