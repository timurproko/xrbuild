import { inputFixture } from './calibration-helpers.ts';
import { fitSpatialCalibration,inversePoint } from '../src/live/multiview/calibration.ts';
import { fitTemporalCalibration,clockSource } from '../src/live/multiview/temporal.ts';
import { wire } from './rgbd-helpers.ts';
import type { SourceFrame,Side } from '../src/live/multiview/fusion.ts';
import type { MeasuredJoint } from '../src/live/rgbd/reconstruction.ts';
export async function setup(){const spatial=await fitSpatialCalibration(inputFixture());const stamps=(side:Side)=>{const w=wire();w.runId=`run-${side}`;w.color.domain='System Time';return w;};const a=await clockSource(spatial.input.sources.a,stamps('a')),b=await clockSource(spatial.input.sources.b,stamps('b'));const timing=await fitTemporalCalibration({sources:{a,b},events:[10,20,30].map(i=>({id:`e${i}`,a:{number:i,timeMs:1000+i*33},b:{number:i,timeMs:1000+i*33-12}})),description:'GENERATED common-event clocks, not hardware evidence',perViewUncertaintyMs:1,commonEventConfirmed:true});return {spatial,timing};}
export type Setup=Awaited<ReturnType<typeof setup>>;
export function source(s:Setup,side:Side,sequence=1,positions=[0],ids=positions.map((_,i)=>side==='a'?i+1:90+i)):SourceFrame{
 const w=wire(sequence);w.runId=`run-${side}`;w.nativeReceiveMs=1000+sequence*33;const time=1000+sequence*33-(side==='b'?12:0);for(const stamp of [w.color,w.depth,w.alignedDepth]){stamp.timestampMs=time;stamp.domain='System Time';}w.depth.timestampMs=w.alignedDepth.timestampMs=time-9;
 const hands=positions.map((offset,index)=>{const joints=Array.from({length:21},(_,i):MeasuredJoint=>{const a={x:offset+(i%5)*0.005,y:Math.floor(i/5)*0.005,z:1+i*0.001},point=side==='b'?inversePoint(s.spatial.bToA,a):a;return {valid:true,point,pixel:{x:320,y:240},reason:null,sample:{centerRaw:1000,medianRaw:1000,support:25,total:25,coverage:1,spreadM:0,madM:0},reprojectionPx:0,provenance:'sdk-aligned-surface'};});return {id:ids[index],joints,valid:21,palmValid:5,tipsValid:5,palmZ:1};});
 return {wire:w,receivedPageMs:100+sequence*33,observation:null,reconstruction:{runId:w.runId,sequence,hands,frame:'color-camera-metric',units:'m',measurement:'surface-at-model-landmark',probe:null,error:null,pairSkewMs:9,exposureSyncVerified:false,reasons:{},elapsedMs:0}};
}
