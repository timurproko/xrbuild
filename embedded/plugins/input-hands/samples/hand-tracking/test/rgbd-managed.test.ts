import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import WebSocket from 'ws';
import { managedBridge,bootstrapPath } from '../bridge/managed.mjs';import { createBridge } from '../bridge/server.mjs';import { FakeNative,pause } from './rgbd-helpers.ts';
async function setup(options:any={}){
 const captures:FakeNative[]=[],created:any[]=[],logs:any[]=[];let prepares=0;
 const managed=managedBridge({prepare:()=>{prepares++;options.prepare?.();},logger:{error:(...args:any[])=>logs.push(args)},bridgeFactory:options.bridgeFactory??(async(config:any)=>{
  const service=await createBridge({...config,token:'a'.repeat(64),nativeFactory:()=>{const capture=new FakeNative();captures.push(capture);return capture;}});created.push(service);return service;
 })});
 const server=http.createServer(),vite={httpServer:server,config:{server:{https:false}}};
 const middleware=managed.middleware(vite);server.on('request',(req,res)=>{void middleware(req,res,()=>{res.writeHead(404);res.end();});});
 managed.prepare();managed.prepare();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as any).port,origin=`http://127.0.0.1:${port}`,url=origin+bootstrapPath;
 const headers={Origin:origin,'X-HandTracking-Local':'1','Sec-Fetch-Site':'same-origin'};
 return {managed,server,vite,captures,created,logs,origin,url,headers,get prepares(){return prepares;},
  async close(){await managed.close();server.closeIdleConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
async function socket(config:any,origin:string){
 const ws=new WebSocket(config.url,['handtracking-rgbd-v1',`auth.${config.token}`],{origin});ws.on('error',()=>{});
 const queue:any[]=[];ws.on('message',(data,binary)=>{if(!binary)queue.push(JSON.parse(data.toString()));});
 await new Promise<void>((resolve,reject)=>{ws.once('open',()=>resolve());ws.once('error',reject);});
 const wait=async(type:string)=>{for(let i=0;i<200;i++){const at=queue.findIndex(m=>m.type===type);if(at>=0)return queue.splice(at,1)[0];await pause();}assert.fail('missing '+type);};
 await wait('connected');return {ws,wait,send:(value:any)=>ws.send(JSON.stringify(value))};
}

test('same-origin viewer boot coalesces one random-port service without acquiring a camera or logging credentials',async()=>{
 const s=await setup();try{
  assert.equal(s.prepares,1);assert.equal(s.created.length,0);
  const responses=await Promise.all(Array.from({length:4},()=>fetch(s.url,{method:'POST',headers:s.headers}))),config=await responses[0].json();
  assert.equal(s.created.length,1);assert.equal(config.url,`ws://127.0.0.1:${s.created[0].port}/bridge`);
  for(const response of responses){assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');}
  assert.equal(s.captures.length,0);const c=await socket(config,s.origin);c.send({type:'list'});await c.wait('devices');assert.ok(s.captures.every(n=>n.starts===0));assert.equal(c.ws.protocol,'handtracking-rgbd-v1');assert.equal(s.logs.length,0);
 }finally{await s.close();}
});
test('bootstrap rejects cross-origin/simple/prefetched/rebound requests before starting any service',async()=>{
 const s=await setup();try{
  const cases:any[]=[{method:'GET',headers:s.headers},{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-HandTracking-Local'}},
   {method:'POST',headers:{Origin:s.origin}},{method:'POST',headers:{...s.headers,Origin:'null'}},{method:'POST',headers:{...s.headers,Origin:'https://evil.example'}},
   {method:'POST',headers:{...s.headers,Host:'rebound.example'}},{method:'POST',headers:{...s.headers,Origin:s.origin.replace('127.0.0.1','localhost')}},
   {method:'POST',headers:{'X-HandTracking-Local':'1'}},{method:'POST',headers:{...s.headers,'Sec-Fetch-Site':'cross-site'}},{method:'POST',headers:s.headers,body:'{}'}];
  for(const init of cases){const r=await new Promise<{status:number;headers:http.IncomingHttpHeaders;body:string}>((resolve,reject)=>{const request=http.request(s.url,{method:init.method,headers:{...init.headers,...(init.body?{'Content-Length':Buffer.byteLength(init.body)}:{})}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode!,headers:response.headers,body}));});request.on('error',reject);request.end(init.body);});assert.equal(r.status,403,JSON.stringify(init));assert.equal(r.headers['access-control-allow-origin'],undefined);assert.equal(r.body.includes('token'),false);}
  assert.equal((await fetch(s.url+'?anything',{method:'POST',headers:s.headers})).status,400);assert.equal(s.created.length,0);assert.equal(s.captures.length,0);
 }finally{await s.close();}
});
test('missing distributed runtime is honest and does not spawn a bridge, camera, build, or fallback',async()=>{
 const s=await setup({prepare:()=>{throw new Error('SIMULATED absent runtime');}});try{const r=await fetch(s.url,{method:'POST',headers:s.headers});assert.equal(r.status,503);assert.match((await r.json()).error,/optional Hand Tracking native runtime is unavailable/);assert.equal(s.created.length,0);assert.equal(s.captures.length,0);assert.equal(s.logs.length,1);}finally{await s.close();}
});
test('viewer shutdown stops owned capture and closes the authenticated service; repeated close is safe',async()=>{
 const s=await setup();try{
  const config=await(await fetch(s.url,{method:'POST',headers:s.headers})).json(),c=await socket(config,s.origin);c.send({type:'start',serial:'fixture-serial',profile:'640x480@30'});await c.wait('started');const capture=s.captures.at(-1)!;
  const closed=new Promise(resolve=>c.ws.once('close',resolve));await Promise.all([s.managed.close(),s.managed.close()]);await closed;
  assert.equal(capture.active,false);assert.equal(capture.stops,1);await assert.rejects(fetch(config.url.replace('ws:','http:').replace('/bridge','/health')));
  assert.equal((await fetch(s.url,{method:'POST',headers:s.headers})).status,403);
 }finally{await s.close();}
});
test('shutdown during service startup closes a late service rather than leaking it or returning credentials',async()=>{
 let resolve!:(v:any)=>void,closes=0;const s=await setup({bridgeFactory:()=>new Promise(r=>{resolve=r;})});try{
  const response=fetch(s.url,{method:'POST',headers:s.headers});for(let i=0;i<100&&!resolve;i++)await pause();assert.ok(resolve);
  const close=s.managed.close();resolve({port:12345,token:'a'.repeat(64),close:async()=>{closes++;}});await close;
  const result=await response;assert.equal(result.status,503);assert.equal((await result.text()).includes('token'),false);assert.equal(closes,1);
 }finally{await s.close();}
});
test('managed boot refuses a viewer bound to a nonloopback interface',async()=>{
 const s=await setup();try{const address=s.vite.httpServer.address.bind(s.vite.httpServer);s.vite.httpServer.address=()=>({...address() as any,address:'0.0.0.0'});const r=await fetch(s.url,{method:'POST',headers:s.headers});assert.equal(r.status,403);assert.equal(s.created.length,0);}finally{await s.close();}
});
