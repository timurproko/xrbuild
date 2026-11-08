import { BONES,type LiveFrame,type Point } from '../contracts.ts';
import { depthAt,type Calibration,type Packet,type WireFrame } from './protocol.ts';
import { prepareGeometry,alignedPoint,imagePixel,projectPoint,type CameraGeometry,type Pixel } from './geometry.ts';
export const PALM=[0,5,9,13,17] as const;
export const TIPS=[4,8,12,16,20] as const;
export const JOINT_NAMES=['Wrist','Thumb CMC','Thumb MCP','Thumb IP','Thumb tip','Index MCP','Index PIP','Index DIP','Index tip','Middle MCP','Middle PIP','Middle DIP','Middle tip','Ring MCP','Ring PIP','Ring DIP','Ring tip','Little MCP','Little PIP','Little DIP','Little tip'] as const;
export interface DepthSettings {radius:number;minCoverage:number;minSupport:number;minDepthM:number;maxDepthM:number;maxSpreadM:number;maxMadM:number;maxCenterDeltaM:number;palmBandM:number;maxBoneM:number;maxSpeedMps:number;jumpSlackM:number;historyMs:number;maxPairSkewMs:number}
export const DEPTH_DEFAULTS:Readonly<DepthSettings>=Object.freeze({radius:2,minCoverage:0.72,minSupport:9,minDepthM:0.15,maxDepthM:3,maxSpreadM:0.04,maxMadM:0.01,maxCenterDeltaM:0.025,palmBandM:0.18,maxBoneM:0.18,maxSpeedMps:3,jumpSlackM:0.04,historyMs:250,maxPairSkewMs:50});
export type InvalidReason='no-image-point'|'off-image'|'missing-depth'|'insufficient-support'|'depth-range'|'depth-edge'|'depth-noise'|'center-disagreement'|'unsupported-calibration'|'pair-clock-unverified'|'pair-skew'|'aligned-stamp-mismatch'|'frame-order'|'no-palm-anchor'|'palm-depth-mismatch'|'long-bone'|'motion-jump';
export interface DepthSample {readonly centerRaw:number|null;readonly medianRaw:number|null;readonly support:number;readonly total:number;readonly coverage:number;readonly spreadM:number|null;readonly madM:number|null}
export interface MeasuredJoint {readonly valid:boolean;readonly point:Point|null;readonly pixel:Pixel|null;readonly reason:InvalidReason|null;readonly sample:DepthSample|null;readonly reprojectionPx:number|null;readonly provenance:'sdk-aligned-surface';}
export interface MeasuredHand {readonly id:number;readonly joints:readonly MeasuredJoint[];readonly valid:number;readonly palmValid:number;readonly tipsValid:number;readonly palmZ:number|null}
export interface ReconstructionFrame {readonly frame:'color-camera-metric';readonly units:'m';readonly measurement:'surface-at-model-landmark';readonly runId:string;readonly sequence:number;readonly hands:readonly MeasuredHand[];readonly probe:MeasuredJoint|null;readonly error:string|null;readonly pairSkewMs:number|null;readonly exposureSyncVerified:false;readonly reasons:Readonly<Record<string,number>>;readonly elapsedMs:number}
const median=(v:readonly number[])=>v[Math.floor(v.length/2)];
export function validateDepthSettings(s:DepthSettings):void {
  if(!s||Object.keys(DEPTH_DEFAULTS).some(key=>!Number.isFinite(s[key as keyof DepthSettings]))||!Number.isInteger(s.radius)||s.radius<1||s.radius>3||s.minCoverage<0.5||s.minCoverage>1||!Number.isInteger(s.minSupport)||s.minSupport<1||s.minSupport>49||s.minDepthM<0.05||s.maxDepthM<=s.minDepthM||s.maxDepthM>10||s.maxSpreadM<=0||s.maxSpreadM>0.15||s.maxMadM<=0||s.maxMadM>0.05||s.maxCenterDeltaM<=0||s.maxCenterDeltaM>0.1||s.palmBandM<=0||s.palmBandM>0.3||s.maxBoneM<=0||s.maxBoneM>0.3||s.maxSpeedMps<=0||s.maxSpeedMps>10||s.jumpSlackM<0||s.jumpSlackM>0.1||s.historyMs<1||s.historyMs>500||s.maxPairSkewMs<1||s.maxPairSkewMs>100)throw new Error('Invalid reconstruction settings');
}
function invalid(reason:InvalidReason,pixel:Pixel|null=null,sample:DepthSample|null=null):MeasuredJoint {return Object.freeze({valid:false,point:null,pixel,reason,sample,reprojectionPx:null,provenance:'sdk-aligned-surface'});}
function reject(value:MeasuredJoint,reason:InvalidReason):MeasuredJoint {return invalid(reason,value.pixel,value.sample);}
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
/** Rejection only: no averaging, prediction, old-pose display, confidence or anatomical fitting. */
export class Reconstructor {
  private key='';private geometry:CameraGeometry|null=null;private geometryError:string|null=null;
  private previous=new Map<string,{point:Point;at:number}>();private sequence=0;private lastTime=-1;
  reset():void {this.key='';this.geometry=null;this.geometryError=null;this.previous.clear();this.sequence=0;this.lastTime=-1;}
  frame(observation:LiveFrame|null,packet:Packet&{meta:WireFrame},calibration:Calibration,s:DepthSettings=DEPTH_DEFAULTS,probe:Pixel|null=null):ReconstructionFrame {
    validateDepthSettings(s);const begin=performance.now(),wire=packet.meta,key=wire.runId+JSON.stringify(s);
    if(this.key!==key){this.reset();this.key=key;try{this.geometry=prepareGeometry(calibration);}catch(error){this.geometryError=error instanceof Error?error.message:String(error);}}
    const pair=pairing(wire,s.maxPairSkewMs);let frameReason:InvalidReason|null=this.geometryError?'unsupported-calibration':pair.reason;
    if(wire.sequence<=this.sequence||wire.nativeReceiveMs<=this.lastTime){frameReason='frame-order';this.previous.clear();}
    this.sequence=wire.sequence;this.lastTime=wire.nativeReceiveMs;
    const sample=(pixel:Pixel|null)=>frameReason?invalid(frameReason,pixel):samplePoint(packet,calibration,this.geometry!,pixel,s);
    const active=new Set<string>(),reasons:Record<string,number>={};
    const hands=(observation?.hands??[]).slice(0,2).map(hand=>{
      let joints=Array.from({length:21},(_,i)=>{const p=hand.image[i];if(!p)return invalid('no-image-point');const pixel=imagePixel(p,packet.width,packet.height);return pixel?sample(pixel):invalid('off-image');});
      const palm=PALM.flatMap(i=>joints[i].valid?[joints[i].point!.z]:[]).sort((a,b)=>a-b),anchor=palm.length>=3?median(palm):null;
      if(anchor===null)joints=joints.map(j=>j.valid?reject(j,'no-palm-anchor'):j);
      else joints=joints.map(j=>j.valid&&Math.abs(j.point!.z-anchor)>s.palmBandM?reject(j,'palm-depth-mismatch'):j);
      for(let i=0;i<21;i++){
        const j=joints[i],key=`${hand.id}:${i}`;active.add(key);const previous=this.previous.get(key),dt=previous?(wire.nativeReceiveMs-previous.at)/1000:0;
        if(j.valid&&previous&&dt>0&&dt*1000<=s.historyMs&&Math.hypot(j.point!.x-previous.point.x,j.point!.y-previous.point.y,j.point!.z-previous.point.z)>s.jumpSlackM+s.maxSpeedMps*dt)joints[i]=reject(j,'motion-jump');
      }
      for(const [parent,child] of BONES){const a=joints[parent],b=joints[child];if(a.valid&&b.valid&&Math.hypot(a.point!.x-b.point!.x,a.point!.y-b.point!.y,a.point!.z-b.point!.z)>s.maxBoneM)joints[child]=reject(b,'long-bone');}
      joints.forEach((j,i)=>{if(j.valid)this.previous.set(`${hand.id}:${i}`,{point:j.point!,at:wire.nativeReceiveMs});else if(j.reason)reasons[j.reason]=(reasons[j.reason]??0)+1;});
      return Object.freeze({id:hand.id,joints:Object.freeze(joints),valid:joints.filter(j=>j.valid).length,palmValid:PALM.filter(i=>joints[i].valid).length,tipsValid:TIPS.filter(i=>joints[i].valid).length,palmZ:anchor});
    });
    for(const key of this.previous.keys())if(!active.has(key)||wire.nativeReceiveMs-this.previous.get(key)!.at>s.historyMs)this.previous.delete(key);
    return Object.freeze({frame:'color-camera-metric',units:'m',measurement:'surface-at-model-landmark',runId:wire.runId,sequence:wire.sequence,hands:Object.freeze(hands),probe:probe?sample(probe):null,error:this.geometryError,pairSkewMs:pair.skew,exposureSyncVerified:false,reasons:Object.freeze(reasons),elapsedMs:performance.now()-begin});
  }
}
/** Optional operator stationary TARGET test. Valid current points only, bounded processed-frame window. */
export class ProbeWindow {
  private values:({point:Point|null;frame:number})[]=[];private key='';
  reset():void {this.values=[];this.key='';}
  push(key:string,frame:number,point:Point|null):void {if(this.key!==key){this.reset();this.key=key;}if(this.values.at(-1)?.frame===frame)return;this.values.push({point,frame});if(this.values.length>60)this.values.shift();}
  snapshot(){const p=this.values.flatMap(v=>v.point?[v.point]:[]),mean=p.length?{x:p.reduce((n,p)=>n+p.x,0)/p.length,y:p.reduce((n,p)=>n+p.y,0)/p.length,z:p.reduce((n,p)=>n+p.z,0)/p.length}:null;
    return {acceptedFrames:this.values.length,valid:p.length,invalid:this.values.length-p.length,mean,sdZ:mean?Math.sqrt(p.reduce((n,p)=>n+(p.z-mean.z)**2,0)/p.length):null};}
}
