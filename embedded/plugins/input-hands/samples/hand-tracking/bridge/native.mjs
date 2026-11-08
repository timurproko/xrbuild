import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { RGBD, packetSize, parsePacket, validateDevices } from '../src/live/rgbd/protocol.ts';
import {runtimePaths,assertRuntimeSync} from './runtime.mjs';
const execute=promisify(execFile);
/** Bounded incremental reader: copy each IPC byte once, not an ever-growing Buffer.concat queue. */
export class PacketReader {
  header=new Uint8Array(24);headerUsed=0;body=null;used=0;closed=false;
  constructor(packet,error){this.packet=packet;this.error=error;}
  push(input){if(this.closed)return;try{let offset=0;while(offset<input.byteLength){
    if(!this.body){const count=Math.min(24-this.headerUsed,input.byteLength-offset);this.header.set(input.subarray(offset,offset+count),this.headerUsed);this.headerUsed+=count;offset+=count;
      if(this.headerUsed!==24)continue;const size=packetSize(this.header);this.body=new Uint8Array(size);this.body.set(this.header);this.used=24;}
    const count=Math.min(this.body.length-this.used,input.byteLength-offset);this.body.set(input.subarray(offset,offset+count),this.used);this.used+=count;offset+=count;
    if(this.used===this.body.length){const complete=this.body;this.body=null;this.used=0;this.headerUsed=0;this.packet(parsePacket(complete.buffer));}
  }}catch(error){this.closed=true;this.body=null;this.error(error);}}
  end(){if(!this.closed&&(this.body||this.headerUsed))this.error(new Error('Truncated native IPC packet'));this.closed=true;this.body=null;}
}
export class NativeCapture extends EventEmitter {
  constructor(options={}){super();this.options=options;}
  get executable(){assertRuntimeSync(this.options);return runtimePaths(this.options).executable;}
  child=null;done=null;stopping=false;stderr='';pings=new Map();nextPing=0;clock=null;
  async list(){const {stdout}=await execute(this.executable,['--list'],{windowsHide:true,timeout:10000,maxBuffer:2*1024*1024});const result=JSON.parse(stdout);validateDevices(result);return result;}
  start(serial,markerCalibration=false,profile='640x480@30'){
    if(this.child)throw new Error('Native capture already active');this.stopping=false;this.stderr='';
    const child=spawn(this.executable,[`--serial=${serial}`,...(profile==='640x480@30'?[]:[`--profile=${profile}`]),...(markerCalibration?['--marker=tag36h11']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
    const fail=error=>{if(!this.stopping)this.emit('failure',error);void this.stop();};
    const reader=new PacketReader(packet=>{const received=performance.now();
      if(packet.meta.type==='pong'){
        const sent=this.pings.get(packet.meta.id);this.pings.delete(packet.meta.id);
        if(sent!==undefined){const n1=packet.meta.nativeReceiveMs,n2=packet.meta.nativeSendMs;if(Number.isFinite(n1)&&Number.isFinite(n2)){
          const rtt=(received-sent)-(n2-n1);if(rtt>=-0.1){const sample={offsetMs:(n1+n2-sent-received)/2,uncertaintyMs:Math.max(0,rtt)/2,rttMs:Math.max(0,rtt)};if(!this.clock||sample.uncertaintyMs<this.clock.uncertaintyMs)this.clock=sample;}
        }}return;
      }
      if(packet.meta.type==='hello')this.ping(); // Sample again after camera startup, not just during it.
      this.emit('packet',packet,received);
    },fail);
    child.stdout.on('data',bytes=>reader.push(bytes));child.stderr.on('data',bytes=>{this.stderr=(this.stderr+bytes.toString()).slice(-4096);});
    child.stdin.on('error',()=>{});
    this.done=new Promise(resolve=>{
      child.once('error',error=>{fail(error);});
      child.once('close',(code,signal)=>{reader.end();this.child=null;this.pings.clear();if(!this.stopping&&code!==0)this.emit('failure',new Error(`Native capture exited (${code??signal}). ${this.stderr}`));this.emit('exit');resolve();});
    });
    this.clock=null;this.ping();
  }
  ping(){if(!this.child||this.stopping||this.pings.size>=4)return;const id=++this.nextPing;this.pings.set(id,performance.now());this.child.stdin.write(JSON.stringify({type:'ping',id})+'\n');}
  async stop(){
    if(!this.child){await this.done;return;}const child=this.child;this.stopping=true;
    child.stdin.end(JSON.stringify({type:'stop'})+'\n');
    const timer=setTimeout(()=>child.kill(),3000);try{await this.done;}finally{clearTimeout(timer);}
  }
}
