import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraCalibration } from '../src/live/multiview/viewer.ts';
import { metricCalibration, plane } from './reconstruction-helpers.ts';
const choices = { a: { serial: 'camera-a', profile: '640x480@30' }, b: { serial: 'camera-b', profile: '640x480@30' } };
export function markerPacket(n: number, detections = true) {
  const corners = [{ x: 290 + n, y: 210 }, { x: 350 + n, y: 210 }, { x: 350 + n, y: 270 }, { x: 290 + n, y: 270 }];
  return plane(n + 1, 1000, { meta: { marker: { version: 1, family: 'tag36h11', detector: 'apriltag-3.4.5', colorFrame: n + 1, detections: detections ? [{ id: 42, hamming: 0, margin: 30, corners }] : [] } } });
}
test('marker coordinator retains collection on weak frames, qualifies disjoint fit/check groups and never saves implicitly', async () => {
  let now = 1000, writes = 0; const calls: any[] = [], port = { async start(choice: any) { calls.push(choice); }, async stop() {} };
  const controller = new CameraCalibration({ a: port, b: port }, { getItem: () => null, setItem() { writes++; } }, () => now);
  await controller.start(choices, 'marker'); assert.ok(calls.every(value => value.markers && value.handInference === false));
  const value = (side: 'a'|'b', n: number, detected = true) => ({ packet: markerPacket(n, detected), calibration: { ...metricCalibration(), serial: choices[side].serial }, receivedPageMs: now, pageOriginMs: 100000 });
  await controller.push('a', value('a', 0, false)); assert.match(controller.snapshot().marker.reason, /Place marker/); assert.equal(controller.snapshot().phase, 'running');
  for (let n = 0; n < 12; n++) { now = 1000 + n * 220; for (const side of ['a','b'] as const) await controller.push(side, value(side, n)); }
  const result = controller.snapshot().result!; assert.equal(result.spatialQualified, true); assert.equal(result.check.samples, 16); assert.equal(result.fit.samples, 32); assert.equal(result.accuracy, 'unverified'); assert.equal(result.temporalAlignment, null); assert.equal(result.fusionEnabled, false); assert.equal(writes, 0);
  await controller.stop(); assert.equal(controller.snapshot().result, result);
});
test('Stop during asynchronous marker fit fences the computed result', async () => {
  let now=1000;const port={async start(){},async stop(){}},controller=new CameraCalibration({a:port,b:port},{getItem:()=>null,setItem(){assert.fail('no write');}},()=>now);
  await controller.start(choices);
  const value=(side:'a'|'b',n:number)=>({packet:markerPacket(n),calibration:{...metricCalibration(),serial:choices[side].serial},receivedPageMs:now,pageOriginMs:100000});
  for(let n=0;n<11;n++){now=1000+n*220;for(const side of ['a','b']as const)await controller.push(side,value(side,n));}
  now=3420;await controller.push('a',value('a',11));const fitting=controller.push('b',value('b',11));await controller.stop();await fitting;
  assert.equal(controller.snapshot().result,null);assert.equal(controller.snapshot().phase,'idle');
});
test('marker cancellation fences subsequent native packets and leaves no applied or saved result', async () => {
  const port = { async start() {}, async stop() {} }, controller = new CameraCalibration({ a: port, b: port }, { getItem: () => null, setItem() { assert.fail('no write'); } }, () => 1000);
  await controller.start(choices); await controller.stop();
  await controller.push('a', { packet: markerPacket(0), calibration: { ...metricCalibration(), serial: 'camera-a' }, receivedPageMs: 1000, pageOriginMs: 100000 });
  assert.equal(controller.snapshot().result, null); assert.equal(controller.snapshot().marker.paired, 0); assert.equal(controller.snapshot().phase, 'idle');
});
