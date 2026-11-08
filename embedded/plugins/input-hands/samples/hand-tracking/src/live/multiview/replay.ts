import { decodeDepthFrame,type DepthClip } from '../recording/depth-format.ts';
import { Reconstructor,DEPTH_DEFAULTS,type DepthSettings } from '../rgbd/reconstruction.ts';
import { Preparer,type Prepared } from '../rgbd/preparer.ts';
import { FusionEngine,type SourceFrame,type FusionOutput,type FusionOptions } from './fusion.ts';
import type { SpatialCalibration } from './calibration.ts';
import type { TemporalCalibration } from './temporal.ts';
import { pairContentHash,type PairClip } from './recording.ts';
import { metadataHash } from '../recording/format.ts';
import { provenance,type Dataset } from '../bench/dataset.ts';
const sampling=(s:DepthSettings)=>Object.fromEntries(Object.keys(DEPTH_DEFAULTS).map(k=>[k,s[k as keyof DepthSettings]])) as unknown as DepthSettings;
const drops=(d:DepthClip['manifest']['drops'])=>({sourceBusy:d.sourceBusy,encoderBusy:d.encoderBusy,beforeStart:d.beforeStart,invalid:d.invalid,limit:d.limit});
export interface PairSeries {a:SourceFrame[];b:SourceFrame[];contentSha256:string}
export interface PairComparison {best:FusionOutput[];fused:FusionOutput[];dataset:Dataset}
export async function reconstructPair(clip:PairClip,cancelled=()=>false,progress:(done:number,total:number)=>void=()=>{}):Promise<PairSeries>{
  const result:{a:SourceFrame[];b:SourceFrame[]}={a:[],b:[]};let done=0;
  for(const side of ['a','b'] as const){const source=clip[side],reconstructor=new Reconstructor();for(let index=0;index<source.frames.length;index++){
    if(cancelled())throw new DOMException('Pair reconstruction cancelled','AbortError');const saved=source.frames[index],packet=await decodeDepthFrame(saved,cancelled);
    const reconstruction=reconstructor.frame(saved.meta.observation,packet,source.manifest.calibration,sampling(saved.meta.sampling));result[side].push({wire:packet.meta,receivedPageMs:saved.meta.receivedPageMs,reconstruction,observation:saved.meta.observation,index});progress(++done,clip.manifest.frameCount);
  }}
  const contentSha256=await pairContentHash(clip);if(cancelled())throw new DOMException('Pair reconstruction cancelled','AbortError');return {...result,contentSha256};
}
export async function comparePair(clip:PairClip,series:PairSeries,spatial:SpatialCalibration,timing:TemporalCalibration,options:FusionOptions):Promise<PairComparison> {
  const bestEngine=new FusionEngine(spatial,timing,'best',options),fusedEngine=new FusionEngine(spatial,timing,'fused',options),best:FusionOutput[]=[],fused:FusionOutput[]=[];
  const events=[...series.a.map(frame=>({side:'a' as const,frame})),...series.b.map(frame=>({side:'b' as const,frame}))].sort((a,b)=>a.frame.receivedPageMs-b.frame.receivedPageMs||(a.side==='a'?-1:1));
  for(const {side,frame}of events){const a=bestEngine.push(side,frame),b=fusedEngine.push(side,frame);if(a)best.push(a);if(b)fused.push(b);}
  if(bestEngine.snapshot().error||fusedEngine.snapshot().error)throw new Error(bestEngine.snapshot().error||fusedEngine.snapshot().error);
  if(!best.length||best.length!==fused.length||best.some((p,i)=>p.a.index!==fused[i].a.index||p.b.index!==fused[i].b.index))throw new Error('No identical qualified paired inputs; check current-run timing, profile and uncertainty');
  const start=best[0].receivedPageMs,metric=(out:FusionOutput)=>({timeMs:out.receivedPageMs-start,available:out.a.observation!==null||out.b.observation!==null,hands:out.hands.map(h=>({id:h.id,points:h.joints.map(j=>j.valid?j.point:null)})),rejections:out.reasons});
  const timeline=best.map((out,index)=>({index,aIndex:out.a.index,bIndex:out.b.index,aColorFrame:out.a.wire.color.number,bColorFrame:out.b.wire.color.number,reportedSkewMs:out.reportedSkewMs,effectiveSkewMs:out.effectiveSkewMs,registeredJointDisparityM:out.registeredJointDisparityM,bothContributions:fused[index].hands.reduce((n,h)=>n+h.joints.filter(j=>j.weightA>0&&j.weightB>0).length,0),rejections:{...fused[index].reasons}}));
  const contentSha256=await metadataHash({media:series.contentSha256,pairs:best.map(p=>({a:p.a.index,b:p.b.index,at:p.receivedPageMs-start}))});
  const dataset:Dataset={implementation:'two-view-bench-1',id:clip.manifest.id,contentSha256,kind:'rgbd',frameA:'color-camera-metric',frameB:'color-camera-metric',a:best.map(metric),b:fused.map(metric),
    provenance:{a:provenance(clip.a),b:provenance(clip.b),worldFrame:'camera-a-optical',measurement:'registered visible surfaces, not anatomical centers',exposureSyncVerified:false},
    configuration:{comparisonA:'Best View',comparisonB:'Fused',spatialInputSha256:spatial.inputSha256,rigidBToA:spatial.bToA,spatialFit:spatial.fit,spatialHeldOut:spatial.check,timingInputSha256:timing.inputSha256,timing,options:{...options},samplingA:clip.a.frames.map(f=>sampling(f.meta.sampling)),samplingB:clip.b.frames.map(f=>sampling(f.meta.sampling)),history:'Independent fresh sequential histories; identical source pairs; original per-frame sampling'},
    timings:{bestFusionCompute:best.map(p=>p.computeMs),fusedCompute:fused.map(p=>p.computeMs),reportedInterCameraSkew:best.map(p=>p.reportedSkewMs),effectiveTemporalBudget:best.flatMap(p=>p.effectiveSkewMs===null?[]:[p.effectiveSkewMs]),inferenceA:series.a.flatMap(f=>f.observation?[f.observation.timing.inferenceEndWorkerMs-f.observation.timing.inferenceStartWorkerMs]:[]),inferenceB:series.b.flatMap(f=>f.observation?[f.observation.timing.inferenceEndWorkerMs-f.observation.timing.inferenceStartWorkerMs]:[])},
    source:{originalContentSha256:series.contentSha256,drops:{a:drops(clip.a.manifest.drops),b:drops(clip.b.manifest.drops)},inputFrames:{a:series.a.length,b:series.b.length},matching:bestEngine.snapshot(),sourceRejections:{a:series.a.map(f=>({index:f.index,reasons:f.reconstruction.reasons})),b:series.b.map(f=>({index:f.index,reasons:f.reconstruction.reasons}))},timeline,accuracy:null,fusionImprovement:'operator must compare; retain Best View if fusion worsens results'}};
  return {best,fused,dataset};
}
/** Latest-request wins; one decode/worker transaction in flight, both source images committed together. */
export class PairImages {
  private clip:PairClip|null=null;private wanted:{a:number;b:number;slot:number}|null=null;private shown='';private busy=false;private generation=0;private preparer:Preparer|null=null;private shownSlot=-1;
  private present:(slot:number,a:Prepared,b:Prepared)=>void;private error:(error:unknown)=>void;
  constructor(present:PairImages['present'],error:PairImages['error']){this.present=present;this.error=error;}
  setClip(clip:PairClip|null):void{this.generation++;this.clip=clip;this.wanted=null;this.shown='';this.shownSlot=-1;this.preparer?.dispose();this.preparer=null;}
  request(a:number,b:number,slot:number):void{if(!this.clip||!Number.isInteger(a)||!Number.isInteger(b)||!this.clip.a.frames[a]||!this.clip.b.frames[b])return;this.wanted={a,b,slot};this.pump();}
  snapshot(){return {inFlight:this.busy?1:0,displayed:this.shownSlot};}
  private pump():void{
    const wanted=this.wanted,clip=this.clip;if(this.busy||!clip||!wanted||this.shown===`${wanted.a}:${wanted.b}:${wanted.slot}`)return;this.busy=true;const generation=this.generation;this.preparer??=new Preparer();const preparer=this.preparer;
    void(async()=>{let a:Prepared|null=null,b:Prepared|null=null;try{const decode=async(source:DepthClip,index:number)=>{const packet=await decodeDepthFrame(source.frames[index],()=>generation!==this.generation);return preparer.prepare(packet.buffer,{space:'aligned',mask:false,near:0.15,far:3,scale:source.manifest.calibration.depthScaleMeters});};a=await decode(clip.a,wanted.a);if(generation!==this.generation)return;b=await decode(clip.b,wanted.b);if(generation===this.generation&&this.wanted?.a===wanted.a&&this.wanted?.b===wanted.b&&this.wanted?.slot===wanted.slot){this.present(wanted.slot,a,b);this.shown=`${wanted.a}:${wanted.b}:${wanted.slot}`;this.shownSlot=wanted.slot;}}
      catch(error){if(generation===this.generation){this.wanted=null;this.error(error);}}finally{a?.color.close();a?.heatmap.close();b?.color.close();b?.heatmap.close();this.busy=false;this.pump();}})();
  }
}
