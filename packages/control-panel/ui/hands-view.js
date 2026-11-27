import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HandInput } from '/sdk/hands.js';
import { HandFrameIngress } from '/sdk/hand-source.js';
import { HandVisual } from '/sdk/hand-visual.js';
import { PanelFrame } from '/sdk/stereo.js';
import { toSceneHand } from '/sdk/scene-hands.js';
import { Interactor } from '/sdk/interaction/core/interactor.js';
import { createHandStream } from './hands-stream.js';
import { createHandTestTargets } from './hands-targets.js';
import { createAxisGizmo } from './hands-axis-gizmo.js';

/** Core-owned scene. No provider, device, app host or optional diagnostic module is started here. */
export function createHandsView({ canvas, viewport, onMetrics = () => {}, onStatus = () => {}, onTestFeedback = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .005, 10);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = .3; controls.maxDistance = 2;
  // Like 3D tools: left drag orbits, middle drag pans, right drag zooms (right/up in, left/down out).
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
  let zoomDrag = null;
  const zoomOffset = new THREE.Vector3();
  canvas.addEventListener('pointerdown', event => { if (event.button !== 2) return; zoomDrag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!zoomDrag) return;
    const delta = (event.clientX - zoomDrag.x) - (event.clientY - zoomDrag.y); zoomDrag = { x: event.clientX, y: event.clientY };
    zoomOffset.copy(camera.position).sub(controls.target);
    zoomOffset.setLength(THREE.MathUtils.clamp(zoomOffset.length() * Math.pow(.995, delta), controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(zoomOffset);
  });
  const endZoom = () => { zoomDrag = null; };
  canvas.addEventListener('pointerup', endZoom); canvas.addEventListener('pointercancel', endZoom);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#162338', 2.8));
  const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(.2, .4, .6); scene.add(light);
  // Endless grid in the panel plane (z = 0, the monitor's plane): 5 cm cells drawn in a shader, fading with distance.
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color('#ffffff') }, opacity: { value: .5 }, cell: { value: .05 }, fade: { value: 2 }, focus: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vWorld; void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }',
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform float cell; uniform float fade; uniform vec3 focus; varying vec3 vWorld;
      void main() {
        vec2 c = vWorld.xy / cell, w = fwidth(c), g = abs(fract(c - .5) - .5) / w;
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float a = line * opacity * (1.0 - smoothstep(fade * .35, fade, length(vWorld.xy - focus.xy)));
        if (a < .004) discard;
        gl_FragColor = vec4(color, a);
      }`,
  }));
  grid.frustumCulled = false; grid.renderOrder = -1; scene.add(grid);
  // The selected monitor as a frame in the panel plane: hands are in panel metres (x right, y up, z toward the
  // viewer, origin at the screen), so the frame shows where hands are relative to the screen.
  const monitor = new THREE.Group(); monitor.visible = false; scene.add(monitor);
  let monitorShown = true;
  function setMonitor(value, { keepView = false } = {}) {
    // The same size again (the live list confirming the remembered one) changes nothing, so the view never jumps.
    if (value?.widthMm && monitorSize && Math.abs(monitorSize.w - value.widthMm / 1000) < 1e-6 && Math.abs(monitorSize.h - value.heightMm / 1000) < 1e-6) return;
    for (const object of [...monitor.children]) { object.geometry.dispose(); object.material.dispose(); monitor.remove(object); }
    if (!value?.widthMm || !value?.heightMm) { monitor.visible = false; monitorSize = null; return; }
    const w = value.widthMm / 1000, h = value.heightMm / 1000, color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#86a4ff';
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    monitor.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color })));
    monitor.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .06, depthWrite: false, side: THREE.DoubleSide })));
    monitor.visible = monitorShown; monitorSize = { w, h }; if (!keepView) resetView();
  }
  // Axes appear as an orientation widget in the bottom-left corner (View › Axes), not at the origin.
  const axes = createAxisGizmo(); axes.visible = false;
  const panel = new PanelFrame(), input = new HandInput(), ingress = new HandFrameIngress(input, 'native'), visual = new HandVisual(), interaction = new Interactor();
  scene.add(visual);
  const tests = createHandTestTargets(scene, interaction, onTestFeedback);
  let currentHands = [], sceneHands = [], profile = null, profileRequest = 0, recordedSession = false, pendingProfile = null;
  const legacy = new THREE.Group(); scene.add(legacy);
  function clearHands() { currentHands = []; sceneHands = []; interaction.update([], 1); visual.update([], panel); tests.reset(); }
  const stream = createHandStream({ ingress, clear: clearHands });
  function clearLegacy() { for (const object of [...legacy.children]) { object.geometry.dispose(); object.material.dispose(); legacy.remove(object); } }
  async function setProfile(value, { isCurrent = () => true, mode = 'live' } = {}) {
    const allowed = () => mode === 'replay' ? !stream.active || recordedSession : !recordedSession;
    const guard = () => { if (!allowed()) throw new Error('Stop the current hand session before switching live/replay.'); };
    guard();
    const request = ++profileRequest;
    // Reuse the delivered SDK contract; never duplicate an adjustment schema/transform in the panel.
    const api = await import('/sdk/hand-profile.js');
    const next = api.handProfile(value);
    if (closed || request !== profileRequest || !isCurrent()) return false;
    guard();
    if (!('profile' in ingress) || typeof visual.applyAppearance !== 'function') throw new Error('Rebuild the SDK to apply hand adjustments.');
    pendingProfile?.resolve(false);
    return new Promise(resolve => { pendingProfile = { resolve, apply() {
      if (closed || request !== profileRequest || !isCurrent() || !allowed()) { resolve(false); return; }
      if (profile && !api.sameHandGeometry(profile, next)) { ingress.reset(performance.now()); clearHands(); }
      ingress.profile = next; visual.applyAppearance(next.appearance); profile = next; stream.setReady(true); resolve(true);
    } }; });
  }
  function theme() {
    const css = getComputedStyle(document.documentElement);
    scene.background = new THREE.Color(css.getPropertyValue('--log-bg').trim());
    tests.theme(css.getPropertyValue('--accent').trim());
  }
  theme(); const observer = new MutationObserver(theme); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  const system = matchMedia('(prefers-color-scheme: dark)'); system.addEventListener('change', theme);
  // Size the canvas to the viewer before the first frame, so a reload never shows the scene at the default
  // 300x150 canvas (a small, zoomed-out flash); frames wait until the viewer has a real size.
  let sized = false;
  const fit = () => { const { width, height } = viewport.getBoundingClientRect(); sized = width > 0 && height > 0; if (!sized) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  fit(); const resize = new ResizeObserver(fit); resize.observe(viewport);
  // Reset frames the selected monitor (with a margin) when there is one, else the default hand workspace.
  let monitorSize = null;
  function resetView() {
    let distance = .72;
    if (monitorSize) {
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      distance = Math.min(controls.maxDistance, Math.max(controls.minDistance, 1.15 * Math.max(monitorSize.h / 2 / half, monitorSize.w / 2 / (half * camera.aspect))));
    }
    camera.position.set(0, .02, distance); controls.target.set(0, 0, monitorSize ? 0 : .04); controls.update();
  }
  resetView();
  let frameId, closed = false, ticks = 0, start = performance.now();
  function render(now) {
    if (closed) return;
    if (pendingProfile) { const pending = pendingProfile; pendingProfile = null; pending.apply(); }
    controls.update();
    grid.material.uniforms.focus.value.copy(controls.target); grid.material.uniforms.fade.value = Math.max(1, camera.position.distanceTo(controls.target) * 2.5);
    stream.tick();
    panel.update({ mode: 'world', center: new THREE.Vector3(), scale: 1 }, camera);
    currentHands = stream.active ? input.sample(now) : [];
    sceneHands = currentHands.map(hand => toSceneHand(hand, panel));
    tests.setActive(stream.active && !recordedSession);
    interaction.update(sceneHands, 1); visual.update(currentHands, panel);
    if (!sized) fit();
    if (sized) { renderer.render(scene, camera); axes.render(renderer, camera); } ticks++;
    if (now - start >= 1000) { onMetrics({ renderFps: ticks * 1000 / (now - start), ...stream.metrics(), ...(recordedSession ? { trackingFps: null } : {}) }); ticks = 0; start = now; }
    frameId = requestAnimationFrame(render);
  }
  frameId = requestAnimationFrame(render);
  return {
    setProfile,
    beginSession(options) { if (stream.active && recordedSession !== (options.mode === 'replay')) return false; const accepted = stream.beginSession(options); if (accepted) { clearLegacy(); recordedSession = options.mode === 'replay'; onStatus({ phase: recordedSession ? 'replay' : 'running', hands: 0 }); } return accepted; },
    pushFrame(value) { const accepted = stream.pushFrame(value); if (accepted) onStatus({ phase: recordedSession ? 'replay' : 'running', hands: value.frame.hands.length }); return accepted; },
    clearHands() { stream.clearHands(); },
    clearSession() { pendingProfile?.resolve(false); pendingProfile = null; profileRequest++; stream.clearSession(); recordedSession = false; onStatus({ phase: 'idle', hands: null }); },
    get replaying() { return recordedSession; },
    get active() { return stream.active; },
    get profile() { return profile ? structuredClone(profile) : null; },
    get currentHands() { return currentHands; },
    get sceneHands() { return sceneHands; },
    get interaction() { return interaction; },
    get testTargets() { return tests.targets; },
    get testState() { return tests.state; },
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
    clearLegacy() { clearLegacy(); if (!stream.active) onStatus({ phase: 'idle', hands: null }); },
    resetView,
    setViewOptions(options) { grid.visible = options.includes('grid'); axes.visible = options.includes('axes'); monitorShown = options.includes('monitor'); monitor.visible = monitorShown && monitor.children.length > 0; tests.setVisible(options.includes('object')); },
    setMonitor,
    setObject(kind) { return tests.setShape(kind); },
    setObjectPosition(x, y, z) { tests.setPosition(x, y, z); },
    /** Grid line color (hex) and opacity (0-1). */
    setGrid({ color, opacity }) { if (color) grid.material.uniforms.color.value.set(color); if (Number.isFinite(opacity)) grid.material.uniforms.opacity.value = opacity; },
    dispose() {
      if (closed) return; closed = true; pendingProfile?.resolve(false); pendingProfile = null; profileRequest++; stream.dispose(); tests.dispose(); clearLegacy(); cancelAnimationFrame(frameId); resize.disconnect(); observer.disconnect(); system.removeEventListener('change', theme); controls.dispose();
      scene.traverse(object => { object.geometry?.dispose(); for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) material.dispose(); });
      axes.dispose(); renderer.renderLists.dispose(); renderer.dispose();
    },
  };
}
