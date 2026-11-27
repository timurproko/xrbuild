import './dom-shim.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Interactor } from '@xr-build/sdk';
import { Button, Dialog, Slider } from '../src/index.ts';

test('listeners retain chainability and selective idempotent removal', () => {
  const button = new Button({ title: 'b', text: '', shape: 'pill' });
  const ix = new Interactor(); button.attach(ix);
  let a = 0, b = 0;
  const first = () => a++;
  assert.equal(button.on('click', first).off('click', first), button);
  const off = button.subscribe('click', () => b++);
  const press = () => { ix.pointerDown(new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1))); ix.pointerUp(); };
  press(); assert.deepEqual([a, b], [0, 1]);
  off(); off(); press(); assert.deepEqual([a, b], [0, 1]);
  button.dispose(); button.dispose();
});

test('detach cancels capture and can reattach; final disposal excludes borrowed content', () => {
  const button = new Button({ title: 'b', text: '', shape: 'pill' });
  const ix = new Interactor(), other = new Interactor();
  button.attach(ix); button.attach(ix);
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  assert.ok(ix.pointerDown(ray));
  button.attach(other); assert.equal(ix.captured(-1), null); assert.ok(other.pointerDown(ray));
  button.detach(); assert.equal(other.captured(-1), null); button.attach(ix);
  const counts = new Map<object, number>();
  button.traverse(object => {
    const mesh = object as THREE.Mesh;
    for(const resource of [mesh.geometry,...(Array.isArray(mesh.material)?mesh.material:[mesh.material])])if(resource&&!counts.has(resource)) {
      counts.set(resource,0); resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));
    }
  });
  const borrowed = new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  let borrowedDisposals=0; borrowed.geometry.addEventListener('dispose',()=>borrowedDisposals++);
  button.add(borrowed);button.dispose();button.dispose();
  assert.ok([...counts.values()].every(count=>count===1));assert.equal(borrowedDisposals,0);
  assert.throws(()=>button.attach(ix),/disposed/);
});

test('dialog nested target subscriptions and slider dynamic geometry retire once', () => {
  const ix = new Interactor(); const dialog = new Dialog({title:'d',text:'body'});
  dialog.attach(ix);dialog.open(); const closeTargets=(dialog.closeButton as any).targets;
  dialog.dispose();dialog.closeButton.dispose();
  for(const target of closeTargets){assert.equal(ix.has(target),false);assert.equal(target.listeners.size,0);}
  const slider = new Slider({ title:'s',value:0.5 });
  const old=(slider as any).fill.geometry;let oldDisposals=0;old.addEventListener('dispose',()=>oldDisposals++);
  slider.value=1;slider.update(0.1);const next=(slider as any).fill.geometry;let newDisposals=0;next.addEventListener('dispose',()=>newDisposals++);
  slider.dispose();slider.dispose();assert.equal(oldDisposals,1);assert.equal(newDisposals,1);
});
