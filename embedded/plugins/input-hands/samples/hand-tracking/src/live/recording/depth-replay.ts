import { Preparer, type Prepared } from '../rgbd/preparer.ts';
import type { PixelPreparer } from '../rgbd/session.ts';
import type { ViewSettings } from '../rgbd/pixels.ts';
import { decodeDepthFrame, type DepthClip } from './depth-format.ts';
/** One decode/preparation in flight; latest requested index wins, and every bitmap is closed. */
export class DepthImages {
  private generation=0;private busy=false;private desired=-1;private displayed=-1;private failed=-1;private clip:DepthClip|null=null;private preparer:PixelPreparer|null=null;
  private readonly view:()=>Omit<ViewSettings,'scale'>;private readonly show:(index:number,value:Prepared)=>void;
  private readonly error:(error:unknown)=>void;private readonly factory:()=>PixelPreparer;
  constructor(view:()=>Omit<ViewSettings,'scale'>,show:(index:number,value:Prepared)=>void,
    error:(error:unknown)=>void,factory:()=>PixelPreparer=()=>new Preparer()){
    this.view=view;this.show=show;this.error=error;this.factory=factory;
  }
  setClip(clip:DepthClip|null):void {++this.generation;this.clip=clip;this.desired=this.displayed=this.failed=-1;this.preparer?.dispose();this.preparer=null;}
  request(index:number):void {this.desired=index;this.drain();}
  invalidate():void {this.displayed=this.failed=-1;}
  snapshot(){return {inFlight:this.busy?1:0,displayed:this.displayed};}
  private drain():void {
    const clip=this.clip,index=this.desired,generation=this.generation;
    if(this.busy||!clip||index<0||index>=clip.frames.length||index===this.displayed||index===this.failed)return;
    this.busy=true;const cancelled=()=>generation!==this.generation;
    void(async()=>{
      const packet=await decodeDepthFrame(clip.frames[index],cancelled);if(cancelled())return;
      this.preparer??=this.factory();const prepared=await this.preparer.prepare(packet.buffer,{...this.view(),scale:clip.manifest.calibration.depthScaleMeters});
      try{if(!cancelled()&&index===this.desired){this.show(index,prepared);this.displayed=index;this.failed=-1;}}
      finally{prepared.color.close();prepared.heatmap.close();}
    })().catch(error=>{if(!cancelled()){this.displayed=-1;this.failed=index;this.error(error);}}).finally(()=>{this.busy=false;this.drain();});
  }
}
