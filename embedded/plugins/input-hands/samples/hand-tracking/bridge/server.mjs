import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { NativeCapture } from './native.mjs';
import { RGBD, validSerial, record, validateCalibration, validateNativeFrame, validateDevices, validateFramePlanes, encodePacket } from '../src/live/rgbd/protocol.ts';
import {captureProfile,profileKey} from '../src/live/rgbd/profiles.ts';
const defaults=['http://127.0.0.1:5190','http://localhost:5190'];
export function validOrigin(origin){try{const u=new URL(origin);return ['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1'].includes(u.hostname)&&u.origin===origin&&!u.username&&!u.password;}catch{return false;}}
export async function createBridge({port=5191,origins=defaults,token=randomBytes(32).toString('hex'),runtimeOptions={},nativeFactory=()=>new NativeCapture(runtimeOptions),maxPeers=1}={}){
  if(!Number.isInteger(maxPeers)||maxPeers<1||maxPeers>4||!Number.isInteger(port)||port<0||port>65535||!origins.length||origins.some(o=>!validOrigin(o))||!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid local bridge configuration');
  const allowed=new Set(origins),peers=new Set();let owner=null,listWork=null,closing=false;
  const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
    if(!hostAllowed(req)||req.method!=='GET'||req.url!=='/health'||(req.headers.origin&&!allowed.has(req.headers.origin))){res.writeHead(403).end();return;}
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({service:'hand-tracking-rgbd',version:1}));
  });
  server.maxConnections=16;server.headersTimeout=3000;server.requestTimeout=3000;server.keepAliveTimeout=2000;
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false,handleProtocols:protocols=>protocols.has(RGBD.protocol)?RGBD.protocol:false});
  const hostAllowed=req=>['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&[`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`].includes(req.headers.host);
  const send=(p,message)=>{if(p.ws.readyState!==WebSocket.OPEN)return;if(p.ws.bufferedAmount>RGBD.packetBytes){p.ws.close(1008,'Backpressure limit');return;}p.ws.send(JSON.stringify(message));};
  const stop=async p=>{
    ++p.generation;p.runId=null;p.awaiting=null;p.starting=false;const capture=p.capture;p.capture=null;
    if(capture)p.cleanup=Promise.allSettled([p.cleanup,capture.stop()]).then(()=>{});
    await p.cleanup;
    if(owner===p&&!p.capture&&!p.starting)owner=null;
  };
  const fatal=(p,error)=>{send(p,{type:'error',fatal:true,message:String(error.message??error).slice(0,2048)});void stop(p).then(()=>send(p,{type:'stopped',fatal:true}));};
  server.on('upgrade',(req,socket,head)=>{
    const protocols=String(req.headers['sec-websocket-protocol']??'').split(',').map(v=>v.trim());
    const offered=protocols.find(v=>v.startsWith('auth.'))?.slice(5);
    const authenticated=typeof offered==='string'&&/^[a-f0-9]{64}$/.test(offered)&&timingSafeEqual(Buffer.from(offered,'hex'),Buffer.from(token,'hex'));
    if(closing||!hostAllowed(req)||req.url!=='/bridge'||!allowed.has(req.headers.origin)||!authenticated||protocols.length!==2||!protocols.includes(RGBD.protocol)||peers.size>=maxPeers){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n',()=>socket.destroy());return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    const p={ws,generation:0,runId:null,capture:null,starting:false,cleanup:Promise.resolve(),awaiting:null,busySince:0,clientBusyDrops:0,alive:true,window:performance.now(),commands:0,lastNativeAt:0};peers.add(p);
    send(p,{type:'connected',version:1,profile:'640x480@30',recording:false});
    ws.on('pong',()=>{p.alive=true;});
    ws.on('error',()=>{void stop(p);});
    ws.on('close',()=>{void stop(p).finally(()=>peers.delete(p));});
    ws.on('message',(data,binary)=>{
      if(closing||ws.readyState!==WebSocket.OPEN)return;
      if(performance.now()-p.window>=1000){p.window=performance.now();p.commands=0;}
      if(++p.commands>100||binary){ws.close(1008,'Invalid control/rate limit');return;}
      let message;try{message=record(JSON.parse(data.toString()));if(typeof message.type!=='string')throw new Error('Control type required');}catch{ws.close(1008,'Malformed control');return;}
      void (async()=>{
        if(message.type==='ping'){
          if(!Number.isSafeInteger(message.id)||message.id<0||!Number.isFinite(message.clientSendPageMs)||message.clientSendPageMs<0)throw new Error('Invalid ping');
          const receive=performance.now();p.capture?.ping();send(p,{type:'pong',id:message.id,bridgeReceiveMs:receive,bridgeSendMs:performance.now(),bridgeOriginMs:performance.timeOrigin,nativeClock:p.capture?.clock??null});return;
        }
        if(message.type==='ack'){
          if(typeof message.runId!=='string'||!Number.isSafeInteger(message.sequence)||message.sequence<1)throw new Error('Invalid acknowledgement');
          if(message.runId!==p.runId)return; // Explicit stop/switch fences a late acknowledgement.
          if(p.awaiting!==message.sequence)throw new Error('Out-of-order acknowledgement');p.awaiting=null;return;
        }
        if(message.type==='list'){
          const generation=p.generation;if(!listWork)listWork=nativeFactory().list().finally(()=>{listWork=null;});
          const result=await listWork;validateDevices(result);if(peers.has(p)&&generation===p.generation)send(p,{type:'devices',...result});return;
        }
        if(message.type==='stop'){
          if(message.id!==undefined&&(!Number.isSafeInteger(message.id)||message.id<0))throw new Error('Invalid stop request ID');
          await stop(p);send(p,{type:'stopped',id:message.id});return;
        }
        if(message.type!=='start'||!validSerial(message.serial)||typeof message.profile!=='string'||message.markerCalibration!==undefined&&typeof message.markerCalibration!=='boolean')throw new Error('Unsupported command, serial or profile');
        const selectedProfile=profileKey(captureProfile(message.profile));
        if(p.capture||p.starting)throw new Error('Stop the current stream before starting another');
        if(owner&&owner!==p)throw new Error('Another Hand Tracking tab owns capture. Stop it there before starting in this tab.');
        owner=p;p.starting=true;const generation=p.generation;await p.cleanup;if(generation!==p.generation||!peers.has(p)){if(owner===p&&!p.capture&&!p.starting)owner=null;return;}
        const runId=randomUUID(),capture=nativeFactory();p.capture=capture;p.runId=runId;p.clientBusyDrops=0;let calibrated=false;
        const startTimer=setTimeout(()=>{if(p.capture===capture)fatal(p,new Error('Native camera start timed out'));},15000);
        capture.on('failure',error=>{if(p.capture===capture&&generation===p.generation){clearTimeout(startTimer);fatal(p,error);}});
        capture.on('exit',()=>{clearTimeout(startTimer);if(p.capture===capture&&generation===p.generation)fatal(p,new Error('Native stream ended; restart explicitly'));});
        capture.on('packet',(packet,received)=>{
          if(p.capture!==capture||generation!==p.generation)return;
          try{
            const meta=packet.meta;
            if(meta.type==='hello'){
              validateCalibration(meta);if(calibrated||meta.serial!==message.serial||profileKey(meta.color)!==selectedProfile||packet.rgbBytes||packet.depthBytes||packet.alignedBytes)throw new Error('Native calibration/source mismatch');
              calibrated=true;p.starting=false;p.lastNativeAt=performance.now();clearTimeout(startTimer);send(p,{type:'started',runId,calibration:meta});return;
            }
            if(meta.type==='error'){clearTimeout(startTimer);throw new Error(typeof meta.message==='string'?meta.message:'Native capture failed');}
            if(meta.type==='stopped')return;
            validateNativeFrame(meta);if(!calibrated)throw new Error('Uncalibrated native frame');validateFramePlanes(packet,selectedProfile);
            p.lastNativeAt=performance.now();
            if(p.awaiting!==null){p.clientBusyDrops++;return;}
            if(ws.readyState!==WebSocket.OPEN)return;
            const output={...meta,runId,bridgeReceiveMs:received,bridgeSendMs:performance.now(),bridgeOriginMs:performance.timeOrigin,clientBusyDrops:p.clientBusyDrops};
            const bytes=new Uint8Array(packet.buffer);
            const payload=encodePacket(output,bytes.subarray(packet.rgbOffset,packet.rgbOffset+packet.rgbBytes),bytes.subarray(packet.depthOffset,packet.depthOffset+packet.depthBytes),bytes.subarray(packet.alignedOffset,packet.alignedOffset+packet.alignedBytes));
            p.awaiting=meta.sequence;p.busySince=performance.now();ws.send(payload,{binary:true},error=>{if(error&&p.capture===capture)fatal(p,error);});
          }catch(error){clearTimeout(startTimer);fatal(p,error);}
        });
        try{capture.start(message.serial,message.markerCalibration===true,selectedProfile);}catch(error){clearTimeout(startTimer);fatal(p,error);}
      })().catch(error=>{fatal(p,error);});
    });
  });
  const timer=setInterval(()=>{
    for(const p of peers){
      if(!p.alive){p.ws.terminate();continue;}p.alive=false;if(p.ws.readyState===WebSocket.OPEN)p.ws.ping();
      if(p.awaiting!==null&&performance.now()-p.busySince>5000)fatal(p,new Error('Client processing/acknowledgement stalled for 5 seconds'));
      if(p.capture&&!p.starting&&performance.now()-p.lastNativeAt>4000)fatal(p,new Error('Native frames stalled for 4 seconds'));
    }
  },2000);
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){closing=true;clearInterval(timer);wss.close();server.close(()=>{});throw error;}
  let closeWork=null;
  return {port:server.address().port,token,origins:[...allowed],close(){return closeWork??= (async()=>{closing=true;clearInterval(timer);await Promise.allSettled([...peers].map(p=>stop(p)));if(listWork)await listWork.catch(()=>{});for(const p of peers)p.ws.terminate();wss.close();server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));})();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let port=5191,origins=[];
  for(const arg of process.argv.slice(2)){if(/^--port=\d+$/.test(arg))port=Number(arg.slice(7));else if(arg.startsWith('--origin='))origins.push(arg.slice(9));else throw new Error('Use --port=<number> and/or --origin=<exact loopback origin>');}
  const bridge=await createBridge({port,...(origins.length?{origins}:{})});
  console.log(`RGB-D bridge: ws://127.0.0.1:${bridge.port}/bridge\nAllowed origins: ${bridge.origins.join(', ')}\nPairing token (paste into the Hand Tracking diagnostic; not a URL): ${bridge.token}\nCamera remains closed until explicit serial selection + Start. Ctrl+C stops the owned camera/service.`);
  let stopping=false;const shutdown=()=>{if(stopping)return;stopping=true;void bridge.close().then(()=>process.exit(0));};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
