import React from 'react';
import { mountXrbApp } from '@xr-build/react';
import { AppScene } from './scene.tsx';
import createIcon from './icon.js';

await import.meta.hot?.data.teardown;
const mount=mountXrbApp(document.body,<AppScene/>,{xrb:{pointer:false,icon:{create:createIcon}}});
export function dispose(){window.removeEventListener('pagehide',onPageHide);return mount.dispose();}
function onPageHide(event:PageTransitionEvent){if(!event.persisted)void dispose();}
window.addEventListener('pagehide',onPageHide);
if(import.meta.hot){
  import.meta.hot.accept('./scene.tsx',module=>{if(module)mount.update(<module.AppScene/>);});
  import.meta.hot.dispose(data=>{data.teardown=dispose();});
}
await mount.ready;
