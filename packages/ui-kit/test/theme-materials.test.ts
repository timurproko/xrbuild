import './dom-shim.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as K from '../src/index.ts';

const robotRoles = ['robotSocket', 'robotEye', 'robotSocket', 'robotEye', 'robotEar', 'robotEar', 'robotHead', 'robotNose', 'robotAntenna', 'robotTip'] as const;
const colors = { robotSocket: '#0000ff', robotEye: '#ff0000', robotEar: '#ffff00', robotHead: '#ff00ff', robotNose: '#00ffff', robotAntenna: '#ffffff', robotTip: '#00ff00' };
function distinctRobot(): K.UiKitTheme {
  const visuals = { ...K.defaultTheme.visuals };
  for (const [role, color] of Object.entries(colors)) visuals[role as keyof typeof colors] = {
    ...K.defaultTheme.visuals[role as keyof typeof colors],
    material(material) { (material as THREE.MeshStandardMaterial).color.set(color); return material; },
  };
  return { ...K.defaultTheme, id: 'distinct-robot', visuals };
}
function translucentBoard(opacity = 0.5): K.UiKitTheme {
  return { ...K.defaultTheme, id: `translucent-board-${opacity}`, visuals: { ...K.defaultTheme.visuals,
    board: { ...K.defaultTheme.visuals.board, material(material) { material.transparent = true; material.opacity = opacity; return material; } },
  } };
}

test('independently styled robot roles have separate stable handles and retire once', () => {
  const ball = new K.Trackball('Trackball', 0.056), robot = ball.object.children[0];
  const handles = robot.children.map(node => (node as THREE.Mesh).material as THREE.MeshStandardMaterial);
  for (let i = 0; i < handles.length; i++) for (let j = i + 1; j < handles.length; j++)
    if (robotRoles[i] !== robotRoles[j]) assert.notEqual(handles[i], handles[j], `${robotRoles[i]} must not alias ${robotRoles[j]}`);
  const retired = new Map([...new Set(handles)].map(material => [material, 0]));
  for (const material of retired.keys()) material.addEventListener('dispose', () => retired.set(material, retired.get(material)! + 1));
  const theme = distinctRobot();
  for (const selected of [theme, K.chamferTheme, K.defaultTheme, theme]) {
    ball.setTheme(selected);
    assert.deepEqual(robot.children.map(node => (node as THREE.Mesh).material), handles, 'live animation/material handles remain stable');
    if (selected === theme) handles.forEach((material, i) => assert.equal(material.color.getHexString(), colors[robotRoles[i]].slice(1), robotRoles[i]));
  }
  ball.dispose(); ball.dispose();
  for (const [material, count] of retired) assert.equal(count, 1, `${material.uuid} retired once`);
});

test('theme-owned static transparency/opacity applies and resets between themes', () => {
  const board = new K.Board({ width: 0.5, height: 0.3, theme: translucentBoard() });
  const material = (board.children[0] as THREE.Mesh).material as THREE.Material;
  assert.equal(material.transparent, true); assert.equal(material.opacity, 0.5);
  board.setTheme(translucentBoard(0.25)); assert.equal(material.opacity, 0.25);
  board.setTheme('default'); assert.equal(material.transparent, false); assert.equal(material.opacity, 1);
  board.setTheme(translucentBoard()); assert.equal(material.transparent, true); assert.equal(material.opacity, 0.5);
  board.dispose();
});

test('actual constructor and later consumer overrides survive theme material recipes', () => {
  const board = new K.Board({ width: 0.5, height: 0.3, material: { transparent: false, opacity: 1 }, theme: translucentBoard() });
  const material = (board.children[0] as THREE.Mesh).material as THREE.Material;
  assert.equal(material.transparent, false); assert.equal(material.opacity, 1);
  material.transparent = true; material.opacity = 0.3;
  board.setTheme('chamfer'); assert.equal(material.transparent, true); assert.equal(material.opacity, 0.3);
  board.setTheme('default'); assert.equal(material.transparent, true); assert.equal(material.opacity, 0.3);
  board.dispose();
});

test('declared composition survives even when its value matched the constructor default', () => {
  const label = new K.Label('Caption'), board = new K.Board({ width: 0.5, height: 0.3 });
  const labelMaterial = (label.children[0] as THREE.Mesh).material as THREE.Material;
  const boardMaterial = (board.children[0] as THREE.Mesh).material as THREE.Material;
  K.setVisualComposition(label, { transparent: true }); // already true; still explicit intent
  K.setVisualComposition(board, { opacity: 1 }); // already 1; still explicit intent
  const theme = { ...translucentBoard(), id: 'composition-test', visuals: { ...translucentBoard().visuals,
    label: { ...K.defaultTheme.visuals.label, material(material: THREE.Material) { material.transparent = false; material.opacity = 0.4; return material; } },
  } };
  for (const selected of [theme, K.defaultTheme, theme]) {
    label.setTheme(selected); board.setTheme(selected);
    assert.equal(labelMaterial.transparent, true); assert.equal(boardMaterial.opacity, 1);
    assert.equal(labelMaterial.opacity, selected === theme ? 0.4 : 1, 'undeclared opacity belongs to the theme');
    assert.equal(boardMaterial.transparent, selected === theme, 'undeclared transparency belongs to the theme');
  }
  label.dispose(); board.dispose();
});

test('glass edge preserves only its declared animated uniforms', () => {
  const edge = new K.GlassEdge({ width: 0.2, height: 0.12, radius: 0.014 }); edge.opacity = 0.3;
  const theme = { ...K.defaultTheme, id: 'edge-static-and-animated', visuals: { ...K.defaultTheme.visuals,
    glassEdge: { ...K.defaultTheme.visuals.glassEdge, material(material: THREE.Material) {
      material.opacity = 0.6; (material as THREE.ShaderMaterial).uniforms.opacity.value = 0.9; return material;
    } },
  } };
  edge.setTheme(theme); assert.equal(edge.material.opacity, 0.6); assert.equal(edge.material.uniforms.opacity.value, 0.3); edge.dispose();
});

test('animated trackball opacity retains its current phase instead of recipe defaults', () => {
  const ball = new K.Trackball('Trackball', 0.056); ball.axis = 'x';
  for (let i = 0; i < 12; i++) ball.update(1 / 60);
  const ring = ball.object.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, opacity = ring.material.opacity;
  const theme = { ...K.defaultTheme, id: 'ring-opacity', visuals: { ...K.defaultTheme.visuals,
    trackballRing: { ...K.defaultTheme.visuals.trackballRing, material(material: THREE.Material) { material.opacity = 0.9; return material; } },
  } };
  ball.setTheme(theme); assert.equal(ring.material.opacity, opacity); assert.equal(ball.axis, 'x'); ball.dispose();
});

test('disabled Trackball reapplies the retained fade immediately without advancing time', () => {
  for (const frames of [8, 100]) {
    const ball = new K.Trackball('Trackball', 0.056); ball.setEnabled(false);
    for (let i = 0; i < frames; i++) ball.update(1 / 60);
    const head = ball.object.children[0].children[6] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const color = head.material.color.clone(), dim = (ball as any).dim, quaternion = ball.object.quaternion.toArray();
    ball.setTheme('chamfer');
    assert.ok(head.material.color.equals(color), 'no one-frame enabled-colour flash');
    assert.equal((ball as any).dim, dim); assert.deepEqual(ball.object.quaternion.toArray(), quaternion); ball.dispose();
  }
});
