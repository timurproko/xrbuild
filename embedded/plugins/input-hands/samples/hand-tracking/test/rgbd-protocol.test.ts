import test from 'node:test';import assert from 'node:assert/strict';
import {framePacket,parsePacket,packetSize,RGBD,depthAt,cursorPixel,clockSample,validateCalibration,validateDevices}from'../src/live/rgbd/protocol.ts';
import{rgbPixels,depthPixels,validateViewOptions}from'../src/live/rgbd/pixels.ts';
import{packet,calibration,devices}from'./rgbd-helpers.ts';
import{PacketReader}from'../bridge/native.mjs';
test('RGB8 and both Z16 planes round trip without eight-bit truncation or alignment assumptions',()=>{
  let bytes=packet(1,{padding:'x'});if(parsePacket(bytes.buffer).depthOffset%2===0)bytes=packet(1,{padding:'xx'});
  const p=framePacket(bytes.buffer);assert.equal(p.depthOffset%2,1,'exercise unaligned JSON-dependent byte offset');
  assert.equal(depthAt(p,'native',0,0),1234);assert.equal(depthAt(p,'aligned',0,0),4321);assert.equal(depthAt(p,'aligned',1,0),null);assert.equal(depthAt(p,'native',640,0),null);
  assert.equal(p.meta.color.domain,'FIXTURE');assert.equal(p.meta.color.sensorTimestampUs,null);assert.equal(p.rgbBytes,RGBD.rgbBytes);
});
test('wire parser rejects corrupt magic/version, truncation, lengths, clocks and incomplete planes',()=>{
  const bytes=packet();for(const offset of[0,4,6]){const b=bytes.slice();b[offset]^=1;assert.throws(()=>framePacket(b.buffer),/magic/);}
  assert.throws(()=>framePacket(bytes.slice(0,-1).buffer),/truncated/);
  const huge=bytes.slice(0,24);new DataView(huge.buffer).setUint32(8,0xffffffff,true);assert.throws(()=>packetSize(huge),/length limit/);
  assert.throws(()=>framePacket(packet(1,{nativeSendMs:99}).buffer),/clock order/);assert.throws(()=>framePacket(packet(0).buffer),/sequence/);
  const bad=bytes.slice();bad[24]=255;assert.throws(()=>framePacket(bad.buffer),/JSON\/UTF-8/);
});
test('calibration validation rejects guessed missing values, malformed transforms and unsupported profiles',()=>{
  validateCalibration(calibration());validateDevices(devices());
  for(const change of[{depthScaleMeters:0},{depthScaleMeters:null},{colorIntrinsics:{...calibration().colorIntrinsics,fx:NaN}},{color:{...calibration().color,width:1280}},{depthToColor:{rotationColumnMajor:[],translationMeters:[]}}])assert.throws(()=>validateCalibration({...calibration(),...change}),/RGB-D protocol/);
  assert.throws(()=>validateDevices({...devices(),devices:[devices().devices[0],devices().devices[0]]}),/device/);
});
test('pixel preparation keeps RGB channels, reports missing depth separately and never fills holes',()=>{
  const p=framePacket(packet().buffer),rgba=new Uint8ClampedArray(640*480*4);rgbPixels(p,rgba);assert.deepEqual([...rgba.slice(0,4)],[12,34,56,255]);
  const view={space:'native' as const,mask:false,near:0.1,far:5,scale:0.001};assert.equal(depthPixels(p,view,rgba),1);assert.deepEqual([...rgba.slice(4,8)],[255,0,255,255]);
  assert.equal(depthPixels(p,{...view,mask:true},rgba),1);assert.deepEqual([...rgba.slice(0,4)],[24,24,24,255]);assert.equal(depthAt(p,'native',0,0),1234);
  assert.throws(()=>validateViewOptions({...view,near:5,far:2}),/settings/);assert.throws(()=>depthPixels(p,{...view,scale:NaN},rgba),/scale/);
});
test('mirrored cursor maps CSS coordinates back to unmirrored native pixels',()=>{
  const rect={left:10,top:20,width:320,height:240};assert.deepEqual(cursorPixel(10,20,rect,false),{x:0,y:0});assert.deepEqual(cursorPixel(10,20,rect,true),{x:639,y:0});
  assert.deepEqual(cursorPixel(330,260,rect,true),{x:0,y:479});assert.equal(cursorPixel(9,20,rect,false),null);assert.equal(cursorPixel(10,20,{...rect,width:0},false),null);
});
test('clock exchange measures offset plus uncertainty, not invented sensor latency',()=>{
  assert.deepEqual(clockSample(100,112,114,106),{offsetMs:10,uncertaintyMs:2,rttMs:4});assert.throws(()=>clockSample(100,110,200,102),/clock exchange/);
});
test('native IPC reader handles arbitrary splits/coalescing with one bounded packet buffer',()=>{
  const packets:any[]=[],errors:Error[]=[],reader=new PacketReader(p=>packets.push(p),e=>errors.push(e)),bytes=packet();
  for(let offset=0;offset<bytes.length;offset+=173)reader.push(bytes.subarray(offset,offset+173));reader.push(bytes);reader.end();assert.equal(packets.length,2);assert.deepEqual(errors,[]);assert.equal(reader.body,null);
});
test('native IPC rejects oversized/truncated headers before allocating or accepting media',()=>{
  const errors:Error[]=[],reader=new PacketReader(()=>assert.fail('must not accept'),e=>errors.push(e)),bad=packet().slice(0,24);new DataView(bad.buffer).setUint32(12,0xffffffff,true);reader.push(bad);assert.equal(errors.length,1);assert.equal(reader.body,null);
  const partial=new PacketReader(()=>assert.fail('partial packet'),e=>errors.push(e));partial.push(new Uint8Array([88]));partial.end();assert.equal(errors.length,2);
});
