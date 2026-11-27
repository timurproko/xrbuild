// Default authored meshes only. Input targets, state, timing and sounds stay in the controls.
import * as THREE from 'three';
import { Label } from './label.ts';
import { Icon } from './icon.ts';
import type { ButtonOptions } from './button.ts';
import { COLORS, material, roundedBox, roundedDisc, disc } from './theme.ts';

export function buttonVisual(options: ButtonOptions, w: number, h: number, depth: number, rest: number) {
  const pill = options.shape === 'pill';
  const base = new THREE.Mesh(pill ? roundedBox(w + 0.008, h + 0.008, 0.004, (h + 0.008) / 2) : roundedDisc(w / 2 + 0.004, 0.004), material(COLORS.well));
  const cap = new THREE.Group(), capMaterial = material(COLORS.cap, { roughness: 0.35 });
  const capMesh = new THREE.Mesh(pill ? roundedBox(w, h, depth, h / 2) : roundedDisc(w / 2, depth), capMaterial);
  const glyph = !pill && options.icon ? new Icon(options.icon, { size: 0.022, stroke: options.iconStroke }) : new Label(options.text, { size: pill ? 0.0085 : 0.019, color: '#30363f', weight: pill ? 600 : 900 });
  glyph.position.z = depth + 0.0003; cap.add(capMesh, glyph); cap.position.z = rest;
  return { base, cap, capMaterial };
}
export function switchVisual(w: number, h: number, radius: number, depth: number, rest: number) {
  const knob = new THREE.Group(), trackMaterial = material(COLORS.track), knobMaterial = material(COLORS.cap, { roughness: 0.35 });
  const track = new THREE.Mesh(roundedBox(w, h, 0.006, h / 2), trackMaterial);
  knob.add(new THREE.Mesh(roundedDisc(radius, depth), knobMaterial)); knob.position.z = rest;
  return { track, knob, trackMaterial, knobMaterial };
}
export function segmentVisual(text: string, x: number, w: number, h: number, depth: number, rest: number) {
  const capMaterial = material(COLORS.capDark, { roughness: 0.4 }), cap = new THREE.Group();
  const label = new Label(text, { size: 0.008, color: COLORS.text }); label.position.z = depth + 0.0003;
  cap.add(new THREE.Mesh(roundedBox(w, h, depth, 0.004), capMaterial), label);cap.position.set(x, 0, rest);
  return { cap, material: capMaterial, label };
}
export function sliderVisual(length: number, steps: number | null, trackH: number, trackD: number, handleW: number, handleH: number, handleD: number, handleZ: number) {
  const root = new THREE.Group(), handle = new THREE.Group(), handleMaterial = material(COLORS.cap, { roughness: 0.4 });
  const track = new THREE.Mesh(roundedBox(length + trackH, trackH, trackD, trackH / 2), material(COLORS.track));
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), material(COLORS.accent)); fill.visible = !steps;
  root.add(track, fill);
  if (steps) for(let i = 0; i < steps; i++) {
    const dot = new THREE.Mesh(disc(0.0016, 0.0008, 16), material(COLORS.muted));dot.position.set(-length / 2 + (i / (steps - 1)) * length, 0, trackD);root.add(dot);
  }
  handle.add(new THREE.Mesh(roundedBox(handleW, handleH, handleD, 0.004), handleMaterial));
  for (const x of [-0.005, 0, 0.005]) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.0012, handleH * 0.7, 0.0012), material(x === 0 ? COLORS.accent : '#8d96a6'));ridge.position.set(x, 0, handleD);handle.add(ridge);
  }
  handle.position.z = handleZ; root.add(handle);
  return { root, handle, handleMaterial, fill };
}
export function dialVisual(radius: number, depth: number, z: number, tickCount: number, start: number, sweep: number) {
  const root = new THREE.Group(), knob = new THREE.Group(), knobMaterial = material(COLORS.cap, { roughness: 0.35 });
  const ticks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  root.add(new THREE.Mesh(roundedDisc(radius + 0.012, 0.004), material(COLORS.well)));
  for(let i = 0; i < tickCount; i++) {
    const a = start - (i / (tickCount - 1)) * sweep;
    const dot = new THREE.Mesh(disc(0.0013, 0.0008, 12), material(COLORS.track));dot.position.set(Math.cos(a) * (radius + 0.0065), Math.sin(a) * (radius + 0.0065), 0.004);ticks.push(dot);root.add(dot);
  }
  const body = new THREE.Mesh(roundedDisc(radius, depth), knobMaterial), notchWidth = 0.00205;
  const notch = new THREE.Mesh(roundedBox(notchWidth, radius * 0.5, 0.0008, notchWidth / 2), material('#30363f', { roughness: 0.6 }));notch.position.set(0, radius * 0.6, depth - 0.0001);
  knob.add(body, notch);knob.position.z = z;root.add(knob);
  return { root, knob, knobMaterial, ticks };
}
