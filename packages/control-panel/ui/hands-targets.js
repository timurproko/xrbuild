import * as THREE from 'three';
import { PinchTarget, GrabTarget } from '/sdk/interaction/core/targets.js';

/** Shapes the viewer can show as its single centre object. */
export const VIEW_OBJECTS = { cube: 'Cube', sphere: 'Sphere', suzanne: 'Suzanne' };
const START = new THREE.Vector3(0, 0, 0), SIZE = .05;
let suzanne = null;
/** The Suzanne test mesh (Blender's free test model), stored centred with a 1 m largest extent. */
async function suzanneGeometry() {
  suzanne ??= fetch('/hands-suzanne.json').then(response => response.json()).then(data => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    geometry.scale(SIZE, SIZE, SIZE); geometry.computeVertexNormals(); return geometry;
  });
  return (await suzanne).clone();
}
function shapeGeometry(kind) {
  return kind === 'sphere' ? new THREE.SphereGeometry(SIZE / 2, 32, 24) : new THREE.BoxGeometry(SIZE * .8, SIZE * .8, SIZE * .8);
}

/**
 * One object in front of the screen centre that hands can pinch (highlight) and grab (move), through the existing SDK
 * events only. No mouse binding, native flag interpretation or local hand generation.
 */
export function createHandTestTargets(scene, interaction, onFeedback = () => {}) {
  const object = new THREE.Mesh(shapeGeometry('cube'), new THREE.MeshStandardMaterial({ transparent: true, opacity: .75, roughness: .6 }));
  object.position.copy(START); scene.add(object);
  const targets = [interaction.add(new PinchTarget(object, { radius: .06 })), interaction.add(new GrabTarget(object, { radius: .06 }))];
  let active = false, shown = true, shape = 'cube', shapeRequest = 0;
  const states = targets.map(() => ({ phase: 'Ready', starts: 0, moves: 0, releases: 0 }));
  const feedback = () => onFeedback({ pinch: { ...states[0], held: targets[0].state.held }, drag: { ...states[1], held: targets[1].state.held } });
  const enable = () => targets.forEach(target => { target.enabled = active && shown; });
  // Pinch or grab picks the object up: it keeps its offset from the hand and turns with the palm.
  let holder = -1;
  const offset = new THREE.Vector3(), turn = new THREE.Quaternion(), palm = new THREE.Quaternion();
  targets.forEach((target, index) => target.on(event => {
    if (!active || !event.hand || event.source === 'mouse') return;
    const state = states[index];
    if (event.type === 'start') {
      state.phase = 'Held'; state.starts++; holder = index;
      offset.copy(object.position).sub(event.world);
      turn.copy(event.hand.palm.quaternion).invert().multiply(object.quaternion);
    }
    if (event.type === 'move') {
      state.moves++;
      if (index === holder) { object.position.copy(event.world).add(offset); object.quaternion.copy(palm.copy(event.hand.palm.quaternion).multiply(turn)); }
    }
    if (event.type === 'end' && index === holder) holder = -1;
    if (event.type === 'end') { state.phase = event.reason === 'release' ? 'Released' : 'Ready'; if (event.reason === 'release') state.releases++; }
    const held = targets.some(item => item.state.held);
    object.material.emissive.copy(object.material.color).multiplyScalar(held && event.type !== 'end' ? .3 : 0);
    feedback();
  }));
  function reset() {
    object.position.copy(START); object.quaternion.identity(); holder = -1; object.material.emissive.set(0);
    states.forEach(state => Object.assign(state, { phase: 'Ready', starts: 0, moves: 0, releases: 0 })); feedback();
  }
  async function setShape(kind) {
    if (!VIEW_OBJECTS[kind] || kind === shape) return;
    const request = ++shapeRequest;
    const geometry = kind === 'suzanne' ? await suzanneGeometry() : shapeGeometry(kind);
    if (request !== shapeRequest) { geometry.dispose(); return; }
    object.geometry.dispose(); object.geometry = geometry; shape = kind;
  }
  return {
    targets,
    get state() { return { pinch: { ...states[0], held: targets[0].state.held }, drag: { ...states[1], held: targets[1].state.held }, dragPosition: object.position.toArray(), shape, visible: object.visible }; },
    setActive(value) { active = value; enable(); },
    setVisible(value) { shown = value; object.visible = value; enable(); },
    setShape,
    /** Rest position in panel metres; the object returns there on reset. */
    setPosition(x, y, z) { START.set(x, y, z); if (!targets.some(target => target.state.held)) object.position.copy(START); },
    theme(color) { object.material.color.set(color); },
    reset,
    dispose() { targets.forEach(t => interaction.remove(t)); scene.remove(object); object.geometry.dispose(); object.material.dispose(); },
  };
}
