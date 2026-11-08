import test from 'node:test';import assert from 'node:assert/strict';
import { rgbDataset,depthDataset,benchmarkReport,exportAnnotations,importAnnotations } from '../src/live/bench/dataset.ts';
import { METRIC_DEFAULTS,type Interval } from '../src/live/bench/metrics.ts';
import { DepthComparator } from '../src/live/recording/depth-comparison.ts';import { DEPTH_DEFAULTS } from '../src/live/rgbd/reconstruction.ts';
import { exportClip,importClip,metadataHash } from '../src/live/recording/format.ts';
import { clip } from './recording-helpers.ts';import { depthClip } from './depth-recording-helpers.ts';
const annotation:Interval={id:'unit-label',start:0,end:2,visibility:'visible',expectedHands:1,stationary:true,note:'GENERATED ONLY'};
test('RGB and RGB-D benchmarks carry frame/configuration/provenance, metrics, units and scalar-only reports',async()=>{
 const rgb=await rgbDataset(await clip(),null),c=await depthClip(),cache=await new DepthComparator().run(c,{...DEPTH_DEFAULTS});assert.ok(cache);const depth=depthDataset(c,cache);
 for(const data of [rgb,depth]){const r=benchmarkReport(data,[annotation],{...METRIC_DEFAULTS});assert.equal(r.a.visibleFrames,3);assert.notEqual(r.a.timeWeightedAvailability,null);assert.equal(r.accuracy,null);assert.equal(r.captureToPhotonMs,null);assert.equal(r.a.stationary[0].joint,0);assert.equal(r.annotations[0].note,'GENERATED ONLY');
 const text=JSON.stringify(r);for(const key of ['worldLandmarks','landmarks','pngSha256','packetSha256','deflate-xrb3','image-normalized'])assert.equal(text.includes(`"${key}"`),false);assert.ok(!text.includes('data:image'));}
 assert.equal(rgb.frameA,'hand-relative');assert.equal(depth.frameA,'color-camera-metric');assert.equal(benchmarkReport(depth,[],{...METRIC_DEFAULTS}).timing.receiveToRender.samples,0);
});
test('annotations export/import is bounded, validated, content-bound and never loads camera/model media',async()=>{
 const data=await rgbDataset(await clip(),null),blob=exportAnnotations(data,[annotation],{...METRIC_DEFAULTS}),v=await importAnnotations(blob,data);assert.deepEqual(v,{annotations:[annotation],options:{...METRIC_DEFAULTS}});
 await assert.rejects(importAnnotations(blob,{...data,contentSha256:'0'.repeat(64)}),/mismatch/);await assert.rejects(importAnnotations(new Blob([new Uint8Array(65537)]),data),/64 KiB/);
 const parsed=JSON.parse(await blob.text());parsed.annotations[0].end=999;await assert.rejects(importAnnotations(new Blob([JSON.stringify(parsed)]),data),/annotation/i);
});
test('same input reports repeat exactly, while annotation/configuration changes cannot masquerade as an identical experiment',async()=>{
 const data=await rgbDataset(await clip(),null),a=benchmarkReport(data,[annotation],{...METRIC_DEFAULTS}),b=benchmarkReport(data,[annotation],{...METRIC_DEFAULTS});assert.deepEqual(a,b);
 const unknown=benchmarkReport(data,[],{...METRIC_DEFAULTS});assert.equal(unknown.a.timeWeightedAvailability,null);assert.notDeepEqual(a.annotations,unknown.annotations);
 const data2=await rgbDataset(await clip(),null);assert.equal(data.contentSha256,data2.contentSha256);
});
test('a disabled source model is unavailable, not a false zero-percent benchmark or fabricated jitter',async()=>{
 const c=await depthClip(false),cache=await new DepthComparator().run(c,{...DEPTH_DEFAULTS});assert.ok(cache);const r=benchmarkReport(depthDataset(c,cache),[annotation],{...METRIC_DEFAULTS});
 assert.equal(r.a.timeWeightedAvailability,null);assert.equal(r.a.trackedFrameFraction,null);assert.equal(r.a.visibleFrames,0);assert.equal(r.a.unavailableFrames,3);assert.ok(r.a.unknownUnavailableMs>0);assert.equal(r.a.timeline[0].state,'unavailable');assert.deepEqual(r.a.stationary,[]);
});
test('content identity survives RGB export/import key order and preserves signed-zero distinctions',async()=>{
 const c=await clip(),a=await rgbDataset(c,null),b=await rgbDataset(await importClip(exportClip(c)),null);assert.equal(a.contentSha256,b.contentSha256);
 assert.equal(await metadataHash({a:1,b:2}),await metadataHash({b:2,a:1}));assert.notEqual(await metadataHash({x:-0}),await metadataHash({x:0}));
});
test('presentation telemetry stays unknown on old clips and only comparable saved receive/render clocks produce durations',async()=>{
 const c=await depthClip();
 const saved={...c,frames:c.frames.map(f=>({...f,meta:{...f.meta,presentedPageMs:f.meta.receivedPageMs+42}}))};const cache=await new DepthComparator().run(saved,{...DEPTH_DEFAULTS});assert.ok(cache);const r=benchmarkReport(depthDataset(saved,cache),[],{...METRIC_DEFAULTS});assert.equal(r.timing.receiveToRender.samples,3);assert.equal(r.timing.receiveToRender.mean,42);assert.equal(r.sensorToHostMs,null);
});
