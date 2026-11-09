import test from 'node:test';
import assert from 'node:assert/strict';
import { exportClip, importClip, LIMITS, pngDimensions, json } from '../src/live/recording/format.ts';
import { clip, png } from './recording-helpers.ts';
import {LEGACY_RECORDING_FORMAT,LEGACY_RGB_MAGIC} from '../src/live/legacy.ts';
// Deliberately bypass the exporter to exercise untrusted files, including invalid manifests.
function pack(manifest: unknown, frames: { meta: unknown; png: Blob }[],magic='XRBHTRK1'): Blob {
  const json = (v: unknown) => new Blob([JSON.stringify(v)]), header = (...values: number[]) => { const b = new ArrayBuffer(values.length*4), d = new DataView(b); values.forEach((v,i)=>d.setUint32(i*4,v,true)); return b; };
  const m = json(manifest), parts: BlobPart[] = [magic,header(m.size),m];
  for (const f of frames) { const meta = json(f.meta); parts.push(header(meta.size,f.png.size),meta,f.png); }
  return new Blob(parts);
}
test('lossless RGB container round trip retains raw points, empty observations, clocks, backend and gaps', async () => {
  const original = await clip(), restored = await importClip(exportClip(original));
  assert.deepEqual(restored.manifest,original.manifest);
  for (let i=0;i<3;i++) { assert.deepEqual(restored.frames[i].meta,original.frames[i].meta); assert.deepEqual(await restored.frames[i].png.arrayBuffer(),await original.frames[i].png.arrayBuffer()); }
  assert.equal(restored.frames[1].meta.observation.hands.length,0);
  assert.ok(Object.isFrozen(restored.frames[0].meta.observation.raw.landmarks[0][0]));
  assert.equal(restored.manifest.calibration,'unavailable'); assert.equal(restored.manifest.backend.delegate,'CPU'); assert.equal(restored.manifest.settings.delegate,'GPU');
});
test('legacy RGB recordings remain readable but export and imported manifests use the canonical identity',async()=>{
  const original=await clip(),legacy=await importClip(pack({...original.manifest,format:LEGACY_RECORDING_FORMAT},original.frames,LEGACY_RGB_MAGIC));
  assert.equal(legacy.manifest.format,'xrbuild-hand-tracking');
  assert.equal(await exportClip(original).slice(0,8).text(),'XRBHTRK1');
});
test('import rejects unsupported versions/streams and invented calibration', async () => {
  const c = await clip();
  for (const changes of [{version:2},{calibration:'identity'},{streams:[{kind:'depth',encoding:'z16le',width:1,height:1}]},{privateEvaluationOnly:false},{source:{...c.manifest.source,width:LIMITS.pixels+1}}])
    await assert.rejects(importClip(pack({...c.manifest,...changes},c.frames)),/Invalid recording/);
});
test('import bounds file/JSON/chunk lengths, rejects truncation, trailing bytes and wrong magic', async () => {
  const c = await clip(), file = exportClip(c), prefix = new Uint8Array(await file.slice(0,12).arrayBuffer());
  await assert.rejects(importClip(new Blob(['BADMAGIC',file.slice(8)])),/magic/);
  await assert.rejects(importClip(file.slice(0,file.size-1)),/truncated/);
  await assert.rejects(importClip(new Blob([file,'garbage'])),/trailing/);
  new DataView(prefix.buffer).setUint32(8,0xffffffff,true);
  await assert.rejects(importClip(new Blob([prefix,file.slice(12)])),/manifest length/);
  await assert.rejects(importClip(new Blob([new Uint8Array(LIMITS.bytes+1)])),/file size/);
  await assert.rejects(importClip(new Blob([LEGACY_RGB_MAGIC,new Uint8Array([1,0,0,0]),'{'])),/malformed/);
});
test('import verifies PNG dimensions/encoding and content hash before decoding', async () => {
  const c = await clip(), data = new Uint8Array(await c.frames[0].png.arrayBuffer()); data[data.length-5] ^= 1;
  await assert.rejects(importClip(pack(c.manifest,[{...c.frames[0],png:new Blob([data])},...c.frames.slice(1)])),/integrity hash/);
  await assert.rejects(pngDimensions(png(),2,1),/PNG profile/);
  await assert.rejects(pngDimensions(new Blob(['not an image']),1,1),/PNG size/);
});
test('import rejects invalid poses, mixed sources, bad timeline and clock provenance', async () => {
  const c = await clip();
  for (const modify of [
    (v: any) => { v.frames[0].meta.observation.raw.landmarks[0][0].x = null; },
    (v: any) => { v.frames[0].meta.observation.hands[0].relative.pop(); },
    (v: any) => { v.frames[0].meta.observation.sourceId = 'other'; },
    (v: any) => { v.frames[1].meta.relativeMs = 0; },
    (v: any) => { v.frames[0].meta.observation.timing.frameReadyPageMs = 99; },
    (v: any) => { v.frames[2].meta.relativeMs = 249; },
  ]) { const value = structuredClone(c); modify(value); await assert.rejects(importClip(pack(value.manifest,value.frames)),/Invalid recording/); }
});
test('JSON retains signed zero without confusing literal sentinel strings/keys', async () => {
  const value = { label: '__handtracking_negative_zero__', nested: { __handtracking_negative_zero___: -0 }, number: -0 };
  assert.deepEqual(JSON.parse(await json(value).text()),value);
});
test('import cancellation never returns a partial clip', async () => {
  const c = await clip(); await assert.rejects(importClip(exportClip(c),()=>true),{name:'AbortError'});
});
