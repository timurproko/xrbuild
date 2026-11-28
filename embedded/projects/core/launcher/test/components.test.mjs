import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test} from 'node:test';
import React from 'react';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {componentApp}=await import(pathToFileURL(path.join(process.env.XRB_CORE,'packages/react/test/component-app.fixture.mjs')));
const href='http://127.0.0.1:5398/?xrb-panel=http%3A%2F%2F127.0.0.1%3A5191%2F&xrb-project=launcher';
const fetchCatalog=async()=>Response.json({projects:Array.from({length:5},(_,i)=>({id:`scene-${i+1}`,entryExists:true,manifest:{kind:'app',name:`Scene ${i+1}`,description:'A component app.'}}))});
function objects(state,fn){const found=[];state.app.scene.traverse(o=>{if(fn(o))found.push(o);});return found;}
const controls=state=>objects(state,o=>o.userData.control===o);
const cards=state=>objects(state,o=>o.userData.launcherCard);
function native(state,type,x,y,button=0){state.canvas.dispatchEvent(Object.assign(new Event(type),{clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button}));}
function point(state,control){const p=control.getWorldPosition(state.app.camera.position.clone());const camera=state.app.projection==='orthographic'&&!state.app.xrb.stereo?state.app.camera:state.app.xrb.view.leftCamera;const ndc=p.project(camera);return [(ndc.x+1)/2*(state.app.xrb.stereo?400:800),(1-ndc.y)/2*450];}
function mousePress(state,control){state.app.scene.updateMatrixWorld(true);const [x,y]=point(state,control);native(state,'pointermove',x,y);native(state,'pointerdown',x,y);native(state,'pointerup',x,y);}
function handPress(state,control,time){const target=control.targets[0];const p=target.object.position.clone().set(0,0,target.top);let position;
 state.app.xrb.hands.sample=()=>{const keypoints=Array.from({length:21},()=>position.toArray());return [{id:7,handedness:'right',keypoints,rawKeypoints:keypoints,pinching:false,grabbing:false,tip:position.toArray(),pinchPoint:position.toArray(),coasting:false,lastSeen:0}];};
 for(const [index,z]of [0.06,-target.travel*0.8,0.06].entries()){position=target.object.localToWorld(p.clone().add(control.position.clone().set(0,0,z)));state.tick(time+index*16);}
}
for(const theme of ['default','chamfer'])for(const mode of ['perspective','orthographic','stereo'])for(const input of ['mouse','hand'])test(`Launcher ${theme} paging/release/cancellation: ${mode}, ${input}`,async()=>{
 const state=await componentApp(root,{href,fetch:fetchCatalog,input:{mouse:input==='mouse'}});state.canvas.clientWidth=800;
 try{
  const {LauncherScene}=await state.importEntry();state.handle.update(React.createElement(LauncherScene,{theme}));await new Promise(r=>setTimeout(r,35));
  state.app.setProjection(mode==='orthographic'?'orthographic':'perspective');if(mode==='stereo')state.app.xrb.setStereo(true);
  for(let n=0;n<=60;n++)state.tick(n*1000/60);
  assert.equal(cards(state).length,3);assert.deepEqual(cards(state).map(c=>c.userData.launcherCard.entry.title),['Scene 1','Scene 2','Scene 3']);
  const next=controls(state).find(c=>c.title.text==='Next page');
  if(input==='hand'){
    mousePress(state,next);assert.equal(state.pending.size,1,'native Mouse-off must not schedule a release action (only catalog polling exists)');assert.equal(state.app.xrb.interaction.pointer,null);
    handPress(state,next,1100);
  }else mousePress(state,next);
  assert.equal(cards(state).length,3,'navigation waits for release delay');await state.fire(60);
  assert.deepEqual(cards(state).map(c=>c.userData.launcherCard.entry.title),['Scene 4','Scene 5']);assert.equal(controls(state).find(c=>c.title.text==='Next page').enabled,false);
  const previous=controls(state).find(c=>c.title.text==='Previous page');state.tick(1500);for(let n=1;n<=60;n++)state.tick(1500+n*16);
  if(input==='hand')handPress(state,previous,2500);else mousePress(state,previous);await state.fire(60);assert.equal(cards(state).length,3);
  for(let n=0;n<60;n++)state.tick(2600+n*16);
  const open=controls(state).find(c=>c.title.text==='Open Scene 1');state.clock(3600);
  if(input==='hand')handPress(state,open,3600);else mousePress(state,open);await state.fire(60);
  assert.equal(cards(state).filter(c=>c.visible).length,1);assert.equal(open.enabled,false);assert.ok([...state.pending.values()].some(t=>t.delay===1150));
  state.tick(4000);assert.ok(cards(state)[0].scale.x>1);assert.ok(cards(state)[0].position.z>0.02);
  await state.fire(1150);const navigation=state.calls.find(c=>c.startsWith('navigate:'));assert.ok(navigation);const url=new URL(navigation.slice(9));assert.equal(url.searchParams.get('xrb-camera'),mode==='orthographic'?'orthographic':'perspective');assert.equal(url.searchParams.get('xrb-return'),href);
  await state.exports.dispose();assert.equal(state.pending.size,0);assert.equal(state.app.xrb.interaction.captured(-1),null);
 }finally{await state.dispose();}
});

test('native swipe, right-button tilt/reset and explicit XR entry retain authored behavior',async()=>{
 const state=await componentApp(root,{href,fetch:fetchCatalog});state.canvas.clientWidth=800;
 try{
  for(let n=0;n<=60;n++)state.tick(n*1000/60);
  native(state,'pointerdown',400,30);native(state,'pointermove',100,30);native(state,'pointerup',100,30);await new Promise(r=>setTimeout(r,35));assert.deepEqual(cards(state).map(c=>c.userData.launcherCard.entry.title),['Scene 4','Scene 5']);
  const interfaceRoot=cards(state)[0].parent.parent;
  native(state,'pointerdown',400,30,2);native(state,'pointermove',450,50,2);state.tick(1100);assert.ok(interfaceRoot.rotation.y>0);const before=interfaceRoot.rotation.y;
  native(state,'pointerup',450,50,2);state.tick(1200);assert.ok(interfaceRoot.rotation.y<before);
  let entries=0;Object.defineProperty(state.app.xrb,'xrMode',{get:()=>true});state.app.xrb.enterXR=async()=>{entries++;};state.tick(1300);await new Promise(r=>setTimeout(r,35));
  const enter=controls(state).find(c=>c.title.text==='Enter XR');assert.ok(enter.enabled);mousePress(state,enter);assert.equal(entries,1);
  await state.exports.dispose();assert.equal(state.pending.size,0);
 }finally{await state.dispose();}
});

for(const theme of ['default','chamfer'])for(const refresh of ['description','icon revision','error','removal'])for(const finish of ['navigate','teardown'])test(`${theme} accepted navigation survives catalog ${refresh}; ${finish}`,async()=>{
 let description='original',revision=1,available=true,present=true;
 const state=await componentApp(root,{href,fetch:async()=>available?Response.json({projects:present?[{id:'scene-1',entryExists:true,icon:{mtimeMs:revision},manifest:{kind:'app',name:'Scene 1',description}}]:[]}):new Response('',{status:503})});
 try{
  const {LauncherScene}=await state.importEntry();state.handle.update(React.createElement(LauncherScene,{theme}));await new Promise(r=>setTimeout(r,35));
  state.app.setProjection('orthographic');for(let n=0;n<=60;n++)state.tick(n*1000/60);
  const original=cards(state)[0],button=controls(state).find(c=>c.title.text==='Open Scene 1');
  mousePress(state,button);await state.fire(60);
  const accepted=[...state.pending].find(([,timer])=>timer.delay===1150);assert.ok(accepted,'release accepts one navigation');
  state.handle.update(React.createElement(LauncherScene,{theme:theme==='default'?'chamfer':'default'}));await new Promise(r=>setTimeout(r,35));
  assert.ok(cards(state).includes(original),'theme replacement retains the launching card');assert.equal(state.pending.get(accepted[0]),accepted[1],'theme replacement keeps the accepted deadline');
  if(refresh==='description')description='changed during navigation';
  if(refresh==='icon revision')revision++;
  if(refresh==='error')available=false;
  if(refresh==='removal')present=false;
  await state.fire(1000);
  assert.ok(!cards(state).includes(original),'the poll actually retires the launching card');
  assert.equal(state.pending.get(accepted[0]),accepted[1],'card reconciliation must neither cancel nor restart the accepted deadline');
  state.app.setProjection('perspective');
  if(finish==='teardown'){
   await state.exports.dispose();assert.equal(state.pending.size,0);await state.fire(1150);assert.ok(!state.calls.some(c=>c.startsWith('navigate:')));
  }else{
   await state.fire(1150);await state.fire(1150);
   const navigations=state.calls.filter(c=>c.startsWith('navigate:'));assert.equal(navigations.length,1);
   const destination=new URL(navigations[0].slice(9));assert.equal(destination.pathname,'/preview/scene-1/');assert.equal(destination.searchParams.get('xrb-camera'),'orthographic','accepted projection stays frozen across refresh');assert.equal(destination.searchParams.get('xrb-return'),href);
  }
 }finally{await state.dispose();}
});

test('scene teardown cancels navigation after the release delay has accepted it',async()=>{
 const state=await componentApp(root,{href,fetch:fetchCatalog});try{
  for(let n=0;n<=60;n++)state.tick(n*1000/60);mousePress(state,controls(state).find(c=>c.title.text==='Open Scene 1'));await state.fire(60);
  assert.ok([...state.pending.values()].some(timer=>timer.delay===1150));await state.exports.dispose();await state.fire(1150);assert.equal(state.pending.size,0);assert.ok(!state.calls.some(c=>c.startsWith('navigate:')));
 }finally{await state.dispose();}
});

for(const mode of ['perspective','orthographic','stereo'])for(const input of ['mouse','hand'])test(`theme switch keeps held paging release: ${mode} ${input}`,async()=>{
 const state=await componentApp(root,{href,fetch:fetchCatalog,input:{mouse:input==='mouse'}});state.canvas.clientWidth=800;
 try{
  const {LauncherScene,uiKitTheme}=await state.importEntry();assert.equal(uiKitTheme.defaultTheme,'default');
  state.app.setProjection(mode==='orthographic'?'orthographic':'perspective');if(mode==='stereo')state.app.xrb.setStereo(true);for(let n=0;n<60;n++)state.tick(n*16);
  const next=controls(state).find(c=>c.title.text==='Next page'),target=next.targets[0];let position;
  const sampled=z=>{const p=target.object.position.clone().set(0,0,target.top+z);position=target.object.localToWorld(p);};
  if(input==='mouse'){const[x,y]=point(state,next);native(state,'pointermove',x,y);native(state,'pointerdown',x,y);}else{
   state.app.xrb.hands.sample=()=>{const points=Array.from({length:21},()=>position.toArray());return[{id:7,handedness:'right',keypoints:points,rawKeypoints:points,pinching:false,grabbing:false,tip:position.toArray(),pinchPoint:position.toArray(),coasting:false,lastSeen:0}];};
   sampled(.06);state.tick(1100);sampled(-target.travel*.8);state.tick(1116);
  }
  const held=state.app.xrb.interaction.captured(input==='mouse'?-1:7);assert.ok(held);
  state.handle.update(React.createElement(LauncherScene,{theme:'chamfer'}));await new Promise(r=>setTimeout(r,35));
  assert.equal(controls(state).find(c=>c.title.text==='Next page'),next);assert.equal(next.themeId,'chamfer');assert.equal(state.app.xrb.interaction.captured(input==='mouse'?-1:7),held);
  if(input==='mouse'){const[x,y]=point(state,next);native(state,'pointerup',x,y);}else{sampled(.06);state.tick(1132);}
  await state.fire(60);assert.deepEqual(cards(state).map(c=>c.userData.launcherCard.entry.title),['Scene 4','Scene 5']);
 }finally{await state.dispose();}
});

test('unmount retires held release actions and pending launch navigation',async()=>{
 const state=await componentApp(root,{href,fetch:fetchCatalog});try{
  for(let n=0;n<=60;n++)state.tick(n*1000/60);const button=controls(state).find(c=>c.title.text==='Open Scene 1');mousePress(state,button);await state.exports.dispose();await state.fire(60);await state.fire(1150);assert.ok(!state.calls.some(c=>c.startsWith('navigate:')));assert.equal(state.pending.size,0);
 }finally{await state.dispose();}
});
