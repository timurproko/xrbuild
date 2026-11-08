import { DepthRecorder,type DepthRecorderDependencies } from '../recording/depth-recorder.ts';
import { compressPacket,exportDepthClip,importDepthClip,validateDepthManifest,immutable,DEPTH_MAGIC,type DepthClip,type DepthCaptureMetadata,type DepthFrameInput } from '../recording/depth-format.ts';
import { LIMITS,header,json,parse,check,metadataHash } from '../recording/format.ts';
import type { Packet,WireFrame } from '../rgbd/protocol.ts';
import type { Side } from './fusion.ts';
import {LEGACY_DEPTH_MAGIC,LEGACY_PAIRED_FORMAT} from '../legacy.ts';
export interface PairManifest {format:'xrbuild-paired-hand-tracking'|typeof LEGACY_PAIRED_FORMAT;version:1;id:string;privateEvaluationOnly:true;timebase:'shared-page-receive-only';exposureSyncVerified:false;frameCount:number;durationMs:number;pageTimeOriginMs:number}
export interface PairClip {manifest:Readonly<PairManifest>;a:DepthClip;b:DepthClip}
const MAGIC='XRBPAIR1';
function manifest(value:PairManifest):PairManifest {
  check((value?.format==='xrbuild-paired-hand-tracking'||value?.format===LEGACY_PAIRED_FORMAT)&&value.version===1&&value.privateEvaluationOnly===true&&value.exposureSyncVerified===false&&value.timebase==='shared-page-receive-only','paired format/declarations');
  check(typeof value.id==='string'&&value.id.length>0&&value.id.length<=128&&Number.isInteger(value.frameCount)&&value.frameCount>=2&&value.frameCount<=LIMITS.frames&&Number.isFinite(value.durationMs)&&value.durationMs>=0&&value.durationMs<=LIMITS.durationMs&&Number.isFinite(value.pageTimeOriginMs)&&value.pageTimeOriginMs>=0,'paired identity/limits');
  return {format:'xrbuild-paired-hand-tracking',version:1,id:value.id,privateEvaluationOnly:true,timebase:value.timebase,exposureSyncVerified:false,frameCount:value.frameCount,durationMs:value.durationMs,pageTimeOriginMs:value.pageTimeOriginMs};
}
export function validatePair(clip:PairClip):void {
  manifest(clip.manifest);const a=clip.a,b=clip.b;validateDepthManifest(a.manifest);validateDepthManifest(b.manifest);
  check(a.manifest.calibration.serial!==b.manifest.calibration.serial&&a.manifest.pageTimeOriginMs===b.manifest.pageTimeOriginMs&&a.manifest.pageTimeOriginMs===clip.manifest.pageTimeOriginMs,'distinct cameras/shared page-clock provenance');
  check(a.frames.length===a.manifest.frameCount&&b.frames.length===b.manifest.frameCount&&a.frames.length+b.frames.length===clip.manifest.frameCount,'paired frame count');
  const start=Math.min(a.frames[0].meta.receivedPageMs,b.frames[0].meta.receivedPageMs),end=Math.max(a.frames.at(-1)!.meta.receivedPageMs,b.frames.at(-1)!.meta.receivedPageMs);
  check(Math.max(a.manifest.startedPageMs,b.manifest.startedPageMs)<=Math.min(a.manifest.stoppedPageMs,b.manifest.stoppedPageMs)&&Math.abs(end-start-clip.manifest.durationMs)<0.001,'paired overlap/duration');
}
export function exportPair(clip:PairClip):Blob {validatePair(clip);const meta=json(manifest(clip.manifest)),a=exportDepthClip(clip.a),b=exportDepthClip(clip.b),file=new Blob([MAGIC,header(meta.size),meta,header(a.size),a,header(b.size),b],{type:'application/octet-stream'});check(file.size<=LIMITS.bytes,'combined paired file size');return file;}
async function peek(file:Blob){const prefix=await file.slice(0,12).arrayBuffer(),magic=new TextDecoder().decode(prefix.slice(0,8));check(prefix.byteLength===12&&(magic===DEPTH_MAGIC||magic===LEGACY_DEPTH_MAGIC),'nested RGB-D version');const size=new DataView(prefix).getUint32(8,true);check(size>0&&size<=LIMITS.jsonBytes&&size+12<=file.size,'nested manifest length');const v=await parse(file.slice(12,12+size));validateDepthManifest(v);return v;}
export async function importPair(file:Blob,cancelled=()=>false):Promise<PairClip>{
  check(file.size>=20&&file.size<=LIMITS.bytes,'paired file size');const p=await file.slice(0,12).arrayBuffer();check(new TextDecoder().decode(p.slice(0,8))===MAGIC,'paired magic');const size=new DataView(p).getUint32(8,true);check(size>0&&size<=LIMITS.jsonBytes&&size+20<=file.size,'paired manifest size');const meta=manifest(await parse(file.slice(12,12+size)) as PairManifest);
  let offset=12+size;const part=async()=>{check(offset+4<=file.size,'truncated paired header');const n=new DataView(await file.slice(offset,offset+4).arrayBuffer()).getUint32(0,true);offset+=4;check(n>=12&&offset+n<=file.size,'nested file length');const part=file.slice(offset,offset+n);offset+=n;return part;};
  const fa=await part(),fb=await part();check(offset===file.size,'paired trailing bytes');const ma=await peek(fa),mb=await peek(fb);check(ma.frameCount+mb.frameCount===meta.frameCount&&ma.calibration.serial!==mb.calibration.serial&&ma.pageTimeOriginMs===mb.pageTimeOriginMs&&ma.pageTimeOriginMs===meta.pageTimeOriginMs,'paired admission limits/identity');
  if(cancelled())throw new DOMException('Pair import cancelled','AbortError');const a=await importDepthClip(fa,cancelled),b=await importDepthClip(fb,cancelled),clip={manifest:immutable(meta),a,b};validatePair(clip);return Object.freeze(clip);
}
export async function pairContentHash(clip:PairClip):Promise<string>{return metadataHash({manifest:clip.manifest,a:{manifest:clip.a.manifest,frames:await Promise.all(clip.a.frames.map(f=>metadataHash(f.meta)))},b:{manifest:clip.b.manifest,frames:await Promise.all(clip.b.frames.map(f=>metadataHash(f.meta)))}});}
/** Exactly two encoders in flight; a shared 128 MiB / 600-frame / 20 s budget, including format overhead. */
export class PairRecorder {
  private recorders:{a:DepthRecorder;b:DepthRecorder};private state='idle';private frames=0;private bytes=3*LIMITS.jsonBytes+128;private started=0;private generation=0;private work:Promise<PairClip|null>|null=null;private reason='';private ready:(clip:PairClip|null)=>void;private deps:DepthRecorderDependencies;
  constructor(ready:(clip:PairClip|null)=>void,deps:DepthRecorderDependencies={now:()=>performance.now(),utc:()=>new Date().toISOString(),id:()=>crypto.randomUUID(),encode:compressPacket,timer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id)}){
    this.ready=ready;this.deps=deps;
    const admit=(bytes:number)=>{if(this.frames>=LIMITS.frames||this.bytes+bytes>LIMITS.bytes){queueMicrotask(()=>{void this.stop('Shared 128 MiB / 600-frame limit');});return false;}this.frames++;this.bytes+=bytes;if(this.frames===LIMITS.frames)queueMicrotask(()=>{void this.stop('Shared 600-frame limit');});return true;};
    const ended=()=>{if(this.state==='recording')void this.stop('One stream reached its recording boundary');};this.recorders={a:new DepthRecorder(ended,{...deps,admit}),b:new DepthRecorder(ended,{...deps,admit})};
  }
  snapshot(){return {state:this.state,frames:this.frames,bytes:this.bytes,reason:this.reason,inFlight:this.recorders.a.snapshot().inFlight+this.recorders.b.snapshot().inFlight,a:this.recorders.a.snapshot(),b:this.recorders.b.snapshot()};}
  start(a:DepthCaptureMetadata,b:DepthCaptureMetadata,fences:{a:number;b:number},busy:{a:number;b:number}={a:0,b:0}):void {
    if(this.state!=='idle'||this.snapshot().inFlight)throw new Error('Delete the previous paired clip first');if(a.calibration.serial===b.calibration.serial||a.pageTimeOriginMs!==b.pageTimeOriginMs)throw new Error('Two distinct cameras in one page are required');
    this.started=this.deps.now();try{this.recorders.a.start(a,fences.a,busy.a);this.recorders.b.start(b,fences.b,busy.b);this.state='recording';}catch(error){this.clear();throw error;}
  }
  capture(side:Side,packet:Packet&{meta:WireFrame},input:DepthFrameInput):void {if(this.state!=='recording')return;if(input.receivedPageMs-this.started>=LIMITS.durationMs){void this.stop('Shared 20-second limit');return;}this.recorders[side].capture(packet,input);}
  stop(reason='User stopped paired recording'):Promise<PairClip|null>{
    if(this.work)return this.work;if(this.state!=='recording')return Promise.resolve(null);this.state='finishing';this.reason=reason;const generation=this.generation;
    this.work=(async()=>{const[a,b]=await Promise.all([this.recorders.a.stop(reason),this.recorders.b.stop(reason)]);if(generation!==this.generation)return null;this.state='ready';let clip:PairClip|null=null;
      if(a&&b){const start=Math.min(a.frames[0].meta.receivedPageMs,b.frames[0].meta.receivedPageMs),end=Math.max(a.frames.at(-1)!.meta.receivedPageMs,b.frames.at(-1)!.meta.receivedPageMs);clip=Object.freeze({manifest:immutable<PairManifest>({format:'xrbuild-paired-hand-tracking',version:1,id:this.deps.id(),privateEvaluationOnly:true,timebase:'shared-page-receive-only',exposureSyncVerified:false,frameCount:a.frames.length+b.frames.length,durationMs:end-start,pageTimeOriginMs:a.manifest.pageTimeOriginMs}),a,b});validatePair(clip);}this.ready(clip);return clip;
    })();return this.work;
  }
  clear():void{++this.generation;this.recorders.a.clear();this.recorders.b.clear();this.state='idle';this.frames=0;this.bytes=3*LIMITS.jsonBytes+128;this.work=null;this.reason='';}
}
