import { EventEmitter } from 'node:events';
import { encodePacket,parsePacket,RGBD,type Calibration,type WireFrame,type Device } from '../src/live/rgbd/protocol.ts';
const intrinsics=()=>({width:640,height:480,fx:600,fy:600,cx:320,cy:240,distortion:'None',coefficients:[0,0,0,0,0]});
export function calibration():Calibration{return {type:'hello',sdkVersion:'UNIT-FIXTURE',serial:'fixture-serial',name:'GENERATED UNIT FIXTURE',firmware:'none',usb:'fixture',depthScaleMeters:0.001,
  color:{stream:'Color',encoding:'RGB8',width:640,height:480,fps:30},depth:{stream:'Depth',encoding:'Z16',width:640,height:480,fps:30},
  colorIntrinsics:intrinsics(),depthIntrinsics:intrinsics(),alignedDepthIntrinsics:intrinsics(),depthToColor:{rotationColumnMajor:[1,0,0,0,1,0,0,0,1],translationMeters:[0,0,0]},
  alignment:'GENERATED TEST ONLY',pairing:'GENERATED TEST ONLY',nativeClock:'FIXTURE CLOCK'};}
export const devices=():{sdkVersion:string;devices:Device[]}=>({sdkVersion:'UNIT-FIXTURE',devices:[{serial:'fixture-serial',name:'GENERATED UNIT FIXTURE',firmware:'none',usb:'fixture',supportsBaseline:true,profiles:[calibration().color,calibration().depth]}]});
export function wire(sequence=1):WireFrame{const stamp=()=>({number:sequence,timestampMs:sequence*33,domain:'FIXTURE',sensorTimestampUs:null,readoutTimestampUs:null,actualExposureUs:null});return {type:'frame',sequence,nativeReceiveMs:100,nativeAlignedMs:101,nativeSendMs:102,color:stamp(),depth:stamp(),alignedDepth:stamp(),colorGaps:0,depthGaps:0,colorRepeats:0,depthRepeats:0,runId:'fixture-run',bridgeReceiveMs:200,bridgeSendMs:201,bridgeOriginMs:100000,clientBusyDrops:0};}
export function packet(sequence=1,extra={}){const rgb=new Uint8Array(RGBD.rgbBytes),depth=new Uint8Array(RGBD.depthBytes),aligned=new Uint8Array(RGBD.depthBytes);rgb.set([12,34,56]);new DataView(depth.buffer).setUint16(0,1234,true);new DataView(aligned.buffer).setUint16(0,4321,true);return encodePacket({...wire(sequence),...extra},rgb,depth,aligned);}
export class FakeNative extends EventEmitter{
  starts=0;stops=0;clock=null;active=false;
  async list(){return devices();}
  start(_serial:string){this.starts++;this.active=true;queueMicrotask(()=>this.emit('packet',parsePacket(encodePacket(calibration()).buffer),10));}
  ping(){}
  async stop(){if(this.active){this.stops++;this.active=false;this.emit('exit');}}
  frame(sequence=1){this.emit('packet',parsePacket(packet(sequence).buffer),20);}
}
export const pause=(ms=5)=>new Promise(resolve=>setTimeout(resolve,ms));
