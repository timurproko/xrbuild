import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { useXrb, useXrbFrame } from '@xr-build/react';
import { iconTheme } from './icon-theme.js';

export interface AppSceneProps { title?: string }
/** Reusable scene content. Bootstrap, renderer creation and page lifecycle belong to main.tsx. */
export function AppScene({ title = "__NAME__" }: AppSceneProps = {}) {
  const app=useXrb(),textHost=useRef<THREE.Group>(null),ring=useRef<THREE.Mesh>(null),text=useRef<THREE.Mesh|null>(null);
  useLayoutEffect(()=>{
    const background=app.scene.background;app.scene.background=new THREE.Color('#080c16');
    return()=>{app.scene.background=background;};
  },[app]);
  useLayoutEffect(()=>{
    const font=new FontLoader().parse(fontData);
    const geometry=new TextGeometry(title,{font,size:Math.min(0.85,7/title.length),depth:0.22,curveSegments:12,bevelEnabled:true,bevelThickness:0.025,bevelSize:0.018,bevelSegments:5});geometry.center();
    const material=new THREE.MeshStandardMaterial({color:iconTheme.main,metalness:0.35,roughness:0.22});
    const mesh=new THREE.Mesh(geometry,material);mesh.scale.setScalar(0.7);mesh.name='app-title';text.current=mesh;textHost.current!.add(mesh);
    return()=>{text.current=null;mesh.removeFromParent();geometry.dispose();material.dispose();};
  },[title]);
  useXrbFrame(({timeMs})=>{
    const seconds=timeMs*0.001;if(text.current){text.current.rotation.x=Math.sin(seconds*0.7)*0.16;text.current.rotation.y=seconds*0.45;text.current.position.y=Math.sin(seconds*1.2)*0.08;}
    if(ring.current)ring.current.rotation.z=-seconds*0.08;
  });
  return <>
    <hemisphereLight args={['#b9dcff','#18203c',2.5]}/>
    <directionalLight color="#ffffff" intensity={4} position={[3,4,5]}/>
    <pointLight color={iconTheme.rim} intensity={18} distance={12} position={[-3,1,2]}/>
    <group ref={textHost}/>
    <mesh ref={ring} name="app-ring" position={[0,0,-0.8]}><torusGeometry args={[1.35,0.015,12,128]}/><meshBasicMaterial color={iconTheme.ring} transparent opacity={0.55}/></mesh>
  </>;
}
