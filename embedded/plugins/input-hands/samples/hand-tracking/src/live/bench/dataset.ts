import type { LiveFrame } from '../contracts.ts';
import type { Clip } from '../recording/format.ts';
import { metadataHash } from '../recording/format.ts';
import type { DepthClip } from '../recording/depth-format.ts';
import type { DepthComparison } from '../recording/depth-comparison.ts';
import type { Rerun } from '../recording/reprocess.ts';
import { DEPTH_DEFAULTS,type DepthSettings,type ReconstructionFrame } from '../rgbd/reconstruction.ts';
import { analyze,validateIntervals,validateOptions,timingStats,type MetricFrame,type Interval,type MetricOptions } from './metrics.ts';
export interface Dataset { implementation?:string;id:string;contentSha256:string;kind:'rgb'|'rgbd';a:MetricFrame[];b:MetricFrame[];frameA:'hand-relative'|'color-camera-metric';frameB:Dataset['frameA'];provenance:unknown;configuration:unknown;timings:Record<string,readonly number[]>;source:unknown }
export function rawMetric(frame:LiveFrame|null,timeMs:number):MetricFrame{return {timeMs,available:frame!==null,hands:(frame?.hands??[]).map(h=>({id:h.id,points:h.relative??Array(21).fill(null)}))};}
export function measuredMetric(frame:ReconstructionFrame,timeMs:number):MetricFrame{return {timeMs,available:frame.error===null,hands:frame.hands.map(h=>({id:h.id,points:h.joints.map(j=>j.valid?j.point:null)})),rejections:frame.reasons};}
export function provenance(clip:Clip|DepthClip){
  const m=clip.manifest,a=m.assets;
  return {clipVersion:m.version,runtime:{package:a.runtime.package,version:a.runtime.version,npmIntegrity:a.runtime.npmIntegrity},model:{id:a.model.id,file:a.model.file,sha256:a.model.sha256},
    wasm:a.wasm.map(w=>({file:w.file,sha256:w.sha256})),settings:{delegate:m.settings.delegate,detection:m.settings.detection,presence:m.settings.presence,tracking:m.settings.tracking},
    backend:{delegate:m.backend.delegate,fallback:m.backend.fallback},softwareClock:{pageTimeOriginMs:m.pageTimeOriginMs,timebase:m.timebase,exposureClockMapping:'unverified'},source:{id:m.source.id,label:m.source.label,kind:m.source.kind},
    hardware:m.version===2?{sdkVersion:m.calibration.sdkVersion,nativeClock:m.calibration.nativeClock,alignment:m.calibration.alignment,pairing:m.calibration.pairing,exposureSyncVerified:false,alignedDepthValue:m.calibration.geometry?.alignedValue??'unqualified',serial:m.calibration.serial,name:m.calibration.name,firmware:m.calibration.firmware,usb:m.calibration.usb,depthScaleMeters:m.calibration.depthScaleMeters,
      color:pickProfile(m.calibration.color),depth:pickProfile(m.calibration.depth),colorIntrinsics:pickIntrinsics(m.calibration.colorIntrinsics),alignedIntrinsics:pickIntrinsics(m.calibration.alignedDepthIntrinsics),
      depthToColor:{rotationColumnMajor:[...m.calibration.depthToColor.rotationColumnMajor],translationMeters:[...m.calibration.depthToColor.translationMeters]}}:null};
}
function pickProfile(p:{stream:string;encoding:string;width:number;height:number;fps:number}){return {stream:p.stream,encoding:p.encoding,width:p.width,height:p.height,fps:p.fps};}
function pickIntrinsics(p:{fx:number;fy:number;cx:number;cy:number;distortion:string;coefficients:number[]}){return {fx:p.fx,fy:p.fy,cx:p.cx,cy:p.cy,distortion:p.distortion,coefficients:[...p.coefficients]};}
const inference=(f:LiveFrame|null)=>f?[f.timing.inferenceEndWorkerMs-f.timing.inferenceStartWorkerMs]:[];
const sampling=(s:DepthSettings)=>Object.fromEntries(Object.keys(DEPTH_DEFAULTS).map(key=>[key,s[key as keyof DepthSettings]]));
export async function rgbDataset(clip:Clip,rerun:Rerun|null):Promise<Dataset>{
  if(rerun&&rerun.frames.length!==clip.frames.length)throw new Error('Model rerun/clip frame mismatch');
  const identities=[];for(const f of clip.frames)identities.push(await metadataHash(f.meta));
  return {id:clip.manifest.id,kind:'rgb',contentSha256:await metadataHash({manifest:clip.manifest,frames:identities}),frameA:'hand-relative',frameB:'hand-relative',
    a:clip.frames.map(f=>rawMetric(f.meta.observation,f.meta.relativeMs)),b:clip.frames.map((f,i)=>rawMetric(rerun?.frames[i]??f.meta.observation,f.meta.relativeMs)),
    provenance:provenance(clip),configuration:{a:'Original captured observations',b:rerun?{settings:rerun.settings,delegate:rerun.delegate,fallback:rerun.fallback}:'Original observations (no rerun yet)'},
    timings:{inference:clip.frames.flatMap(f=>inference(f.meta.observation)),readyToProcessed:clip.frames.map(f=>f.meta.observation.timing.receivedPageMs-f.meta.observation.timing.frameReadyPageMs),bInference:rerun?.frames.flatMap(inference)??[]},source:{drops:{...clip.manifest.drops}}};
}
export function depthDataset(clip:DepthClip,cache:DepthComparison):Dataset{
  return {id:clip.manifest.id,kind:'rgbd',contentSha256:cache.contentSha256,frameA:'color-camera-metric',frameB:'color-camera-metric',
    a:cache.a.map((f,i)=>({...measuredMetric(f,clip.frames[i].meta.relativeMs),available:f.error===null&&clip.frames[i].meta.observation!==null})),
    b:cache.b.map((f,i)=>({...measuredMetric(f,clip.frames[i].meta.relativeMs),available:f.error===null&&(cache.observationsB?.[i]??clip.frames[i].meta.observation)!==null})),
    provenance:provenance(clip),configuration:{a:{sampling:clip.frames.map(f=>sampling(f.meta.sampling)),history:'Fresh sequential reconstruction; original observations'},b:{sampling:sampling(cache.settingsB),model:cache.modelB??'Stored model observations'}},
    timings:{pixel:clip.frames.map(f=>f.meta.pixelMs),inference:clip.frames.flatMap(f=>inference(f.meta.observation)),receiveToProcessed:clip.frames.map(f=>f.meta.completedPageMs-f.meta.receivedPageMs),
      receiveToRender:clip.frames.flatMap(f=>f.meta.presentedPageMs==null?[]:[f.meta.presentedPageMs-f.meta.receivedPageMs]),
      bridgeSendToReceiveApprox:clip.frames.flatMap(f=>f.meta.transferApproxMs===null?[]:[f.meta.transferApproxMs]),
      bridgePageUncertainty:clip.frames.flatMap(f=>f.meta.pageClock?[f.meta.pageClock.uncertaintyMs]:[]),
      bridgeMinusPageOffset:clip.frames.flatMap(f=>f.meta.pageClock?[f.meta.pageClock.offsetMs]:[]),
      nativeBridgeUncertainty:clip.frames.flatMap(f=>f.meta.nativeClock?[f.meta.nativeClock.uncertaintyMs]:[]),nativeMinusBridgeOffset:clip.frames.flatMap(f=>f.meta.nativeClock?[f.meta.nativeClock.offsetMs]:[]),
      bInference:cache.observationsB?.flatMap(inference)??[],aReconstruction:cache.a.map(f=>f.elapsedMs),bReconstruction:cache.b.map(f=>f.elapsedMs)},
    source:{drops:{...clip.manifest.drops},timeline:cache.source}};
}
export function benchmarkReport(data:Dataset,annotations:readonly Interval[],options:MetricOptions){
  validateOptions(options);validateIntervals(annotations,data.a.length);
  return {format:'xrbuild-hand-benchmark',version:1,implementation:data.implementation??'one-camera-bench-1',privateEvaluationOnly:true,clipId:data.id,contentSha256:data.contentSha256,
    provenance:data.provenance,configuration:data.configuration,annotations:annotations.map(a=>({...a})),metricOptions:{...options},
    coordinateFrames:{a:data.frameA,b:data.frameB},a:analyze(data.a,annotations,options),b:analyze(data.b,annotations,options),source:data.source,
    timing:Object.fromEntries(Object.entries(data.timings).map(([key,values])=>[key,timingStats(values)])),sensorToHostMs:null,captureToPhotonMs:null,filtering:'disabled',accuracy:null,
    limitations:['Annotations are operator claims, not independent ground truth.','Disabled models/unqualified geometry remain unavailable, not lost; no evaluable visible-time coverage means null availability.','Accepted hand = at least minValidJoints in the named coordinate stream; expected-hand count is an annotated set, not guaranteed physical identity.',
      'Time availability counts annotated visible time, holds each processed observation at most maxGapMs, and reports remaining source-gap time as unknown.',
      'Losses require adjacent observed tracked-to-lost states within one visible interval and maxGapMs; gaps and interval ends censor interruptions.',
      'Reacquisition starts only at an annotated occluded-to-visible boundary; initial acquisition is separate. Censored durations are lower bounds.',
      'Stationary variability includes residual motion; per diagnostic track ID, no motion compensation or cross-ID pooling. Hand-relative wrist variability cannot establish camera placement accuracy.',
      'Segment variance and threshold events are observation plausibility statistics, not anatomical bone or joint-angle truth.',
      'No live pre-recording inference/reconstruction history is restored. CPU/GPU runtime timings and universal bitwise determinism are not promised.',
      'Render timing is software receive-to-render only where saved; exposure, sensor-to-host and capture-to-photon remain unmeasured.']};
}
export function exportAnnotations(data:Dataset,annotations:readonly Interval[],options:MetricOptions):Blob{
  validateIntervals(annotations,data.a.length);validateOptions(options);
  const blob=new Blob([JSON.stringify({format:'xrbuild-bench-annotations',version:1,contentSha256:data.contentSha256,annotations,options})],{type:'application/json'});
  if(blob.size>65536)throw new Error('Annotation export exceeds 64 KiB; shorten notes or reduce intervals');return blob;
}
export async function importAnnotations(file:Blob,data:Dataset){
  if(file.size>65536)throw new Error('Annotation file exceeds 64 KiB');const v=JSON.parse(await file.text());
  if(!v||v.format!=='xrbuild-bench-annotations'||v.version!==1||v.contentSha256!==data.contentSha256)throw new Error('Annotation version or clip content mismatch');
  validateIntervals(v.annotations,data.a.length);validateOptions(v.options);return {annotations:v.annotations as Interval[],options:v.options as MetricOptions};
}
