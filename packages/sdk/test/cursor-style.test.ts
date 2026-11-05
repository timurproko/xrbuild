import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MouseCursor } from '../src/interaction/core/cursor.ts';
import { Interactor } from '../src/interaction/core/interactor.ts';
import { PokeTarget } from '../src/interaction/core/targets.ts';
import { PanelFrame } from '../src/stereo.ts';
import { CURSOR_STYLES, resolveCursorStyle } from '../src/cursor-style.ts';

test('cursor parser defaults unknown styles safely', () => {
  for (const value of [null, undefined, 'bad', {}, 1]) assert.equal(resolveCursorStyle(value), 'ring-dot');
  for (const style of CURSOR_STYLES) assert.equal(resolveCursorStyle(style), style);
});

for (const style of CURSOR_STYLES) test(`${style} cursor respects hover, disabled targets and idle hiding`, () => {
  const cursor = new MouseCursor({ style }), interaction = new Interactor(), panel = new PanelFrame();
  const target = interaction.add(new PokeTarget(new THREE.Group(), { inside: (x, y) => Math.abs(x) < 0.04 && Math.abs(y) < 0.04, top: 0.01, travel: 0.003 }));
  const move = (x: number, time: number) => {
    interaction.pointerMove(new THREE.Ray(new THREE.Vector3(x, 0, 0.6), new THREE.Vector3(0, 0, -1)));
    interaction.update([], 1);
    cursor.update(interaction, panel, new THREE.Vector3(0, 0, 0.6), time, 1 / 60);
  };
  move(0.1, 10);
  assert.equal(cursor.visible, style !== 'system');
  if (style !== 'system') {
    assert.equal(cursor.children[1].visible, false);
    panel.scale = 2; move(0.2, 15);
    assert.ok(Math.abs(cursor.scale.x - 0.012) < 1e-9, '6 mm radius follows physical panel scale');
    panel.scale = 1;
  }
  move(0, 20);
  if (style !== 'system') assert.equal(cursor.children[1].visible, style === 'ring-dot');
  target.enabled = false;
  move(0, 30);
  if (style !== 'system') assert.equal(cursor.children[1].visible, false);
  move(0, 4000);
  assert.equal(cursor.visible, false);
});

test('rendered mouse binding never writes a second system pointer and restores styles', () => {
  const interaction = new Interactor(), callbacks = new Map<string, Function>();
  const canvas = { style: { cursor: 'crosshair' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    addEventListener: (name: string, fn: Function) => callbacks.set(name, fn), removeEventListener: (name: string) => callbacks.delete(name),
  } as unknown as HTMLElement;
  for (const systemCursor of [false, true]) {
    const dispose = interaction.bindMouse(canvas, () => new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)), { systemCursor });
    callbacks.get('pointermove')!({ clientX: 50, clientY: 50 });
    assert.equal(canvas.style.cursor, systemCursor ? 'auto' : 'none');
    dispose();
    assert.equal(canvas.style.cursor, 'crosshair');
    assert.equal(callbacks.size, 0);
  }
});
