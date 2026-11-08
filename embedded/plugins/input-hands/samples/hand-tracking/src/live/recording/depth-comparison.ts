import { Reconstructor, validateDepthSettings, type DepthSettings, type ReconstructionFrame } from '../rgbd/reconstruction.ts';
import { decodeDepthFrame, immutable, type DepthClip } from './depth-format.ts';
import { metadataHash,type Assets } from './format.ts';
import type { LiveFrame } from '../contracts.ts';
import type { Rerun } from './reprocess.ts';
export interface DepthComparison {
  readonly clipId: string; readonly contentSha256: string; readonly settingsB: Readonly<DepthSettings>;
  readonly a: readonly ReconstructionFrame[]; readonly b: readonly ReconstructionFrame[];
  readonly observationsB:readonly LiveFrame[]|null;readonly modelB:{assets:Assets;settings:Rerun['settings'];delegate:Rerun['delegate'];fallback:string|null}|null;
  readonly source: readonly { sequence: number; colorGaps: number; depthGaps: number; colorRepeats: number; depthRepeats: number; clientBusyDrops: number; colorNumber:number;depthNumber:number;colorDomain:string;depthDomain:string;reportedPairSkewMs:number|null }[];
}
/** Every run starts fresh and consumes ALL saved frames sequentially, never random-seek history. */
export class DepthComparator {
  private generation=0; private state='idle'; private completed=0; private total=0;
  snapshot(){return {state:this.state,completed:this.completed,total:this.total};}
  cancel():void {++this.generation;this.state='cancelled';}
  async run(clip:DepthClip,settingsB:DepthSettings,model?:{rerun:Rerun;assets:Assets}):Promise<DepthComparison|null>{
    if(model&&model.rerun.frames.length!==clip.frames.length)throw new Error('Model rerun/clip frame mismatch');
    validateDepthSettings(settingsB);const generation=++this.generation,cancelled=()=>generation!==this.generation;
    this.state='running';this.completed=0;this.total=clip.frames.length;
    const a=new Reconstructor(),b=new Reconstructor(),framesA:ReconstructionFrame[]=[],framesB:ReconstructionFrame[]=[],source:DepthComparison['source'][number][]=[];
    const config=immutable(settingsB),frameIdentities:string[]=[];
    try{
      for(const frame of clip.frames){
        if(cancelled())return null;const packet=await decodeDepthFrame(frame,cancelled);if(cancelled())return null;
        framesA.push(a.frame(frame.meta.observation,packet,clip.manifest.calibration,frame.meta.sampling));
        framesB.push(b.frame(model?.rerun.frames[frame.meta.index]??frame.meta.observation,packet,clip.manifest.calibration,config));
        const {sequence,colorGaps,depthGaps,colorRepeats,depthRepeats,clientBusyDrops}=packet.meta;
        source.push(Object.freeze({sequence,colorGaps,depthGaps,colorRepeats,depthRepeats,clientBusyDrops,colorNumber:packet.meta.color.number,depthNumber:packet.meta.depth.number,
          colorDomain:packet.meta.color.domain,depthDomain:packet.meta.depth.domain,reportedPairSkewMs:packet.meta.color.domain===packet.meta.depth.domain&&['System Time','Global Time'].includes(packet.meta.color.domain)?Math.abs(packet.meta.color.timestampMs-packet.meta.depth.timestampMs):null}));frameIdentities.push(await metadataHash(frame.meta));this.completed++;
      }
      const contentSha256=await metadataHash({manifest:clip.manifest,frames:frameIdentities});
      if(cancelled())return null;this.state='complete';
      return Object.freeze({clipId:clip.manifest.id,contentSha256,settingsB:config,a:Object.freeze(framesA),b:Object.freeze(framesB),observationsB:model?.rerun.frames??null,
        modelB:model?immutable({assets:model.assets,settings:model.rerun.settings,delegate:model.rerun.delegate,fallback:model.rerun.fallback}):null,source:Object.freeze(source)});
    }catch(error){if(cancelled())return null;this.state='error';throw error;}
  }
}
export function depthReport(clip:DepthClip,cache:DepthComparison){
  if(cache.clipId!==clip.manifest.id||cache.a.length!==clip.frames.length||cache.b.length!==clip.frames.length)throw new Error('Comparison/clip mismatch');
  const summarize=(frames:readonly ReconstructionFrame[],observations:readonly LiveFrame[]|null=null)=>{
    let accepted=0,total=0,palm=0,tips=0;const reasons:Record<string,number>={};
    for(const frame of frames){for(const hand of frame.hands){accepted+=hand.valid;total+=21;palm+=hand.palmValid;tips+=hand.tipsValid;}for(const [reason,n]of Object.entries(frame.reasons))reasons[reason]=(reasons[reason]??0)+n;}
    return {processedFrames:frames.length,modelObservationFrames:observations?.length??clip.frames.filter(f=>f.meta.observation!==null).length,
      landmarkSamples:total,acceptedSurfaceSamples:accepted,acceptedFraction:total?accepted/total:null,palmAccepted:palm,tipsAccepted:tips,rejections:reasons,
      reconstructionMeanMs:frames.reduce((n,f)=>n+f.elapsedMs,0)/Math.max(1,frames.length)};
  };
  const mean=(values:number[])=>values.length?values.reduce((n,v)=>n+v,0)/values.length:null;
  return {
    format:'xrbuild-depth-comparison',version:1,implementation:'depth-ab-2',clipId:cache.clipId,contentSha256:cache.contentSha256,
    hardware:clip.manifest.calibration,assets:clip.manifest.assets,settings:clip.manifest.settings,backend:clip.manifest.backend,
    captureDrops:clip.manifest.drops,coordinateFrame:'color-camera-metric',units:'m',measurement:'surface-at-model-landmark',
    configuration:{a:'Per-frame recorded sampling, fresh sequential history',b:cache.settingsB,modelB:cache.modelB},a:summarize(cache.a),b:summarize(cache.b,cache.observationsB),
    captureTiming:{pixelMeanMs:mean(clip.frames.map(f=>f.meta.pixelMs)),
      inferenceMeanMs:mean(clip.frames.flatMap(f=>f.meta.observation?[f.meta.observation.timing.inferenceEndWorkerMs-f.meta.observation.timing.inferenceStartWorkerMs]:[])),
      receiveToProcessedMeanMs:mean(clip.frames.map(f=>f.meta.completedPageMs-f.meta.receivedPageMs)),
      bridgeSendToReceiveApproxMeanMs:mean(clip.frames.flatMap(f=>f.meta.transferApproxMs===null?[]:[f.meta.transferApproxMs])),
      maxBridgePageUncertaintyMs:clip.frames.some(f=>f.meta.pageClock)?Math.max(...clip.frames.flatMap(f=>f.meta.pageClock?[f.meta.pageClock.uncertaintyMs]:[])):null,
      sensorToHostMs:null,captureToPhotonMs:null},
    timeline:clip.frames.map((f,index)=>({index,relativeMs:f.meta.relativeMs,aAccepted:cache.a[index].hands.reduce((n,h)=>n+h.valid,0),
      bAccepted:cache.b[index].hands.reduce((n,h)=>n+h.valid,0),landmarkSamples:(f.meta.observation?.hands.length??0)*21,source:cache.source[index]})),
    accuracy:null,visibilityAnnotatedAvailability:null,lossesPerMinute:null,reacquisitionMs:null,stationaryJitter:null,
    limitations:['Depth acceptance is not hand accuracy, visibility or tracking availability.','No independent ruler or hand ground truth is supplied.',
      'Visible surface samples are not anatomical joint centers.',cache.modelB?'B uses a fresh model rerun over identical saved RGB8 input.':'Both pipelines use identical stored observations; no model rerun selected.',
      'Pre-recording model/reconstruction history is not restored.','Component times may vary across runs; clocks do not measure exposure or capture-to-photon.',
      'This depth-sample report is separate from the annotation-bound full benchmark report.'],
  };
}
