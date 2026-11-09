// Minimal SDK example: a few cubes at different depths, OrbitControls, click to select.
// Runs in xrb-host (3D + hands: pinch = click, pinch-and-move = rotate) and in a browser.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createXrbApp, rendererOptions } from '@xr-build/sdk';
import createIcon from './icon.ts';

const renderer = new THREE.WebGLRenderer(rendererOptions());
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0f14');
scene.add(new THREE.HemisphereLight('#cfe3ff', '#202833', 2.0));
const sun = new THREE.DirectionalLight('#ffffff', 2.0);
sun.position.set(2, 4, 3);
scene.add(sun);
const app = createXrbApp(renderer, {
  scene,
  camera: { position: [0, 0, 6], near: 0.05, far: 100, perspectiveFov: 38, orthographicHeight: 6 },
  xrb: { icon: { create: createIcon } },
  autoStart: false,
});
const { xrb, camera } = app;
scene.add(xrb.handsObject);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Cubes in front of, on and behind the panel plane (the orbit target sits on the glass).
const colors = ['#f08a24', '#5bd18b', '#2f6fdf'];
const cubes = [-1.2, 0, 1.2].map((z, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: colors[i] }));
  m.position.set((i - 1) * 1.4, 0, z);
  m.userData.base = colors[i];
  scene.add(m);
  return m;
});
const grid = new THREE.GridHelper(8, 16, '#3a4a5a', '#26313d');
grid.position.y = -0.8;
scene.add(grid);

// Click/pinch to select: the raycaster uses the canvas rect, so mouse and hands behave the same.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('click', (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(cubes)[0];
  for (const c of cubes) (c.material as THREE.MeshStandardMaterial).color.set(c === hit?.object ? '#ffffff' : c.userData.base);
  console.log(`CLICK ${hit ? `cube ${cubes.indexOf(hit.object as THREE.Mesh)}` : 'nothing'}`);
});

let last = 0;
app.setFrame(({ timeMs }) => {
  controls.update();
  cubes.forEach((c, i) => (c.rotation.y = timeMs / 1000 * (0.3 + i * 0.1)));
  if (timeMs - last > 2000) {
    last = timeMs;
    console.log(`STATS fps ${xrb.fps.toFixed(0)}, hands ${xrb.currentHands.length}, status ${xrb.handStatus?.state ?? 'no host'}`);
  }
});
app.start();
