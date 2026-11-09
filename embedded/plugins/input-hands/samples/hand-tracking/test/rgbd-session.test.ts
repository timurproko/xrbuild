import test from'node:test';import assert from'node:assert/strict';import{RgbdSession,endpoint}from'../src/live/rgbd/session.ts';
import{calibration,devices,packet,pause}from'./rgbd-helpers.ts';import{deferred,bitmap,inference}from'./live-helpers.ts';
import type{Prepared}from'../src/live/rgbd/preparer.ts';
class Socket{readyState=0;bufferedAmount=0;binaryType='blob';onopen:any=null;onmessage:any=null;onerror:any=null;onclose:any=null;sent:any[]=[];closes=0;
 send(text:string){this.sent.push(JSON.parse(text));}close(){this.closes++;this.readyState=3;}open(){this.readyState=1;this.onopen?.({});}emit(data:unknown){this.onmessage?.({data:typeof data==='object'&&!(data instanceof ArrayBuffer)?JSON.stringify(data):data});}}
function setup(options:{prepare?:(buffer:ArrayBuffer,view:any)=>Promise<Prepared>;initialize?:()=>Promise<any>;estimate?:(image:ImageBitmap,time:number)=>Promise<any>}={}){
 const socket=new Socket(),shown:any[]=[],images:ReturnType<typeof bitmap>[]=[],state={now:200,clears:0,preparerDisposals:0,modelDisposals:0,models:0};
 const session=new RgbdSession({frame:value=>shown.push(value),clear:()=>state.clears++,view:()=>({space:'aligned',mask:false,near:0.15,far:2})},{socket:()=>socket as unknown as WebSocket,now:()=>state.now,
 preparer:()=>({prepare:options.prepare??(async(buffer,view)=>{const color=bitmap(),heatmap=bitmap();images.push(color,heatmap);return {buffer:structuredClone(buffer,{transfer:[buffer]}),color:color.value,heatmap:heatmap.value,valid:1,pixelMs:2,view};}),dispose:()=>state.preparerDisposals++}),
 estimator:()=>{state.models++;return{initialize:options.initialize??(async()=>({delegate:'CPU',fallback:null})),estimate:options.estimate??(async image=>({...inference(),bitmap:image})),dispose:async()=>{state.modelDisposals++;}};}});
 session.connect('ws://127.0.0.1:5191/bridge','a'.repeat(64));socket.open();socket.emit({type:'devices',...devices()});return{session,socket,state,shown,images};
}
const settings={delegate:'CPU' as const,detection:0.5,presence:0.5,tracking:0.5};
async function start(s:ReturnType<typeof setup>,infer=true){await s.session.start('fixture-serial','/local/','model.task',settings,infer);s.socket.emit({type:'started',runId:'fixture-run',calibration:calibration()});}
test('endpoint/token/serial validation cannot connect remotely or silently choose an index',async()=>{
 for(const url of['ws://remote.example:5191/bridge','ws://127.0.0.1:5191/bridge?token=secret','ws://localhost:5191/other','ws://localhost:0/bridge'])assert.throws(()=>endpoint(url));
 const s=setup();try{assert.equal(s.state.models,0,'connection/enumeration does not initialize model/capture');await assert.rejects(s.session.start('','/','x',settings,true),/Explicitly select/);await assert.rejects(s.session.start('another','/','x',settings,true),/Explicitly select/);}finally{s.session.disconnect();}
});
test('bridge RGB inference and depth display remain paired; all borrowed bitmaps close after callback',async()=>{
 const s=setup();try{await start(s);s.socket.emit(packet().buffer);await pause();assert.equal(s.shown.length,1);const frame=s.shown[0];assert.equal(frame.observation.hands.length,1);
 assert.equal(frame.observation.sourceId,'rgbd:fixture-serial:fixture-run');assert.equal(frame.observation.timing.mediaTimeMs,undefined,'no fabricated media clock for native frames');assert.equal(frame.packet.meta.depth.sensorTimestampUs,null);assert.ok(s.images.every(i=>i.state.closes===1));
 assert.equal(s.socket.sent.at(-1).type,'ack');assert.equal(s.socket.sent.at(-1).sequence,1);assert.equal(s.session.snapshot().frames,1);
 }finally{s.session.disconnect();}
});
test('depth-only inspection starts no model and still acknowledges/disposes both preview bitmaps',async()=>{
 const s=setup();try{await start(s,false);s.socket.emit(packet().buffer);await pause();assert.equal(s.state.models,0);assert.equal(s.shown[0].observation,null);assert.ok(s.images.every(i=>i.state.closes===1));}finally{s.session.disconnect();}
});
test('marker-only start sends an explicit detector option and creates no hand model',async()=>{const s=setup();try{await s.session.start('fixture-serial','/local/','model.task',settings,false,true);assert.deepEqual(s.socket.sent.find(v=>v.type==='start'),{type:'start',serial:'fixture-serial',profile:'640x480@30',markerCalibration:true});assert.equal(s.state.models,0);}finally{s.session.disconnect();}});
test('stop during preparation discards/closes late pixels and cannot repopulate display',async()=>{
 const work=deferred<Prepared>(),s=setup({prepare:()=>work.promise});try{await start(s);const buffer=packet().buffer;s.socket.emit(buffer);await s.session.stop();const color=bitmap(),heatmap=bitmap();
 work.resolve({buffer,color:color.value,heatmap:heatmap.value,valid:1,pixelMs:1,view:{space:'aligned',mask:false,near:0.15,far:2,scale:0.001}});await pause();assert.equal(s.shown.length,0);assert.equal(color.state.closes,1);assert.equal(heatmap.state.closes,1);assert.equal(s.state.preparerDisposals,1);
 }finally{s.session.disconnect();}
});
test('stop during inference fences its late result and closes returned bitmap',async()=>{
 const work=deferred<any>(),s=setup({estimate:()=>work.promise});try{await start(s);s.socket.emit(packet().buffer);await pause();await s.session.stop();const result=bitmap();work.resolve({...inference(),bitmap:result.value});await pause();assert.equal(s.shown.length,0);assert.equal(result.state.closes,1);assert.equal(s.images[1].state.closes,1);
 }finally{s.session.disconnect();}
});
test('cancelled model initialization never sends camera Start',async()=>{
 const init=deferred<any>(),s=setup({initialize:()=>init.promise});try{const starting=s.session.start('fixture-serial','/local/','model',settings,true);await pause();await s.session.stop();init.resolve({delegate:'CPU',fallback:null});await starting;assert.equal(s.socket.sent.filter(v=>v.type==='start').length,0);assert.equal(s.state.modelDisposals,1);}finally{s.session.disconnect();}
});
test('old-run frames are acknowledged/discarded; malformed frames fail closed',async()=>{
 const s=setup();try{await start(s);s.socket.emit(packet(1,{runId:'old-run'}).buffer);await pause();assert.equal(s.shown.length,0);assert.equal(s.socket.sent.at(-1).runId,'old-run');
 s.socket.emit(new ArrayBuffer(5));assert.equal(s.session.snapshot().state,'error');assert.equal(s.socket.closes,1);assert.match(s.session.snapshot().error,/protocol/);assert.equal(s.state.preparerDisposals,1);
 }finally{s.session.disconnect();}
});
test('only the latest Stop acknowledgement can release a newer start; stale/fatal stops are fenced',async()=>{
 const s=setup();try{await start(s);await s.session.stop();const first=s.socket.sent.at(-1).id;await s.session.stop();const second=s.socket.sent.at(-1).id;
 s.socket.emit({type:'stopped',id:first});assert.equal(s.session.snapshot().state,'stopping');s.socket.emit({type:'stopped',id:second});assert.equal(s.session.snapshot().state,'connected');
 await start(s);s.socket.emit({type:'stopped',id:first});assert.equal(s.session.snapshot().state,'running');
 const stops=s.socket.sent.filter(v=>v.type==='stop').length;s.socket.emit({type:'error',fatal:true,message:'fixture native failure'});assert.equal(s.socket.sent.filter(v=>v.type==='stop').length,stops,'fatal shutdown must not generate duplicate Stop');
 s.socket.emit({type:'stopped',fatal:true});assert.equal(s.session.snapshot().state,'connected');await start(s);s.socket.emit({type:'stopped',fatal:true});assert.equal(s.session.snapshot().state,'running');
 }finally{s.session.disconnect();}
});
test('processing error stops capture explicitly and preserves the error without silent fallback',async()=>{
 const s=setup({prepare:async()=>{throw new Error('fixture pixel failure');}});try{await start(s);s.socket.emit(packet().buffer);await pause();assert.equal(s.shown.length,0);assert.match(s.session.snapshot().error,/fixture pixel failure/);assert.ok(s.socket.sent.some(v=>v.type==='stop'));assert.equal(s.state.modelDisposals,1);}finally{s.session.disconnect();}
});
