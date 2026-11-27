import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Glasses } from 'lucide';
import { useXrb, useXrbFrame } from '@xr-build/react';
import { appLaunchUrl, fitIcon, loadAppIcon, updateIcon } from '@xr-build/sdk';
import { Board, Button, Dialog, Label } from '@xr-build/ui-kit-app';
import { COLORS, type Button as ButtonObject, type Label as LabelObject } from '@xr-build/ui-kit';
import { catalogBaseHref, excludeCurrentPublication, isLoopbackDevelopment, isPanelPreview, isPublishedHosting, loadRuntimeCatalog, workspaceCatalogBase } from './catalog.js';
import { loadIconModel } from './icon-loader.js';
import { brandVisual, dotsVisual, iconWellVisual, spinnerVisual, disposeObject, transparent, wrapLines } from './visuals.js';

const PANEL = { width:0.597, height:0.336 };
const FRAME = { width:PANEL.width-0.018, height:PANEL.height-0.018, radius:0.014 };
const PAGE_SIZE=3, CARD_WIDTH=0.17, CARD_HEIGHT=0.178, CARD_REST_LIFT=0.008, CARD_ACTIVE_LIFT=0.07, CARD_FACE_Z=CARD_REST_LIFT+0.008;
const ICON_DIAMETER=0.056;
const DEFAULT_ICON_COLORS={blue:'#2f9bff',green:'#269b5b',amber:'#d58a20',red:'#d94239',purple:'#864fd4',teal:'#20a4af',grey:'#7d8796'};
type Entry = { id?:string; slug?:string; title:string; description:string; route?:string; launchUrl:string; iconUrl?:string; iconModelUrl?:string; projectId?:string; placeholder?:boolean; defaultSphere?:boolean; defaultIcon3d?:boolean; iconColor?:string };

/** Commit-owned decoration, not an application runtime or a control implementation. */
function Visual({ create, revision, objectRef, ...props }: {create:()=>THREE.Object3D; revision?:unknown; objectRef?:React.MutableRefObject<THREE.Object3D|null>; position?:[number,number,number]; visible?:boolean}) {
  const host=useRef<THREE.Group>(null);
  useLayoutEffect(()=>{const object=create();host.current!.add(object);if(objectRef)objectRef.current=object;return()=>{if(objectRef)objectRef.current=null;disposeObject(object);};},[revision]);
  return <group ref={host} {...props}/>;
}
function useReleaseAction(action:()=>void) {
  const latest=useRef(action),pressed=useRef(false),timers=useRef(new Set<ReturnType<typeof setTimeout>>());
  useLayoutEffect(()=>{latest.current=action;});
  useLayoutEffect(()=>()=>{pressed.current=false;for(const id of timers.current)clearTimeout(id);timers.current.clear();},[]);
  return {onClick:()=>{pressed.current=true;},onRelease:()=>{
    if(!pressed.current)return;pressed.current=false;
    const id=setTimeout(()=>{timers.current.delete(id);latest.current();},60);timers.current.add(id);
  }};
}
function IconView({entry,fallback}:{entry:Entry;fallback:React.RefObject<LabelObject|null>}) {
  const root=useRef<THREE.Group>(null),model=useRef<THREE.Object3D|null>(null);
  const animation=useRef({reveal:0,seconds:0});
  useLayoutEffect(()=>{
    let disposed=false,image:THREE.Object3D|null=null;
    const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
    const showPng=()=>entry.iconUrl&&loader.load(entry.iconUrl,texture=>{
      if(disposed||model.current){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
      image=new THREE.Mesh(new THREE.PlaneGeometry(0.052,0.052),new THREE.MeshBasicMaterial({map:texture,transparent:true}));
      image.position.set(0,0.043,CARD_FACE_Z+0.0075);if(fallback.current)fallback.current.visible=false;root.current!.add(image);
    },undefined,()=>{});
    const show3d=(icon:THREE.Object3D)=>{
      if(disposed){disposeObject(icon);return;}
      if(image){disposeObject(image);image=null;}
      if(entry.defaultSphere)icon.traverse(object=>{const m=(object as THREE.Mesh).material;for(const material of Array.isArray(m)?m:[m])if(material&&'color'in material)(material.color as THREE.Color).set(DEFAULT_ICON_COLORS[entry.iconColor??'blue']??DEFAULT_ICON_COLORS.blue);});
      icon.position.set(0,0.043,CARD_FACE_Z+ICON_DIAMETER/2);icon.scale.multiplyScalar(0.01*(entry.defaultSphere?0.819315:1));
      if(fallback.current)fallback.current.visible=false;model.current=icon;root.current!.add(icon);
    };
    if(entry.defaultIcon3d)show3d(fitIcon(new THREE.Mesh(new THREE.SphereGeometry(1,64,32),new THREE.MeshStandardMaterial({color:DEFAULT_ICON_COLORS[entry.iconColor??'blue']??DEFAULT_ICON_COLORS.blue,metalness:0.1,roughness:0.35})),ICON_DIAMETER));
    else if(entry.placeholder||!entry.route)showPng();
    else {
      showPng();
      const load=entry.iconModelUrl?loadIconModel(entry.iconModelUrl,ICON_DIAMETER,fitIcon):entry.projectId?Promise.resolve(null):loadAppIcon(entry.route,ICON_DIAMETER);
      void load.then(icon=>{if(icon)show3d(icon);});
    }
    return()=>{disposed=true;if(image)disposeObject(image);if(model.current)disposeObject(model.current);model.current=null;};
  },[]);
  useXrbFrame(({deltaSeconds})=>{
    const icon=model.current;if(!icon)return;const dt=Math.min(0.1,deltaSeconds),state=animation.current;
    if(state.reveal<1){const before=1-Math.pow(1-state.reveal,3);state.reveal=Math.min(1,state.reveal+dt*2.8);const reveal=1-Math.pow(1-state.reveal,3);icon.scale.multiplyScalar(Math.max(reveal,0.01)/Math.max(before,0.01));icon.rotation.y=(1-reveal)*-0.6;}
    state.seconds+=dt;updateIcon(icon.children[0],state.seconds);
  });
  return <group ref={root}/>;
}

export function LauncherCard({entry,index,x,launching,onLaunch}:{entry:Entry;index:number;x:number;launching:number|null;onLaunch:(index:number)=>void}) {
  const app=useXrb(),root=useRef<THREE.Group>(null),content=useRef<THREE.Group>(null);
  const fallback=useRef<LabelObject>(null),button=useRef<ButtonObject>(null),spinner=useRef<THREE.Object3D|null>(null);
  const animation=useRef({launching:false,startedAt:0,origin:new THREE.Vector3(),lift:0});
  const navigation=useRef<ReturnType<typeof setTimeout>|null>(null);
  const action=useReleaseAction(()=>{
    const state=animation.current;if(state.launching)return;
    state.launching=true;state.startedAt=performance.now();state.origin.copy(root.current!.position);root.current!.renderOrder=10;
    button.current?.setEnabled(false);if(button.current)button.current.visible=false;
    if(spinner.current?.parent)spinner.current.parent.visible=true;
    onLaunch(index);
    const launchUrl=appLaunchUrl(entry.launchUrl,{returnUrl:location.href,projection:app.projection});
    navigation.current=setTimeout(()=>location.assign(launchUrl),1150);
  });
  useLayoutEffect(()=>{
    transparent(content.current!);
    root.current!.userData.launcherCard={entry,index};
    return()=>{if(navigation.current!==null)clearTimeout(navigation.current);};
  },[]);
  useXrbFrame(({timeMs:now,deltaSeconds})=>{
    const dt=Math.min(0.1,deltaSeconds),state=animation.current,group=root.current!;
    if(state.launching){
      if(spinner.current)(spinner.current.userData.arc as THREE.Group).rotation.z-=dt*5.5;
      const progress=THREE.MathUtils.clamp((now-state.startedAt)/850,0,1),eased=1-Math.pow(1-progress,3);
      group.position.x=THREE.MathUtils.lerp(state.origin.x,0,eased);group.position.y=THREE.MathUtils.lerp(state.origin.y,0,eased);
      state.lift=eased*(CARD_ACTIVE_LIFT-CARD_REST_LIFT);group.scale.setScalar(1+eased*0.12);group.rotation.y=Math.sin(progress*Math.PI)*-Math.sign(state.origin.x||1)*0.055;
    }
    group.position.z=state.lift+Math.sin(now*0.001+index*0.8)*0.0014;
  });
  const placeholder=entry.placeholder?'+' : entry.title.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  return <group ref={root} position={[x,0,0]} visible={launching===null||launching===index}>
    <Dialog title="" text="" width={CARD_WIDTH} height={CARD_HEIGHT} lift={CARD_REST_LIFT} open interactive={false} closeButtonVisible={false}/>
    <group ref={content}>
      <Visual create={iconWellVisual} position={[0,0.043,CARD_FACE_Z]}/>
      <Label ref={fallback} text={placeholder} size={entry.placeholder?0.02:0.014} weight={700} color={COLORS.accent} position={[0,0.043,CARD_FACE_Z+0.007]}/>
      <IconView entry={entry} fallback={fallback}/>
      <Label text={wrapLines(entry.title,18)} size={0.011} weight={700} position={[0,0.001,CARD_FACE_Z]}/>
      <Label text={wrapLines(entry.description,25)} size={0.0072} weight={500} color={COLORS.text} position={[0,-0.018,CARD_FACE_Z]}/>
      <Visual create={spinnerVisual} objectRef={spinner} position={[0,-0.055,CARD_FACE_Z+0.002]} visible={launching===index}/>
      {!entry.placeholder&&<Button ref={button} title={`Open ${entry.title}`} shape="pill" text="Open" compact configure={transparent} position={[0,-0.055,CARD_FACE_Z]} visible={launching!==index} enabled={launching!==index} {...action}/>}
    </group>
  </group>;
}

function EmptyState({error}:{error:boolean}) {
  const label=useRef<LabelObject>(null);
  useXrbFrame(({timeMs})=>{if(label.current)label.current.position.z=Math.sin(timeMs*0.001)*0.0014;});
  return <Label ref={label} text={error?'The app library could not be loaded. Reload to try again.':'No apps published yet.'} size={0.011} weight={600} color={COLORS.muted} position={[0,-0.01,0.012]}/>;
}

/** Pure exported scene. Polling/input ownership begins on mount, never on import. */
export function LauncherScene() {
  const app=useXrb(),{xrb,renderer,camera}=app;
  const root=useRef<THREE.Group>(null),cards=useRef<THREE.Group>(null),dots=useRef<THREE.Group>(null);
  const previous=useRef<ButtonObject>(null),next=useRef<ButtonObject>(null),enter=useRef<ButtonObject>(null);
  const [catalog,setCatalog]=useState<{apps:Entry[];loaded:boolean;error:boolean;revision:number}>({apps:[],loaded:false,error:false,revision:0});
  const [page,setPage]=useState(0),[launching,setLaunching]=useState<number|null>(null),[xrAvailable,setXrAvailable]=useState(false);
  const latest=useRef({catalog,page}),revealStartedAt=useRef(0),tilt=useRef(new THREE.Vector2()),sliding=useRef(false);
  const totalPages=Math.max(1,Math.ceil(catalog.apps.length/PAGE_SIZE)),paged=totalPages>1;
  useLayoutEffect(()=>{latest.current={catalog,page};});
  const changePage=(value:number,direction:number)=>{cards.current!.position.x=direction*0.16;setPage(value);};
  const previousAction=useReleaseAction(()=>{const state=latest.current;if(state.page>0)changePage(state.page-1,-1);});
  const nextAction=useReleaseAction(()=>{const state=latest.current;if((state.page+1)*PAGE_SIZE<state.catalog.apps.length)changePage(state.page+1,1);});
  useLayoutEffect(()=>{
    revealStartedAt.current=performance.now();const background=app.scene.background;app.scene.background=new THREE.Color(COLORS.background);
    return()=>{app.scene.background=background;};
  },[app]);
  useLayoutEffect(()=>{
    let tilting=false,pointer={x:0,y:0},startX=0;
    const canvas=renderer.domElement,off:(()=>void)[]=[];
    const listen=(type:string,handler:(event:any)=>void,capture=false)=>{canvas.addEventListener(type,handler,capture);off.push(()=>canvas.removeEventListener(type,handler,capture));};
    listen('contextmenu',event=>event.preventDefault());
    listen('pointerdown',event=>{if(event.button!==2)return;event.preventDefault();event.stopImmediatePropagation();tilting=true;pointer={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);},true);
    listen('pointermove',event=>{if(!tilting)return;event.preventDefault();event.stopImmediatePropagation();const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer={x:event.clientX,y:event.clientY};tilt.current.y=THREE.MathUtils.clamp(tilt.current.y+dx*0.0012,-0.09,0.09);tilt.current.x=THREE.MathUtils.clamp(tilt.current.x+dy*0.001,-0.055,0.055);},true);
    const stopTilt=event=>{if(!tilting)return;event.preventDefault();event.stopImmediatePropagation();tilting=false;tilt.current.set(0,0);};
    listen('pointerup',stopTilt,true);listen('pointercancel',stopTilt,true);
    listen('pointerdown',event=>{if(event.button!==0||xrb.interaction.captured(-1))return;sliding.current=true;startX=event.clientX;canvas.setPointerCapture(event.pointerId);});
    listen('pointermove',event=>{if(sliding.current)cards.current!.position.x=THREE.MathUtils.clamp((event.clientX-startX)/canvas.clientWidth*0.7,-0.18,0.18);});
    const stopSlide=()=>{if(!sliding.current)return;sliding.current=false;const offset=cards.current!.position.x,state=latest.current;if(offset< -0.055&&(state.page+1)*PAGE_SIZE<state.catalog.apps.length)changePage(state.page+1,1);else if(offset>0.055&&state.page>0)changePage(state.page-1,-1);};
    listen('pointerup',stopSlide);listen('pointercancel',stopSlide);
    return()=>{off.forEach(remove=>remove());sliding.current=false;};
  },[app]);
  useEffect(()=>{
    let active=true,loading=false,signature='',controller:AbortController|null=null;
    const update=async()=>{
      if(loading)return;loading=true;controller?.abort();controller=new AbortController();
      try{
        const panelPreview=isPanelPreview(location.href),workspaceBase=workspaceCatalogBase(location.href),development=isLoopbackDevelopment(location.href);
        const publishedBase=panelPreview||workspaceBase?location.href:catalogBaseHref(location.href,import.meta.env.VITE_CATALOG_ORIGIN);
        const inventory=await loadRuntimeCatalog({runtimeHref:location.href,publishedBase,signal:controller.signal});if(!active)return;
        let apps=excludeCurrentPublication(inventory,location.href,{id:import.meta.env.VITE_XRB_PUBLICATION_ID,slug:import.meta.env.VITE_XRB_PUBLICATION_SLUG});
        if(development&&!panelPreview&&!workspaceBase)apps=apps.map(entry=>{const local=import.meta.env.VITE_XRB_LOCAL_PUBLICATIONS[entry.slug];if(!local)return entry;const launch=new URL(local,location.origin);launch.searchParams.set('xrb-xr','enter');return {...entry,route:launch.href,launchUrl:launch.href};});
        const nextSignature=JSON.stringify(apps.map(({id,title,description,route,launchUrl,iconUrl,iconColor,defaultSphere,defaultIcon3d,iconModelUrl,iconRevision})=>[id,title,description,route,launchUrl,iconUrl,iconColor,defaultSphere,defaultIcon3d,iconModelUrl,iconRevision]));
        if(nextSignature!==signature){signature=nextSignature;setCatalog(old=>({apps,loaded:true,error:false,revision:old.revision+1}));setPage(old=>Math.min(old,Math.max(0,Math.ceil(apps.length/PAGE_SIZE)-1)));cards.current!.position.x=0;}
      }catch(error){if(active&&error?.name!=='AbortError'){console.warn('[launcher] library unavailable:',error);signature='';setCatalog(old=>({apps:[],loaded:true,error:true,revision:old.revision+1}));setPage(0);cards.current!.position.x=0;}}
      finally{loading=false;}
    };
    void update();const interval=isPanelPreview(location.href)||workspaceCatalogBase(location.href)?1000:isPublishedHosting(location.href)?15000:0;
    const timer=interval?setInterval(()=>void update(),interval):null;
    return()=>{active=false;controller?.abort();if(timer!==null)clearInterval(timer);};
  },[app]);
  useXrbFrame(({timeMs:now,deltaSeconds})=>{
    const dt=Math.min(0.1,deltaSeconds);
    if(!sliding.current)cards.current!.position.x+=(0-cards.current!.position.x)*(1-Math.exp(-dt*12));
    const progress=THREE.MathUtils.clamp((now-revealStartedAt.current)/720,0,1),reveal=1-Math.pow(1-progress,3),group=root.current!;
    group.scale.setScalar(0.94+reveal*0.06);group.position.y=-0.012*(1-reveal);
    const tiltX=(xrb.presenting?0:tilt.current.x)-0.04*(1-reveal),tiltY=xrb.presenting?0:tilt.current.y;
    group.rotation.x+=(tiltX-group.rotation.x)*(1-Math.exp(-dt*10));group.rotation.y+=(tiltY-group.rotation.y)*(1-Math.exp(-dt*10));
    const available=Boolean(xrb.xrMode)&&!xrb.presenting;if(available!==xrAvailable){if(enter.current){enter.current.visible=available;enter.current.setEnabled(available);}setXrAvailable(available);}
  });
  const visible=catalog.apps.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE);
  const cardPlaneWidth=FRAME.width*(camera.position.z-CARD_REST_LIFT)/(camera.position.z+0.025),gap=(cardPlaneWidth-visible.length*CARD_WIDTH)/(visible.length+1);
  const beginLaunch=(index:number)=>{
    // Immediate visibility change precedes React's discrete commit, as in the baseline.
    for(const child of cards.current!.children)if(child.userData.launcherCard&&child.userData.launcherCard.index!==index)child.visible=false;
    if(previous.current)previous.current.visible=false;if(next.current)next.current.visible=false;if(dots.current)dots.current.visible=false;setLaunching(index);
  };
  return <>
    <hemisphereLight args={['#dfe8ff','#11141a',1.8]}/><directionalLight color="#dbe7ff" intensity={2.5} position={[-0.35,0.5,0.8]}/>
    <group ref={root} scale={0.94} position={[0,-0.012,0]}>
      <Board width={FRAME.width} height={FRAME.height} radius={FRAME.radius} position={[0,0,-0.025]}/>
      <Visual create={brandVisual}/>
      <group ref={dots} position={[0,-0.118,CARD_REST_LIFT]} visible={paged&&launching===null}><Visual create={()=>dotsVisual(totalPages,page)} revision={`${totalPages}:${page}`}/></group>
      <Button ref={previous} title="Previous page" shape="round" text="" icon={ChevronLeft} compact position={[-0.055,-0.118,CARD_REST_LIFT]} scale={0.6} visible={paged&&launching===null} enabled={paged&&page>0} {...previousAction}/>
      <Button ref={next} title="Next page" shape="round" text="" icon={ChevronRight} compact position={[0.055,-0.118,CARD_REST_LIFT]} scale={0.6} visible={paged&&launching===null} enabled={paged&&page<totalPages-1} {...nextAction}/>
      <Button ref={enter} title="Enter XR" shape="pill" text="Enter XR" icon={Glasses} compact position={[-0.24,0.118,0.008]} visible={xrAvailable} enabled={xrAvailable} onClick={()=>void xrb.enterXR().catch(error=>console.warn('[launcher] could not enter XR:',error))}/>
      <group ref={cards}>
        {visible.map((entry,index)=><LauncherCard key={`${catalog.revision}:${page}:${index}`} entry={entry} index={index} x={-cardPlaneWidth/2+gap+CARD_WIDTH/2+index*(CARD_WIDTH+gap)} launching={launching} onLaunch={beginLaunch}/>)}
        {!visible.length&&catalog.loaded&&<EmptyState error={catalog.error}/>}
      </group>
    </group>
  </>;
}
