import * as THREE from 'three';
import { PinchTarget, GrabTarget } from '/sdk/interaction/core/targets.js';
/** Existing SDK events only. No mouse binding, native flag interpretation or local hand generation. */
export function createHandTestTargets(scene, interaction, onFeedback = () => {}) {
  const pinch = new THREE.Mesh(new THREE.SphereGeometry(.014, 16, 12), new THREE.MeshStandardMaterial({ transparent: true, opacity: .75, roughness: .6 }));
  const drag = new THREE.Mesh(new THREE.BoxGeometry(.028, .028, .028), new THREE.MeshStandardMaterial({ transparent: true, opacity: .75, roughness: .6 }));
  const starts = [new THREE.Vector3(-.11, .085, .15), new THREE.Vector3(.11, .085, .15)];
  pinch.position.copy(starts[0]); drag.position.copy(starts[1]); scene.add(pinch, drag);
  const targets = [interaction.add(new PinchTarget(pinch, { radius: .06 })), interaction.add(new GrabTarget(drag, { radius: .06 }))];
  let active = false;
  const states = targets.map(() => ({ phase: 'Ready', starts: 0, moves: 0, releases: 0 }));
  const feedback = () => onFeedback({ pinch: { ...states[0], held: targets[0].state.held }, drag: { ...states[1], held: targets[1].state.held } });
  targets.forEach((target, index) => target.on(event => {
    if (!active || !event.hand || event.source === 'mouse') return;
    const state = states[index];
    if (event.type === 'start') { state.phase = 'Held'; state.starts++; }
    if (event.type === 'move') { state.moves++; if (index === 1) drag.position.copy(event.world); }
    if (event.type === 'end') { state.phase = event.reason === 'release' ? 'Released' : 'Ready'; if (event.reason === 'release') state.releases++; }
    target.object.material.emissive.copy(target.object.material.color).multiplyScalar(event.type === 'end' ? 0 : .3);
    feedback();
  }));
  function reset() {
    [pinch, drag].forEach((mesh, index) => { mesh.position.copy(starts[index]); mesh.material.emissive.set(0); Object.assign(states[index], { phase: 'Ready', starts: 0, moves: 0, releases: 0 }); }); feedback();
  }
  return {
    targets,
    get state() { return { pinch: { ...states[0], held: targets[0].state.held }, drag: { ...states[1], held: targets[1].state.held }, dragPosition: drag.position.toArray() }; },
    setActive(value) { active = value; targets.forEach(t => t.enabled = value); },
    theme(color) { pinch.material.color.set(color); drag.material.color.set(color); },
    reset,
    dispose() { targets.forEach(t => interaction.remove(t)); for (const mesh of [pinch, drag]) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}
