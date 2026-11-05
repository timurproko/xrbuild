// A new XR Build app: rotating 3D text on a desktop, a 3D display or a WebXR headset.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { createXrbApp, rendererOptions } from '@xr-build/sdk';
import createIcon from './icon.js';
import { iconTheme } from './icon-theme.js';

const renderer = new THREE.WebGLRenderer(rendererOptions());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080c16');

scene.add(new THREE.HemisphereLight('#b9dcff', '#18203c', 2.5));
const keyLight = new THREE.DirectionalLight('#ffffff', 4);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(iconTheme.rim, 18, 12);
rimLight.position.set(-3, 1, 2);
scene.add(rimLight);

const font = new FontLoader().parse(fontData);
const title = '__NAME__';
const geometry = new TextGeometry(title, {
  font,
  size: Math.min(0.85, 7 / title.length),
  depth: 0.22,
  curveSegments: 12,
  bevelEnabled: true,
  bevelThickness: 0.025,
  bevelSize: 0.018,
  bevelSegments: 5,
});
geometry.center();

const text = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ color: iconTheme.main, metalness: 0.35, roughness: 0.22 }),
);
text.scale.setScalar(0.7);
scene.add(text);

// A soft ring behind the title makes its depth and rotation easy to see.
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.35, 0.015, 12, 128),
  new THREE.MeshBasicMaterial({ color: iconTheme.ring, transparent: true, opacity: 0.55 }),
);
ring.position.z = -0.8;
scene.add(ring);

// The shared runtime owns projection, resize and rendering. This app only injects its scene and animation.
createXrbApp(renderer, {
  scene,
  // Shared defaults match 2D/3D framing and bind the return control's mouse interaction.
  xrb: { pointer: false, icon: { create: createIcon } },
  frame: ({ timeMs }) => {
    const seconds = timeMs * 0.001;
    text.rotation.x = Math.sin(seconds * 0.7) * 0.16;
    text.rotation.y = seconds * 0.45;
    text.position.y = Math.sin(seconds * 1.2) * 0.08;
    ring.rotation.z = -seconds * 0.08;
  },
});
