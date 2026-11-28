import './dom-shim.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { StrictMode, createRef } from 'react';
import * as THREE from 'three';
import { ArrowRight } from 'lucide';
import { mountXrbApp } from '../../react/src/index.ts';
import { fixture, settle } from '../../react/test/fixture.ts';
import { createXrbApp, Interactor, type SceneHand, type Hand } from '@xr-build/sdk';
import { installPointerEvents } from '../../react/test/fixture.ts';
import * as Kit from '../src/index.ts';
import * as UI from '../src/react/index.ts';
Kit.setMuted(true);
Object.assign(globalThis,{innerWidth:800,innerHeight:450});
const ray=(x=0,y=0)=>new THREE.Ray(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1));
function hand(x=0,y=0,z=0.08,pinching=false):SceneHand {
 const tip=new THREE.Vector3(x,y,z),points=Array.from({length:21},(_,i)=>tip.clone().add(new THREE.Vector3(i%3*0.001,Math.floor(i/3)*0.001,0)));
 const value={id:1,handedness:'right',keypoints:points.map(p=>p.toArray()),rawKeypoints:[],pinching,pinchStrength:pinching?1:0,grabbing:false,tip:tip.toArray(),pinchPoint:tip.toArray(),coasting:false,lastSeen:0} as Hand;
 return {hand:value,tip,pinchPoint:tip.clone(),points,palm:{position:tip.clone(),quaternion:new THREE.Quaternion()}};
}
const definitions=[
 {name:'pill',C:UI.Button,props:{title:'b',text:'Press',shape:'pill'},make:()=>new Kit.Button({title:'b',text:'Press',shape:'pill'})},
 {name:'round',C:UI.Button,props:{title:'b',text:'',shape:'round',icon:ArrowRight},make:()=>new Kit.Button({title:'b',text:'',shape:'round',icon:ArrowRight})},
 {name:'round-text',C:UI.Button,props:{title:'b',text:'+',shape:'round'},make:()=>new Kit.Button({title:'b',text:'+',shape:'round'})},
 {name:'switch-on',C:UI.Switch,props:{title:'s',initialOn:true},make:()=>new Kit.Switch('s',true)},
 {name:'segments-latched',C:UI.Segmented,props:{title:'s',options:['Full','X','Y','Z']},make:()=>new Kit.Segmented('s',['Full','X','Y','Z'])},
 {name:'segments-reselect',C:UI.Segmented,props:{title:'s',options:['Full','X','Y','Z'],initialIndex:1,reselectIndex:0},make:()=>new Kit.Segmented('s',['Full','X','Y','Z'],1,{reselectIndex:0})},
 ...(['x','y','z'] as const).map(axis=>({name:`trackball-${axis}`,C:UI.Trackball,props:{title:'t',radius:0.056,axis},make:()=>{const object=new Kit.Trackball('t',0.056);object.axis=axis;return object;}})),
 {name:'switch',C:UI.Switch,props:{title:'s'},make:()=>new Kit.Switch('s')},
 {name:'segmented',C:UI.Segmented,props:{title:'s',options:['Full','X','Y','Z'],latchSelected:false},make:()=>new Kit.Segmented('s',['Full','X','Y','Z'],0,{latchSelected:false})},
 {name:'slider',C:UI.Slider,props:{title:'s',value:0.5,length:0.13},make:()=>new Kit.Slider({title:'s',value:0.5,length:0.13})},
 {name:'stepped',C:UI.Slider,props:{title:'s',value:0.25,length:0.13,steps:5},make:()=>new Kit.Slider({title:'s',value:0.25,length:0.13,steps:5})},
 {name:'dial',C:UI.Dial,props:{title:'d'},make:()=>new Kit.Dial('d')},
 {name:'trackball',C:UI.Trackball,props:{title:'t',radius:0.056},make:()=>new Kit.Trackball('t',0.056)},
 {name:'dialog',C:UI.Dialog,props:{title:'d',text:'body',open:true},make:()=>{const d=new Kit.Dialog({title:'d',text:'body'});d.open();return d;}},
];
function snapshot(object:Kit.Control){
 const value=object as any;
 return {clicks:value.clicks,on:value.isOn,index:value.index,value:value.value,axis:value.axis,open:value.isOpen,status:(object.status as any).text,
  transforms:object.children.map(c=>[c.position.toArray(),c.scale.toArray(),c.visible])};
}
function replay(control:Kit.Control,ix:Interactor,input:'mouse'|'hand') {
 const events:unknown[]=[];
 const off=['click','release','change','grab','rotate','open','close'].map(type=>control.subscribe(type,detail=>events.push({type,...detail})));
 control.update(0); control.updateMatrixWorld(true);
 const frame=(hands:SceneHand[]=[])=>{control.update(1/60);control.updateMatrixWorld(true);ix.update(hands,1);};
 if(input==='mouse') {
  ix.pointerMove(ray());frame();ix.pointerDown(ray());frame();ix.pointerMove(ray(0.04,0.015));frame();ix.pointerUp();frame();
 }else{
  frame([hand()]);frame([hand(0,0,0.008)]);frame([hand(0.02,0,0.008)]);frame([hand()]);
  frame([hand(0.01,0,0.017)]);frame([hand(0.01,0,0.017,true)]);frame([hand(0.04,0.01,0.017,true)]);frame([hand(0.04,0.01,0.017)]);frame();
 }
 if(control instanceof Kit.Dialog){control.close();for(let n=0;n<50;n++)frame();}
 if(control instanceof Kit.Trackball)for(const axis of ['x','y','z','free'] as const){control.axis=axis;ix.pointerDown(ray());ix.pointerMove(ray(0.02,0.02));ix.pointerUp();frame();}
 const result={events,state:snapshot(control)};off.forEach(f=>f());return result;
}
for(const theme of ['default','chamfer'] as const)for(const projection of ['perspective','orthographic','stereo'] as const)for(const input of ['mouse','hand'] as const)for(const definition of definitions)test(`${theme} ${definition.name}: ${projection} ${input} matches imperative behavior`,async()=>{
 const f=fixture();f.app.setProjection(projection==='orthographic'?'orthographic':'perspective');if(projection==='stereo')f.app.xrb.setStereo(true);
 const ref=createRef<Kit.Control>();const C=definition.C as React.ComponentType<any>;
 const mount=mountXrbApp(f.container,<C {...definition.props} theme={theme} ref={ref}/>,{app:f.app});await mount.ready;
 assert.ok(ref.current);
 const baseline=definition.make();const ix=new Interactor();baseline.attach(ix);
 const expected=replay(baseline,ix,input),actual=replay(ref.current,f.app.xrb.interaction,input);
 assert.deepEqual(actual,expected);
 const targets=[...(ref.current as any).targets];await mount.dispose();
 assert.equal(ref.current,null);for(const target of targets){assert.equal(f.app.xrb.interaction.has(target),false);assert.equal(target.listeners.size,0);}
 baseline.dispose();f.app.dispose();
});

const handTraces = new Map<string, unknown>();
for(const theme of ['default','chamfer'] as const)for(const projection of ['perspective','orthographic','stereo'] as const)for(const mouse of [false,true])for(const definition of definitions)test(`${theme} ${definition.name}: SDK sampled hands, ${projection}, Mouse=${mouse}`,async()=>{
 const restore=installPointerEvents();const f=fixture();f.app.dispose();
 Object.assign(document,{elementFromPoint:()=>f.canvas});
 const app=createXrbApp(f.renderer,{autoStart:false,camera:{position:[0,0,0.6]},xrb:{mouse,mapping:{mode:'world',center:new THREE.Vector3(),scale:1},xr:{button:false}}});
 app.setProjection(projection==='orthographic'?'orthographic':'perspective');if(projection==='stereo')app.xrb.setStereo(true);
 const ref=createRef<Kit.Control>(),C=definition.C as React.ComponentType<any>;const got:unknown[]=[];
 const record=(type:string)=>(detail:Record<string,unknown>)=>got.push({type,...detail});
 const mount=mountXrbApp(f.container,<C {...definition.props} theme={theme} ref={ref} onClick={record('click')} onChange={record('change')} onGrab={record('grab')} onRotate={record('rotate')} onRelease={record('release')} onClose={record('close')}/>,{app});
 try{
  await mount.ready;let sample=hand(0,0,0.08);app.xrb.hands.sample=()=>[sample.hand];
  let time=1000;const frame=(x:number,z:number,pinching=false,y=0)=>{sample=hand(x+(definition.name==='stepped'?-0.0325:0),y,z,pinching);f.tick(time);time+=16;};
  frame(0,0.08);frame(0,0.008);frame(0.02,0.008);frame(0,0.08);
  frame(0.01,0.017);frame(0.01,0.017,true);frame(0.04,0.017,true);frame(0.04,0.017);frame(0,0.2);
  if(definition.name==='dialog'){for(let n=0;n<60;n++)frame(0,0.2);frame(0,0.16,false,-0.032);frame(0,0.09,false,-0.032);frame(0,0.16,false,-0.032);}
  assert.ok(got.length,`${definition.name} responds to sampled physical hands`);
  assert.ok(got.length<20,'physical capture cannot echo through component pointer handlers');
  const traceKey=`${definition.name}:${projection}:${mouse}`;
  if(theme==='default')handTraces.set(traceKey,got.slice());else assert.deepEqual(got,handTraces.get(traceKey),'sampled hand event order, sources and values match Default');
  if(!mouse){const before=got.length;for(const type of ['pointerdown','pointermove','pointerup','click'])f.canvas.dispatchEvent(new PointerEvent(type,{clientX:400,clientY:225,pointerId:1,pointerType:'mouse'}));assert.equal(got.length,before);assert.equal(app.xrb.interaction.pointer,null);}
 }finally{await mount.dispose();app.dispose();restore();}
});

test('Strict replay and callbacks retain held identity; removal cancels before retired callbacks',async()=>{
 const f=fixture(),ref=createRef<Kit.Button>();const calls:string[]=[];
 const tree=(name:string)=><StrictMode><UI.Button ref={ref} title="b" text="Press" shape="pill" onClick={()=>calls.push(name)} onRelease={()=>calls.push(`${name}:release`)}/></StrictMode>;
 const mount=mountXrbApp(f.container,tree('old'),{app:f.app});await mount.ready;
 const button=ref.current!;assert.ok(f.app.xrb.interaction.pointerDown(ray()));
 mount.update(tree('new'));await settle();assert.equal(ref.current,button);assert.ok(f.app.xrb.interaction.captured(-1));
 f.app.xrb.interaction.pointerUp();assert.deepEqual(calls,['old','new:release']);
 f.app.xrb.interaction.pointerDown(ray());await mount.dispose();assert.equal(f.app.xrb.interaction.captured(-1),null);assert.deepEqual(calls,['old','new:release','new']);f.app.dispose();
});

test('each component owns one frame; dialog Close is updated by its dialog only',async()=>{
 const f=fixture(),ref=createRef<Kit.Dialog>();let updates=0,nested=0;
 const mount=mountXrbApp(f.container,<UI.Dialog ref={ref} title="d" text="body" open configure={d=>{
  const update=d.update.bind(d),close=d.closeButton.update.bind(d.closeButton);d.update=dt=>{updates++;update(dt);};d.closeButton.update=dt=>{nested++;close(dt);};
 }}/>,{app:f.app});await mount.ready;f.app.xrb.setStereo(true);f.tick(1000);f.tick(1016);assert.equal(updates,2);assert.equal(nested,2);
 await mount.dispose();f.tick(1032);assert.equal(updates,2);f.app.dispose();
});

test('keyed replacement, disable and two instances isolate targets and owned resources',async()=>{
 const f=fixture(),left=createRef<Kit.Button>(),right=createRef<Kit.Button>();let clicks=0;
 const tree=(key:string,enabled=true)=><><UI.Button key={key} ref={left} title="left" text="Press" shape="pill" enabled={enabled} onClick={()=>clicks++}/><UI.Button key="right" ref={right} title="right" text="Press" shape="pill" position={[0.2,0,0]}/></>;
 const mount=mountXrbApp(f.container,tree('a'),{app:f.app});await mount.ready;
 const first=left.current!,sibling=right.current!;const resources:any[]=[];first.traverse(o=>{if((o as THREE.Mesh).geometry)resources.push((o as THREE.Mesh).geometry);});let disposed=0;for(const g of new Set(resources))g.addEventListener('dispose',()=>disposed++);
 f.app.scene.updateMatrixWorld(true);assert.ok(f.app.xrb.interaction.pointerDown(ray()));
 mount.update(tree('a',false));await settle();f.app.xrb.interaction.update([],1);assert.equal(f.app.xrb.interaction.captured(-1),null);assert.equal(clicks,1);
 mount.update(tree('b'));await settle();assert.notEqual(left.current,first);assert.equal(right.current,sibling);assert.equal(disposed,new Set(resources).size);
 const siblingTargets=[...(sibling as any).targets];assert.ok(siblingTargets.every(t=>f.app.xrb.interaction.has(t)));
 await mount.dispose();await mount.dispose();assert.ok(siblingTargets.every(t=>!f.app.xrb.interaction.has(t)));f.app.dispose();
});

test('Board preserves texture maps borrowed through material parameters',async()=>{
 const f=fixture(),texture=new THREE.Texture();let disposed=0;texture.addEventListener('dispose',()=>disposed++);
 const mount=mountXrbApp(f.container,<UI.Board width={0.5} height={0.3} material={{map:texture}}/>,{app:f.app});await mount.ready;await mount.dispose();assert.equal(disposed,0);texture.dispose();assert.equal(disposed,1);f.app.dispose();
});

test('visual-only dialog has no blockers and sibling primitives retire independently',async()=>{
 const f=fixture(),ref=createRef<Kit.Dialog>();
 const mount=mountXrbApp(f.container,<><UI.Board width={0.5} height={0.3}/><UI.Dialog ref={ref} interactive={false} title="d" text="" open closeButtonVisible={false}/><UI.Label text="label"/><UI.Icon icon={ArrowRight}/><UI.GlassEdge width={0.2} height={0.1} radius={0.01}/></>,{app:f.app});await mount.ready;
 for(const target of [...(ref.current as any).targets,...(ref.current!.closeButton as any).targets])assert.equal(f.app.xrb.interaction.has(target),false);
 assert.equal(f.app.xrb.interaction.pointerDown(ray()),false);await mount.dispose();f.app.dispose();
});
