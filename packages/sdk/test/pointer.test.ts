import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PointerEmulation, choosePointerHand, projectToPanel } from '../src/pointer.ts';
import { KP, type Hand } from '../src/hands.ts';
import { DEFAULT_DISPLAY as D } from '../src/host.ts';
import type { Vec3 } from '../src/protocol.ts';
import { openHand } from './fixtures.ts';

const hand = (id: number, tip: Vec3, pinching = false): Hand => {
  const kp = openHand([tip[0], tip[1] - 0.1, tip[2]]);
  kp[KP.INDEX_TIP] = tip;
  return { id, handedness: 'right', keypoints: kp, rawKeypoints: kp, pinching, grabbing: false, pinchPoint: tip, coasting: false, lastSeen: 0 };
};

test('a fingertip on the glass points at itself; in mid-air it points along the eye ray', () => {
  const eye: Vec3 = [0, 0, 0.6];
  const onGlass = projectToPanel(eye, [D.widthM / 4, 0, 0], D)!;
  assert.ok(Math.abs(onGlass.u - 0.75) < 1e-9 && Math.abs(onGlass.v - 0.5) < 1e-9);
  // Halfway between eye and glass, 5 cm right: the ray hits the glass 10 cm right.
  const mid = projectToPanel(eye, [0.05, 0, 0.3], D)!;
  assert.ok(Math.abs(mid.u - (0.1 / D.widthM + 0.5)) < 1e-9);
  assert.equal(projectToPanel(eye, [0, 0, 0.7], D), null, 'behind the eye');
});

test('pointer hand: the pinching one wins, otherwise keep the current one', () => {
  const a = hand(1, [0, 0, 0.1]), b = hand(2, [0.1, 0, 0.05]);
  assert.equal(choosePointerHand([a, b], null)!.id, 2, 'closest to the panel');
  assert.equal(choosePointerHand([a, b], 1)!.id, 1, 'sticky');
  assert.equal(choosePointerHand([a, hand(2, [0.1, 0, 0.05], true)], 1)!.id, 2, 'pinch wins');
});

test('pinch drives pointerdown / move / up / click on the element under the point', () => {
  const events: Array<{ type: string; x: number; buttons: number; target: string }> = [];
  const mkTarget = (name: string) => ({
    name,
    getBoundingClientRect: () => ({ left: 100, top: 0, width: 3840, height: 1080 }),
    dispatchEvent(e: Event) { const i = e as unknown as { clientX: number; buttons: number }; events.push({ type: e.type, x: i.clientX, buttons: i.buttons, target: name }); return true; },
  });
  const canvas = mkTarget('canvas');
  const p = new PointerEmulation({
    element: canvas, hitTest: () => canvas, mouseEvents: false,
    createEvent: (type, init) => Object.assign(new Event(type), { clientX: init.clientX, buttons: init.buttons }),
  });
  const eye: Vec3 = [0, 0, 0.6];
  p.update([hand(5, [0, 0, 0])], eye, D);                 // centre, not pinching
  p.update([hand(5, [0, 0, 0], true)], eye, D);           // pinch
  p.update([hand(5, [D.widthM / 4, 0, 0], true)], eye, D);  // drag right
  p.update([hand(5, [D.widthM / 4, 0, 0])], eye, D);      // release
  assert.deepEqual(events.map((e) => e.type), ['pointermove', 'pointermove', 'pointerdown', 'pointermove', 'pointermove', 'pointerup', 'click']);
  assert.equal(events[0].x, 100 + 0.5 * 3840, 'centre of the canvas rect');
  assert.equal(events[3].x, 100 + 0.75 * 3840);
  assert.equal(events[3].buttons, 1, 'move while pressed carries the button');
  assert.equal(events[5].buttons, 0);
});

test('small movement while pinched does not move the pointer (click slop)', () => {
  const xs: number[] = [];
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }), dispatchEvent: (e: Event) => { xs.push((e as unknown as { clientX: number }).clientX); return true; } };
  const p = new PointerEmulation({ element: el, hitTest: () => el, mouseEvents: false, createEvent: (t, i) => Object.assign(new Event(t), { clientX: i.clientX }) });
  const eye: Vec3 = [0, 0, 0.6];
  p.update([hand(1, [0, 0, 0], true)], eye, D);             // down at the centre
  p.update([hand(1, [0.005, 0, 0], true)], eye, D);         // 5 mm jitter: < 1.5 % of the panel
  p.update([hand(1, [0.005, 0, 0])], eye, D);               // release
  assert.ok(xs.every((x) => x === 500), `all events at the down point: ${xs}`);
  p.update([hand(1, [0, 0, 0], true)], eye, D);
  p.update([hand(1, [0.05, 0, 0], true)], eye, D);          // 5 cm: a real drag
  assert.ok(xs.at(-1)! > 500);
});

test('losing the hand while pinching releases without a click', () => {
  const types: string[] = [];
  const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), dispatchEvent: (e: Event) => { types.push(e.type); return true; } };
  const p = new PointerEmulation({ element: el, hitTest: () => el, mouseEvents: false, createEvent: (t) => new Event(t) });
  p.update([hand(1, [0, 0, 0], true)], [0, 0, 0.6], D);
  p.update([], [0, 0, 0.6], D);
  assert.deepEqual(types, ['pointermove', 'pointerdown', 'pointerup']);
});
