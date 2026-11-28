import React from 'react';
import * as THREE from 'three';
import { mountXrbApp } from '@xr-build/react';
import { connectComponentSettings } from '@xr-build/sdk';
import { LauncherScene } from './scene.tsx';
import createIcon from './icon.js';
import './style.css';

await import.meta.hot?.data.teardown;
const lifetime = new AbortController();
let Scene = LauncherScene;
let mount: ReturnType<typeof mountXrbApp> | undefined;
let settings: Awaited<ReturnType<typeof connectComponentSettings>> | undefined;
let offSettings: (() => void) | undefined;
export function dispose() {
  lifetime.abort(); offSettings?.(); settings?.dispose();
  window.removeEventListener('pagehide', onPageHide);
  return mount?.dispose() ?? Promise.resolve();
}
function onPageHide(event: PageTransitionEvent) { if (!event.persisted) void dispose(); }
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) {
  import.meta.hot.accept('./scene.tsx', module => {
    if (module && mount && !lifetime.signal.aborted) { Scene = module.LauncherScene; mount.update(<Scene {...settings?.props}/>); }
  });
  import.meta.hot.dispose(data => { data.teardown = dispose(); });
}
// Compiled metadata avoids watching the writable manifest and reloading on a live settings save.
settings = await connectComponentSettings(import.meta.env.VITE_XRB_COMPONENTS ?? {}, { signal: lifetime.signal });
if (!lifetime.signal.aborted) {
  mount = mountXrbApp(document.body, <Scene {...settings.props}/>, {
    camera: { position: [0, 0, 0.67], near: 0.01, far: 5, perspectiveFov: 34, orthographicHeight: 0.336 },
    xrb: { mapping: { mode: 'world', center: new THREE.Vector3(), scale: 1 }, pointer: false, icon: { create: createIcon }, xr: { button: false, panel: { widthM: 0.597, heightM: 0.336, distanceM: 0.5, dropM: 0.12 } } },
  });
  offSettings = settings.subscribe(props => mount?.update(<Scene {...props}/>));
  await mount.ready;
  if (!lifetime.signal.aborted) document.body.classList.add('ready');
}
