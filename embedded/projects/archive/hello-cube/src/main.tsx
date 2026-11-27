// Run entry only. Reusable components are exported separately from src/index.ts.
import React, { StrictMode } from 'react';
import { mountXrbApp } from '@xr-build/react';
import { HelloCubeScene } from './scene.tsx';
import createIcon from './icon.ts';

// Bootstrap HMR waits for the previous owner; component edits update the same tree.
await import.meta.hot?.data.teardown;
const mount = mountXrbApp(document.body, <StrictMode><HelloCubeScene /></StrictMode>, {
  camera: { position: [0, 0, 6], near: 0.05, far: 100, perspectiveFov: 38, orthographicHeight: 6 },
  xrb: { icon: { create: createIcon } },
});

/** Stop the SDK before releasing component controls, resources and the owned canvas. */
export function dispose(): Promise<void> {
  window.removeEventListener('pagehide', onPageHide);
  return mount.dispose();
}
function onPageHide(event: PageTransitionEvent) {
  if (!event.persisted) void dispose();
}
window.addEventListener('pagehide', onPageHide);

if (import.meta.hot) {
  import.meta.hot.accept('./scene.tsx', (module) => {
    if (module) mount.update(<StrictMode><module.HelloCubeScene /></StrictMode>);
  });
  import.meta.hot.dispose((data) => { data.teardown = dispose(); });
}
await mount.ready;
