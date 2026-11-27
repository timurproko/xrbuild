import React from 'react';
import * as THREE from 'three';
import { mountXrbApp } from '@xr-build/react';
import { LauncherScene } from './scene.tsx';
import createIcon from './icon.js';
import './style.css';

await import.meta.hot?.data.teardown;
const mount=mountXrbApp(document.body,<LauncherScene/>,{
  camera:{position:[0,0,0.67],near:0.01,far:5,perspectiveFov:34,orthographicHeight:0.336},
  xrb:{mapping:{mode:'world',center:new THREE.Vector3(),scale:1},pointer:false,icon:{create:createIcon},xr:{button:false,panel:{widthM:0.597,heightM:0.336,distanceM:0.5,dropM:0.12}}},
});
export function dispose(){window.removeEventListener('pagehide',onPageHide);return mount.dispose();}
function onPageHide(event:PageTransitionEvent){if(!event.persisted)void dispose();}
window.addEventListener('pagehide',onPageHide);
if(import.meta.hot){
  import.meta.hot.accept('./scene.tsx',module=>{if(module)mount.update(<module.LauncherScene/>);});
  import.meta.hot.dispose(data=>{data.teardown=dispose();});
}
await mount.ready;
document.body.classList.add('ready');
