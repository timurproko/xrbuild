import test from 'node:test';import assert from 'node:assert/strict';
import { DepthComparator, depthReport } from '../src/live/recording/depth-comparison.ts';import { DEPTH_DEFAULTS } from '../src/live/rgbd/reconstruction.ts';import { depthClip } from './depth-recording-helpers.ts';
const geometry=(frames:readonly unknown[])=>JSON.stringify(frames,(_key,value)=>_key==='elapsedMs'?0:value);
test('depth A/B consumes identical stored frames sequentially with fresh history and immutable original poses',async()=>{
 const clip=await depthClip(),before=JSON.stringify(clip.frames.map(f=>f.meta)),cmp=new DepthComparator(),a=await cmp.run(clip,{...DEPTH_DEFAULTS}),b=await cmp.run(clip,{...DEPTH_DEFAULTS});assert.ok(a&&b);
 assert.equal(a.a.length,3);assert.equal(geometry(a.a),geometry(a.b));assert.equal(geometry(a.a),geometry(b.a));assert.equal(a.contentSha256,b.contentSha256);assert.equal(before,JSON.stringify(clip.frames.map(f=>f.meta)));
 assert.ok(a.a[0].hands.some(h=>h.valid>0));assert.ok(a.a[1].hands.every(h=>h.valid===0));assert.ok(a.a[2].hands.some(h=>h.valid>0));
 const changed=await cmp.run(clip,{...DEPTH_DEFAULTS,maxDepthM:0.8});assert.ok(changed);assert.equal(geometry(changed.a),geometry(a.a));assert.ok(changed.b.every(f=>f.hands.every(h=>h.valid===0)));assert.deepEqual(cmp.snapshot(),{state:'complete',completed:3,total:3});
});
test('depth report exports scalar denominators, timing qualifications and provenance, never images/raw poses or fabricated accuracy',async()=>{
 const clip=await depthClip(),cache=await new DepthComparator().run(clip,{...DEPTH_DEFAULTS});assert.ok(cache);const report=depthReport(clip,cache);
 assert.equal(report.a.processedFrames,3);assert.equal(report.a.landmarkSamples,clip.frames.reduce((n,f)=>n+(f.meta.observation?.hands.length??0)*21,0));
 assert.equal(report.timeline.length,3);assert.equal(report.visibilityAnnotatedAvailability,null);assert.equal(report.stationaryJitter,null);assert.equal(report.accuracy,null);assert.equal(report.captureTiming.captureToPhotonMs,null);
 assert.equal(report.captureTiming.maxBridgePageUncertaintyMs,2);assert.match(report.contentSha256,/^[a-f0-9]{64}$/);assert.ok(report.a.rejections['missing-depth']>0);
 const text=JSON.stringify(report);for(const name of ['worldLandmarks','image-normalized','packetSha256','deflate-xrb3','auth.'])assert.equal(text.includes(name),false);
});
test('no-model comparison reports unavailable denominators, not a 0% tracking-accuracy result',async()=>{
 const clip=await depthClip(false),cache=await new DepthComparator().run(clip,{...DEPTH_DEFAULTS});assert.ok(cache);const report=depthReport(clip,cache);assert.equal(report.a.landmarkSamples,0);assert.equal(report.a.acceptedFraction,null);assert.equal(report.a.modelObservationFrames,0);
});
test('clip content identity includes original observation/timing metadata, not only media hashes',async()=>{
 const clip=await depthClip(),cmp=new DepthComparator(),a=await cmp.run(clip,{...DEPTH_DEFAULTS});
 const changed={...clip,frames:[{...clip.frames[0],meta:{...clip.frames[0].meta,pixelMs:99}},...clip.frames.slice(1)]};
 const b=await cmp.run(changed,{...DEPTH_DEFAULTS});assert.ok(a&&b);assert.equal(geometry(a.a),geometry(b.a));assert.notEqual(a.contentSha256,b.contentSha256);
});
test('comparison cancellation suppresses late completion and configuration errors do not alter clips',async()=>{
 const clip=await depthClip(),cmp=new DepthComparator(),pending=cmp.run(clip,{...DEPTH_DEFAULTS});cmp.cancel();assert.equal(await pending,null);assert.equal(cmp.snapshot().state,'cancelled');
 await assert.rejects(cmp.run(clip,{...DEPTH_DEFAULTS,radius:99}),/settings/);assert.ok(await cmp.run(clip,{...DEPTH_DEFAULTS}));
});
