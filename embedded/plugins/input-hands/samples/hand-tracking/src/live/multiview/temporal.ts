import { calibrationMetadata,type SpatialCalibration } from './calibration.ts';
import type { Calibration,WireFrame } from '../rgbd/protocol.ts';
import { metadataHash,json } from '../recording/format.ts';
import { immutable } from '../recording/depth-format.ts';
export interface ClockSource {serial:string;profileHash:string;runId:string;domain:'System Time'|'Global Time'}
export interface EventStamp {number:number;timeMs:number}
export interface CommonEvent {id:string;a:EventStamp;b:EventStamp}
export interface TemporalInput {sources:{a:ClockSource;b:ClockSource};events:readonly CommonEvent[];description:string;perViewUncertaintyMs:number;commonEventConfirmed:true}
export interface TemporalCalibration {format:'xrbuild-two-view-timing';version:1;input:TemporalInput;inputSha256:string;bToAOffsetMs:number;uncertaintyMs:number;maximumResidualMs:number;validFromAMs:number;validUntilAMs:number;exposureSyncVerified:false}
export async function clockSource(cal:Calibration,wire:WireFrame):Promise<ClockSource>{
  if(!['System Time','Global Time'].includes(wire.color.domain))throw new Error('Unmapped hardware/unknown clocks cannot be aligned just because labels match');
  return {serial:cal.serial,profileHash:await metadataHash(calibrationMetadata(cal)),runId:wire.runId,domain:wire.color.domain as ClockSource['domain']};
}
export async function fitTemporalCalibration(value:TemporalInput):Promise<TemporalCalibration>{
  if(!value||value.commonEventConfirmed!==true||typeof value.description!=='string'||!value.description.trim()||value.description.length>256||!Number.isFinite(value.perViewUncertaintyMs)||value.perViewUncertaintyMs<=0||value.perViewUncertaintyMs>25)throw new Error('Confirm common visual events, describe them and provide per-view uncertainty in (0,25] ms');
  const source=(s:ClockSource):ClockSource=>{if(!s||!/^[-a-zA-Z0-9_]{1,64}$/.test(s.serial)||!/^[-a-zA-Z0-9_]{1,128}$/.test(s.runId)||! /^[a-f0-9]{64}$/.test(s.profileHash)||!['System Time','Global Time'].includes(s.domain))throw new Error('Invalid temporal source/profile/run/clock');return {serial:s.serial,profileHash:s.profileHash,runId:s.runId,domain:s.domain};};
  const a=source(value.sources?.a),b=source(value.sources?.b);if(a.serial===b.serial||a.domain!==b.domain)throw new Error('Timing requires distinct sources with qualified common clock domains');
  if(!Array.isArray(value.events)||value.events.length<3||value.events.length>32)throw new Error('Provide 3–32 distinct matched visual events');
  const ids=new Set<string>(),numbersA=new Set<number>(),numbersB=new Set<number>();
  const stamp=(s:EventStamp):EventStamp=>{if(!s||!Number.isSafeInteger(s.number)||s.number<0||!Number.isFinite(s.timeMs)||s.timeMs<0)throw new Error('Invalid common-event frame stamp');return {number:s.number,timeMs:s.timeMs};};
  const events=value.events.map(e=>{if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(e.id)||ids.has(e.id))throw new Error('Duplicate/invalid event ID');ids.add(e.id);const ea=stamp(e.a),eb=stamp(e.b);if(numbersA.has(ea.number)||numbersB.has(eb.number))throw new Error('Use distinct frames for distinct common events');numbersA.add(ea.number);numbersB.add(eb.number);return {id:e.id,a:ea,b:eb};}).sort((x,y)=>x.a.timeMs-y.a.timeMs);
  if(events.at(-1)!.a.timeMs-events[0].a.timeMs<200||events.at(-1)!.b.timeMs-events[0].b.timeMs<200||events.some((e,i)=>i>0&&(e.a.timeMs<=events[i-1].a.timeMs||e.b.timeMs<=events[i-1].b.timeMs)))throw new Error('Common events must be ordered and span at least 200 ms in both sources');
  const offsets=events.map(e=>e.a.timeMs-e.b.timeMs).sort((x,y)=>x-y),offset=offsets[Math.floor(offsets.length/2)],residual=Math.max(...offsets.map(n=>Math.abs(n-offset))),uncertainty=2*value.perViewUncertaintyMs+residual;
  if(Math.abs(offset)>10000||uncertainty>60)throw new Error('Temporal offset/uncertainty exceeds the diagnostic budget; improve event matching');
  const input:TemporalInput={sources:{a,b},events,description:value.description,perViewUncertaintyMs:value.perViewUncertaintyMs,commonEventConfirmed:true};
  return immutable({format:'xrbuild-two-view-timing',version:1,input,inputSha256:await metadataHash(input),bToAOffsetMs:offset,uncertaintyMs:uncertainty,maximumResidualMs:residual,validFromAMs:Math.max(0,events[0].a.timeMs-60000),validUntilAMs:events.at(-1)!.a.timeMs+60000,exposureSyncVerified:false});
}
export function matchSetupSources(spatial:SpatialCalibration,timing:TemporalCalibration):void {
  if(!spatial.spatialQualified||spatial.fusionEnabled!==false||spatial.temporalAlignment!==null||timing.exposureSyncVerified!==false||spatial.sourceHashes.a!==timing.input.sources.a.profileHash||spatial.sourceHashes.b!==timing.input.sources.b.profileHash||spatial.input.sources.a.serial!==timing.input.sources.a.serial||spatial.input.sources.b.serial!==timing.input.sources.b.serial)throw new Error('Spatial/timing source identity mismatch or unqualified spatial setup');
}
export function exportTiming(value:TemporalCalibration):Blob{const blob=json(value);if(blob.size>32768)throw new Error('Timing setup exceeds 32 KiB');return blob;}
export async function importTiming(file:Blob):Promise<TemporalCalibration>{
  if(!file.size||file.size>32768)throw new Error('Timing setup must be 1 byte–32 KiB');const v=JSON.parse(await file.text());if(v?.format!=='xrbuild-two-view-timing'||v.version!==1||v.exposureSyncVerified!==false)throw new Error('Unsupported timing setup');
  const r=await fitTemporalCalibration(v.input);if(r.inputSha256!==v.inputSha256||r.bToAOffsetMs!==v.bToAOffsetMs||r.uncertaintyMs!==v.uncertaintyMs||r.maximumResidualMs!==v.maximumResidualMs||r.validFromAMs!==v.validFromAMs||r.validUntilAMs!==v.validUntilAMs)throw new Error('Timing integrity/derived-value mismatch');return r;
}
