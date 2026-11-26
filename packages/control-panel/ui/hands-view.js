import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HandInput } from '/sdk/hands.js';
import { HandFrameIngress } from '/sdk/hand-source.js';
import { HandVisual } from '/sdk/hand-visual.js';
import { PanelFrame } from '/sdk/stereo.js';
import { toSceneHand } from '/sdk/scene-hands.js';
import { Interactor } from '/sdk/interaction/core/interactor.js';
import { createHandStream } from './hands-stream.js';

/** Core-owned scene. No provider, device, app host or optional diagnostic module is started here. */
export function createHandsView({ canvas, viewport, onMetrics = () => {}, onStatus = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .005, 10);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = .3; controls.maxDistance = 2;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#162338', 2.8));
  const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(.2, .4, .6); scene.add(light);
  const grid = new THREE.GridHelper(.6, 12); grid.rotation.x = Math.PI / 2; grid.position.z = -.02; scene.add(grid);
  const axes = new THREE.AxesHelper(.09); axes.visible = false; scene.add(axes);
  const panel = new PanelFrame(), input = new HandInput(), ingress = new HandFrameIngress(input, 'native'), visual = new HandVisual(), interaction = new Interactor();
  scene.add(visual);
  let currentHands = [], sceneHands = [], profile = null, profileRequest = 0;
  const legacy = new THREE.Group(); scene.add(legacy);
  function clearHands() { currentHands = []; sceneHands = []; interaction.update([], 1); visual.update([], panel); }
  const stream = createHandStream({ ingress, clear: clearHands });
  function clearLegacy() { for (const object of [...legacy.children]) { object.geometry.dispose(); object.material.dispose(); legacy.remove(object); } }
  async function setProfile(value) {
    const request = ++profileRequest;
    // Reuse the delivered SDK contract; never duplicate an adjustment schema/transform in the panel.
    const api = await import('/sdk/hand-profile.js');
    const next = api.handProfile(value);
    if (closed || request !== profileRequest) return false;
    if (!('profile' in ingress) || typeof visual.applyAppearance !== 'function') throw new Error('Rebuild the SDK to apply hand adjustments.');
    if (profile && !api.sameHandGeometry(profile, next)) { ingress.reset(performance.now()); clearHands(); }
    ingress.profile = next; visual.applyAppearance(next.appearance); profile = next; stream.setReady(true); return true;
  }
  function theme() {
    const css = getComputedStyle(document.documentElement);
    scene.background = new THREE.Color(css.getPropertyValue('--log-bg').trim());
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
      material.color.set(css.getPropertyValue('--line').trim()); material.transparent = true; material.opacity = .5;
    }
  }
  theme(); const observer = new MutationObserver(theme); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  const system = matchMedia('(prefers-color-scheme: dark)'); system.addEventListener('change', theme);
  const resize = new ResizeObserver(() => { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }); resize.observe(viewport);
  function resetView() { camera.position.set(0, .02, .72); controls.target.set(0, 0, .04); controls.update(); }
  resetView();
  let frameId, closed = false, ticks = 0, start = performance.now();
  function render(now) {
    if (closed) return;
    controls.update();
    panel.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, camera);
    currentHands = stream.active ? input.sample(now) : [];
    sceneHands = currentHands.map(hand => toSceneHand(hand, panel));
    interaction.update(sceneHands, 1); visual.update(currentHands, panel);
    renderer.render(scene, camera); ticks++;
    if (now - start >= 1000) { onMetrics({ renderFps: ticks * 1000 / (now - start), ...stream.metrics() }); ticks = 0; start = now; }
    frameId = requestAnimationFrame(render);
  }
  frameId = requestAnimationFrame(render);
  return {
    setProfile,
    beginSession(options) { clearLegacy(); const accepted = stream.beginSession(options); if (accepted) onStatus({ phase: 'running', hands: 0 }); return accepted; },
    pushFrame(value) { const accepted = stream.pushFrame(value); if (accepted) onStatus({ phase: 'running', hands: value.frame.hands.length }); return accepted; },
    clearSession() { stream.clearSession(); onStatus({ phase: 'idle', hands: null }); },
    get active() { return stream.active; },
    get currentHands() { return currentHands; },
    get sceneHands() { return sceneHands; },
    get interaction() { return interaction; },
    showLegacyFrame(frame) {
      if (stream.active) throw new Error('Stop live hands before replay.');
      clearLegacy();
      const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      for (const hand of frame.hands) {
        const points = hand.joints.filter(Boolean).map(p => new THREE.Vector3(p.x, -p.y, -p.z));
        if (points.length) legacy.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(points), new THREE.PointsMaterial({ color, size: .006 })));
      }
      onStatus({ phase: 'replay', hands: frame.hands.length, space: frame.space });
    },
    clearLegacy() { clearLegacy(); onStatus({ phase: 'idle', hands: null }); },
    resetView,
    setViewOptions(options) { grid.visible = options.includes('grid'); axes.visible = options.includes('axes'); },
    dispose() {
      if (closed) return; closed = true; profileRequest++; stream.dispose(); clearLegacy(); cancelAnimationFrame(frameId); resize.disconnect(); observer.disconnect(); system.removeEventListener('change', theme); controls.dispose();
      scene.traverse(object => { object.geometry?.dispose(); for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) material.dispose(); });
      renderer.renderLists.dispose(); renderer.dispose();
    },
  };
}
