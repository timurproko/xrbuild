import test from 'node:test';import assert from 'node:assert/strict';
import { exportDepthClip, importDepthClip, decodeDepthFrame, compressPacket, decompressPacket, isDepthClip, validateDepthInput } from '../src/live/recording/depth-format.ts';
import { exportClip, importClip, LIMITS,header,json } from '../src/live/recording/format.ts';
import {LEGACY_DEPTH_MAGIC,LEGACY_RECORDING_FORMAT} from '../src/live/legacy.ts';
import { depthClip, depthInput } from './depth-recording-helpers.ts';import { plane } from './reconstruction-helpers.ts';import { clip as rgbClip } from './recording-helpers.ts';
test('RGB-D v2 round trip preserves every RGB8/native/aligned Z16 byte, calibration, original pose and signed zero',async()=>{
 const original=await depthClip(),file=exportDepthClip(original);assert.equal(await isDepthClip(file),true);const imported=await importDepthClip(file);
 assert.deepEqual(imported.manifest,original.manifest);assert.ok(Object.isFrozen(imported.manifest.calibration.depthToColor.rotationColumnMajor));
 for(let i=0;i<3;i++){assert.deepEqual(imported.frames[i].meta,original.frames[i].meta);const p=await decodeDepthFrame(imported.frames[i]);assert.deepEqual(p.buffer,plane(i+1,i===1?0:1000).buffer);assert.equal(p.depthBytes,640*480*2);assert.equal(p.alignedBytes,p.depthBytes);}
 assert.equal(imported.frames[0].meta.observation?.timing.mediaTimeMs,undefined);assert.equal(imported.frames[0].meta.pageClock?.uncertaintyMs,2);
 assert.deepEqual(await exportDepthClip(imported).arrayBuffer(),await file.arrayBuffer());
});
test('legacy RGB-D recordings remain readable but normalize and export with canonical identifiers',async()=>{
 const original=await depthClip(),file=exportDepthClip(original),prefix=await file.slice(0,12).arrayBuffer(),size=new DataView(prefix).getUint32(8,true),manifest=JSON.parse(await file.slice(12,12+size).text());manifest.format=LEGACY_RECORDING_FORMAT;
 const imported=await importDepthClip(new Blob([LEGACY_DEPTH_MAGIC,header(json(manifest).size),json(manifest),file.slice(12+size)]));assert.equal(imported.manifest.format,'xrbuild-hand-tracking');assert.equal(await exportDepthClip(original).slice(0,8).text(),'XRBHTRK2');
});
test('RGB v1 remains readable and is never relabeled RGB-D',async()=>{
 const original=await rgbClip(),file=exportClip(original);assert.equal(await isDepthClip(file),false);assert.deepEqual((await importClip(file)).manifest,original.manifest);
 await assert.rejects(importDepthClip(file),/magic/);await assert.rejects(importClip(exportDepthClip(await depthClip())),/magic/);
});
test('depth-only recording preserves null observations without fabricated media clock or model detections',async()=>{
 const c=await importDepthClip(exportDepthClip(await depthClip(false)));assert.equal(c.manifest.backend.delegate,null);assert.ok(c.frames.every(f=>f.meta.observation===null));
 const v=depthInput();v.observation!.timing.mediaTimeMs=1;assert.throws(()=>validateDepthInput(v),/media-time/);
});
test('RGB-D importer rejects truncated, trailing, oversized, corrupt compressed data and wrong integrity hash',async()=>{
 const c=await depthClip(),file=exportDepthClip(c);await assert.rejects(importDepthClip(file.slice(0,file.size-1)),/truncated/);
 await assert.rejects(importDepthClip(new Blob([file,'x'])),/trailing/);await assert.rejects(importDepthClip(new Blob([new Uint8Array(LIMITS.bytes+1)])),/size/);
 const wrong={...c,frames:[{...c.frames[0],meta:{...c.frames[0].meta,packetSha256:'0'.repeat(64)}},...c.frames.slice(1)]};await assert.rejects(importDepthClip(exportDepthClip(wrong)),/integrity/);
 await assert.rejects(importDepthClip(exportDepthClip({...c,frames:[{...c.frames[0],data:new Blob(['not deflate'])},...c.frames.slice(1)]})));
});
test('decompression enforces output length before accepting a bomb or malformed packet',async()=>{
 const data=await compressPacket(new Blob([new Uint8Array(1024*1024)]));await assert.rejects(decompressPacket(data,24),/output limit/);
 await assert.rejects(decompressPacket(data,2*1024*1024),/length/);await assert.rejects(decompressPacket(data,24,()=>true),/cancelled/);
});
test('RGB-D import rejects forged timeline, calibration/source, model provenance and packet ordering',async()=>{
 const c=await depthClip(),badTime={...c,frames:[c.frames[0],{...c.frames[1],meta:{...c.frames[1].meta,relativeMs:0}},c.frames[2]]};await assert.rejects(importDepthClip(exportDepthClip(badTime)),/timeline/);
 await assert.rejects(importDepthClip(exportDepthClip({...c,manifest:{...c.manifest,source:{...c.manifest.source,id:'rgbd:other:run'}}})),/identity/);
 await assert.rejects(importDepthClip(exportDepthClip({...c,frames:[{...c.frames[0],meta:{...c.frames[0].meta,observation:null}},...c.frames.slice(1)]})),/model/);
 const reordered={...c,frames:[c.frames[0],{...c.frames[0],meta:{...c.frames[1].meta,packetSha256:c.frames[0].meta.packetSha256,packetBytes:c.frames[0].meta.packetBytes}},c.frames[2]]};await assert.rejects(importDepthClip(exportDepthClip(reordered)),/order/);
 const bad=structuredClone(c.manifest);bad.calibration.depthScaleMeters=0;assert.throws(()=>exportDepthClip({...c,manifest:bad}),/depth units/);
});
test('RGB-D import cancellation publishes no clip',async()=>{const file=exportDepthClip(await depthClip());await assert.rejects(importDepthClip(file,()=>true),/cancelled/);});
