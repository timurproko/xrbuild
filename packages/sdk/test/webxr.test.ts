import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HandInput, KP, type HandEvent } from '../src/hands.ts';
import { PanelFrame } from '../src/stereo.ts';
import { toSceneHand } from '../src/scene-hands.ts';
import { DEFAULT_DISPLAY } from '../src/host.ts';
import { detectXrMode, eyesInPanel, rigMatrix, virtualDisplay, VirtualPanel, XrHands, XR_JOINTS, type XrFrameLike, type XrInputSource, type XrMode, type XrSystemLike } from '../src/webxr.ts';

const near = (a: number[], b: number[], eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < eps);

function xrSystem(supported: XrMode[], fail = false): XrSystemLike {
  return {
    isSessionSupported: async (mode) => {
      if (fail) throw new Error('no secure context');
      return supported.includes(mode);
    },
    requestSession: async () => { throw new Error('not in tests'); },
  };
}

test('detectXrMode prefers passthrough, falls back to VR, and is null without WebXR', async () => {
  assert.equal(await detectXrMode(null), null);
  assert.equal(await detectXrMode(xrSystem([])), null);
  assert.equal(await detectXrMode(xrSystem(['immersive-ar', 'immersive-vr'])), 'immersive-ar');
  assert.equal(await detectXrMode(xrSystem(['immersive-vr'])), 'immersive-vr');
  assert.equal(await detectXrMode(xrSystem(['immersive-ar', 'immersive-vr']), 'immersive-vr'), 'immersive-vr');
  assert.equal(await detectXrMode(xrSystem(['immersive-vr']), 'immersive-ar'), null);
  assert.equal(await detectXrMode(xrSystem(['immersive-vr'], true)), null);
});

test('XR_JOINTS maps the 25 headset joints onto the 21 keypoints', () => {
  assert.equal(XR_JOINTS.length, 21);
  assert.equal(XR_JOINTS[KP.WRIST], 'wrist');
  assert.equal(XR_JOINTS[1], 'thumb-metacarpal');
  assert.equal(XR_JOINTS[KP.THUMB_TIP], 'thumb-tip');
  assert.equal(XR_JOINTS[KP.INDEX_MCP], 'index-finger-phalanx-proximal');
  assert.equal(XR_JOINTS[KP.INDEX_TIP], 'index-finger-tip');
  assert.equal(XR_JOINTS[KP.MIDDLE_MCP], 'middle-finger-phalanx-proximal');
  assert.equal(XR_JOINTS[KP.RING_TIP], 'ring-finger-tip');
  assert.equal(XR_JOINTS[KP.PINKY_TIP], 'pinky-finger-tip');
  assert.ok(!XR_JOINTS.some((j) => j.endsWith('metacarpal') && !j.startsWith('thumb')));
});

test('the virtual panel hangs in front of the head, upright, facing it', () => {
  const panel = new VirtualPanel();
  panel.anchor(new THREE.Vector3(0, 1.6, 0), new THREE.Quaternion());
  // the head is 0.45 m in front of the panel centre and 0.15 m above it
  assert.ok(near(panel.pointToPanel({ x: 0, y: 1.6, z: 0 }), [0, 0.15, 0.45]));
  assert.ok(near(panel.pointToPanel({ x: 0, y: 1.45, z: -0.45 }), [0, 0, 0]));
  // looking down does not tilt the panel: only the heading counts
  const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.6);
  panel.anchor(new THREE.Vector3(0, 1.6, 0), down);
  assert.ok(near(panel.pointToPanel({ x: 0, y: 1.45, z: -0.45 }), [0, 0, 0]));
});

test('recenter places the panel in front of a new heading', () => {
  const panel = new VirtualPanel({ distanceM: 0.5, dropM: 0 });
  panel.anchor(new THREE.Vector3(0, 1.6, 0), new THREE.Quaternion());
  panel.reset();
  assert.equal(panel.anchored, false);
  // turned to face -X (a quarter turn to the left)
  panel.anchor(new THREE.Vector3(1, 1.6, 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  assert.ok(near(panel.pointToPanel({ x: 0.5, y: 1.6, z: 2 }), [0, 0, 0]));
  // the head is on the panel's +Z side, and the user's right (-Z here) is the panel's +X
  assert.ok(near(panel.pointToPanel({ x: 1, y: 1.6, z: 2 }), [0, 0, 0.5]));
  assert.ok(near(panel.pointToPanel({ x: 0.5, y: 1.6, z: 1.9 }), [0.1, 0, 0]));
});

test('virtualDisplay keeps the nominal size unless the app sets one', () => {
  assert.equal(virtualDisplay(DEFAULT_DISPLAY).widthM, DEFAULT_DISPLAY.widthM);
  const d = virtualDisplay(DEFAULT_DISPLAY, { widthM: 0.8, heightM: 0.45 });
  assert.equal(d.widthM, 0.8);
  assert.equal(d.heightM, 0.45);
  assert.equal(d.tiltRad, 0);
});

// --- recorded-style joint frames ------------------------------------------------------------------

type Joints = Record<string, [number, number, number]>;

/** An open right hand in reference space, fingers up, palm facing -Z (towards the panel ahead). */
function openHand(origin: [number, number, number]): Joints {
  const [ox, oy, oz] = origin;
  const j: Joints = { wrist: [ox, oy, oz] };
  const thumb = ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'];
  thumb.forEach((n, i) => (j[`thumb-${n}`] = [ox - 0.025 - i * 0.015, oy + 0.02 + i * 0.012, oz]));
  ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].forEach((f, fi) => {
    const x = ox - 0.02 + fi * 0.014;
    j[`${f}-metacarpal`] = [x, oy + 0.03, oz];
    ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].forEach((n, i) => (j[`${f}-${n}`] = [x, oy + 0.08 + i * 0.025, oz]));
  });
  return j;
}

function pinched(h: Joints): Joints {
  const t = h['index-finger-tip'];
  return { ...h, 'thumb-tip': [t[0] - 0.01, t[1], t[2]] };
}

interface FakeSource extends XrInputSource {
  joints: Joints | null;
}

function source(handedness: 'left' | 'right', joints: Joints | null): FakeSource {
  const s: FakeSource = { handedness, joints, hand: { get: (name: string) => (s.joints && s.joints[name] ? { source: s, name } : undefined) } };
  return s;
}

function frame(sources: FakeSource[]): XrFrameLike {
  return {
    session: { inputSources: sources, end: async () => {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true },
    getViewerPose: () => null,
    getJointPose: (joint) => {
      const { source: s, name } = joint as { source: FakeSource; name: string };
      const p = s.joints![name];
      return { transform: { position: { x: p[0], y: p[1], z: p[2] }, orientation: { x: 0, y: 0, z: 0, w: 1 } } };
    },
  };
}

function anchored(): VirtualPanel {
  const panel = new VirtualPanel();
  panel.anchor(new THREE.Vector3(0, 1.6, 0), new THREE.Quaternion());
  return panel;
}

test('headset hands keep their id per input source and their handedness', () => {
  const panel = anchored(), hands = new XrHands();
  const left = source('left', openHand([-0.1, 1.3, -0.3])), right = source('right', openHand([0.1, 1.3, -0.3]));
  const a = hands.read(frame([left, right]), null, panel, 0);
  const b = hands.read(frame([right, left]), null, panel, 16);
  assert.deepEqual(a.hands.map((h) => [h.id, h.handedness]), [[1, 0], [2, 1]]);
  assert.deepEqual(b.hands.map((h) => [h.id, h.handedness]), [[2, 1], [1, 0]]);
  assert.deepEqual(a.capabilities, { pinch: false, grab: false, palm: false });
  // wrist at (-0.1, 1.3, -0.3) is 0.15 m in front of the panel at (0, 1.45, -0.45)
  assert.ok(near(a.hands[0].keypoints[KP.WRIST], [-0.1, -0.15, 0.15]));
});

test('a hand with a joint missing this frame is left out', () => {
  const j = openHand([0, 1.3, -0.3]);
  delete j['ring-finger-tip'];
  const msg = new XrHands().read(frame([source('right', j)]), null, anchored(), 0);
  assert.equal(msg.hands.length, 0);
});

test('a pinch on the headset gives exactly one pinchstart and one pinchend', () => {
  const panel = anchored(), xrHands = new XrHands();
  const input = new HandInput();
  const events: HandEvent['type'][] = [];
  input.on((e) => events.push(e.type));
  const hand = source('right', null);
  const open = openHand([0, 1.3, -0.3]);
  const frames = [...Array(5).fill(open), ...Array(6).fill(pinched(open)), ...Array(5).fill(open)];
  frames.forEach((j, i) => {
    hand.joints = j;
    const t = i * 11;
    input.push(xrHands.read(frame([hand]), null, panel, t), t);
    input.sample(t);
  });
  assert.deepEqual(events.filter((e) => e.startsWith('pinch')), ['pinchstart', 'pinchend']);
  assert.ok(!events.includes('grabstart'));
});

test('mapping holds: 7.6 scene units per metre, a hand 10 cm in front of the virtual panel', () => {
  const panel = anchored();
  const frameOfPanel = new PanelFrame();
  const centre = new THREE.Vector3(2, 0, -1);
  frameOfPanel.update({ mode: 'world', center: centre, scale: 7.6 }, new THREE.PerspectiveCamera());
  // reference space -> scene through the XR camera's rig
  const rig = rigMatrix(frameOfPanel.toWorld, panel);
  const tipRef = new THREE.Vector3(0, 1.45, -0.35);  // 10 cm in front of the panel centre
  assert.ok(near(tipRef.clone().applyMatrix4(rig).toArray(), [2, 0, -1 + 0.76], 1e-9));
  // and the hand input path lands on the same point
  const j = openHand([0, 1.3, -0.35]);
  j['index-finger-tip'] = [0, 1.45, -0.35];
  const input = new HandInput({ smoothing: false });
  input.push(new XrHands().read(frame([source('right', j)]), null, panel, 0), 0);
  const scene = toSceneHand(input.sample(0)[0], frameOfPanel);
  assert.ok(near(scene.tip.toArray(), [2, 0, -1 + 0.76], 1e-9));
});

test('eyes of a viewer pose are given in the panel frame', () => {
  const panel = anchored();
  const view = (eye: 'left' | 'right', x: number) => ({ eye, transform: { position: { x, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
  const pose = { transform: { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }, views: [view('left', -0.032), view('right', 0.032)] };
  const eyes = eyesInPanel(pose, panel);
  assert.ok(near(eyes.left, [-0.032, 0.15, 0.45]));
  assert.ok(near(eyes.right, [0.032, 0.15, 0.45]));
});
