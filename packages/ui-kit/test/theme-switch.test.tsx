import './dom-shim.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React, {StrictMode, createRef} from 'react';
import * as THREE from 'three';
import {ArrowRight} from 'lucide';
import {mountXrbApp} from '../../react/src/index.ts';
import {fixture,settle} from '../../react/test/fixture.ts';
import * as K from '../src/index.ts';
import * as UI from '../src/react/index.ts';
K.setMuted(true);
Object.assign(globalThis,{innerWidth:800,innerHeight:450});
const ray=(x=0,y=0)=>new THREE.Ray(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1));
const defs=[
 {C:UI.Button,props:{title:'Pill',shape:'pill',text:'Press'}},
 {C:UI.Button,props:{title:'Round',shape:'round',text:'',icon:ArrowRight}},
 {C:UI.Switch,props:{title:'Switch'}},
 {C:UI.Segmented,props:{title:'Segmented',options:['Full','X','Y','Z'],latchSelected:false}},
 {C:UI.Slider,props:{title:'Slider',length:.13,value:.5}},
 {C:UI.Slider,props:{title:'Stepped',length:.13,value:.25,steps:5}},
 {C:UI.Dial,props:{title:'Dial'}},
 {C:UI.Trackball,props:{title:'Trackball',radius:.056}},
 {C:UI.Dialog,props:{title:'Dialog',text:'Body',open:true}},
];
function state(control:K.Control){const c=control as any;return {enabled:c.enabled,visible:c.visible,clicks:c.clicks,value:c.value,on:c.isOn,index:c.index,axis:c.axis,turned:c.turned&&{...c.turned},quaternion:c.object?.quaternion.toArray(),open:c.isOpen,targets:[...c.targets]};}

for(const [i,def]of defs.entries())test(`provider switch ${i}: held identity, callback and value survive`,async()=>{
 const f=fixture(),ref=createRef<K.Control>(),C=def.C as React.ComponentType<any>,calls:string[]=[];
 const tree=(theme:K.UiKitThemeId,tag:string)=><StrictMode><UI.UiKitThemeProvider theme={theme}><C {...def.props} ref={ref} onRelease={()=>calls.push(tag)}/></UI.UiKitThemeProvider></StrictMode>;
 const mount=mountXrbApp(f.container,tree('default','old'),{app:f.app});await mount.ready;
 const object=ref.current!;for(let n=0;n<60;n++)f.tick(1000+n*16);f.app.scene.updateMatrixWorld(true);
 const target=(object as any).targets[0];const centre=target.centre??target.position??new THREE.Vector3();
 const p=target.object.localToWorld(new THREE.Vector3(centre.x??0,centre.y??0,target.top??centre.z??0));
 assert.ok(f.app.xrb.interaction.pointerDown(ray(p.x,p.y)),'held target exists');
 const captured=f.app.xrb.interaction.captured(-1),before=state(object),eventCount=calls.length;
 mount.update(tree('accent','new'));await settle();
 assert.equal(ref.current,object);assert.equal(object.themeId,'accent');assert.equal(f.app.xrb.interaction.captured(-1),captured);assert.deepEqual(state(object),before);assert.equal(calls.length,eventCount);
 f.app.xrb.interaction.pointerMove(ray(p.x+.02,p.y+.02));f.app.xrb.interaction.pointerUp();
 assert.ok(!calls.includes('old'),'release uses current callback');
 await mount.dispose();assert.equal(f.app.xrb.interaction.captured(-1),null);f.app.dispose();
});

test('nested fallback/override removal and independent providers never reset instances',async()=>{
 const f=fixture(),a=createRef<K.Button>(),b=createRef<K.Button>(),c=createRef<K.Button>(),d=createRef<K.Button>();
 const tree=(outer?:K.UiKitThemeSelection,override?:K.UiKitThemeSelection)=><>
  <UI.UiKitThemeProvider theme={outer}><UI.UiKitThemeProvider defaultTheme="default"><UI.Button ref={a} title="a" shape="pill" text="a"/><UI.Button ref={b} theme={override} title="b" shape="pill" text="b"/></UI.UiKitThemeProvider></UI.UiKitThemeProvider>
  <UI.UiKitThemeProvider theme="default"><UI.Button ref={c} title="c" shape="pill" text="c"/></UI.UiKitThemeProvider>
  <UI.UiKitThemeProvider defaultTheme="accent"><UI.Button ref={d} title="d" shape="pill" text="d"/></UI.UiKitThemeProvider>
 </>;
 const mount=mountXrbApp(f.container,tree('accent','default'),{app:f.app});await mount.ready;
 const objects=[a.current,b.current,c.current,d.current];assert.deepEqual(objects.map(o=>o!.themeId),['accent','default','default','accent']);
 mount.update(tree('accent'));await settle();assert.equal(b.current!.themeId,'accent');
 mount.update(tree());await settle();assert.deepEqual([a.current,b.current,c.current,d.current],objects);assert.deepEqual(objects.map(o=>o!.themeId),['default','default','default','accent']);
 await mount.dispose();f.app.dispose();
});

for(const [i,def]of defs.entries())test(`repeated theme retirement ${i}: resources bounded, borrowed children and state survive`,async()=>{
 const f=fixture(),ref=createRef<K.Control>(),C=def.C as React.ComponentType<any>;
 const mount=mountXrbApp(f.container,<C {...def.props} ref={ref} compact/>,{app:f.app});await mount.ready;const object=ref.current!;
 const borrowed=new THREE.Mesh(new THREE.BoxGeometry(.001,.001,.001),new THREE.MeshBasicMaterial());let borrowedDisposals=0;borrowed.geometry.addEventListener('dispose',()=>borrowedDisposals++);object.add(borrowed);
 const counts=new Map<THREE.BufferGeometry|THREE.Material,number>();const watch=()=>object.traverse(node=>{const m=node as THREE.Mesh;for(const r of [m.geometry,...(Array.isArray(m.material)?m.material:[m.material])])if(r&&!counts.has(r)){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)!+1));}});
 object.setEnabled(false);object.visible=false;watch();
 for(let n=0;n<20;n++){
  const before=state(object);object.setTheme(n%2?'default':'accent');assert.deepEqual(state(object),before);
  assert.equal(object.title.visible,false);assert.equal(object.status.visible,false);watch();object.update(1/60);
 }
 assert.equal(borrowedDisposals,0);borrowed.removeFromParent();counts.delete(borrowed.geometry);counts.delete(borrowed.material as THREE.Material);
 await mount.dispose();await mount.dispose();for(const [resource,count]of counts)assert.equal(count,1,`${resource.type} retired once`);
 assert.equal(borrowedDisposals,0);borrowed.geometry.dispose();(borrowed.material as THREE.Material).dispose();f.app.dispose();
});

for (const def of [defs[0],defs[4],defs[6],defs[7]]) test(`provider switch: physical ${def.props.title} capture survives`,async()=>{
 const f=fixture(),ref=createRef<K.Control>(),C=def.C as React.ComponentType<any>;
 const tree=(theme:K.UiKitThemeId)=><UI.UiKitThemeProvider theme={theme}><C {...def.props} ref={ref}/></UI.UiKitThemeProvider>;
 const mount=mountXrbApp(f.container,tree('default'),{app:f.app});await mount.ready;
 const object=ref.current!;
 const sample=(z:number,pinching=false,x=0)=>{
  const pinchPoint=new THREE.Vector3(x,0,z),tip=object instanceof K.Button?pinchPoint.clone():new THREE.Vector3(x,0,.1),points=Array.from({length:21},(_,i)=>pinchPoint.clone().add(new THREE.Vector3(i%3*.0001,Math.floor(i/3)*.0001,0)));
  const hand={id:7,handedness:'right',keypoints:points.map(p=>p.toArray()),rawKeypoints:[],pinching,pinchStrength:pinching?1:0,grabbing:false,tip:tip.toArray(),pinchPoint:pinchPoint.toArray(),coasting:false,lastSeen:0};
  object.update(1/60);object.updateMatrixWorld(true);f.app.xrb.interaction.update([{hand,tip,pinchPoint,points,palm:{position:tip.clone(),quaternion:new THREE.Quaternion()}}] as any,1);
 };
 const z=object instanceof K.Button ? .011 : .026;
 sample(.08);sample(z);sample(z,true);sample(z,true,.005);object.update(1/60);
 const captured=f.app.xrb.interaction.captured(7);assert.ok(captured,'physical capture is positive');const before=state(object);
 mount.update(tree('accent'));await settle();assert.equal(ref.current,object);assert.equal(f.app.xrb.interaction.captured(7),captured);assert.deepEqual(state(object),before);
 sample(z,true,.015);sample(.2);f.app.xrb.interaction.update([],1);
 await mount.dispose();assert.equal(f.app.xrb.interaction.captured(7),null);f.app.dispose();
});

test('unchanged theme typography retains its texture allocation until final disposal',()=>{
 const label=new K.Label('Caption'),texture=(label.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>).material.map!;let retired=0;texture.addEventListener('dispose',()=>retired++);
 for(let n=0;n<20;n++)label.setTheme(n%2?'default':'accent');assert.equal(retired,0);label.dispose();label.dispose();assert.equal(retired,1);
});

test('Board keeps explicit material overrides and borrowed maps across switches',async()=>{
 const f=fixture(),ref=createRef<K.Board>(),texture=new THREE.Texture();let retired=0;texture.addEventListener('dispose',()=>retired++);
 const mount=mountXrbApp(f.container,<UI.Board ref={ref} width={.5} height={.3} color="#ff0000" material={{map:texture,roughness:.17}}/>,{app:f.app});await mount.ready;
 const mesh=ref.current!.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 for(const theme of ['accent','default','accent'] as const){ref.current!.setTheme(theme);assert.equal(mesh.material.roughness,.17);assert.equal(mesh.material.color.getHexString(),'ff0000');assert.equal(mesh.material.map,texture);}
 await mount.dispose();assert.equal(retired,0);texture.dispose();assert.equal(retired,1);f.app.dispose();
});

test('visual-only Dialog stays unregistered and Close is themed without replacement',async()=>{
 const f=fixture(),ref=createRef<K.Dialog>();let closeUpdates=0;
 const tree=(theme:K.UiKitThemeId)=><UI.UiKitThemeProvider theme={theme}><UI.Dialog ref={ref} title="d" text="body" open interactive={false} closeButtonVisible={false} configure={d=>{const update=d.closeButton.update.bind(d.closeButton);d.closeButton.update=dt=>{closeUpdates++;update(dt);};}}/></UI.UiKitThemeProvider>;
 const mount=mountXrbApp(f.container,tree('default'),{app:f.app});await mount.ready;const close=ref.current!.closeButton;
 mount.update(tree('accent'));await settle();assert.equal(ref.current!.closeButton,close);assert.equal(close.themeId,'accent');assert.equal(close.visible,false);
 f.app.xrb.setStereo(true);f.tick(1000);assert.equal(closeUpdates,1);for(const t of [...(ref.current as any).targets,...(close as any).targets])assert.equal(f.app.xrb.interaction.has(t),false);
 await mount.dispose();f.app.dispose();
});
