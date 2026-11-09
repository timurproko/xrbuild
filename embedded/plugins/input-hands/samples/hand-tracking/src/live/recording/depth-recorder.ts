import type { Packet, WireFrame } from '../rgbd/protocol.ts';
import { LIMITS, hash, json, type Drops } from './format.ts';
import { validateDepthCapture, validateDepthInput, validateDepthSource, immutable, compressPacket,
  type DepthCaptureMetadata, type DepthFrameInput, type DepthRecordedFrame, type DepthClip, type DepthManifest } from './depth-format.ts';
export interface DepthRecorderDependencies {
  now(): number; utc(): string; id(): string; encode(packet: Blob): Promise<Blob>;
  admit?(bytes:number):boolean;
  timer(fn: () => void, ms: number): ReturnType<typeof setTimeout>; clearTimer(id: ReturnType<typeof setTimeout>): void;
}
/** One immutable packet snapshot / compressor in flight; never queue camera frames. */
export class DepthRecorder {
  private state: 'idle'|'recording'|'finishing'|'ready' = 'idle';
  private presentations=new Map<number,{received:number;at:number|null;index:number|null}>();
  private generation=0; private metadata: DepthCaptureMetadata|null=null; private frames: DepthRecordedFrame[]=[];
  private drops: Drops={sourceBusy:0,encoderBusy:0,beforeStart:0,invalid:0,limit:0};
  private bytes=0; private started=0; private startedUtc=''; private afterSequence=0; private sequence=0; private nativeTime=-1;
  private firstPage: number|null=null; private pending: Promise<void>|null=null; private finishing: Promise<DepthClip|null>|null=null;
  private deadline: ReturnType<typeof setTimeout>|null=null; private reason=''; private requestedStop=''; private sourceBusyStart: number|null=null;
  private readonly ready:(clip:DepthClip|null)=>void;
  private readonly deps:DepthRecorderDependencies;
  constructor(ready:(clip:DepthClip|null)=>void,deps:DepthRecorderDependencies={
    now:()=>performance.now(),utc:()=>new Date().toISOString(),id:()=>crypto.randomUUID(),encode:compressPacket,
    timer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id),
  }){this.ready=ready;this.deps=deps;}
  snapshot(){return {state:this.state,frames:this.frames.length,bytes:this.bytes,drops:{...this.drops},reason:this.reason,inFlight:this.pending?1:0};}
  start(metadata:DepthCaptureMetadata,afterSequence:number,sourceBusy=0):void {
    if(this.state!=='idle'||this.pending)throw new Error('Delete the previous clip before recording');
    validateDepthCapture(metadata); if(!Number.isSafeInteger(afterSequence)||afterSequence<0||!Number.isSafeInteger(sourceBusy)||sourceBusy<0)throw new Error('Invalid recording admission fence/counter');
    this.metadata=immutable(metadata); this.started=this.deps.now(); this.startedUtc=this.deps.utc(); this.afterSequence=afterSequence; this.sourceBusyStart=sourceBusy; this.state='recording';
    this.deadline=this.deps.timer(()=>{void this.stop('20-second limit');},LIMITS.durationMs);
  }
  capture(packet:Packet&{meta:WireFrame},input:DepthFrameInput):void {
    if(this.state!=='recording'||!this.metadata)return;
    // Fence by source sequence too: page clocks can round pre-Record and Record to the same value.
    if(packet.meta.sequence<=this.afterSequence||input.receivedPageMs<this.started){this.drops.beforeStart++;return;}
    if(input.receivedPageMs-this.started>=LIMITS.durationMs){void this.stop('20-second limit');return;}
    this.sourceBusyStart??=packet.meta.clientBusyDrops;
    this.drops.sourceBusy=Math.max(0,packet.meta.clientBusyDrops-this.sourceBusyStart);
    if(this.pending){this.drops.encoderBusy++;return;}
    try{
      validateDepthInput(input);validateDepthSource(input,packet,this.metadata);
      if(packet.meta.sequence<=this.sequence||packet.meta.nativeReceiveMs<=this.nativeTime||this.firstPage!==null&&input.receivedPageMs<=this.frames.at(-1)!.meta.receivedPageMs)throw new Error('Non-monotonic source');
    }catch{this.drops.invalid++;return;}
    const generation=this.generation,original=new Blob([packet.buffer]),snapshot=immutable(input),sequence=packet.meta.sequence,nativeTime=packet.meta.nativeReceiveMs;
    const presentation={received:input.receivedPageMs,at:null as number|null,index:null as number|null};this.presentations.set(sequence,presentation);
    let encoded:Promise<Blob>;try{encoded=this.deps.encode(original);}catch(error){encoded=Promise.reject(error);}
    this.pending=(async()=>{
      const data=await encoded;
      if(generation!==this.generation)return;
      if(data.size<=0||data.size>4*1024*1024)throw new Error('Compressed packet limit');
      const packetSha256=await hash(original);if(generation!==this.generation)return;
      const relativeMs=snapshot.receivedPageMs-(this.firstPage??snapshot.receivedPageMs);
      const meta=immutable({...snapshot,presentedPageMs:presentation.at,index:this.frames.length,relativeMs,packetSha256,packetBytes:original.size});
      const bytes=data.size+json(meta).size+8+64; // Reserve bounded space for the first actual render timestamp.
      if(this.bytes+bytes+LIMITS.jsonBytes+12>LIMITS.bytes){this.drops.limit++;this.requestedStop='128 MiB size limit';return;}
      if(this.deps.admit&&!this.deps.admit(bytes)){this.drops.limit++;this.requestedStop='Shared paired recording budget';return;}
      this.firstPage??=snapshot.receivedPageMs;presentation.index=this.frames.length;this.frames.push(Object.freeze({meta,data}));this.bytes+=bytes;this.sequence=sequence;this.nativeTime=nativeTime;
      if(this.frames.length>=LIMITS.frames)this.requestedStop='600-frame limit';
    })().catch(error=>{if(generation===this.generation){this.drops.invalid++;this.requestedStop=`Encoding stopped: ${error instanceof Error?error.message:String(error)}`;}})
      .finally(()=>{this.pending=null;if(generation===this.generation&&this.requestedStop&&this.state==='recording')void this.stop(this.requestedStop);});
  }
  presented(sequence:number,pageMs:number):void {
    const p=this.presentations.get(sequence);if(!p||p.at!==null||!['recording','finishing'].includes(this.state)||!Number.isFinite(pageMs)||pageMs<p.received)return;
    p.at=pageMs;if(p.index!==null){const frame=this.frames[p.index],meta=immutable({...frame.meta,presentedPageMs:pageMs});
      try{json(meta);this.frames[p.index]=Object.freeze({...frame,meta});}catch{/* Optional telemetry remains unknown if metadata is already at its hard limit. */}}
  }
  stop(reason='User stopped recording'):Promise<DepthClip|null>{
    if(this.finishing)return this.finishing;if(this.state!=='recording')return Promise.resolve(null);
    this.state='finishing';this.reason=reason;if(this.deadline!==null)this.deps.clearTimer(this.deadline);this.deadline=null;
    const stoppedPageMs=this.deps.now(),stoppedUtc=this.deps.utc(),generation=this.generation;
    this.finishing=(async()=>{
      await this.pending;if(generation!==this.generation||!this.metadata)return null;
      this.state='ready';this.reason=this.requestedStop||reason;
      const manifest:DepthManifest={...this.metadata,format:'xrbuild-hand-tracking',version:2,id:this.deps.id(),startedUtc:this.startedUtc,stoppedUtc,
        startedPageMs:this.started,stoppedPageMs,stopReason:this.reason,frameCount:this.frames.length,durationMs:this.frames.at(-1)?.meta.relativeMs??0,
        drops:{...this.drops},encoding:'deflate-xrb3',timebase:'relative-browser-receive-ms',topology:'mediapipe-21',privateEvaluationOnly:true};
      const clip=this.frames.length?Object.freeze({manifest:immutable(manifest),frames:Object.freeze([...this.frames])}):null;
      this.ready(clip);return clip;
    })();return this.finishing;
  }
  clear():void {
    ++this.generation;if(this.deadline!==null)this.deps.clearTimer(this.deadline);this.deadline=null;
    this.presentations.clear();this.state='idle';this.metadata=null;this.frames=[];this.bytes=0;this.firstPage=null;this.sequence=0;this.nativeTime=-1;this.sourceBusyStart=null;
    this.finishing=null;this.reason=this.requestedStop='';this.drops={sourceBusy:0,encoderBusy:0,beforeStart:0,invalid:0,limit:0};
    // An uncancellable compression stays pending; start cannot overlap it.
  }
}
