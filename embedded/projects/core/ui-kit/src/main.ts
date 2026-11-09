// UI Kit: spatial controls on one board. Hands and the mouse drive the same SDK targets.
// Scene units are metres; the origin is the glass centre, with +z toward the viewer.
import * as THREE from 'three';
import { createXrbApp, rendererOptions } from '@xr-build/sdk';
import { Button, COLORS, Dial, Dialog, Segmented, Slider, Switch, Trackball, type Control } from '@xr-build/ui-kit';
import { ArrowRight } from 'lucide';
import createIcon from './icon.ts';

const renderer = new THREE.WebGLRenderer(rendererOptions());
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
scene.add(new THREE.HemisphereLight('#dfe8ff', '#1a1e26', 1.6));
const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(-0.3, 0.5, 0.8);
scene.add(key);
const app = createXrbApp(renderer, {
  scene,
  camera: { position: [0, 0, 0.6], near: 0.01, far: 5, perspectiveFov: 38, orthographicHeight: 0.336 },
  xrb: {
    mapping: { mode: 'world', center: new THREE.Vector3(0, 0, 0), scale: 1 },
    pointer: false,
    icon: { create: createIcon },
  },
  autoStart: false,
});
const { xrb } = app;
scene.add(xrb.handsObject);

// The board is 0.597 x 0.336 m. Keep symmetric rows and room for the SDK return control.
const pill = new Button({ title: 'Button (pill)', shape: 'pill', text: 'Press' });
const round = new Button({ title: 'Button (round)', shape: 'round', text: '', icon: ArrowRight });
const toggle = new Switch('Switch');
const interactable = new Switch('Interactable', true);
const stepped = new Slider({ title: 'Stepped slider', steps: 5, value: 0.25, length: 0.13 });
const slider = new Slider({ title: 'Slider', value: 0.5, length: 0.13 });
const trackball = new Trackball('Trackball', 0.056);
const mode = new Segmented('', ['Full', 'X', 'Y', 'Z'], 0, { latchSelected: false });
const dial = new Dial('Dial');
const dialogButton = new Button({ title: 'Dialog', shape: 'pill', text: 'Open' });
const dialog = new Dialog({ title: 'Glass dialog', text: 'A sheet 7 cm in front of the board.\nThe board shows through, blurred.' });
mode.title.visible = mode.status.visible = false;

const row1 = [pill, dialogButton, toggle, interactable];
const row1X = [-0.215, -0.075, 0.075, 0.215];
row1.forEach((control, index) => control.position.set(row1X[index], 0.105, 0));
stepped.position.set(-0.19, -0.105, 0);
slider.position.set(0.19, -0.105, 0);
trackball.position.set(0, -0.01, 0.02);
mode.position.set(0, -0.128, 0);
round.position.set(-0.215, -0.01, 0);
dial.position.set(0.215, -0.01, 0);
dialog.position.set(0, 0, 0);

const controls: Control[] = [pill, round, toggle, interactable, stepped, slider, trackball, mode, dial, dialogButton, dialog];
scene.add(...controls);
for (const control of controls) control.attach(xrb.interaction);

// Keep only the showcase interactions; no checklist tracking or diagnostic shortcuts.
dialogButton.on('click', (event) => dialog.open(event.source as 'hand' | 'mouse'));
const AXES = ['free', 'x', 'y', 'z'] as const;
mode.on('change', (event) => { trackball.axis = AXES[event.index as number]; });
interactable.on('change', (event) => {
  for (const control of controls) if (control !== interactable && control !== dialog) control.setEnabled(event.on as boolean);
  interactable.status.set(event.on ? 'On' : 'Off: other controls ignore input');
});
interactable.status.set('On');

let stableFrames = 0;
app.setFrame(({ deltaSeconds }) => {
  if (!xrb.icon) for (const control of controls) control.update(Math.min(0.1, deltaSeconds));
  if (!document.body.classList.contains('ready') && ++stableFrames >= 3) document.body.classList.add('ready');
});
app.start();
