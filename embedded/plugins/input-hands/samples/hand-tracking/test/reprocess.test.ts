import test from 'node:test';
import assert from 'node:assert/strict';
import { Reprocessor } from '../src/live/recording/reprocess.ts';
import type { Estimator } from '../src/live/session.ts';
import { clip, settle } from './recording-helpers.ts';
import { bitmap, deferred, inference } from './live-helpers.ts';
test('rerun feeds identical saved frames sequentially with original gaps into a fresh model each run',async()=>{
  const c=await clip(), source=JSON.stringify(c.manifest), estimators:Estimator[]=[],times:number[][]=[],closed:ReturnType<typeof bitmap>[]=[],seen:Blob[]=[];
  let now=1;
  const processor=new Reprocessor({now:()=>now++,decode:async blob=>{seen.push(blob);const b=bitmap();closed.push(b);return b.value;},estimator:()=>{
    const timestamps:number[]=[];times.push(timestamps);
    const estimator:Estimator={initialize:async()=>({delegate:'CPU',fallback:'fixture GPU failure'}),estimate:async(image,t)=>{timestamps.push(t);return {...inference(),bitmap:image};},dispose:async()=>{}};
    estimators.push(estimator);return estimator;
  }});
  for(let i=0;i<2;i++){
    const run=await processor.run(c,'/local/','installed.task',{delegate:'GPU',detection:0.5,presence:0.5,tracking:0.5});assert.ok(run);
    assert.equal(run.frames.length,3);assert.equal(run.delegate,'CPU');assert.match(run.fallback!,/fixture/);assert.ok(Object.isFrozen(run.frames));
    assert.deepEqual(times[i],[1,34,251]);assert.equal(run.frames[0].sourceId,'recording:unit-clip');assert.equal(run.frames[0].timing.mediaTimeMs,0);
  }
  assert.equal(estimators.length,2);assert.equal(closed.filter(v=>v.state.closes===1).length,6);assert.equal(seen[0],c.frames[0].png);assert.equal(JSON.stringify(c.manifest),source);assert.equal(c.frames[1].meta.observation.hands.length,0);
});
test('cancellation during decode closes late bitmap and never estimates or publishes partial results',async()=>{
  const c=await clip(),decode=deferred<ImageBitmap>();let estimates=0,disposes=0;
  const processor=new Reprocessor({now:()=>10,decode:()=>decode.promise,estimator:()=>({initialize:async()=>({delegate:'CPU',fallback:null}),estimate:async image=>{estimates++;return {...inference(),bitmap:image};},dispose:async()=>{disposes++;}})});
  const result=processor.run(c,'/local/','model.task',{delegate:'CPU',detection:0.5,presence:0.5,tracking:0.5});await settle();await processor.cancel();
  const late=bitmap();decode.resolve(late.value);assert.equal(await result,null);assert.equal(late.state.closes,1);assert.equal(estimates,0);assert.ok(disposes>0);
});
test('cancelled initialization is fenced, and restart waits for prior worker shutdown',async()=>{
  const c=await clip(),init=deferred<{delegate:'CPU';fallback:null}>(),shutdown=deferred<void>();let created=0;
  const processor=new Reprocessor({now:()=>10,decode:async()=>bitmap().value,estimator:()=>{created++;return {initialize:()=>init.promise,estimate:async image=>({...inference(),bitmap:image}),dispose:()=>shutdown.promise};}});
  const settings={delegate:'CPU' as const,detection:0.5,presence:0.5,tracking:0.5},first=processor.run(c,'/local/','model.task',settings);await settle();const cancelled=processor.cancel();
  const second=processor.run(c,'/local/','model.task',settings);await settle();assert.equal(created,1,'no new worker until cleanup resolves');
  init.resolve({delegate:'CPU',fallback:null});shutdown.resolve();await cancelled;assert.equal(await first,null);assert.ok(await second);assert.equal(created,2);
});
test('cancellation during final worker cleanup fences an otherwise completed RGB cache',async()=>{
 const c=await clip(),shutdown=deferred<void>();let disposing=false;
 const processor=new Reprocessor({now:()=>10,decode:async()=>bitmap().value,estimator:()=>({initialize:async()=>({delegate:'CPU',fallback:null}),estimate:async image=>({...inference(),bitmap:image}),dispose:()=>{disposing=true;return shutdown.promise;}})});
 const result=processor.run(c,'/local/','model.task',{delegate:'CPU',detection:0.5,presence:0.5,tracking:0.5});for(let i=0;i<100&&!disposing;i++)await settle();assert.ok(disposing);
 const stopped=processor.cancel();shutdown.resolve();await stopped;assert.equal(await result,null);assert.equal(processor.snapshot().state,'cancelled');
});
test('model failures dispose the worker and leave original observations intact',async()=>{
  const c=await clip();let disposed=0;
  const processor=new Reprocessor({now:()=>10,decode:async()=>bitmap().value,estimator:()=>({initialize:async()=>{throw new Error('model failed');},estimate:async image=>({...inference(),bitmap:image}),dispose:async()=>{disposed++;}})});
  await assert.rejects(processor.run(c,'/local/','model.task',{delegate:'CPU',detection:0.5,presence:0.5,tracking:0.5}),/model failed/);assert.equal(disposed,1);assert.equal(processor.snapshot().state,'error');assert.equal(c.frames.length,3);
});
