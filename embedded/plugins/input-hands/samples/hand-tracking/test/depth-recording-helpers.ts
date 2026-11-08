import { metadata, observation } from './recording-helpers.ts';
import { metricCalibration, plane } from './reconstruction-helpers.ts';
import { DEPTH_DEFAULTS } from '../src/live/rgbd/reconstruction.ts';
import { DepthRecorder } from '../src/live/recording/depth-recorder.ts';
import { compressPacket, type DepthCaptureMetadata, type DepthFrameInput, type DepthClip } from '../src/live/recording/depth-format.ts';
export function depthMetadata(infer=true):DepthCaptureMetadata {
  const base=metadata();return {assets:base.assets,settings:base.settings,backend:{delegate:infer?'CPU':null,fallback:null},source:{kind:'native-rgbd',id:'rgbd:fixture-serial:fixture-run',label:'GENERATED RGB-D FIXTURE'},
    calibration:metricCalibration(),pageTimeOriginMs:100000,mirroredPreview:false};
}
export function depthInput(sequence=1,infer=true,empty=false):DepthFrameInput {
  const receivedPageMs=100+sequence*33,obs=structuredClone(observation(receivedPageMs,empty));
  delete obs.timing.mediaTimeMs;obs.sourceId=depthMetadata().source.id;
  return {receivedPageMs,completedPageMs:receivedPageMs+25,observation:infer?obs:null,sampling:{...DEPTH_DEFAULTS},pixelMs:2,reconstructionMs:1,transferApproxMs:3,
    pageClock:{offsetMs:100,uncertaintyMs:2,rttMs:4},nativeClock:null};
}
export async function waitIdle(recorder:DepthRecorder):Promise<void>{
  for(let i=0;i<1000&&recorder.snapshot().inFlight;i++)await new Promise(r=>setTimeout(r,1));
  if(recorder.snapshot().inFlight)throw new Error('Recorder did not settle');
}
export async function depthClip(infer=true):Promise<DepthClip>{
  const clock={now:100};const recorder=new DepthRecorder(()=>{},{now:()=>clock.now,utc:()=>new Date(1793404800000+clock.now).toISOString(),id:()=> 'depth-unit-clip',encode:compressPacket,
    timer:()=>0 as unknown as ReturnType<typeof setTimeout>,clearTimer:()=>{}});
  recorder.start(depthMetadata(infer),0);
  for(let i=1;i<=3;i++){clock.now=100+i*33;recorder.capture(plane(i,i===2?0:1000),depthInput(i,infer));await waitIdle(recorder);}
  clock.now=300;const clip=await recorder.stop();if(!clip)throw new Error('No fixture frames');return clip;
}
