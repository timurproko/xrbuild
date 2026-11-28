import React from 'react';
import * as THREE from 'three';
import { mountXrbApp } from '@xr-build/react';
import { connectComponentSettings } from '@xr-build/sdk';
import { UiKitScene } from './scene.tsx';
import createIcon from './icon.ts';

await import.meta.hot?.data.teardown;
const lifetime = new AbortController();
// The theme chosen in the panel's Settings tab, live while the app runs (the same path Launcher uses).
const settings = await connectComponentSettings(import.meta.env.VITE_XRB_COMPONENTS ?? {}, { signal: lifetime.signal });
let Scene = UiKitScene;
const mount = mountXrbApp(document.body, <Scene {...settings.props} />, {
  camera: { position: [0, 0, 0.6], near: 0.01, far: 5, perspectiveFov: 38, orthographicHeight: 0.336 },
  xrb: { mapping: { mode: 'world', center: new THREE.Vector3(), scale: 1 }, pointer: false, icon: { create: createIcon } },
});
const offSettings = settings.subscribe(props => mount.update(<Scene {...props} />));
let stableFrames = 0;
const off = mount.app.onComponentFrame(() => {
  if (!document.body.classList.contains('ready') && ++stableFrames >= 3) document.body.classList.add('ready');
});
export function dispose() {
  lifetime.abort(); offSettings(); settings.dispose();
  off(); window.removeEventListener('pagehide', onPageHide); return mount.dispose();
}
function onPageHide(event: PageTransitionEvent) { if (!event.persisted) void dispose(); }
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) {
  import.meta.hot.accept('./scene.tsx', module => { if (module) { Scene = module.UiKitScene; mount.update(<Scene {...settings.props} />); } });
  import.meta.hot.dispose(data => { data.teardown = dispose(); });
}
await mount.ready;
