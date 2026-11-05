// Gestures with and without provider support (design D9): pinch and grab come from the keypoints,
// the provider's flags only when its frames declare them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HAND_INPUT, fingerCurl, HandInput, KP, type HandEvent } from '../src/hands.ts';
import { CAP_GRAB, CAP_PALM, CAP_PINCH, decodeMessage, type HandsMessage, type Vec3 } from '../src/protocol.ts';
import * as sdk from '../src/index.ts';
import { handsMessage, openHand } from './fixtures.ts';
import { readHandsRecording } from './recording.ts';

const DATA = fileURLToPath(new URL('./data/', import.meta.url));

/** A fist around `at`: the four fingertips folded onto the palm. */
function fist(at: Vec3): Vec3[] {
  const kp = openHand(at);
  for (const [tip, mcp] of [[KP.INDEX_TIP, KP.INDEX_MCP], [KP.MIDDLE_TIP, KP.MIDDLE_MCP], [KP.RING_TIP, KP.RING_MCP], [KP.PINKY_TIP, KP.PINKY_MCP]]) {
    kp[tip] = [kp[mcp][0] * 0.5 + at[0] * 0.5, at[1] + 0.035, at[2] + 0.01];
    kp[tip - 1] = [kp[mcp][0], at[1] + 0.06, at[2] + 0.015];
    kp[tip - 2] = [kp[mcp][0], at[1] + 0.065, at[2] + 0.005];
  }
  return kp;
}

function run(frames: { kp: Vec3[]; grabbing?: boolean }[], capabilities: number) {
  const input = new HandInput({ smoothing: false });
  const events: string[] = [];
  input.on((e) => { if (e.type.startsWith('grab')) events.push(e.type); });
  frames.forEach((f, i) => {
    const t = 1000 + i * 16;
    input.push(decodeMessage(handsMessage([{ id: 1, keypoints: f.kp, grabbing: f.grabbing }], t, i, 60, { capabilities })) as HandsMessage, t);
  });
  return events;
}

test('finger curl: an open hand is about 1, a fist under the grab threshold', () => {
  assert.ok(fingerCurl(openHand([0, 0, 0.2])) > DEFAULT_HAND_INPUT.grabExitCurl);
  assert.ok(fingerCurl(fist([0, 0, 0.2])) < DEFAULT_HAND_INPUT.grabEnterCurl);
});

test('no grab capability: a fist grabs from the keypoints, after the enter frames, and ends when the hand opens', () => {
  const open = { kp: openHand([0, 0, 0.2]) }, closed = { kp: fist([0, 0, 0.2]) };
  assert.deepEqual(run([open, closed, closed, closed, open, open, open], CAP_PINCH | CAP_PALM), ['grabstart', 'grabend']);
  assert.deepEqual(run([open, closed, open, closed, open], 0), [], 'one-frame fists do not grab');
});

test('grab capability: the provider decides, not the keypoints', () => {
  const closed = { kp: fist([0, 0, 0.2]), grabbing: false };
  const open = { kp: openHand([0, 0, 0.2]), grabbing: true };
  assert.deepEqual(run([closed, closed, closed], CAP_GRAB), [], 'a fist the provider does not call a grab');
  assert.deepEqual(run([open, { ...open, grabbing: false }], CAP_GRAB), ['grabstart', 'grabend'], 'the provider flag, frame by frame');
});

test('native pinch counts only when declared', () => {
  const pinchFlag = (capabilities: number) => {
    const input = new HandInput({ smoothing: false, nativePinch: true });
    let starts = 0;
    input.on((e) => { if (e.type === 'pinchstart') starts++; });
    // Fingers apart (no distance pinch) but the wire's pinch flag is set.
    input.push(decodeMessage(handsMessage([{ id: 1, pinch: true }], 1000, 1, 60, { capabilities })) as HandsMessage, 1000);
    return starts;
  };
  assert.equal(pinchFlag(CAP_PINCH), 1);
  assert.equal(pinchFlag(0), 0);
});

/** Pinch and grab events of a recording, with its capabilities or with all of them cleared. */
function gestureEvents(msgs: HandsMessage[], clearCaps: boolean) {
  const input = new HandInput();
  const out: { type: HandEvent['type']; id: number; frame: number }[] = [];
  let frame = 0;
  input.on((e) => { if (e.type !== 'appear' && e.type !== 'lost') out.push({ type: e.type, id: e.hand.id, frame }); });
  for (const m of msgs) {
    const msg = clearCaps ? { ...m, capabilities: { pinch: false, grab: false, palm: false } } : m;
    input.push(msg, m.captureTimeMs);
    input.sample(m.captureTimeMs);
    frame++;
  }
  return out;
}

test('Rig recordings with the capability bits cleared: the same pinch and grab events within 2 frames', () => {
  for (const file of readdirSync(DATA).filter((f) => f.endsWith('.hands'))) {
    const msgs = readHandsRecording(DATA + file);
    const native = gestureEvents(msgs, false), core = gestureEvents(msgs, true);
    const grabs = native.filter((e) => e.type === 'grabstart').length;
    console.log(`${file}: ${native.length} events with capabilities (${grabs} grabs), ${core.length} without`);
    assert.equal(core.length, native.length, file);
    for (const type of ['pinchstart', 'pinchend', 'grabstart', 'grabend'] as const) {
      const a = native.filter((e) => e.type === type), b = core.filter((e) => e.type === type);
      assert.equal(b.length, a.length, `${file}: ${type}`);
      a.forEach((e, i) => assert.ok(Math.abs(b[i].frame - e.frame) <= 2, `${file}: ${type} #${i} at frame ${b[i].frame}, native ${e.frame}`));
    }
  }
});

