import test from'node:test';import assert from'node:assert/strict';import http from'node:http';import WebSocket from'ws';
import{createBridge,validOrigin}from'../bridge/server.mjs';import{framePacket}from'../src/live/rgbd/protocol.ts';import{FakeNative,pause}from'./rgbd-helpers.ts';import{sizedCalibration,sizedPacket}from'./profile-helpers.ts';import{encodePacket,parsePacket}from'../src/live/rgbd/protocol.ts';
const origin='http://127.0.0.1:5190',token='a'.repeat(64);
async function setup(options={}){const captures:FakeNative[]=[];const bridge=await createBridge({port:0,token,...options,nativeFactory:()=>{const n=new FakeNative();captures.push(n);return n;}});return{bridge,captures};}
async function client(bridge:any){const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`,['handtracking-rgbd-v1',`auth.${token}`],{origin});const queue:any[]=[];ws.on('message',(bytes,binary)=>queue.push(binary?framePacket(Uint8Array.from(bytes).buffer):JSON.parse(bytes.toString())));ws.on('error',()=>{});await new Promise((yes,no)=>{ws.once('open',yes);ws.once('error',no);});
 const wait=async(predicate:(v:any)=>boolean,timeout=2500)=>{const end=Date.now()+timeout;while(Date.now()<end){const index=queue.findIndex(predicate);if(index>=0)return queue.splice(index,1)[0];await pause();}assert.fail(`message timeout: ${JSON.stringify(queue.map(v=>v.type??v.meta?.type))}`);};
 await wait(v=>v.type==='connected');return{ws,send:(v:unknown)=>ws.send(JSON.stringify(v)),wait,queue};}
async function rejected(bridge:any,options:any={}){return new Promise<void>((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`,['handtracking-rgbd-v1',`auth.${options.token??token}`],{origin:options.origin??origin});ws.once('open',()=>{ws.terminate();reject(new Error('unexpected upgrade'));});ws.once('error',()=>resolve());});}
test('loopback origins and exact token gate upgrade before native enumeration/capture',async()=>{
 assert.equal(validOrigin('https://localhost:5000'),true);for(const value of['null','http://remote.example:5190','http://127.0.0.1:5190/path','http://user@localhost:5190'])assert.equal(validOrigin(value),false);
 const{bridge,captures}=await setup();try{await rejected(bridge,{token:'b'.repeat(64)});await rejected(bridge,{origin:'https://untrusted.example'});assert.equal(captures.length,0);
 const response=await fetch(`http://127.0.0.1:${bridge.port}/health`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{service:'hand-tracking-rgbd',version:1});
 const status=await new Promise<number>(resolve=>http.get({hostname:'127.0.0.1',port:bridge.port,path:'/health',headers:{host:'remote.example'}},r=>{r.resume();resolve(r.statusCode!);}));assert.equal(status,403);
 }finally{await bridge.close();}
});
test('connect/list never starts a camera; one authenticated owner at a time',async()=>{
 const{bridge,captures}=await setup();try{const c=await client(bridge);assert.equal(captures.length,0);c.send({type:'list'});const list=await c.wait(v=>v.type==='devices');assert.equal(list.devices[0].serial,'fixture-serial');assert.ok(captures.every(n=>n.starts===0));await rejected(bridge);assert.equal(c.ws.protocol,'handtracking-rgbd-v1','token is never selected/reflected as protocol');}finally{await bridge.close();}
});
test('managed idle tabs coexist, but a nonowner cannot stop, receive, or take over another tab capture',async()=>{
 const{bridge,captures}=await setup({maxPeers:4});try{
  const first=await client(bridge),second=await client(bridge);assert.equal(captures.length,0);
  first.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await first.wait(v=>v.type==='started');const active=captures.at(-1)!;
  second.send({type:'stop',id:7});assert.equal((await second.wait(v=>v.type==='stopped')).id,7);assert.equal(active.active,true);
  second.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});assert.match((await second.wait(v=>v.type==='error')).message,/Another Hand Tracking tab/);await second.wait(v=>v.type==='stopped');assert.equal(active.active,true);assert.equal(captures.filter(n=>n.starts>0).length,1);
  active.frame(1);await first.wait(v=>v.meta?.type==='frame');assert.equal(second.queue.some(v=>v.meta?.type==='frame'),false);
  second.ws.close();await pause(20);assert.equal(active.active,true);
  const third=await client(bridge);first.send({type:'stop',id:8});await first.wait(v=>v.type==='stopped');assert.equal(active.active,false);
  third.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await third.wait(v=>v.type==='started');assert.equal(captures.at(-1)!.active,true);
 }finally{await bridge.close();}
});
test('managed client count is capped and simultaneous starts acquire only one camera',async()=>{
 const{bridge,captures}=await setup({maxPeers:4});try{
  const clients=await Promise.all(Array.from({length:4},()=>client(bridge)));await rejected(bridge);
  clients[0].send({type:'start',serial:'fixture-serial',profile:'640x480@30'});clients[1].send({type:'start',serial:'fixture-serial',profile:'640x480@30'});
  const results=await Promise.all(clients.slice(0,2).map(c=>c.wait(v=>v.type==='started'||v.type==='error')));assert.equal(results.filter(v=>v.type==='started').length,1);assert.equal(captures.filter(n=>n.active).length,1);
 }finally{await bridge.close();}
});
test('a busy explicit bridge port fails without reusing or closing the foreign service',async()=>{
 const server=http.createServer((req,res)=>res.end('foreign'));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as any).port;
 try{await assert.rejects(createBridge({port}),/EADDRINUSE/);assert.equal(await(await fetch(`http://127.0.0.1:${port}`)).text(),'foreign');}finally{server.closeIdleConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('one outgoing frame until matching ack; skipped source packets are counted, not queued',async()=>{
 const{bridge,captures}=await setup();try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});const started=await c.wait(v=>v.type==='started'),native=captures.at(-1)!;
 native.frame(1);const first=await c.wait(v=>v.meta?.type==='frame');assert.equal(first.meta.sequence,1);native.frame(2);await pause(20);assert.equal(c.queue.filter(v=>v.meta?.type==='frame').length,0);
 c.send({type:'ack',runId:started.runId,sequence:1});await pause();native.frame(3);const third=await c.wait(v=>v.meta?.type==='frame');assert.equal(third.meta.sequence,3);assert.equal(third.meta.clientBusyDrops,1);
 c.send({type:'stop'});await c.wait(v=>v.type==='stopped');assert.equal(native.stops,1);assert.equal(native.active,false);
 c.send({type:'ack',runId:started.runId,sequence:3});await pause();assert.equal(c.ws.readyState,WebSocket.OPEN,'late old-run ack is fenced, not fatal');
 }finally{await bridge.close();}
});
test('unsupported commands/profiles and serial injection never start native capture',async()=>{
 for(const command of[{type:'start',serial:'fixture;bad',profile:'640x480@30'},{type:'start',serial:'fixture-serial',profile:'1920x1080@60'},{type:'shell',command:'anything'},{type:'start',serial:'fixture-serial',profile:'640x480@30',markerCalibration:'tag36h11'}]){
 const{bridge,captures}=await setup();try{const c=await client(bridge);c.send(command);await c.wait(v=>v.type==='error');assert.ok(captures.every(n=>n.starts===0));}finally{await bridge.close();}}
});
test('marker detection is an explicit bounded boolean start option, never a shell/family/path argument',async()=>{
 let flag:unknown=null;const native=new FakeNative(),original=native.start.bind(native);native.start=((serial:string,marker:boolean)=>{flag=marker;original(serial);}) as typeof native.start;
 const bridge=await createBridge({port:0,token,nativeFactory:()=>native});try{const c=await client(bridge);assert.equal(native.starts,0);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30',markerCalibration:true});await c.wait(v=>v.type==='started');assert.equal(flag,true);c.send({type:'stop'});await c.wait(v=>v.type==='stopped');assert.equal(native.active,false);}finally{await bridge.close();}
});
test('selected nonbaseline profile reaches native and exact-sized original packets reach its owner',async()=>{const native=new FakeNative();let chosen='';native.start=((serial:string,_marker:boolean,profile:string)=>{chosen=profile;native.starts++;native.active=true;native.emit('packet',parsePacket(encodePacket(sizedCalibration(profile)).buffer),performance.now());}) as typeof native.start;const bridge=await createBridge({port:0,token,nativeFactory:()=>native});try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'1280x720@30'});await c.wait(v=>v.type==='started');assert.equal(chosen,'1280x720@30');native.emit('packet',sizedPacket(chosen),performance.now());const packet=await c.wait(v=>v.meta?.type==='frame');assert.equal(packet.width,1280);assert.equal(packet.height,720);assert.equal(packet.rgbBytes,1280*720*3);c.send({type:'stop'});await c.wait(v=>v.type==='stopped');assert.equal(native.active,false);}finally{await bridge.close();}});
test('a native profile fallback is rejected before becoming a calibrated running stream',async()=>{const{bridge,captures}=await setup();try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'1280x720@30'});assert.match((await c.wait(v=>v.type==='error')).message,/calibration\/source mismatch/);await c.wait(v=>v.type==='stopped');assert.ok(captures.every(n=>!n.active));}finally{await bridge.close();}});
test('disconnect/failure closes the owned native camera and permits clean explicit restart',async()=>{
 const{bridge,captures}=await setup();try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await c.wait(v=>v.type==='started');const first=captures.at(-1)!;
 first.emit('failure',new Error('SIMULATED USB disconnect'));assert.match((await c.wait(v=>v.type==='error')).message,/SIMULATED/);await c.wait(v=>v.type==='stopped');assert.equal(first.stops,1);
 c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await c.wait(v=>v.type==='started');const second=captures.at(-1)!;c.ws.close();for(let i=0;i<50&&second.active;i++)await pause();assert.equal(second.stops,1);
 }finally{await bridge.close();}
});
test('missing acknowledgements stop capture after a bounded stall, rather than accumulating frames',async()=>{
 const{bridge,captures}=await setup();try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await c.wait(v=>v.type==='started');const native=captures.at(-1)!;native.frame(1);await c.wait(v=>v.meta?.type==='frame');
 await pause(2500);native.frame(2); // The producer remains alive while the consumer withholds credit.
 const error=await c.wait(v=>v.type==='error',8000);assert.match(error.message,/acknowledgement stalled/);await c.wait(v=>v.type==='stopped');assert.equal(native.active,false);
 }finally{await bridge.close();}
});
test('a silent native producer is stopped independently of WebSocket client acknowledgements',async()=>{
 const{bridge,captures}=await setup();try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await c.wait(v=>v.type==='started');
 const error=await c.wait(v=>v.type==='error',8000);assert.match(error.message,/Native frames stalled/);await c.wait(v=>v.type==='stopped');assert.equal(captures.at(-1)!.active,false);
 }finally{await bridge.close();}
});
test('oversized/binary client controls are rejected and cannot leave capture running',async()=>{
 const{bridge,captures}=await setup();try{const c=await client(bridge);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await c.wait(v=>v.type==='started');const native=captures.at(-1)!;
 c.ws.send(new Uint8Array(4097));await new Promise(resolve=>c.ws.once('close',resolve));for(let i=0;i<50&&native.active;i++)await pause();assert.equal(native.active,false);
 }finally{await bridge.close();}
});
