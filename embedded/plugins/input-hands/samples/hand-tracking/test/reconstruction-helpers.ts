import {calibration,wire}from'./rgbd-helpers.ts';import{encodePacket,framePacket,RGBD,type Calibration,type WireFrame}from'../src/live/rgbd/protocol.ts';
import{observation}from'./recording-helpers.ts';
export function metricCalibration():Calibration{return {...calibration(),geometry:{version:1,alignedPixelFrame:'color-optical',alignedValue:'original-depth-optical-z'}};}
export function plane(sequence=1,raw=1000,options:{patch?:(depth:DataView)=>void;meta?:Partial<WireFrame>}={}){
 const depth=new Uint8Array(RGBD.depthBytes),aligned=new Uint8Array(RGBD.depthBytes),d=new DataView(depth.buffer),a=new DataView(aligned.buffer);for(let i=0;i<640*480;i++){d.setUint16(i*2,raw,true);a.setUint16(i*2,raw,true);}options.patch?.(a);
 const m=wire(sequence);for(const stamp of[m.color,m.depth,m.alignedDepth])stamp.domain='System Time';m.nativeReceiveMs=1000+sequence*33;m.nativeAlignedMs=m.nativeReceiveMs+1;m.nativeSendMs=m.nativeReceiveMs+2;
 return framePacket(encodePacket({...m,...options.meta},new Uint8Array(RGBD.rgbBytes),depth,aligned).buffer);
}
export const model=()=>observation(200);
export function patch(view:DataView,x:number,y:number,radius:number,fn:(dx:number,dy:number)=>number){for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)view.setUint16(((y+dy)*640+x+dx)*2,fn(dx,dy),true);}
