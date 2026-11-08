import { MediaPipeEstimator } from '../estimator.ts';
import { ObservationTracker } from '../observations.ts';
import { validateSettings,type Settings,type LiveFrame } from '../contracts.ts';
import type { Estimator } from '../session.ts';
import { Preparer } from '../rgbd/preparer.ts';
import type { PixelPreparer } from '../rgbd/session.ts';
import { decodeDepthFrame,type DepthClip } from './depth-format.ts';
import type { Rerun } from './reprocess.ts';
export interface DepthReprocessDependencies { estimator():Estimator;preparer():PixelPreparer;now():number }
/** Fresh VIDEO model, original RGB8 bytes, exact saved timestamp gaps; no camera or media-clock invention. */
export class DepthReprocessor {
  private generation=0;private estimator:Estimator|null=null;private preparer:PixelPreparer|null=null;private cleanup=Promise.resolve();private state='idle';private completed=0;private total=0;
  private readonly deps:DepthReprocessDependencies;
  constructor(deps:DepthReprocessDependencies={estimator:()=>new MediaPipeEstimator(),preparer:()=>new Preparer(),now:()=>performance.now()}){this.deps=deps;}
  snapshot(){return {state:this.state,completed:this.completed,total:this.total};}
  cancel():Promise<void>{
    ++this.generation;this.state='cancelled';this.preparer?.dispose();this.preparer=null;const e=this.estimator;this.estimator=null;
    if(e)this.cleanup=Promise.allSettled([this.cleanup,e.dispose()]).then(()=>{});return this.cleanup;
  }
  async run(clip:DepthClip,base:string,modelFile:string,settings:Settings):Promise<Rerun|null>{
    validateSettings(settings);const config=Object.freeze({...settings}),cleanup=this.cancel(),generation=this.generation,cancelled=()=>generation!==this.generation;
    this.state='loading';this.completed=0;this.total=clip.frames.length;let estimator:Estimator|null=null,preparer:PixelPreparer|null=null,output:Rerun|null=null;
    try{
      await cleanup;if(cancelled())return null;estimator=this.deps.estimator();this.estimator=estimator;
      const ready=await estimator.initialize(base,modelFile,config);if(cancelled())return null;
      preparer=this.deps.preparer();this.preparer=preparer;this.state='running';const tracker=new ObservationTracker(),frames:LiveFrame[]=[];
      for(const frame of clip.frames){
        const packet=await decodeDepthFrame(frame,cancelled);if(cancelled())return null;
        const prepared=await preparer.prepare(packet.buffer,{space:'aligned',mask:false,near:0.15,far:3,scale:clip.manifest.calibration.depthScaleMeters});
        prepared.heatmap.close();if(cancelled()){prepared.color.close();return null;}
        const start=this.deps.now(),processed=await estimator.estimate(prepared.color,frame.meta.relativeMs+1);
        try{
          if(cancelled())return null;
          frames.push(tracker.frame(processed.raw,{frameReadyPageMs:start,inferenceStartWorkerMs:processed.inferenceStartWorkerMs,inferenceEndWorkerMs:processed.inferenceEndWorkerMs,
            workerTimeOriginMs:processed.workerTimeOriginMs,receivedPageMs:this.deps.now()},`recording:${clip.manifest.id}`));this.completed++;
        }finally{processed.bitmap.close();}
      }
      if(cancelled())return null;output=Object.freeze({settings:config,...ready,frames:Object.freeze(frames)});
    }catch(error){if(cancelled())return null;this.state='error';throw error;}
    finally{preparer?.dispose();if(this.preparer===preparer)this.preparer=null;if(estimator){await estimator.dispose();if(this.estimator===estimator)this.estimator=null;}}
    if(cancelled())return null;this.state='complete';return output;
  }
}
