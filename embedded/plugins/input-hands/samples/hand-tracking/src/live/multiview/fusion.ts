import type { Point,LiveFrame } from '../contracts.ts';
import type { WireFrame } from '../rgbd/protocol.ts';
import { PALM,pairing,type ReconstructionFrame,type MeasuredJoint } from '../rgbd/reconstruction.ts';
import { transformPoint,validateRigid,type SpatialCalibration } from './calibration.ts';
import { matchSetupSources,type TemporalCalibration } from './temporal.ts';
import {reportedClockPreview,type ReportedClockPreview} from './reported-clock.ts';
type FusionTiming=TemporalCalibration|ReportedClockPreview;
const reported=(t:FusionTiming):t is ReportedClockPreview=>t.format==='sdk-system-time-preview';
const source=(t:FusionTiming,side:Side)=>reported(t)?t.sources[side]:t.input.sources[side];
const mappedTime=(t:FusionTiming,side:Side,time:number)=>reported(t)?time:time+(side==='b'?t.bToAOffsetMs:0);
export type Side='a'|'b';
export type FusionMode='camera-a'|'camera-b'|'best'|'fused';
export interface SourceFrame {wire:WireFrame;receivedPageMs:number;reconstruction:ReconstructionFrame;observation:LiveFrame|null;index?:number}
export interface FusionOptions {maxPairSkewMs:number;matchRadiusM:number;ambiguityM:number;jointAgreementM:number;maxSpeedMps:number;jumpSlackM:number;holdMs:number}
export const FUSION_DEFAULTS:Readonly<FusionOptions>=Object.freeze({maxPairSkewMs:75,matchRadiusM:0.1,ambiguityM:0.01,jointAgreementM:0.04,maxSpeedMps:3,jumpSlackM:0.04,holdMs:150});
export function validateFusionOptions(s:FusionOptions):void {if(!s||Object.keys(FUSION_DEFAULTS).some(k=>!Number.isFinite(s[k as keyof FusionOptions]))||s.maxPairSkewMs<1||s.maxPairSkewMs>100||s.matchRadiusM<0.02||s.matchRadiusM>0.15||s.ambiguityM<0.001||s.ambiguityM>0.03||s.jointAgreementM<0.005||s.jointAgreementM>0.06||s.maxSpeedMps<=0||s.maxSpeedMps>5||s.jumpSlackM<0||s.jumpSlackM>0.06||s.holdMs<1||s.holdMs>200)throw new Error('Invalid bounded fusion settings');}
export interface FusionJoint {valid:boolean;point:Point|null;weightA:number;weightB:number;reason:'missing'|'disagreement'|'motion-jump'|null;color:string}
export interface WorldHand {id:number;joints:readonly FusionJoint[];sources:{a:number|null;b:number|null};selection:Side|null;ambiguous:boolean}
export interface FusionOutput {computeMs:number;hands:readonly WorldHand[];a:SourceFrame;b:SourceFrame;reportedSkewMs:number;reportedBudgetMs:number;effectiveSkewMs:number|null;timingQualification:'common-event-calibrated'|'sdk-reported-clock-only';temporalUncertaintyMs:number|null;timeMs:number;receivedPageMs:number;mode:FusionMode;registeredJointDisparityM:{samples:number;median:number|null;p95:number|null;maximum:number|null};exposureSyncVerified:false;reasons:Readonly<Record<string,number>>}
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
interface Candidate {id:number;joints:readonly MeasuredJoint[];side:Side;center:Point;quality:number;handedness:string|null}
const quality=(j:MeasuredJoint)=>j.valid&&j.point?Math.max(0.01,(j.sample?.coverage??0.5)/(1+(j.sample?.spreadM??0.02)/0.01+(j.sample?.madM??0.01)/0.005)):0;
function candidates(frame:SourceFrame,side:Side,spatial:SpatialCalibration):Candidate[]{return frame.reconstruction.hands.flatMap(h=>{
  const joints=h.joints.map(j=>j.valid&&j.point&&side==='b'?{...j,point:transformPoint(spatial.bToA,j.point)}:j),p=PALM.flatMap(i=>joints[i]?.valid&&joints[i].point?[joints[i].point!]:[]);
  if(p.length<3)return [];const center={x:p.reduce((s,p)=>s+p.x,0)/p.length,y:p.reduce((s,p)=>s+p.y,0)/p.length,z:p.reduce((s,p)=>s+p.z,0)/p.length};const category=frame.observation?.hands.find(v=>v.id===h.id)?.handedness?.categoryName.toLowerCase(),handedness=category==='left'||category==='right'?category:null;return [{id:h.id,side,joints,center,handedness,quality:joints.reduce((s,j)=>s+(j.valid?1:0)+quality(j)*0.1,0)/21}];});}
/** One-to-one global assignment; a source-local ID/handedness is never a cross-camera ID. */
function associate(a:Candidate[],b:Candidate[],s:FusionOptions):{pairs:[number,number][];ambiguous:boolean}{
  const costs=a.map(x=>b.map(y=>{const common=PALM.filter(i=>x.joints[i].valid&&y.joints[i].valid);if(common.length<3||dist(x.center,y.center)>s.matchRadiusM)return Infinity;return common.reduce<number>((n,i)=>n+dist(x.joints[i].point!,y.joints[i].point!),0)/common.length+(x.handedness&&y.handedness&&x.handedness!==y.handedness?0.003:0);}));
  const solutions:{pairs:[number,number][];cost:number}[]=[];
  const visit=(i:number,pairs:[number,number][],used:Set<number>,cost:number)=>{if(i===a.length){solutions.push({pairs:[...pairs],cost});return;}visit(i+1,pairs,used,cost);for(let j=0;j<b.length;j++)if(!used.has(j)&&costs[i][j]<=s.matchRadiusM){used.add(j);pairs.push([i,j]);visit(i+1,pairs,used,cost+costs[i][j]);pairs.pop();used.delete(j);}};
  visit(0,[],new Set(),0);solutions.sort((x,y)=>y.pairs.length-x.pairs.length||x.cost-y.cost);const best=solutions[0],near=solutions.filter(x=>x.pairs.length===best.pairs.length&&x.cost-best.cost<s.ambiguityM);
  return {pairs:best.pairs.filter(([i,j])=>near.every(x=>x.pairs.some(([ai,bj])=>ai===i&&bj===j))),ambiguous:near.length>1};
}
/** Scalar-only queues, maximum eight processed frames per source. No image/packet buffers or old-pose filling. */
export class FusionEngine {
  private queues:{a:SourceFrame[];b:SourceFrame[]}={a:[],b:[]};private last:Record<Side,{number:number;time:number;sequence:number;nativeReceiveMs:number}|null>={a:null,b:null};
  private current:FusionOutput|null=null;private time=-Infinity;private nextId=1;private ids=new Map<string,{id:number;at:number}>();private previous=new Map<string,{point:Point;at:number}>();private selections=new Map<number,Side>();
  private stats={pairs:0,queueDrops:0,unmatched:0,duplicates:0,invalid:0,ambiguous:0};private error='';
  readonly spatial:SpatialCalibration;readonly timing:FusionTiming;readonly options:FusionOptions;readonly mode:FusionMode;
  constructor(spatial:SpatialCalibration,timing:FusionTiming,mode:FusionMode='best',options:FusionOptions=FUSION_DEFAULTS){if(reported(timing)){reportedClockPreview(spatial,timing.sources);if(timing.exposureSyncVerified!==false||timing.temporalUncertaintyMs!==null)throw new Error('Reported-clock preview must not claim temporal qualification');}else{matchSetupSources(spatial,timing);if(![timing.bToAOffsetMs,timing.uncertaintyMs,timing.validFromAMs,timing.validUntilAMs].every(Number.isFinite)||timing.uncertaintyMs<=0||timing.uncertaintyMs>60||timing.validUntilAMs<=timing.validFromAMs)throw new Error('Unqualified timing bounds');}validateRigid(spatial.bToA);validateFusionOptions(options);if(!['camera-a','camera-b','best','fused'].includes(mode))throw new Error('Invalid fusion mode');this.spatial=spatial;this.timing=timing;this.mode=mode;this.options={...options};}
  push(side:Side,frame:SourceFrame):FusionOutput|null {
    if(this.error)return null;const began=performance.now(),w=frame.wire,expected=source(this.timing,side),last=this.last[side],p=pairing(w,50);
    if(w.runId!==expected.runId||w.color.domain!==expected.domain){this.fail('Source run/clock changed; restart/requalify the current two streams');return null;}
    const mapped=mappedTime(this.timing,side,w.color.timestampMs);if(!reported(this.timing)&&(mapped<this.timing.validFromAMs||mapped>this.timing.validUntilAMs)){this.fail('Timing evidence expired (outside common events ±60 s); remeasure');return null;}
    if(last&&(w.color.timestampMs<last.time||w.color.number<last.number||w.sequence<=last.sequence)){this.fail('Source clock/frame order regressed; restart and remeasure timing');return null;}
    if(reported(this.timing)&&last&&Math.abs((w.color.timestampMs-last.time)-(w.nativeReceiveMs-last.nativeReceiveMs))>1000){this.fail('SDK System Time discontinuity; restart/requalify both streams');return null;}
    if(!Number.isFinite(w.nativeReceiveMs)||!Number.isFinite(frame.receivedPageMs)||frame.receivedPageMs<0||!Number.isFinite(w.color.timestampMs)||!Number.isSafeInteger(w.sequence)||frame.reconstruction.runId!==w.runId||frame.reconstruction.sequence!==w.sequence||frame.reconstruction.error||frame.reconstruction.frame!=='color-camera-metric'||frame.reconstruction.units!=='m'||frame.reconstruction.hands.length>2||frame.reconstruction.hands.some(h=>h.joints.length!==21||h.joints.some(j=>j.valid&&(!j.point||![j.point.x,j.point.y,j.point.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||!j.sample||!Number.isFinite(j.sample.coverage)||j.sample.coverage<=0||j.sample.coverage>1||j.sample.spreadM===null||!Number.isFinite(j.sample.spreadM)||j.sample.spreadM<0||j.sample.madM===null||!Number.isFinite(j.sample.madM)||j.sample.madM<0)))||p.reason){this.stats.invalid++;this.current=null;this.queues[side]=[];return null;}
    this.last[side]={number:w.color.number,time:w.color.timestampMs,sequence:w.sequence,nativeReceiveMs:w.nativeReceiveMs};if(last&&(w.color.number===last.number||w.color.timestampMs===last.time)){this.stats.duplicates++;return null;}
    this.queues[side].push(frame);if(this.queues[side].length>8){this.queues[side].shift();this.stats.queueDrops++;}
    let best:{i:number;j:number;cost:number}|null=null;
    this.queues.a.forEach((a,i)=>this.queues.b.forEach((b,j)=>{const cost=Math.abs(mappedTime(this.timing,'a',a.wire.color.timestampMs)-mappedTime(this.timing,'b',b.wire.color.timestampMs))+(reported(this.timing)?0:this.timing.uncertaintyMs)+Math.abs(a.wire.color.timestampMs-a.wire.depth.timestampMs)+Math.abs(b.wire.color.timestampMs-b.wire.depth.timestampMs);if(Math.abs(a.receivedPageMs-b.receivedPageMs)<=this.options.holdMs&&cost<=this.options.maxPairSkewMs&&(!best||cost<best.cost))best={i,j,cost};}));
    if(!best)return null;const match=best as {i:number;j:number;cost:number},a=this.queues.a[match.i],b=this.queues.b[match.j];this.stats.unmatched+=match.i+match.j;this.queues.a.splice(0,match.i+1);this.queues.b.splice(0,match.j+1);
    const time=(mappedTime(this.timing,'a',a.wire.color.timestampMs)+mappedTime(this.timing,'b',b.wire.color.timestampMs))/2;if(time<=this.time){this.stats.unmatched+=2;return null;}this.time=time;this.stats.pairs++;const result=this.combine(a,b,time,match.cost);result.computeMs=Math.max(0,performance.now()-began);return this.current=result;
  }
  private fail(message:string):void{this.error=message;this.current=null;this.queues={a:[],b:[]};this.previous.clear();}
  value(now:number):FusionOutput|null {return this.current&&now>=this.current.receivedPageMs&&now-this.current.receivedPageMs<=this.options.holdMs?this.current:null;}
  snapshot(){return {...this.stats,timingQualification:reported(this.timing)?'sdk-reported-clock-only' as const:'common-event-calibrated' as const,temporalUncertaintyMs:reported(this.timing)?null:this.timing.uncertaintyMs,error:this.error,queuedA:this.queues.a.length,queuedB:this.queues.b.length,identities:this.ids.size,history:this.previous.size};}
  private combine(a:SourceFrame,b:SourceFrame,time:number,effectiveSkewMs:number):FusionOutput {
    const ca=candidates(a,'a',this.spatial),cb=candidates(b,'b',this.spatial),association=associate(ca,cb,this.options),usedA=new Set(association.pairs.map(p=>p[0])),usedB=new Set(association.pairs.map(p=>p[1]));if(association.ambiguous)this.stats.ambiguous++;
    const groups:{a:Candidate|null;b:Candidate|null;ambiguous:boolean}[]=association.pairs.map(([i,j])=>({a:ca[i],b:cb[j],ambiguous:false}));
    ca.forEach((h,i)=>{if(!usedA.has(i))groups.push({a:h,b:null,ambiguous:association.ambiguous});});cb.forEach((h,i)=>{if(!usedB.has(i)&&!ca.some(x=>dist(x.center,h.center)<this.options.matchRadiusM*1.25))groups.push({a:null,b:h,ambiguous:association.ambiguous});});
    for(const[k,v]of this.ids)if(time-v.at>1000)this.ids.delete(k);for(const[k,v]of this.previous)if(time-v.at>250)this.previous.delete(k);
    const reasons:Record<string,number>={};if(association.ambiguous)reasons['ambiguous-association']=1;
    const disparity:number[]=[];for(const g of groups)if(g.a&&g.b)for(let i=0;i<21;i++){const a=g.a.joints[i],b=g.b.joints[i];if(a.valid&&a.point&&b.valid&&b.point)disparity.push(dist(a.point,b.point));}disparity.sort((a,b)=>a-b);
    const hands=groups.map(g=>{
      const keys: string[]=[];if(g.a)keys.push(`a:${a.wire.runId}:${g.a.id}`);if(g.b)keys.push(`b:${b.wire.runId}:${g.b.id}`);const known=[...new Set(keys.flatMap(k=>this.ids.has(k)?[this.ids.get(k)!.id]:[]))],id=known.length===1?known[0]:this.nextId++;keys.forEach(k=>this.ids.set(k,{id,at:time}));
      let selection:Side|null=null;if(this.mode!=='fused'){selection=this.mode==='camera-a'?'a':this.mode==='camera-b'?'b':!g.a?'b':!g.b?'a':g.a.quality>=g.b.quality?'a':'b';const previous=this.selections.get(id);if(this.mode==='best'&&previous&&g[previous]&&g[selection]&&g[previous]!.quality+0.08>=g[selection]!.quality)selection=previous;this.selections.set(id,selection);}
      const joints=Array.from({length:21},(_,i):FusionJoint=>{
        let ja=g.a?.joints[i],jb=g.b?.joints[i];if(selection==='a')jb=undefined;if(selection==='b')ja=undefined;
        let pa=ja?.valid?ja.point:null,pb=jb?.valid?jb.point:null,reason:FusionJoint['reason']=!pa&&!pb?'missing':null,weightA=pa?quality(ja!):0,weightB=pb?quality(jb!):0,point:Point|null=null;
        if(pa&&pb&&dist(pa,pb)>this.options.jointAgreementM){reason='disagreement';weightA=weightB=0;}else if(pa||pb){const sum=weightA+weightB;weightA/=sum;weightB/=sum;point={x:(pa?.x??0)*weightA+(pb?.x??0)*weightB,y:(pa?.y??0)*weightA+(pb?.y??0)*weightB,z:(pa?.z??0)*weightA+(pb?.z??0)*weightB};}
        const key=`${id}:${i}`,previous=this.previous.get(key),dt=previous?(time-previous.at)/1000:0;
        if(point&&previous&&dt>0&&dt<=0.25&&dist(point,previous.point)>this.options.jumpSlackM+this.options.maxSpeedMps*dt){reason='motion-jump';point=null;weightA=weightB=0;}
        if(point)this.previous.set(key,{point,at:time});if(reason)reasons[reason]=(reasons[reason]??0)+1;
        return {valid:point!==null,point,weightA,weightB,reason,color:weightA&&weightB?'#edc56b':weightA?'#65ced9':'#bd9bff'};
      });
      return {id,joints,sources:{a:g.a?.id??null,b:g.b?.id??null},selection,ambiguous:g.ambiguous};
    });
    while(this.ids.size>64)this.ids.delete(this.ids.keys().next().value!);const retained=new Set([...this.ids.values()].map(v=>v.id));for(const key of this.previous.keys())if(!retained.has(Number(key.split(':')[0])))this.previous.delete(key);const active=new Set(hands.map(h=>h.id));for(const id of this.selections.keys())if(!active.has(id))this.selections.delete(id);
    return {computeMs:0,hands,a,b,reportedSkewMs:Math.abs(mappedTime(this.timing,'a',a.wire.color.timestampMs)-mappedTime(this.timing,'b',b.wire.color.timestampMs)),reportedBudgetMs:effectiveSkewMs-(reported(this.timing)?0:this.timing.uncertaintyMs),effectiveSkewMs:reported(this.timing)?null:effectiveSkewMs,timingQualification:reported(this.timing)?'sdk-reported-clock-only':'common-event-calibrated',temporalUncertaintyMs:reported(this.timing)?null:this.timing.uncertaintyMs,timeMs:time,receivedPageMs:Math.max(a.receivedPageMs,b.receivedPageMs),mode:this.mode,registeredJointDisparityM:{samples:disparity.length,median:disparity.length?disparity[Math.floor(disparity.length/2)]:null,p95:disparity.length?disparity[Math.floor((disparity.length-1)*0.95)]:null,maximum:disparity.at(-1)??null},exposureSyncVerified:false,reasons};
  }
}
