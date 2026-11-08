import test from 'node:test';import assert from 'node:assert/strict';
import { DepthReprocessor } from '../src/live/recording/depth-reprocess.ts';import { DepthComparator } from '../src/live/recording/depth-comparison.ts';
import { DEPTH_DEFAULTS } from '../src/live/rgbd/reconstruction.ts';import { depthClip,depthMetadata } from './depth-recording-helpers.ts';
import { bitmap,deferred,inference } from './live-helpers.ts';import { settle } from './recording-helpers.ts';import type { Prepared } from '../src/live/rgbd/preparer.ts';
const settings={delegate:'GPU' as const,detection:0.5,presence:0.5,tracking:0.5};
test('RGB-D rerun uses all original RGB packets in order, fresh model, recorded gaps, actual fallback and closes both preview bitmaps',async()=>{
 const clip=await depthClip(),times:number[][]=[],pixels:ReturnType<typeof bitmap>[]=[],heat:ReturnType<typeof bitmap>[]=[],sources:ArrayBuffer[]=[];let now=1000,disposes=0;
 const processor=new DepthReprocessor({now:()=>now++,estimator:()=>{const stamps:number[]=[];times.push(stamps);return {initialize:async()=>({delegate:'CPU',fallback:'fixture fallback'}),estimate:async(image,t)=>{stamps.push(t);return {...inference(),bitmap:image};},dispose:async()=>{disposes++;}};},
 preparer:()=>({prepare:async(buffer,view)=>{sources.push(buffer);const color=bitmap(),map=bitmap();pixels.push(color);heat.push(map);return {buffer,color:color.value,heatmap:map.value,view,valid:1,pixelMs:1};},dispose:()=>{}})});
 for(let i=0;i<2;i++){const run=await processor.run(clip,'/pinned/','installed.task',settings);assert.ok(run);assert.equal(run.frames.length,3);assert.equal(run.delegate,'CPU');assert.match(run.fallback!,/fixture/);assert.deepEqual(times[i],[1,34,67]);assert.equal(run.frames[0].timing.mediaTimeMs,undefined);assert.equal(run.frames[0].sourceId,'recording:depth-unit-clip');}
 assert.equal(disposes,2);assert.equal(sources.length,6);assert.ok(pixels.every(p=>p.state.closes===1));assert.ok(heat.every(p=>p.state.closes===1));assert.equal(clip.manifest.backend.delegate,'CPU');
});
test('RGB-D cancellation during pixel preparation closes late resources and publishes no partial model cache',async()=>{
 const clip=await depthClip(),pending=deferred<Prepared>();let estimates=0,preparing=false;const processor=new DepthReprocessor({now:()=>10,estimator:()=>({initialize:async()=>({delegate:'CPU',fallback:null}),estimate:async image=>{estimates++;return {...inference(),bitmap:image};},dispose:async()=>{}}),preparer:()=>({prepare:()=>{preparing=true;return pending.promise;},dispose:()=>{}})});
 const run=processor.run(clip,'/local/','model.task',settings);for(let i=0;i<100&&!preparing;i++)await settle();assert.ok(preparing);await processor.cancel();const a=bitmap(),b=bitmap();pending.resolve({buffer:new ArrayBuffer(0),color:a.value,heatmap:b.value,view:{space:'aligned',mask:false,near:0.15,far:3,scale:0.001},pixelMs:1,valid:0});
 assert.equal(await run,null);assert.equal(a.state.closes,1);assert.equal(b.state.closes,1);assert.equal(estimates,0);assert.equal(processor.snapshot().state,'cancelled');
});
test('RGB-D rerun initialization failure cleans the owned estimator and never opens a preparer',async()=>{
 const clip=await depthClip();let disposed=0;const processor=new DepthReprocessor({now:()=>10,estimator:()=>({initialize:async()=>{throw new Error('model fixture failure');},estimate:async image=>({...inference(),bitmap:image}),dispose:async()=>{disposed++;}}),preparer:()=>{throw new Error('unexpected preparer');}});
 await assert.rejects(processor.run(clip,'/local/','model.task',settings),/model fixture failure/);assert.equal(disposed,1);assert.equal(processor.snapshot().state,'error');
});
test('cancellation during final worker cleanup fences an otherwise completed RGB-D model cache',async()=>{
 const clip=await depthClip(),shutdown=deferred<void>();let disposing=false;
 const processor=new DepthReprocessor({now:()=>10,estimator:()=>({initialize:async()=>({delegate:'CPU',fallback:null}),estimate:async image=>({...inference(),bitmap:image}),dispose:()=>{disposing=true;return shutdown.promise;}}),
 preparer:()=>({prepare:async(buffer,view)=>({buffer,color:bitmap().value,heatmap:bitmap().value,view,valid:1,pixelMs:1}),dispose:()=>{}})});
 const result=processor.run(clip,'/local/','model.task',settings);for(let i=0;i<100&&!disposing;i++)await settle();assert.ok(disposing);const stopped=processor.cancel();shutdown.resolve();await stopped;
 assert.equal(await result,null);assert.equal(processor.snapshot().state,'cancelled');
});
test('depth comparison B may consume fresh model outputs without changing original A, saved RGB-D or content identity',async()=>{
 const clip=await depthClip(),before=JSON.stringify(clip.frames.map(f=>f.meta)),cmp=new DepthComparator(),a=await cmp.run(clip,{...DEPTH_DEFAULTS});assert.ok(a);
 const frames=clip.frames.map(f=>({...f.meta.observation!,hands:[],raw:{landmarks:[],worldLandmarks:[],handedness:[]}}));
 const b=await cmp.run(clip,{...DEPTH_DEFAULTS},{rerun:{frames,settings,delegate:'CPU',fallback:'fixture'},assets:depthMetadata().assets});assert.ok(b);assert.equal(b.contentSha256,a.contentSha256);assert.ok(b.b.every(f=>f.hands.length===0));assert.equal(b.modelB?.delegate,'CPU');assert.equal(b.observationsB,frames);assert.equal(before,JSON.stringify(clip.frames.map(f=>f.meta)));
 await assert.rejects(cmp.run(clip,{...DEPTH_DEFAULTS},{rerun:{frames:[],settings,delegate:'CPU',fallback:null},assets:depthMetadata().assets}),/mismatch/);
});
