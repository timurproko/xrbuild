import './dom-shim.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArrowRight } from 'lucide';
import * as Kit from '../src/index.ts';
import { referenceGeometry } from '../src/visual-theme.ts';

export const controls = [
  () => new Kit.Button({ title: 'Pill', shape: 'pill', text: 'Press' }),
  () => new Kit.Button({ title: 'Round', shape: 'round', text: '', icon: ArrowRight }),
  () => new Kit.Switch('Switch'),
  () => new Kit.Segmented('Segments', ['Full', 'X', 'Y', 'Z']),
  () => new Kit.Slider({ title: 'Slider', value: 0.5 }),
  () => new Kit.Slider({ title: 'Stepped', value: 0.25, steps: 5 }),
  () => new Kit.Dial('Dial'),
  () => new Kit.Trackball('Trackball', 0.056),
  () => new Kit.Dialog({ title: 'Dialog', text: 'Body' }),
];
function graphics(object: THREE.Object3D): unknown[] {
  const result: unknown[] = [];
  object.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) result.push({ type: mesh.geometry.type, position: Array.from(mesh.geometry.getAttribute('position')?.array ?? []), material: (mesh.material as THREE.Material).type });
  });
  return result;
}
function targets(object: Kit.Control) {
  return (object as any).targets.map((target: any) => ({ kind: target.kind, top: target.top, travel: target.travel, radius: target.radius, position: target.position?.toArray(), centre: target.centre?.toArray(), inside: target.inside ? [[0,0],[0.1,0],[0.025,0.01]].map(([x,y]) => target.inside(x,y)) : undefined }));
}

test('Default contract covers every visual role without constructing graphics on import', () => {
  assert.equal(Kit.resolveUiKitTheme(), Kit.defaultTheme);
  assert.equal(Kit.resolveUiKitTheme('default'), Kit.defaultTheme);
  assert.equal(Kit.visualRoles.length, 33);
  for (const role of Kit.visualRoles) {
    assert.equal(typeof Kit.defaultTheme.visuals[role].geometry, 'function');
    assert.equal(typeof Kit.defaultTheme.visuals[role].material, 'function');
  }
  assert.throws(() => Kit.resolveUiKitTheme('missing' as any), /unknown/);
  assert.throws(() => Kit.resolveUiKitTheme({ ...Kit.defaultTheme, visuals: {} } as any), /Incomplete/);
});

for (const [i, make] of controls.entries()) test(`Default ${i}: theme resolution cannot alter target definitions or current graphics`, () => {
  const object = make(), before = graphics(object), bounds = targets(object);
  object.setTheme('default');
  assert.deepEqual(graphics(object), before);
  assert.deepEqual(targets(object), bounds);
  assert.throws(() => object.setTheme({ ...Kit.defaultTheme, visuals: {} } as any), /Incomplete/);
  assert.deepEqual(graphics(object), before);
  assert.deepEqual(targets(object), bounds);
  object.dispose();
});

test('reference geometry keeps plain grip boxes and exact rounded shape builders', () => {
  const box = referenceGeometry({shape:'plainBox',args:[0.0012,0.0224,0.0012]});
  assert.equal(box.type, 'BoxGeometry'); box.dispose();
  const a = Kit.roundedBox(0.07,0.028,0.008,0.014), b = referenceGeometry({shape:'box',args:[0.07,0.028,0.008,0.014]});
  assert.deepEqual(b.getAttribute('position').array,a.getAttribute('position').array); a.dispose(); b.dispose();
});
