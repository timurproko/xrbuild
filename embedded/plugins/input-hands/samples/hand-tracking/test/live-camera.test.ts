import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeCameraDiscovery,CameraSource, cameraError, preferredRgb, incompatibleRgbLabel,virtualRgbLabel } from '../src/live/camera.ts';
import { Track, stream, video, device, deferred } from './live-helpers.ts';

test('RGB preference recognizes endpoint suffixes without a product-specific preference', () => {
  const depth = device('depth', 'Depth Camera M100 with RGB Module Depth');
  const rgb = device('rgb', 'Depth Camera M100 with RGB Module RGB (abcd:0123)');
  assert.equal(preferredRgb([depth, device('ir','Integrated IR Camera'), device('web','Studio Camera'), rgb])?.deviceId, 'rgb');
  assert.equal(preferredRgb([depth, device('web','Studio Camera')])?.deviceId, 'web');
});
test('IR/depth endpoint labels are incompatible with RGB inference without rejecting an RGB endpoint', () => {
  assert.equal(incompatibleRgbLabel('Depth Camera M100 with RGB Module RGB (abcd:0123)'),false);
  assert.equal(incompatibleRgbLabel('Depth Camera M100 with RGB Module Depth (abcd:0123)'),true);
  assert.equal(incompatibleRgbLabel('Integrated IR Camera'),true);
});
test('generic virtual camera labels are not presented as physical cameras',()=>{for(const label of ['Emulated Camera','Headset Camera','Virtual Camera'])assert.equal(virtualRgbLabel(label),true);for(const label of ['Integrated Camera','Depth Camera M100 with RGB Module RGB'])assert.equal(virtualRgbLabel(label),false);});
test('explicit browser camera authorization releases its temporary stream and returns named devices',async()=>{
  const track=new Track('temporary'),devices=[device('uvc','UVC Camera'),device('studio','Studio Camera'),device('integrated','Integrated Camera')];
  const found=await authorizeCameraDiscovery({getUserMedia:async constraints=>{assert.deepEqual(constraints,{audio:false,video:true});return stream(track);},enumerateDevices:async()=>devices});
  assert.deepEqual(found,devices);assert.equal(track.stops,1);
});
test('camera errors explain denial, unavailable devices and busy hardware without silent fallback', () => {
  assert.match(cameraError(new DOMException('', 'NotAllowedError')), /permission denied/i);
  assert.match(cameraError(new DOMException('', 'NotFoundError')), /unavailable/i);
  assert.match(cameraError(new DOMException('', 'NotReadableError')), /Close other/i);
});
test('twenty explicit camera starts/stops release tracks and clear video', async () => {
  const tracks: Track[] = []; const requests: MediaStreamConstraints[] = []; const view = video();
  const source = new CameraSource(view, { getUserMedia: async constraints => { requests.push(constraints!); const t = new Track('selected'); tracks.push(t); return stream(t); }, enumerateDevices: async () => [] }, () => {});
  for (let i = 0; i < 20; i++) { const info = await source.start('selected'); assert.equal(info.deviceId,'selected'); assert.equal(source.activeTracks,1); source.stop(); source.stop(); assert.equal(view.srcObject,null); }
  assert.ok(tracks.every(track => track.stops === 1)); assert.equal(source.activeTracks,0);
  assert.equal(requests[0].audio,false); assert.deepEqual((requests[0].video as MediaTrackConstraints).deviceId,{ exact: 'selected' });
});
test('an explicit RGB profile becomes exact media constraints',async()=>{let request:MediaStreamConstraints|undefined;const source=new CameraSource(video(),{getUserMedia:async constraints=>{request=constraints;return stream(new Track('selected'));},enumerateDevices:async()=>[]},()=>{});await source.start('selected',{width:640,height:480,frameRate:30});assert.deepEqual(request?.video,{deviceId:{exact:'selected'},width:{exact:640},height:{exact:480},frameRate:{exact:30}});source.stop();});
test('late permission results after cancellation are closed, not adopted', async () => {
  const pending = deferred<MediaStream>(); const track = new Track(); const view = video();
  const source = new CameraSource(view,{ getUserMedia: () => pending.promise, enumerateDevices: async () => [] },()=>{});
  const opening = source.start('chosen'); source.stop(); pending.resolve(stream(track));
  await assert.rejects(opening,{ name:'AbortError' }); assert.equal(track.stops,1); assert.equal(view.srcObject,null);
});
test('an older camera start cannot close a newer selected stream', async () => {
  const old = deferred<MediaStream>(), latest = deferred<MediaStream>(); let calls = 0;
  const source = new CameraSource(video(),{ getUserMedia: () => ++calls === 1 ? old.promise : latest.promise, enumerateDevices: async () => [] },()=>{});
  const first = source.start('old'), second = source.start('new'); const oldTrack = new Track('old'), newTrack = new Track('new');
  latest.resolve(stream(newTrack)); await second; old.resolve(stream(oldTrack)); await assert.rejects(first,{name:'AbortError'});
  assert.equal(oldTrack.stops,1); assert.equal(newTrack.stops,0); assert.equal(source.activeTracks,1); source.stop();
});
test('auto RGB preference releases the permission-acquisition stream before switching', async () => {
  const tracks = [new Track('default','Integrated Camera'),new Track('rgb','Depth Camera RGB')]; let calls = 0, enumerations = 0;
  const source = new CameraSource(video(),{ getUserMedia: async () => stream(tracks[calls++]), enumerateDevices: async () => ++enumerations === 1 ? [] : [device('rgb','Depth Camera RGB')] },()=>{});
  assert.equal((await source.start('')).deviceId,'rgb'); assert.equal(tracks[0].stops,1); assert.equal(tracks[1].stops,0); source.stop();
});
