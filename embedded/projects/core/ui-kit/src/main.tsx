import React from 'react';
import * as THREE from 'three';
import { mountXrbApp } from '@xr-build/react';
import { UiKitScene } from './scene.tsx';
import createIcon from './icon.ts';

await import.meta.hot?.data.teardown;
const mount = mountXrbApp(document.body, <UiKitScene />, {
  camera: { position: [0, 0, 0.6], near: 0.01, far: 5, perspectiveFov: 38, orthographicHeight: 0.336 },
  xrb: { mapping: { mode: 'world', center: new THREE.Vector3(), scale: 1 }, pointer: false, icon: { create: createIcon } },
});
let stableFrames = 0;
const off = mount.app.onComponentFrame(() => {
  if (!document.body.classList.contains('ready') && ++stableFrames >= 3) document.body.classList.add('ready');
});
export function dispose() {
  off(); window.removeEventListener('pagehide', onPageHide); return mount.dispose();
}
function onPageHide(event: PageTransitionEvent) { if (!event.persisted) void dispose(); }
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) {
  import.meta.hot.accept('./scene.tsx', module => { if (module) mount.update(<module.UiKitScene />); });
  import.meta.hot.dispose(data => { data.teardown = dispose(); });
}
await mount.ready;
