import './dom-shim.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Interactor, palmQuaternion, type Hand, type SceneHand } from '@xr-build/sdk';
import { Button } from '../src/button.ts';
import { Dial } from '../src/dial.ts';
import { Dialog } from '../src/dialog.ts';
import { ArrowRight } from 'lucide';
import { Segmented } from '../src/segmented.ts';
import { Slider } from '../src/slider.ts';
import { setMuted } from '../src/sound.ts';
import { Switch } from '../src/switch.ts';
import { Trackball } from '../src/trackball.ts';
import { COLORS } from '../src/theme.ts';

setMuted(true);

type V = [number, number, number];
const v3 = (p: V) => new THREE.Vector3(...p);

interface FakeHandOptions { tip?: V; pinch?: V; pinching?: boolean; coasting?: boolean; points?: THREE.Vector3[] }

/** A scene hand in world coordinates (the board maps one unit to one metre, as the UI Kit app does). */
function hand(id: number, o: FakeHandOptions = {}): SceneHand {
  const tip = v3(o.tip ?? [0, 0, 0.2]);
  const pinch = v3(o.pinch ?? o.tip ?? [0, 0, 0.2]);
  const points = o.points ?? Array.from({ length: 21 }, () => tip.clone());
  const h: Hand = {
    id, handedness: 'right', keypoints: points.map((p) => [p.x, p.y, p.z] as V), rawKeypoints: [],
    pinching: !!o.pinching, pinchStrength: o.pinching ? 1 : 0, grabbing: false,
    tip: [tip.x, tip.y, tip.z], pinchPoint: [pinch.x, pinch.y, pinch.z], coasting: !!o.coasting, lastSeen: 0,
  };
  return { hand: h, points, tip, pinchPoint: pinch, palm: { position: tip.clone(), quaternion: palmQuaternion(points, 'right') } };
}

const events = (c: { on(type: string, fn: (d: Record<string, unknown>) => void): unknown }, types: string[]) => {
  const out: { type: string; detail: Record<string, unknown> }[] = [];
  for (const t of types) c.on(t, (detail) => out.push({ type: t, detail }));
  return out;
};
const DOWN = new THREE.Vector3(0, 0, -1);
const rayAt = (x: number, y: number) => new THREE.Ray(new THREE.Vector3(x, y, 1), DOWN);

function board<T extends { attach(i: Interactor): T; update(dt: number): void; position: THREE.Vector3 }>(control: T, at: V = [0, 0, 0]) {
  const ix = new Interactor();
  const scene = new THREE.Scene();
  control.position.set(...at);
  scene.add(control as unknown as THREE.Object3D);
  scene.updateMatrixWorld(true);
  control.attach(ix);
  const frame = (hands: SceneHand[] = []) => { ix.update(hands, 1); control.update(1 / 60); };
  return { ix, frame };
}

test('button: the cap follows the fingertip in, clicks at the press depth, keeps the press through a 1.5 cm drift, releases on retract', () => {
  const b = new Button({ title: 'b', shape: 'round', text: '', icon: ArrowRight });
  const { frame } = board(b, [0.1, 0.05, 0]);
  const got = events(b, ['click', 'release']);
  const cap = (b as unknown as { cap: THREE.Group }).cap;
  const top = 0.02;  // REST + CAP_DEPTH
  frame([hand(1, { tip: [0.1, 0.05, 0.08] })]);
  frame([hand(1, { tip: [0.1, 0.05, top - 0.003] })]);
  assert.ok(Math.abs(cap.position.z - (0.012 - 0.003)) < 1e-9, 'cap pushed in 3 mm with the finger, before the click');
  assert.equal(got.length, 0);
  frame([hand(1, { tip: [0.1, 0.05, top - 0.007] })]);
  assert.deepEqual(got.map((e) => e.type), ['click']);
  assert.equal(got[0].detail.source, 'hand');
  frame([hand(1, { tip: [0.1 + 0.04, 0.05, top - 0.007] })]);  // 1.5 cm outside the 2.5 cm radius
  frame([hand(1, { tip: [0.1 + 0.04, 0.05, top - 0.006] })]);
  assert.equal(got.length, 1, 'drift keeps the press');
  assert.equal(b.clicks, 1);
  frame([hand(1, { tip: [0.1 + 0.04, 0.05, top - 0.001] })]);
  assert.deepEqual(got.map((e) => e.type), ['click', 'release']);
});

test('button: a 1 cm off-centre poke outside the visible edge still registers', () => {
  const b = new Button({ title: 'b', shape: 'pill', text: 'Press' });
  const { frame } = board(b);
  const got = events(b, ['click']);
  frame([hand(1, { tip: [0.035 + 0.008, 0, 0.08] })]);  // 8 mm outside the pill's half width
  frame([hand(1, { tip: [0.035 + 0.008, 0, 0.02 - 0.007] })]);
  assert.equal(got.length, 1);
});

test('button: the mouse clicks and releases it with source mouse', () => {
  const b = new Button({ title: 'b', shape: 'pill', text: 'Press' });
  const { ix, frame } = board(b);
  const got = events(b, ['click', 'release']);
  frame();
  assert.ok(ix.pointerDown(rayAt(0.01, 0)));
  frame();
  assert.equal(got[0].detail.source, 'mouse');
  ix.pointerUp();
  assert.deepEqual(got.map((e) => e.type), ['click', 'release']);
});

test('switch: a poke flips it each time, with the source', () => {
  const sw = new Switch('s');
  const { frame } = board(sw);
  const got = events(sw, ['change']);
  const poke = () => {
    frame([hand(1, { tip: [0.01, 0, 0.08] })]);
    frame([hand(1, { tip: [0.01, 0, 0.016 - 0.005] })]);
    frame([hand(1, { tip: [0.01, 0, 0.08] })]);
  };
  poke();
  poke();
  assert.deepEqual(got.map((e) => e.detail.on), [true, false]);
  assert.equal(got[0].detail.source, 'hand');
  assert.equal(sw.toggles, 2);
});

test('segmented: the segment under the fingertip is selected; between two, the nearer one', () => {
  const seg = new Segmented('m', ['A', 'B', 'C', 'D']);
  const { frame } = board(seg);
  const got = events(seg, ['change']);
  const xs = [-0.0555, -0.0185, 0.0185, 0.0555];  // segment centres (34 mm wide, 3 mm gaps)
  const pokeAt = (x: number) => {
    frame([hand(1, { tip: [x, 0, 0.08] })]);
    frame([hand(1, { tip: [x, 0, 0.013 - 0.005] })]);
    frame([hand(1, { tip: [x, 0, 0.08] })]);
  };
  pokeAt(xs[2]);
  assert.equal(seg.index, 2);
  pokeAt(xs[0] + 0.019);  // 0.5 mm past the midpoint toward B (segments are 37 mm apart)
  assert.equal(seg.index, 1);
  assert.deepEqual(got.map((e) => e.detail.index), [2, 1]);
});

for (const source of ['hand', 'mouse'] as const) test(`segmented: ${source} reselects any axis back to Full exactly once`, () => {
  const seg = new Segmented('axis', ['Full', 'X', 'Y', 'Z'], 0, { reselectIndex: 0 });
  const { ix, frame } = board(seg), got = events(seg, ['change']);
  const activate = (index: number) => {
    const x = [-0.0555, -0.0185, 0.0185, 0.0555][index];
    if (source === 'mouse') { ix.pointerDown(rayAt(x, 0)); frame(); ix.pointerUp(); frame(); }
    else {
      frame([hand(1, { tip: [x, 0, 0.08] })]);
      frame([hand(1, { tip: [x, 0, 0.008] })]);
      frame([hand(1, { tip: [x, 0, 0.08] })]);
    }
  };
  for (const axis of [1, 2, 3]) { activate(axis); assert.equal(seg.index, axis); activate(axis); assert.equal(seg.index, 0); }
  assert.deepEqual(got.map(e => e.detail.index), [1, 0, 2, 0, 3, 0]);
  assert.ok(got.every(e => e.detail.source === source));
  activate(0); assert.equal(got.length, 6);
  activate(1); activate(2); assert.equal(seg.index, 2);
  seg.select(2); assert.equal(seg.index, 2, 'programmatic assignment does not toggle');
  const count = got.length;
  seg.setEnabled(false); activate(2); activate(3);
  assert.equal(got.length, count); assert.equal(seg.index, 2);
});

for (const source of ['hand', 'mouse'] as const) test(`segmented: momentary ${source} caps spring back without changing selected axis`, () => {
  const seg = new Segmented('axis', ['Full', 'X', 'Y', 'Z'], 0, { latchSelected: false });
  const { ix, frame } = board(seg), got = events(seg, ['change']);
  const caps = (seg as any).segments.map((s: any) => s.cap) as THREE.Group[];
  const release = () => { ix.pointerUp(); for (let i = 0; i < 120; i++) frame(); };
  const press = (index: number) => {
    const x = [-0.0555, -0.0185, 0.0185, 0.0555][index];
    if (source === 'mouse') { ix.pointerDown(rayAt(x, 0)); frame(); }
    else { frame([hand(1, { tip: [x, 0, 0.08] })]); frame([hand(1, { tip: [x, 0, 0.008] })]); }
  };
  for (const axis of [1, 2, 3]) {
    press(axis); assert.equal(seg.index, axis); assert.ok(caps[axis].position.z < 0.005);
    release(); assert.ok(Math.abs(caps[axis].position.z - 0.006) < 1e-6, 'selected cap rests at full height');
    press(axis); release(); assert.equal(seg.index, axis, 'same axis never toggles to Full');
  }
  press(0); release(); assert.equal(seg.index, 0);
  assert.deepEqual(got.map(e => e.detail.index), [1, 2, 3, 0]);
  assert.ok(got.every(e => e.detail.source === source));
  seg.setEnabled(false); press(2); release(); assert.equal(seg.index, 0);
});

test('segmented: radio compatibility and fallback validation', () => {
  const seg = new Segmented('radio', ['A', 'B'], 1), got = events(seg, ['change']);
  seg.select(1, 'mouse'); seg.select(1, 'hand');
  assert.equal(got.length, 0);
  assert.throws(() => new Segmented('bad', ['A'], 0, { reselectIndex: 2 }), RangeError);
});

test('slider: pinch-drag gives grab (pinch), change values, release (pinch)', () => {
  const s = new Slider({ title: 's', value: 0.5, length: 0.13 });
  const { frame } = board(s);
  const got = events(s, ['grab', 'change', 'release']);
  const z = 0.004 + 0.007;
  frame([hand(1, { pinch: [0.01, 0.0, z] })]);
  frame([hand(1, { pinch: [0.01, 0.0, z], pinching: true })]);
  frame([hand(1, { pinch: [0.04, 0.0, z], pinching: true })]);
  frame([hand(1, { pinch: [0.04, 0.0, z], pinching: false })]);
  assert.deepEqual(got.map((e) => e.type), ['grab', 'change', 'release']);
  assert.equal(got[0].detail.mode, 'pinch');
  assert.equal(got[2].detail.mode, 'pinch');
  assert.ok(Math.abs((got[1].detail.value as number) - (0.5 + 0.03 / 0.13)) < 1e-9, 'dragged by the pinch offset');
});

test('slider: touch-drag pushes the handle and slides; lifting lets go', () => {
  const s = new Slider({ title: 's', value: 0.5, length: 0.13 });
  const { frame } = board(s);
  const got = events(s, ['grab', 'change', 'release']);
  const top = 0.018;
  frame([hand(1, { tip: [0, 0, 0.08] })]);
  frame([hand(1, { tip: [0, 0, top - 0.005] })]);
  frame([hand(1, { tip: [0.02, 0, top - 0.005] })]);
  frame([hand(1, { tip: [0.02, 0, top + 0.01] })]);
  assert.deepEqual(got.map((e) => e.type), ['grab', 'change', 'release']);
  assert.equal(got[0].detail.mode, 'touch');
  assert.ok(Math.abs((got[1].detail.value as number) - (0.5 + 0.02 / 0.13)) < 1e-9);
});

test('slider: the mouse jumps the handle to the track and drags it; a stepped slider snaps', () => {
  const s = new Slider({ title: 's', value: 0.5, length: 0.13 });
  const { ix, frame } = board(s);
  const got = events(s, ['grab', 'change', 'release']);
  frame();
  assert.ok(ix.pointerDown(rayAt(0.04, 0)));
  ix.pointerMove(rayAt(0.065, 0));
  ix.pointerUp();
  assert.deepEqual(got.map((e) => e.type), ['grab', 'change', 'change', 'release']);
  assert.equal(got[0].detail.mode, 'mouse');
  assert.equal(got[3].detail.mode, 'mouse');
  assert.equal(got[2].detail.value, 1);

  const st = new Slider({ title: 't', steps: 5, value: 0.25, length: 0.13 });
  const b2 = board(st);
  const got2 = events(st, ['change']);
  b2.frame();
  b2.ix.pointerDown(rayAt(0.05, 0));
  b2.ix.pointerUp();
  assert.equal(got2[0].detail.step, 4);
  assert.equal(st.value, 1);
});

test('dial: a pinch at the rim turns it by the angle swept; release ends the grab', () => {
  const d = new Dial('d');
  const { frame } = board(d);
  const got = events(d, ['grab', 'change', 'release']);
  const z = 0.017;
  const R = 0.022;
  frame([hand(1, { pinch: [R, 0, z] })]);
  frame([hand(1, { pinch: [R, 0, z], pinching: true })]);
  const a = -Math.PI / 4;  // clockwise 45 degrees = value up by 45/270
  frame([hand(1, { pinch: [Math.cos(a) * R, Math.sin(a) * R, z], pinching: true })]);
  frame([hand(1, { pinch: [Math.cos(a) * R, Math.sin(a) * R, z], pinching: false })]);
  assert.deepEqual(got.map((e) => e.type), ['grab', 'change', 'release']);
  assert.ok(Math.abs(d.value - 45 / 270) < 1e-9, `value ${d.value}`);
  assert.equal(got[0].detail.mode, 'pinch');
});

test('dial: the mouse turns it with a straight drag (up or right = up), not an arc', () => {
  const d = new Dial('d');
  const { ix, frame } = board(d);
  frame();
  assert.ok(ix.pointerDown(rayAt(0, 0)));
  ix.pointerMove(rayAt(0, 0.03));  // 3 cm up
  assert.ok(Math.abs(d.value - 0.3) < 1e-6, `up: ${d.value}`);
  ix.pointerMove(rayAt(-0.01, 0.03));  // 1 cm left
  assert.ok(Math.abs(d.value - 0.2) < 1e-6, `left: ${d.value}`);
  ix.pointerUp();
});

test('dial: the last value bulb follows the value immediately instead of the eased knob', () => {
  const d = new Dial('d');
  const { ix, frame } = board(d);
  frame();
  assert.ok(ix.pointerDown(rayAt(0, 0)));
  ix.pointerMove(rayAt(0.1, 0));
  frame();
  const ticks = (d as unknown as { ticks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] }).ticks;
  assert.equal(d.value, 1);
  assert.equal(ticks.at(-1)!.material.color.getHex(), new THREE.Color(COLORS.accent).getHex());
  ix.pointerUp();
});

test('trackball: a hand inside the sphere grabs and turns it, leaving releases it', () => {
  const tb = new Trackball('t', 0.056);
  const { frame } = board(tb);
  const got = events(tb, ['grab', 'release', 'rotate']);
  const cluster = (c: THREE.Vector3) => Array.from({ length: 21 }, (_, i) => (i < 8 ? c.clone().add(new THREE.Vector3((i % 2) * 0.01, ((i >> 1) % 2) * 0.01, 0)) : new THREE.Vector3(0.5, 0.5, 0.5)));
  for (let i = 0; i <= 30; i++) {
    const a = THREE.MathUtils.degToRad(3 * i);
    frame([hand(1, { points: cluster(new THREE.Vector3(Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03)), tip: [0.5, 0.5, 0.5] })]);
  }
  assert.equal(got[0].type, 'grab');
  assert.ok(got.some((e) => e.type === 'rotate'), 'turned');
  for (let i = 0; i < 20; i++) frame([hand(1, { points: cluster(new THREE.Vector3(0.5, 0.5, 0.5)), tip: [0.5, 0.5, 0.5] })]);
  assert.ok(got.some((e) => e.type === 'release'));
});

test('dialog: opens lifted toward the viewer, its Close button closes it with the source, hidden once shut', () => {
  const d = new Dialog({ title: 'Glass', text: 'hello' });
  const { ix, frame } = board(d);
  const got = events(d, ['open', 'close']);
  assert.equal(d.visible, false);
  frame([hand(1, { tip: [0, -0.032, 0.09] })]);
  frame([hand(1, { tip: [0, -0.032, 0.07 + 0.0075 + 0.02 - 0.007] })]);  // where the Close cap will be, before it opens
  assert.equal(got.length, 0, 'a closed dialog takes no input');
  d.open('code');
  for (let i = 0; i < 60; i++) frame();  // let the opening animation settle
  assert.ok(d.visible);
  const sheet = (d as unknown as { sheet: THREE.Group }).sheet;
  assert.ok(sheet.position.z > 0.05, 'the sheet floats in front of the board');
  const capZ = 0.07 + 0.0075 + 0.02;  // lift + button offset + cap top at rest
  frame([hand(1, { tip: [0, -0.032, capZ + 0.05] })]);
  frame([hand(1, { tip: [0, -0.032, capZ - 0.007] })]);
  assert.deepEqual(got.map((e) => e.type), ['open', 'close']);
  assert.equal(got[1].detail.source, 'hand');
  frame([hand(1, { tip: [0, -0.032, capZ + 0.05] })]);
  for (let i = 0; i < 60; i++) frame();
  assert.equal(d.visible, false);
  d.open();
  frame();
  assert.ok(ix.pointerDown(rayAt(0, -0.032)), 'the mouse reaches the Close button');
  ix.pointerUp();
  assert.equal(got.at(-1)!.detail.source, 'mouse');
});

test('dialog: while open, the glass takes the mouse, so a button behind it does not light up or click', () => {
  const ix = new Interactor();
  const scene = new THREE.Scene();
  const behind = new Button({ title: 'b', shape: 'pill', text: 'P' });
  const d = new Dialog({ title: 'Glass', text: 'hi' });
  behind.position.set(0.05, 0.03, 0);
  scene.add(behind, d);
  scene.updateMatrixWorld(true);
  behind.attach(ix);
  d.attach(ix);
  const clicks = events(behind, ['click']);
  d.open();
  ix.update([], 1);
  assert.ok(ix.pointerDown(rayAt(0.05, 0.03)));
  ix.pointerUp();
  assert.equal(clicks.length, 0, 'the glass took it');
  d.close();
  ix.update([], 1);
  ix.pointerDown(rayAt(0.05, 0.03));
  ix.pointerUp();
  assert.equal(clicks.length, 1, 'closed: the button works again');
});

test('fade: a disabled control goes grey but stays opaque; enabled, its colours come back', () => {
  const b = new Button({ title: 'b', shape: 'pill', text: 'P' });
  const { frame } = board(b);
  const materials = () => { const out: THREE.MeshStandardMaterial[] = []; b.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !o.userData.keepLook && m.type === 'MeshStandardMaterial') out.push(m as THREE.MeshStandardMaterial); }); return out; };
  const opaque = () => materials().every((m) => !m.transparent && m.opacity === 1);
  frame();
  const own = materials().map((m) => m.color.getHex());
  assert.ok(opaque());
  b.setEnabled(false);
  for (let i = 0; i < 120; i++) frame();
  assert.ok(opaque(), 'dimmed: still opaque (nothing see-through)');
  const greyed = materials().map((m) => m.color);
  assert.ok(greyed.every((c, i) => c.getHex() !== own[i]), 'every colour changed');
  // Greyed: every colour moved toward the kit's disabled grey tint.
  const tint = new THREE.Color('#5a606b');
  const dist = (c: THREE.Color) => Math.hypot(c.r - tint.r, c.g - tint.g, c.b - tint.b);
  assert.ok(greyed.every((c, i) => dist(c) < dist(new THREE.Color(own[i]))), 'toward grey');
  b.setEnabled(true);
  for (let i = 0; i < 120; i++) frame();
  assert.deepEqual(materials().map((m) => m.color.getHex()), own, 'own colours back');
  assert.ok(opaque());
});

test('disabling a slider mid-drag releases it, keeps the value and ignores further input', () => {
  const s = new Slider({ title: 's', value: 0.5, length: 0.13 });
  const { frame } = board(s);
  const got = events(s, ['release', 'change']);
  const z = 0.011;
  frame([hand(1, { pinch: [0.0, 0, z] })]);
  frame([hand(1, { pinch: [0.0, 0, z], pinching: true })]);
  frame([hand(1, { pinch: [0.02, 0, z], pinching: true })]);
  const value = s.value;
  s.setEnabled(false);
  frame([hand(1, { pinch: [0.04, 0, z], pinching: true })]);
  assert.ok(got.some((e) => e.type === 'release'));
  assert.equal(s.value, value);
  frame([hand(1, { pinch: [0.04, 0, z], pinching: false })]);
  frame([hand(1, { pinch: [0.04, 0, z], pinching: true })]);
  assert.equal(got.filter((e) => e.type === 'change').length, 1, 'no change while disabled');
});
