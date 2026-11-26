import type { Point } from '../contracts.ts';
import { depthAt, type Calibration, type Packet, type WireFrame } from './protocol.ts';
import { alignedPoint, projectPoint, type CameraGeometry, type Pixel } from './geometry.ts';
export interface DepthSettings {radius:number;minCoverage:number;minSupport:number;minDepthM:number;maxDepthM:number;maxSpreadM:number;maxMadM:number;maxCenterDeltaM:number;palmBandM:number;maxBoneM:number;maxSpeedMps:number;jumpSlackM:number;historyMs:number;maxPairSkewMs:number}
export const DEPTH_DEFAULTS:Readonly<DepthSettings>=Object.freeze({radius:2,minCoverage:0.72,minSupport:9,minDepthM:0.15,maxDepthM:3,maxSpreadM:0.04,maxMadM:0.01,maxCenterDeltaM:0.025,palmBandM:0.18,maxBoneM:0.18,maxSpeedMps:3,jumpSlackM:0.04,historyMs:250,maxPairSkewMs:50});
export type InvalidReason='no-image-point'|'off-image'|'missing-depth'|'insufficient-support'|'depth-range'|'depth-edge'|'depth-noise'|'center-disagreement'|'unsupported-calibration'|'pair-clock-unverified'|'pair-skew'|'aligned-stamp-mismatch'|'frame-order'|'no-palm-anchor'|'palm-depth-mismatch'|'long-bone'|'motion-jump';
export interface DepthSample {readonly centerRaw:number|null;readonly medianRaw:number|null;readonly support:number;readonly total:number;readonly coverage:number;readonly spreadM:number|null;readonly madM:number|null}
export interface MeasuredJoint {readonly valid:boolean;readonly point:Point|null;readonly pixel:Pixel|null;readonly reason:InvalidReason|null;readonly sample:DepthSample|null;readonly reprojectionPx:number|null;readonly provenance:'sdk-aligned-surface';}
const median=(v:readonly number[])=>v[Math.floor(v.length/2)];
export function invalid(reason:InvalidReason,pixel:Pixel|null=null,sample:DepthSample|null=null):MeasuredJoint {return Object.freeze({valid:false,point:null,pixel,reason,sample,reprojectionPx:null,provenance:'sdk-aligned-surface'});}
/** Calibrated static surface probe, independent of hand reconstruction. */
export function samplePoint(packet:Packet,calibration:Calibration,geometry:CameraGeometry,pixel:Pixel|null,s:DepthSettings=DEPTH_DEFAULTS):MeasuredJoint {
  if(!pixel)return invalid('no-image-point');
  if(!Number.isFinite(pixel.x)||!Number.isFinite(pixel.y)||pixel.x<0||pixel.x>=packet.width||pixel.y<0||pixel.y>=packet.height)return invalid('off-image',pixel);
  const x=Math.floor(pixel.x),y=Math.floor(pixel.y),center=depthAt(packet,'aligned',x,y);if(center===null)return invalid('missing-depth',pixel);
  const values:number[]=[];let total=0;
  for(let dy=-s.radius;dy<=s.radius;dy++)for(let dx=-s.radius;dx<=s.radius;dx++){
    const px=x+dx,py=y+dy;if(px<0||px>=packet.width||py<0||py>=packet.height)continue;total++;const raw=depthAt(packet,'aligned',px,py);
    if(raw!==null&&raw*calibration.depthScaleMeters>=s.minDepthM&&raw*calibration.depthScaleMeters<=s.maxDepthM)values.push(raw);
  }
  values.sort((a,b)=>a-b);const med=values.length?median(values):null,coverage=values.length/total,scale=calibration.depthScaleMeters;
  const spread=values.length?(values[Math.floor((values.length-1)*0.9)]-values[Math.floor((values.length-1)*0.1)])*scale:null;
  const mad=med===null?null:median(values.map(v=>Math.abs(v-med)).sort((a,b)=>a-b))*scale;
  const sample:DepthSample=Object.freeze({centerRaw:center,medianRaw:med,support:values.length,total,coverage,spreadM:spread,madM:mad});
  if(center*scale<s.minDepthM||center*scale>s.maxDepthM)return invalid('depth-range',pixel,sample);
  if(coverage<s.minCoverage||values.length<Math.min(s.minSupport,total)||med===null)return invalid('insufficient-support',pixel,sample);
  if(spread!>s.maxSpreadM)return invalid('depth-edge',pixel,sample);
  if(mad!>s.maxMadM)return invalid('depth-noise',pixel,sample);
  if(Math.abs(center-med)*scale>s.maxCenterDeltaM)return invalid('center-disagreement',pixel,sample);
  const point=alignedPoint(geometry,pixel,med*scale);if(!point||point.z<s.minDepthM||point.z>s.maxDepthM)return invalid('depth-range',pixel,sample);
  const projected=projectPoint(geometry,point)!;
  return Object.freeze({valid:true,point,pixel:Object.freeze({...pixel}),reason:null,sample,reprojectionPx:Math.hypot(projected.x-pixel.x,projected.y-pixel.y),provenance:'sdk-aligned-surface'});
}
export function pairing(wire:WireFrame,maxSkew:number):{reason:InvalidReason|null;skew:number|null}{
  if(wire.depth.number!==wire.alignedDepth.number||wire.depth.timestampMs!==wire.alignedDepth.timestampMs||wire.depth.domain!==wire.alignedDepth.domain)return {reason:'aligned-stamp-mismatch',skew:null};
  if(wire.color.domain!==wire.depth.domain||!['System Time','Global Time'].includes(wire.color.domain))return {reason:'pair-clock-unverified',skew:null};
  const skew=Math.abs(wire.color.timestampMs-wire.depth.timestampMs);return {reason:skew>maxSkew?'pair-skew':null,skew};
}
