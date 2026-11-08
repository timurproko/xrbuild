import { MediaPipeEstimator, activeWorkers } from '../estimator.ts';
import { ObservationTracker } from '../observations.ts';
import { validateSettings, type Settings, type LiveFrame, type ProcessedFrame } from '../contracts.ts';
import type { Estimator } from '../session.ts';
import { Preparer, activePreparers, type Prepared } from './preparer.ts';
import { framePacket, validateFramePlanes, record, requireValue, validSerial, validateCalibration, validateDevices, clockSample,
  RGBD, type Packet, type WireFrame, type Calibration, type Device } from './protocol.ts';
import { validateViewOptions, type ViewSettings } from './pixels.ts';
import { Reconstructor,DEPTH_DEFAULTS,type DepthSettings,type ReconstructionFrame } from './reconstruction.ts';
import type { Pixel } from './geometry.ts';
import {BASELINE,captureProfile,profileKey,matchingProfiles} from './profiles.ts';
export interface DisplayFrame { observation:LiveFrame|null; packet:Packet&{meta:WireFrame}; prepared:Prepared; color:ImageBitmap; receivedPageMs:number; reconstruction:ReconstructionFrame }
export interface PixelPreparer {prepare(buffer:ArrayBuffer,view:ViewSettings):Promise<Prepared>;dispose():void}
export interface BridgeDependencies { socket(url:string,protocols:string[]):WebSocket; preparer():PixelPreparer; estimator():Estimator; now():number }
export function endpoint(value:string):string {const u=new URL(value);if(u.protocol!=='ws:'||!['localhost','127.0.0.1'].includes(u.hostname)||!u.port||Number(u.port)<1||u.pathname!=='/bridge'||u.search||u.hash||u.username||u.password)throw new Error('Use ws://127.0.0.1:<port>/bridge (loopback only; token is separate)');return u.href;}
export class RgbdSession {
  private connection=0;private generation=0;private socket:WebSocket|null=null;
  private preparer:PixelPreparer|null=null;private estimator:Estimator|null=null;private cleanup=Promise.resolve();
  private reconstruction=new Reconstructor();
  private tracker=new ObservationTracker();private pingTimer:ReturnType<typeof setInterval>|null=null;
  private connectTimer:ReturnType<typeof setTimeout>|null=null;private pings=new Map<number,number>();private nextPing=0;
  private stopSequence=0;private expectedStop:number|null=null;private fatalStop=false;
  private profile=BASELINE;private runId='';private serial='';private busy=false;private started=0;private lastSequence=0;
  private calibration:Calibration|null=null;private devices:Device[]=[];private inventoryReceived=false;
  private state='disconnected';private error='';private frames=0;private received=0;private inferenceMs=0;private pixelMs=0;
  private settings:Readonly<Settings>|null=null;private backend='';private fallback:string|null=null;
  private pageClock:ReturnType<typeof clockSample>|null=null;private nativeClock:ReturnType<typeof clockSample>|null=null;
  private lastWire:WireFrame|null=null;private transferMs:number|null=null;
  private readonly callbacks:{frame(value:DisplayFrame):void;clear():void;view():Omit<ViewSettings,'scale'>;reconstruction?():{settings:DepthSettings;probe:Pixel|null}};
  private readonly deps:BridgeDependencies;
  constructor(callbacks:RgbdSession['callbacks'],dependencies?:BridgeDependencies){this.callbacks=callbacks;this.deps=dependencies??{socket:(url,protocols)=>new WebSocket(url,protocols),preparer:()=>new Preparer(),estimator:()=>new MediaPipeEstimator(),now:()=>performance.now()};}
  snapshot(){return {state:this.state,error:this.error,devices:this.devices.map(d=>({...d,profiles:d.profiles.map(p=>({...p}))})),inventoryReceived:this.inventoryReceived,frames:this.frames,received:this.received,
    inFlight:this.busy?1:0,admissionSequence:this.lastSequence,processedHz:this.state==='running'?this.frames/Math.max(0.001,(this.deps.now()-this.started)/1000):0,
    settings:this.settings?{...this.settings}:null,backend:this.backend,fallback:this.fallback,calibration:this.calibration,
    inferenceMs:this.inferenceMs,pixelMs:this.pixelMs,pageClock:this.pageClock?{...this.pageClock}:null,nativeClock:this.nativeClock?{...this.nativeClock}:null,
    transferApproxMs:this.transferMs,wire:this.lastWire,activePreparers:activePreparers(),activeModelWorkers:activeWorkers(),socketOpen:this.socket?.readyState===1};}
  connect(url:string,token:string):void {
    url=endpoint(url);if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid local service credential. Retry the connection or check the developer override.');
    this.disconnect();this.error='';this.devices=[];this.inventoryReceived=false;this.calibration=null;this.pageClock=this.nativeClock=null;
    const connection=this.connection;this.state='connecting';const socket=this.deps.socket(url,[RGBD.protocol,`auth.${token}`]);this.socket=socket;socket.binaryType='arraybuffer';
    this.connectTimer=setTimeout(()=>{if(connection===this.connection)this.fail('Bridge connection timed out');},5000);
    socket.onopen=()=>{if(connection!==this.connection)return;this.clearConnectTimer();this.state='connected';this.refresh();this.ping();this.pingTimer=setInterval(()=>this.ping(),2000);};
    socket.onmessage=event=>{if(connection!==this.connection)return;try{this.message(event.data);}catch(error){this.fail(error);}};
    socket.onerror=()=>{if(connection===this.connection)this.fail('Local service connection failed or was rejected. Retry the connection; check the Hand Tracking server console if it persists.');};
    socket.onclose=()=>{if(connection!==this.connection)return;this.clearConnectTimer();this.clearPingTimer();this.socket=null;void this.clearLocal();this.state=this.error?'error':'disconnected';};
  }
  private clearConnectTimer(){if(this.connectTimer!==null)clearTimeout(this.connectTimer);this.connectTimer=null;}
  private clearPingTimer(){if(this.pingTimer!==null)clearInterval(this.pingTimer);this.pingTimer=null;this.pings.clear();}
  private send(value:unknown):void {if(this.socket?.readyState!==1)return;if(this.socket.bufferedAmount>4096){this.fail('Control channel backpressure limit');return;}this.socket.send(JSON.stringify(value));}
  refresh():void {this.inventoryReceived=false;this.send({type:'list'});}
  private ping():void {if(this.pings.size>=4)return;const id=++this.nextPing,now=this.deps.now();this.pings.set(id,now);this.send({type:'ping',id,clientSendPageMs:now});}
  private message(data:unknown):void {
    if(data instanceof ArrayBuffer){const packet=framePacket(data);this.received++;
      if(packet.meta.runId!==this.runId||this.state!=='running'){this.send({type:'ack',runId:packet.meta.runId,sequence:packet.meta.sequence});return;}
      validateFramePlanes(packet,this.profile);requireValue(!this.busy&&packet.meta.sequence>this.lastSequence,'unacknowledged/non-monotonic frame');this.lastSequence=packet.meta.sequence;
      this.busy=true;void this.process(packet,this.generation,this.deps.now());return;
    }
    requireValue(typeof data==='string'&&data.length<=512*1024,'control size/type');const message=record(JSON.parse(data));
    if(message.type==='connected'){requireValue(message.version===1,'unsupported service version');return;}
    if(message.type==='devices'){validateDevices(message);this.devices=message.devices;this.inventoryReceived=true;return;}
    if(message.type==='error'){
      this.error=typeof message.message==='string'?message.message:'Bridge error';this.fatalStop=true;this.expectedStop=null;
      this.state='stopping';void this.clearLocal();return; // The service already owns fatal shutdown; do not send a duplicate Stop.
    }
    if(message.type==='stopped'){
      if(message.fatal===true){if(!this.fatalStop)return;this.fatalStop=false;}
      else {if(message.id!==this.expectedStop||this.expectedStop===null)return;this.expectedStop=null;}
      void this.clearLocal();this.state=this.socket?.readyState===1?'connected':'disconnected';return;
    }
    if(message.type==='started'){
      if(this.state!=='starting-camera'){this.send({type:'stop'});return;}
      validateCalibration(message.calibration);requireValue(message.calibration.serial===this.serial&&profileKey(message.calibration.color)===this.profile&&typeof message.runId==='string'&&message.runId.length<=128,'selected source/run mismatch');
      this.calibration=message.calibration;this.runId=message.runId;this.state='running';this.started=this.deps.now();return;
    }
    if(message.type==='pong'){
      requireValue(Number.isSafeInteger(message.id),'ping ID');const sent=this.pings.get(message.id as number);this.pings.delete(message.id as number);if(sent===undefined)return;
      const sample=clockSample(sent,message.bridgeReceiveMs as number,message.bridgeSendMs as number,this.deps.now());
      if(!this.pageClock||sample.uncertaintyMs<this.pageClock.uncertaintyMs)this.pageClock=sample;
      if(message.nativeClock!==null&&message.nativeClock!==undefined){const c=record(message.nativeClock);requireValue([c.offsetMs,c.uncertaintyMs,c.rttMs].every(n=>typeof n==='number'&&Number.isFinite(n))&&(c.uncertaintyMs as number)>=0,'native clock sample');this.nativeClock={offsetMs:c.offsetMs as number,uncertaintyMs:c.uncertaintyMs as number,rttMs:c.rttMs as number};}return;
    }
    throw new Error('Unknown bridge control message');
  }
  async start(serial:string,assetsBase:string,modelFile:string,settings:Settings,infer:boolean,markerCalibration=false,profile=BASELINE):Promise<void>{
    if(this.state!=='connected'||this.socket?.readyState!==1)throw new Error('Connect and stop any current capture first');
    captureProfile(profile);if(!validSerial(serial)||!matchingProfiles(this.devices.find(d=>d.serial===serial)).includes(profile))throw new Error('Explicitly select an available serial and supported matching RGB-D profile');this.profile=profile;
    validateSettings(settings);validateViewOptions(this.callbacks.view());
    const cleanup=this.clearLocal(),generation=this.generation;this.state='loading-model';this.error='';this.serial=serial;this.settings=Object.freeze({...settings});
    this.frames=this.received=0;this.lastSequence=0;this.lastWire=null;this.backend='';this.fallback=null;this.nativeClock=null;
    this.inferenceMs=this.pixelMs=0;this.transferMs=null;this.calibration=null;
    try{
      await cleanup;if(generation!==this.generation)return;
      this.preparer=this.deps.preparer();
      if(infer){this.estimator=this.deps.estimator();const result=await this.estimator.initialize(assetsBase,modelFile,this.settings);if(generation!==this.generation)return;this.backend=result.delegate;this.fallback=result.fallback;}
      if(generation!==this.generation)return;this.state='starting-camera';this.send({type:'start',serial,profile:this.profile,...(markerCalibration?{markerCalibration:true}:{})});
    }catch(error){if(generation===this.generation){this.error=error instanceof Error?error.message:String(error);await this.stop();}}
  }
  private async process(packet:Packet&{meta:WireFrame},generation:number,receivedPageMs:number):Promise<void>{
    const stamp=packet.meta;let prepared:Prepared|null=null,processed:ProcessedFrame|null=null,color:ImageBitmap|null=null;
    try{
      const calibration=this.calibration,preparer=this.preparer;requireValue(calibration&&preparer,'active calibration/preparer');
      const view={...this.callbacks.view(),scale:calibration.depthScaleMeters};prepared=await preparer.prepare(packet.buffer,view);color=prepared.color;
      if(generation!==this.generation)return;
      const restored=framePacket(prepared.buffer);requireValue(restored.meta.runId===stamp.runId&&restored.meta.sequence===stamp.sequence,'prepared/source frame mismatch');let observation:LiveFrame|null=null;
      if(this.estimator){const input=color;color=null;processed=await this.estimator.estimate(input,receivedPageMs);color=processed.bitmap;
        if(generation!==this.generation)return;
        this.inferenceMs=processed.inferenceEndWorkerMs-processed.inferenceStartWorkerMs;
        observation=this.tracker.frame(processed.raw,{frameReadyPageMs:receivedPageMs,inferenceStartWorkerMs:processed.inferenceStartWorkerMs,
          inferenceEndWorkerMs:processed.inferenceEndWorkerMs,workerTimeOriginMs:processed.workerTimeOriginMs,receivedPageMs:this.deps.now()},`rgbd:${calibration.serial}:${stamp.runId}`);
      }
      this.pixelMs=prepared.pixelMs;this.frames++;this.lastWire=stamp;
      this.transferMs=this.pageClock?receivedPageMs-(stamp.bridgeSendMs-this.pageClock.offsetMs):null;
      const config=this.callbacks.reconstruction?.()??{settings:DEPTH_DEFAULTS,probe:null};
      const reconstruction=this.reconstruction.frame(observation,restored,calibration,config.settings,config.probe);
      this.callbacks.frame({observation,packet:restored,prepared,color:color!,receivedPageMs,reconstruction});
    }catch(error){if(generation===this.generation){this.error=error instanceof Error?error.message:String(error);void this.stop();}}
    finally{color?.close();prepared?.heatmap.close();if(generation===this.generation)this.busy=false;this.send({type:'ack',runId:stamp.runId,sequence:stamp.sequence});}
  }
  private clearLocal():Promise<void>{
    ++this.generation;this.runId='';this.serial='';this.busy=false;this.preparer?.dispose();this.preparer=null;
    const estimator=this.estimator;this.estimator=null;if(estimator)this.cleanup=Promise.allSettled([this.cleanup,estimator.dispose()]).then(()=>{});
    this.reconstruction.reset();this.tracker.reset(this.deps.now());this.callbacks.clear();return this.cleanup;
  }
  stop():Promise<void>{
    this.fatalStop=false;this.expectedStop=++this.stopSequence;
    this.state=this.socket?.readyState===1?'stopping':'disconnected';this.send({type:'stop',id:this.expectedStop});return this.clearLocal();
  }
  private fail(error:unknown):void {this.error=error instanceof Error?error.message:String(error);this.disconnect();this.state='error';}
  disconnect():void{
    ++this.connection;this.expectedStop=null;this.fatalStop=false;this.clearConnectTimer();this.clearPingTimer();void this.clearLocal();const socket=this.socket;this.socket=null;
    if(socket){socket.onopen=socket.onmessage=socket.onerror=socket.onclose=null;socket.close(1000,'Diagnostic source stopped');}this.state='disconnected';
  }
}
