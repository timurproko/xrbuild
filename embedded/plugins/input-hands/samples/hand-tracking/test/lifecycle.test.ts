import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import { Lifetime, disposeScene } from '../src/lifecycle.ts';

test('twenty mount/unmount cycles clean every owned resource once in reverse order', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const called: string[] = [];
    const life = new Lifetime();
    for (const name of ['renderer', 'scene', 'controls', 'channel', 'listeners', 'animation']) life.own(() => called.push(name));
    life.dispose(); life.dispose();
    assert.deepEqual(called, ['animation', 'listeners', 'channel', 'controls', 'scene', 'renderer']);
    life.own(() => called.push('late'));
    assert.equal(called.at(-1), 'late');
  }
});
test('cleanup continues after one disposer throws and does not run again', () => {
  const life = new Lifetime(); let cleaned = 0;
  life.own(() => cleaned++); life.own(() => { throw new Error('failed closer'); });
  assert.throws(() => life.dispose(), AggregateError); assert.equal(cleaned, 1);
  life.dispose(); assert.equal(cleaned, 1);
});
test('shared render resources and textures are disposed once', () => {
  let calls = 0, cleared = 0;
  const geometry = { dispose() { calls++; } };
  const texture = { isTexture: true, dispose() { calls++; } };
  const material = { map: texture, dispose() { calls++; } };
  const instanced = { geometry, material, isInstancedMesh: true, dispose() { calls++; } };
  const root = { traverse(fn: (object: unknown) => void) { fn(instanced); fn(instanced); fn({ geometry, material: [material] }); }, clear() { cleared++; } };
  disposeScene(root as unknown as THREE.Object3D);
  assert.equal(calls, 4); assert.equal(cleared, 1);
});
