import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostChannel } from '../src/channel.ts';
import { CAP_PALM, CAP_PINCH, decodeMessage, MSG_DEBUG_IMAGE, MSG_PAGE_FRAME, MSG_SET_VIEW, type DebugImageMessage, type HandsMessage, type PlatformMessage, type StatusMessage } from '../src/protocol.ts';
import type { HostInfo } from '../src/host.ts';
import { debugImageMessage, eyesMessage, FakeSocket, handsMessage, platformMessage, projectionMessage, statusMessage, viewMessage } from './fixtures.ts';

function setup() {
  FakeSocket.all = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let hostClock = 50_000;
  let pageClock = 1_000;
  const host: HostInfo = {
    version: 1, stereo: true, eye: { width: 1920, height: 1080 },
    display: { widthM: 0.6, heightM: 0.34, tiltRad: 0.785, pixelsW: 1920, pixelsH: 1080 },
    channel: { url: 'ws://127.0.0.1:1/?token=t' },
    hostNow: () => hostClock,
  };
  const ch = new HostChannel(host, {
    createSocket: (url) => new FakeSocket(url),
    pageNow: () => pageClock,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  return { ch, timers, socket: () => FakeSocket.all.at(-1)!, advance: (ms: number) => { hostClock += ms; pageClock += ms; } };
}

test('decodes all message types byte-compatible with the host', () => {
  const eyes = decodeMessage(eyesMessage([-0.03, 0.1, 0.6], [0.03, 0.1, 0.6], true));
  assert.ok(eyes && 'left' in eyes);
  assert.ok(Math.abs(eyes.left[0] + 0.03) < 1e-6 && eyes.stale);
  const hands = decodeMessage(handsMessage([{ id: 7, pinch: true, at: [0.01, 0.02, 0.15] }], 1234.5)) as HandsMessage;
  assert.equal(hands.hands.length, 1);
  assert.equal(hands.hands[0].id, 7);
  assert.equal(hands.hands[0].pinch[0], true);
  assert.equal(hands.captureTimeMs, 1234.5);
  assert.ok(Math.abs(hands.hands[0].keypoints[0][2] - 0.15) < 1e-6);
  const status = decodeMessage(statusMessage(1, 'tracking with 2 camera(s)', 58));
  assert.ok(status && 'text' in status);
  assert.equal(status.state, 'running');
  assert.equal(status.text, 'tracking with 2 camera(s)');
  assert.equal(decodeMessage(new ArrayBuffer(8)), null);
});

test('v2: capabilities in the hands header; version 1 hands have every capability', () => {
  const v2 = decodeMessage(handsMessage([{ id: 1 }], 1000, 1, 60, { capabilities: CAP_PINCH | CAP_PALM })) as HandsMessage;
  assert.deepEqual(v2.capabilities, { pinch: true, grab: false, palm: true });
  const none = decodeMessage(handsMessage([{ id: 1 }], 1000, 1, 60, { capabilities: 0 })) as HandsMessage;
  assert.deepEqual(none.capabilities, { pinch: false, grab: false, palm: false });
  const v1 = decodeMessage(handsMessage([{ id: 1 }], 1000, 1, 60, { version: 1 })) as HandsMessage;
  assert.equal(v1.version, 1);
  assert.deepEqual(v1.capabilities, { pinch: true, grab: true, palm: true });
});

test('v2: neutral input states', () => {
  const states = [0, 1, 2, 3, 4, 9].map((s) => (decodeMessage(statusMessage(s, '')) as StatusMessage).state);
  assert.deepEqual(states, ['starting', 'running', 'needs-setup', 'device-missing', 'failed', 'failed']);
});

test('v2: debug images with stream, format, label and boxes (bytes as host-tests encodes them)', () => {
  const m = decodeMessage(debugImageMessage(3, 'Camera 2 colour', 2, 2, 1, [4, 2], [[10, 20, 30, 40, 0.5]], [1, 2, 3, 4, 5, 6])) as DebugImageMessage;
  assert.equal(m.type, MSG_DEBUG_IMAGE + 3);
  assert.equal(m.stream, 3);
  assert.equal(m.format, 'rgb8');
  assert.equal(m.label, 'Camera 2 colour');
  assert.deepEqual([m.width, m.height, m.fullWidth, m.fullHeight], [2, 1, 4, 2]);
  assert.deepEqual(m.boxes, [[10, 20, 30, 40, 0.5]]);
  assert.deepEqual([...m.pixels], [1, 2, 3, 4, 5, 6]);
  const ir = decodeMessage(debugImageMessage(0, '', 1, 2, 2, [2, 2], [], [9, 8, 7, 6])) as DebugImageMessage;
  assert.equal(ir.format, 'y8');
  assert.equal(ir.label, '');
  assert.equal(decodeMessage(debugImageMessage(0, 'x', 1, 4, 4, [4, 4], [], [1, 2])), null, 'truncated pixels');
});

test('v2: platform parameters, decoded and kept as the newest', () => {
  const m = decodeMessage(platformMessage('{"name":"station","params":{"language":"de","volume":"0.5"}}')) as PlatformMessage;
  assert.equal(m.name, 'station');
  assert.deepEqual(m.params, { language: 'de', volume: '0.5' });
  assert.deepEqual((decodeMessage(platformMessage('{"name":"","params":[1]}')) as PlatformMessage).params, {}, 'params must be an object');
  assert.equal(decodeMessage(platformMessage('{not json')), null);

  const { ch, socket } = setup();
  const seen: string[] = [];
  ch.onPlatform((p) => seen.push(String(p.params.language)));
  socket().open();
  socket().receive(platformMessage('{"name":"station","params":{}}', 1));
  socket().receive(platformMessage('{"name":"station","params":{"language":"fr"}}', 2));
  assert.deepEqual(seen, ['undefined', 'fr']);
  assert.equal(ch.platform?.params.language, 'fr');
});

test('keeps only the newest message per type', () => {
  const { ch, socket } = setup();
  socket().open();
  socket().receive(eyesMessage([0, 0, 0.5], [0, 0, 0.5], false, 1));
  socket().receive(eyesMessage([0.1, 0, 0.5], [0.1, 0, 0.5], false, 2));
  socket().receive(handsMessage([{ id: 1 }], 1000, 3));
  assert.equal(ch.eyes?.seq, 2);
  assert.ok(Math.abs(ch.eyes!.left[0] - 0.1) < 1e-6);
  assert.equal(ch.hands?.hands[0].id, 1);
  assert.deepEqual(ch.counts, { eyes: 2, hands: 1, status: 0, view: 0, platform: 0, projection: 0 });
});

test('projection messages are decoded, retained and announced', () => {
  const decoded = decodeMessage(projectionMessage(true, 4));
  assert.ok(decoded && 'orthographic' in decoded);
  assert.deepEqual([decoded.orthographic, decoded.seq], [true, 4]);
  const invalid = projectionMessage(false);
  new DataView(invalid).setUint8(16, 2);
  assert.equal(decodeMessage(invalid), null);

  const { ch, socket } = setup();
  const seen: boolean[] = [];
  ch.onProjection((projection) => seen.push(projection.orthographic));
  socket().open();
  socket().receive(projectionMessage(false));
  socket().receive(projectionMessage(true, 2));
  assert.deepEqual(seen, [false, true]);
  assert.equal(ch.projection?.orthographic, true);
  assert.equal(ch.counts.projection, 2);
});

test('reconnects with growing backoff after the socket drops', () => {
  const { ch, timers, socket } = setup();
  socket().open();
  assert.ok(ch.connected);
  socket().drop();
  assert.equal(ch.connected, false);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 250);
  timers[0].fn();
  assert.equal(FakeSocket.all.length, 2);
  socket().drop();
  assert.equal(timers[1].ms, 500);
  timers[1].fn();
  socket().open();
  socket().receive(eyesMessage([0, 0, 0.5], [0, 0, 0.5]));
  assert.ok(ch.connected && ch.eyes);
  ch.close();
  socket().drop();
  assert.equal(timers.length, 2, 'no reconnect after close()');
});

test('maps host time to page time and sends heartbeats', () => {
  const { ch, socket, advance } = setup();
  // host clock 50000 <-> page clock 1000
  assert.equal(ch.hostToPage(49_990), 990);
  advance(100);
  assert.equal(ch.hostToPage(50_100), 1_100);
  const perf = { fps: 59.5, frameMs: 16.7, latencyMs: 21.5, eyeWidth: 1920, eyeHeight: 1080 };
  ch.sendHeartbeat(perf);
  assert.equal(socket().sent.length, 0, 'not sent before open');
  socket().open();
  ch.sendHeartbeat(perf);
  const v = new DataView(socket().sent[0]);
  assert.equal(v.byteLength, 16 + 24);
  assert.equal(v.getUint8(0), MSG_PAGE_FRAME);
  assert.ok(Math.abs(v.getFloat32(24, true) - 59.5) < 1e-6, 'fps');
  assert.ok(Math.abs(v.getFloat32(28, true) - 16.7) < 1e-4, 'frame time');
  assert.ok(Math.abs(v.getFloat32(32, true) - 21.5) < 1e-6, 'latency');
  assert.equal(v.getUint16(36, true), 1920);
  assert.equal(v.getUint16(38, true), 1080);
});

test('reports unknown latency as NaN', () => {
  const { ch, socket } = setup();
  socket().open();
  ch.sendHeartbeat({ fps: 60, frameMs: 16.6, latencyMs: null, eyeWidth: 800, eyeHeight: 600 });
  assert.ok(Number.isNaN(new DataView(socket().sent[0]).getFloat32(32, true)));
});

test('view messages: the host tells the current view, the page asks for a switch', () => {
  const view = decodeMessage(viewMessage(false, true, 1920, 1080, 4));
  assert.ok(view && 'switchable' in view);
  assert.deepEqual([view.stereo, view.switchable, view.width, view.height, view.seq], [false, true, 1920, 1080, 4]);
  assert.equal(decodeMessage(viewMessage(true).slice(0, 20)), null, 'truncated');

  const { ch, socket } = setup();
  socket().open();
  const seen: boolean[] = [];
  ch.onView((v) => seen.push(v.stereo));
  socket().receive(viewMessage(false));
  socket().receive(viewMessage(true, true, 1920, 1080, 2));
  assert.deepEqual(seen, [false, true]);
  assert.equal(ch.view?.stereo, true);
  assert.equal(ch.counts.view, 2);

  assert.ok(ch.sendSetView(false));
  const sent = socket().sent.at(-1)!;
  const v = new DataView(sent);
  assert.equal(v.getUint8(0), MSG_SET_VIEW);
  assert.equal(sent.byteLength, 17);
  assert.equal(v.getUint8(16), 0);
  ch.sendSetView(true);
  assert.equal(new DataView(socket().sent.at(-1)!).getUint8(16), 1);
  socket().close();
  assert.equal(ch.sendSetView(true), false, 'nothing to send to while disconnected');
});
