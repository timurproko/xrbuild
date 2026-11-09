// Shared browser/Node wire contract. No SDK, Node, renderer or camera dependencies.
import {BASELINE,MAX_PIXELS,captureProfile,profileKey} from './profiles.ts';
export const RGBD = Object.freeze({ version:1, header:24, jsonBytes:65536, width:640, height:480, fps:30,
  rgbBytes:640*480*3, depthBytes:640*480*2, packetBytes:8*1024*1024, protocol:'handtracking-rgbd-v1' });
export type DepthSpace = 'aligned' | 'native';
export interface Intrinsics { width:number; height:number; fx:number; fy:number; cx:number; cy:number; distortion:string; coefficients:number[] }
export interface Profile { stream:string; encoding:string; width:number; height:number; fps:number }
export interface Device { serial:string; name:string; firmware:string; usb:string; supportsBaseline:boolean; profiles:Profile[] }
export interface GeometrySemantics {version:1;alignedPixelFrame:'color-optical';alignedValue:'original-depth-optical-z'}
export interface Calibration {
  type:'hello'; sdkVersion:string; serial:string; name:string; firmware:string; usb:string; depthScaleMeters:number;
  color:Profile; depth:Profile; colorIntrinsics:Intrinsics; depthIntrinsics:Intrinsics; alignedDepthIntrinsics:Intrinsics;
  depthToColor:{rotationColumnMajor:number[];translationMeters:number[]}; alignment:string; pairing:string; nativeClock:string;
  geometry?:GeometrySemantics; // Older Stage 3 bridges remain inspectable, but cannot reconstruct metric points.
}
export interface DeviceStamp { number:number; timestampMs:number; domain:string; sensorTimestampUs:number|null; readoutTimestampUs:number|null; actualExposureUs:number|null }
export interface MarkerDetection {id:number;hamming:number;margin:number;corners:readonly {x:number;y:number}[]}
export interface MarkerFrame {version:1;family:'tag36h11';detector:'apriltag-3.4.5';colorFrame:number;detections:readonly MarkerDetection[]}
export interface NativeFrame {
  profile?:string;marker?:MarkerFrame;
  type:'frame'; sequence:number; nativeReceiveMs:number; nativeAlignedMs:number; nativeSendMs:number;
  color:DeviceStamp; depth:DeviceStamp; alignedDepth:DeviceStamp; colorGaps:number; depthGaps:number; colorRepeats:number; depthRepeats:number;
}
export interface WireFrame extends NativeFrame {
  runId:string; bridgeReceiveMs:number; bridgeSendMs:number; bridgeOriginMs:number; clientBusyDrops:number;
}
export interface Packet { width:number;height:number;buffer:ArrayBuffer; meta:Record<string,unknown>; rgbOffset:number; depthOffset:number; alignedOffset:number; rgbBytes:number; depthBytes:number; alignedBytes:number }
export function requireValue(condition:unknown,message:string):asserts condition { if(!condition)throw new Error(`RGB-D protocol: ${message}`); }
export function record(value:unknown):Record<string,unknown> { requireValue(value && typeof value==='object' && !Array.isArray(value),'object required');return value as Record<string,unknown>; }
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
const text=(v:unknown,max=512):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
export function validSerial(value:unknown):value is string { return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value); }
function profile(value:unknown,encoding?:string):void { const v=record(value);requireValue(text(v.stream,32)&&text(v.encoding,32)&&integer(v.width)&&integer(v.height)&&v.width>0&&v.height>0&&v.width*v.height<=3840*2160&&integer(v.fps)&&v.fps>0&&v.fps<=300,'stream profile');if(encoding){captureProfile(profileKey(v as unknown as Profile));requireValue(v.encoding===encoding,'unsupported RGB-D encoding');} }
function intrinsics(value:unknown):void {
  const v=record(value);requireValue(integer(v.width)&&integer(v.height)&&(v.width as number)>=160&&(v.width as number)<=1280&&(v.height as number)>=120&&(v.height as number)<=720&&finite(v.fx)&&v.fx>0&&finite(v.fy)&&v.fy>0&&finite(v.cx)&&finite(v.cy)&&text(v.distortion,64),'intrinsics');
  requireValue(Array.isArray(v.coefficients)&&v.coefficients.length===5&&v.coefficients.every(finite),'distortion coefficients');
}
export function validateDevices(value:unknown):asserts value is {sdkVersion:string;devices:Device[]} {
  const v=record(value);requireValue(text(v.sdkVersion,32)&&Array.isArray(v.devices)&&v.devices.length<=16,'device list');const ids=new Set<string>();
  for(const value of v.devices) {const d=record(value);requireValue(validSerial(d.serial)&&!ids.has(d.serial)&&text(d.name)&&text(d.firmware)&&text(d.usb)&&typeof d.supportsBaseline==='boolean'&&Array.isArray(d.profiles)&&d.profiles.length<=1024,'device');ids.add(d.serial);d.profiles.forEach(p=>profile(p));}
}
export function validateCalibration(value:unknown):asserts value is Calibration {
  const v=record(value);requireValue(v.type==='hello'&&validSerial(v.serial)&&text(v.sdkVersion,32)&&text(v.name)&&text(v.firmware)&&text(v.usb),'calibration identity');
  requireValue(finite(v.depthScaleMeters)&&v.depthScaleMeters>0&&v.depthScaleMeters<=0.1,'depth units');profile(v.color,'RGB8');profile(v.depth,'Z16');
  const c=record(v.color),d=record(v.depth);requireValue(c.width===d.width&&c.height===d.height&&c.fps===d.fps,'RGB/depth profiles must match');for(const key of ['colorIntrinsics','depthIntrinsics','alignedDepthIntrinsics']){intrinsics(v[key]);const i=record(v[key]);requireValue(i.width===c.width&&i.height===c.height,'profile/intrinsics dimensions');}
  const ex=record(v.depthToColor);requireValue(Array.isArray(ex.rotationColumnMajor)&&ex.rotationColumnMajor.length===9&&ex.rotationColumnMajor.every(finite)&&Array.isArray(ex.translationMeters)&&ex.translationMeters.length===3&&ex.translationMeters.every(finite),'depth-to-color extrinsics');
  requireValue(text(v.alignment)&&text(v.pairing)&&text(v.nativeClock),'alignment/pairing/clock provenance');
  if(v.geometry!==undefined){const g=record(v.geometry);requireValue(g.version===1&&g.alignedPixelFrame==='color-optical'&&g.alignedValue==='original-depth-optical-z','unsupported geometry semantics');}
}
export function validateNativeFrame(value:unknown):asserts value is NativeFrame {
  const v=record(value);requireValue(v.type==='frame'&&integer(v.sequence)&&v.sequence>0,'sequence');const shape=captureProfile(v.profile??BASELINE);
  for(const key of ['nativeReceiveMs','nativeAlignedMs','nativeSendMs'])requireValue(finite(v[key])&&(v[key] as number)>=0,'native clock');
  requireValue((v.nativeAlignedMs as number)>=(v.nativeReceiveMs as number)&&(v.nativeSendMs as number)>=(v.nativeAlignedMs as number),'native clock order');
  for(const key of ['color','depth','alignedDepth']) {const s=record(v[key]);requireValue(integer(s.number)&&finite(s.timestampMs)&&text(s.domain,64),'device stamp');
    for(const field of ['sensorTimestampUs','readoutTimestampUs','actualExposureUs'])requireValue(s[field]===null||Number.isSafeInteger(s[field]),'raw sensor metadata');}
  for(const key of ['colorGaps','depthGaps','colorRepeats','depthRepeats'])requireValue(integer(v[key]),'source counters');
  if(v.marker!==undefined){const m=record(v.marker);requireValue(m.version===1&&m.family==='tag36h11'&&m.detector==='apriltag-3.4.5'&&m.colorFrame===record(v.color).number&&Array.isArray(m.detections)&&m.detections.length<=16,'marker schema/source frame');for(const value of m.detections){const d=record(value);requireValue(integer(d.id)&&d.id<587&&integer(d.hamming)&&d.hamming<=1&&finite(d.margin)&&d.margin>=0&&d.margin<=1000&&Array.isArray(d.corners)&&d.corners.length===4,'marker detection');for(const value of d.corners){const p=record(value);requireValue(finite(p.x)&&finite(p.y)&&p.x>=0&&p.x<shape.width&&p.y>=0&&p.y<shape.height,'marker corner');}}}
}
export function validateWireFrame(value:unknown):asserts value is WireFrame {
  validateNativeFrame(value);const v=record(value);requireValue(text(v.runId,128)&&finite(v.bridgeReceiveMs)&&finite(v.bridgeSendMs)&&finite(v.bridgeOriginMs)&&v.bridgeReceiveMs>=0&&v.bridgeSendMs>=v.bridgeReceiveMs&&v.bridgeOriginMs>=0&&integer(v.clientBusyDrops),'bridge clocks/counters');
}
export function packetSize(header:Uint8Array):number {
  requireValue(header.byteLength===RGBD.header,'header length');const v=new DataView(header.buffer,header.byteOffset,header.byteLength);
  requireValue(header[0]===88&&header[1]===82&&header[2]===66&&header[3]===51&&v.getUint16(4,true)===1&&v.getUint16(6,true)===0,'magic/version/flags');
  const json=v.getUint32(8,true),rgb=v.getUint32(12,true),depth=v.getUint32(16,true),aligned=v.getUint32(20,true);
  requireValue(json>0&&json<=RGBD.jsonBytes&&rgb<=MAX_PIXELS*3&&depth<=MAX_PIXELS*2&&aligned<=MAX_PIXELS*2,'payload length limit');
  const size=RGBD.header+json+rgb+depth+aligned;requireValue(size<=RGBD.packetBytes,'packet limit');return size;
}
export function parsePacket(buffer:ArrayBuffer):Packet {
  requireValue(buffer.byteLength>=RGBD.header&&buffer.byteLength<=RGBD.packetBytes,'packet size');
  requireValue(packetSize(new Uint8Array(buffer,0,24))===buffer.byteLength,'truncated/trailing payload');
  const view=new DataView(buffer),jsonSize=view.getUint32(8,true),rgbBytes=view.getUint32(12,true),depthBytes=view.getUint32(16,true),alignedBytes=view.getUint32(20,true);
  let meta:Record<string,unknown>;try {meta=record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buffer,24,jsonSize))));}catch {throw new Error('RGB-D protocol: malformed metadata JSON/UTF-8');}
  const shape=meta.type==='frame'?captureProfile(meta.profile??BASELINE):captureProfile(BASELINE);return {width:shape.width,height:shape.height,buffer,meta,rgbOffset:24+jsonSize,depthOffset:24+jsonSize+rgbBytes,alignedOffset:24+jsonSize+rgbBytes+depthBytes,rgbBytes,depthBytes,alignedBytes};
}
export function validateFramePlanes(p:Packet,expected?:string):void {const shape=captureProfile(p.meta.profile??BASELINE);if(expected)requireValue(profileKey(shape)===expected,'capture/frame profile mismatch');requireValue(p.width===shape.width&&p.height===shape.height&&p.rgbBytes===p.width*p.height*3&&p.depthBytes===p.width*p.height*2&&p.alignedBytes===p.width*p.height*2,'complete RGB + native/aligned Z16 planes required');}
export function framePacket(buffer:ArrayBuffer):Packet & {meta:WireFrame} {
  const p=parsePacket(buffer);validateWireFrame(p.meta);validateFramePlanes(p);return {...p,meta:p.meta};
}
export function encodePacket(meta:unknown,rgb=new Uint8Array(),depth=new Uint8Array(),aligned=new Uint8Array()):Uint8Array {
  const json=new TextEncoder().encode(JSON.stringify(meta));requireValue(json.length>0&&json.length<=RGBD.jsonBytes&&rgb.length<=MAX_PIXELS*3&&depth.length<=MAX_PIXELS*2&&aligned.length<=MAX_PIXELS*2,'encode length limit');
  const out=new Uint8Array(24+json.length+rgb.length+depth.length+aligned.length),v=new DataView(out.buffer);out.set([88,82,66,51,1,0,0,0]);
  [json.length,rgb.length,depth.length,aligned.length].forEach((n,i)=>v.setUint32(8+i*4,n,true));let offset=24;
  for(const bytes of [json,rgb,depth,aligned]) {out.set(bytes,offset);offset+=bytes.length;}return out;
}
export function depthAt(packet:Packet,space:DepthSpace,x:number,y:number):number|null {
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=packet.width||y<0||y>=packet.height)return null;
  const offset=space==='aligned'?packet.alignedOffset:packet.depthOffset;return new DataView(packet.buffer).getUint16(offset+(y*packet.width+x)*2,true)||null;
}
export function cursorPixel(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number},mirror:boolean,width=640,height=480):{x:number;y:number}|null {
  if(rect.width<=0||rect.height<=0)return null;let u=(clientX-rect.left)/rect.width;const v=(clientY-rect.top)/rect.height;
  if(u<0||u>1||v<0||v>1)return null;if(mirror)u=1-u;return {x:Math.min(width-1,Math.floor(u*width)),y:Math.min(height-1,Math.floor(v*height))};
}
/** NTP-style offset: target clock minus initiating clock, with transport uncertainty. Not sensor latency. */
export function clockSample(localSend:number,remoteReceive:number,remoteSend:number,localReceive:number) {
  const rtt=(localReceive-localSend)-(remoteSend-remoteReceive);
  requireValue([localSend,remoteReceive,remoteSend,localReceive,rtt].every(Number.isFinite)&&localReceive>=localSend&&remoteSend>=remoteReceive&&rtt>=-0.1,'clock exchange');
  return {offsetMs:(remoteReceive+remoteSend-localSend-localReceive)/2,uncertaintyMs:Math.max(0,rtt)/2,rttMs:Math.max(0,rtt)};
}
