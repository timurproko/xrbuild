import test from 'node:test';import assert from 'node:assert/strict';
import { DepthImages } from '../src/live/recording/depth-replay.ts';import type { Prepared } from '../src/live/rgbd/preparer.ts';
import { depthClip } from './depth-recording-helpers.ts';import { bitmap, deferred } from './live-helpers.ts';
const wait=async(fn:()=>boolean)=>{for(let i=0;i<500&&!fn();i++)await new Promise(r=>setTimeout(r,2));assert.ok(fn());};
const view=()=>({space:'aligned' as const,mask:false,near:0.15,far:3});
test('RGB-D replay bounds preparation to one flight, latest seek wins and closes every borrowed bitmap',async()=>{
 const clip=await depthClip(),pending:{promise:ReturnType<typeof deferred<Prepared>>;buffer:ArrayBuffer}[]=[],shown:number[]=[],errors:unknown[]=[];let disposed=0;
 const images=new DepthImages(view,index=>shown.push(index),error=>errors.push(error),()=>({prepare:async buffer=>{const promise=deferred<Prepared>();pending.push({promise,buffer});return promise.promise;},dispose:()=>{disposed++;}}));
 images.setClip(clip);images.request(0);images.request(1);images.request(2);await wait(()=>pending.length===1);
 const first=bitmap(),heat=bitmap();pending[0].promise.resolve({buffer:pending[0].buffer,color:first.value,heatmap:heat.value,valid:1,pixelMs:1,view:{...view(),scale:0.001}});
 await wait(()=>pending.length===2);assert.equal(first.state.closes,1);assert.equal(heat.state.closes,1);assert.deepEqual(shown,[]);
 const last=bitmap(),lastHeat=bitmap();pending[1].promise.resolve({buffer:pending[1].buffer,color:last.value,heatmap:lastHeat.value,valid:1,pixelMs:1,view:{...view(),scale:0.001}});
 await wait(()=>images.snapshot().inFlight===0);assert.deepEqual(shown,[2]);assert.equal(last.state.closes,1);assert.equal(lastHeat.state.closes,1);
 images.invalidate();images.request(2);await wait(()=>pending.length===3);images.setClip(null);const stale=bitmap(),staleHeat=bitmap();pending[2].promise.resolve({buffer:pending[2].buffer,color:stale.value,heatmap:staleHeat.value,valid:1,pixelMs:1,view:{...view(),scale:0.001}});
 await wait(()=>images.snapshot().inFlight===0);assert.equal(stale.state.closes,1);assert.equal(staleHeat.state.closes,1);assert.deepEqual(shown,[2]);assert.equal(disposed,1);assert.deepEqual(errors,[]);
});
test('RGB-D replay decode errors surface once instead of retrying each animation frame',async()=>{
 const clip=await depthClip();let errors=0;const bad={...clip,frames:[{...clip.frames[0],data:new Blob(['bad'])}]};
 const images=new DepthImages(view,()=>assert.fail('bad frame displayed'),()=>errors++);images.setClip(bad);images.request(0);await wait(()=>images.snapshot().inFlight===0);images.request(0);await new Promise(r=>setTimeout(r,20));assert.equal(errors,1);images.setClip(null);
});
