import assert from 'node:assert/strict';
import test from 'node:test';
import { CalibrationCamera } from '../src/live/multiview/calibration-port.ts';
import { CameraCalibration } from '../src/live/multiview/viewer.ts';
import { calibration, devices, packet } from './rgbd-helpers.ts';
import { metricCalibration, plane } from './reconstruction-helpers.ts';

class Socket {
  static latest: Socket; readyState = 1; bufferedAmount = 0; binaryType = ''; onopen: any; onmessage: any; onerror: any; onclose: any; sent: any[] = [];
  constructor(_url: string, publicProtocols: string[]) { assert.equal(publicProtocols.length, 2); Socket.latest = this; queueMicrotask(() => this.onopen?.()); }
  send(raw: string) { const value = JSON.parse(raw); this.sent.push(value); if (value.type === 'list') queueMicrotask(() => this.message({ type: 'devices', ...devices() })); if (value.type === 'ping') queueMicrotask(() => this.message({ type: 'pong', id: value.id, bridgeReceiveMs: 100, bridgeSendMs: 100 })); if (value.type === 'start') queueMicrotask(() => this.message({ type: 'started', runId: 'fixture-run', calibration: calibration() })); if (value.type === 'stop') queueMicrotask(() => this.message({ type: 'stopped', id: value.id })); }
  message(value: any) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; }
}
const endpoint = { url: 'ws://127.0.0.1:5211/bridge', token: 'a'.repeat(64) };
const choice = { serial: 'fixture-serial', profile: '640x480@30', markers: false, handInference: false as const };
test('minimal port enumerates explicitly, starts manual with no marker/inference, validates and acknowledges frames', async () => {
  let frames = 0; const errors: Error[] = [], camera = new CalibrationCamera({ async frame() { frames++; }, failed(error) { errors.push(error); } }, Socket as any);
  assert.equal(camera.snapshot().phase, 'disconnected'); await camera.connect(endpoint); await camera.start(choice);
  const socket = Socket.latest; assert.equal(socket.sent.find(v => v.type === 'start').markerCalibration, false);
  socket.onmessage({ data: packet().buffer }); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(frames, 1); assert.ok(socket.sent.some(v => v.type === 'ack' && v.sequence === 1));
  await camera.stop(); assert.equal(camera.snapshot().phase, 'connected'); camera.disconnect(); assert.deepEqual(errors, []);
});
test('source changes, malformed frames and disconnected transports fail closed', async () => {
  for (const kind of ['source', 'packet', 'disconnect']) {
    const errors: Error[] = [], camera = new CalibrationCamera({ async frame() { assert.fail('must not admit'); }, failed(error) { errors.push(error); } }, Socket as any);
    await camera.connect(endpoint);
    if (kind === 'source') {
      const old = Socket.prototype.send; Socket.prototype.send = function(raw) { const value = JSON.parse(raw); if (value.type === 'start') queueMicrotask(() => this.message({ type: 'started', runId: 'fixture-run', calibration: { ...calibration(), serial: 'changed' } })); else old.call(this, raw); };
      try { await assert.rejects(camera.start(choice), /source\/profile/); } finally { Socket.prototype.send = old; }
    } else { await camera.start(choice); if (kind === 'packet') Socket.latest.onmessage({ data: new ArrayBuffer(4) }); else Socket.latest.onclose(); }
    assert.equal(camera.snapshot().phase, 'failed'); assert.equal(errors.length, 1); camera.disconnect();
  }
});
test('manual controller uses current static native probes and invalidates edits without hand engines', async () => {
  const calls: any[] = [], port = { async start(value: any) { calls.push(value); }, async stop() {} }, storage = { getItem: () => null, setItem: () => assert.fail('no implicit writes') };
  let now = 1000; const controller = new CameraCalibration({ a: port, b: port }, storage, () => now);
  await controller.start({ a: { serial: 'camera-a', profile: choice.profile }, b: { serial: 'camera-b', profile: choice.profile } }, 'manual');
  assert.ok(calls.every(value => value.markers === false && value.handInference === false));
  const cal = { ...metricCalibration(), serial: 'camera-a' }, value = { packet: plane(), calibration: cal, receivedPageMs: now, pageOriginMs: 100000 };
  await controller.push('a', value); await controller.addTarget('a', 'p1', 'fit', { x: 320, y: 240 });
  assert.equal(controller.snapshot().targets, 1); await assert.rejects(controller.addTarget('a', 'p1', 'fit', { x: 320, y: 240 }), /Remove/);
  now += 501; await assert.rejects(controller.addTarget('a', 'p2', 'fit', { x: 320, y: 240 }), /current/);
  controller.removeTarget('p1'); assert.equal(controller.snapshot().targets, 0); await controller.stop();
});
