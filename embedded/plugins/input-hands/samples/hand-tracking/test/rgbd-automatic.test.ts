import test from 'node:test';import assert from 'node:assert/strict';
import { AutomaticBridge,pairLocal } from '../src/live/rgbd/automatic.ts';
const reply=()=>new Response(JSON.stringify({version:1,url:'ws://127.0.0.1:54321/bridge',token:'a'.repeat(64)}),{headers:{'Content-Type':'application/json'}});

test('automatic pairing uses a same-origin no-store non-simple POST, never URL/storage credentials',async()=>{
 let calls=0;const request:typeof fetch=async(input,options)=>{calls++;assert.equal(input,'/__handtracking/bridge');assert.equal(options?.method,'POST');assert.equal(options?.mode,'same-origin');assert.equal(options?.cache,'no-store');assert.equal(options?.credentials,'omit');assert.equal(options?.redirect,'error');assert.deepEqual(options?.headers,{'X-HandTracking-Local':'1'});return reply();};
 const result=await pairLocal(new AbortController().signal,request);assert.equal(calls,1);assert.equal(result.url,'ws://127.0.0.1:54321/bridge');assert.equal(result.token,'a'.repeat(64));
});
test('automatic pairing rejects static-page fallbacks, bad/oversized credentials, nonlocal endpoints and service failures',async()=>{
 const bodies=[new Response('<html>not a managed server</html>'),new Response('x'.repeat(2049),{headers:{'Content-Type':'application/json'}}),
  new Response('{"token":', {headers:{'Content-Type':'application/json'}}),
  ...[{version:2,url:'ws://127.0.0.1:5191/bridge',token:'a'.repeat(64)},{version:1,url:'ws://remote.example:5191/bridge',token:'a'.repeat(64)},
    {version:1,url:'ws://localhost:5191/bridge?token=secret',token:'a'.repeat(64)},{version:1,url:'ws://localhost:5191/bridge',token:'bad'}].map(v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}}))];
 for(const response of bodies)await assert.rejects(pairLocal(new AbortController().signal,async()=>response));
 await assert.rejects(pairLocal(new AbortController().signal,async()=>new Response(JSON.stringify({error:'SDK not prepared'}),{status:503,headers:{'Content-Type':'application/json'}})),/SDK not prepared/);
});
test('source change/disposal fences a successful late pairing even when fetch ignores abort',async()=>{
 let resolve!:(r:Response)=>void,calls=0;const errors:string[]=[];
 const automatic=new AutomaticBridge({connect:()=>{calls++;},error:e=>errors.push(e)},async()=>new Promise(r=>{resolve=r;}));
 const work=automatic.connect();assert.equal(automatic.pending,true);automatic.cancel();resolve(reply());await work;
 assert.equal(calls,0);assert.deepEqual(errors,[]);assert.equal(automatic.pending,false);
});
test('retry is latest-wins and an older finally cannot clear a newer pending connection',async()=>{
 const pending:((r:Response)=>void)[]=[],connections:string[]=[];
 const automatic=new AutomaticBridge({connect:url=>connections.push(url),error:e=>assert.fail(e)},async()=>new Promise(resolve=>pending.push(resolve)));
 const first=automatic.connect(),second=automatic.connect();pending[0](reply());await first;assert.equal(automatic.pending,true);pending[1](reply());await second;
 assert.deepEqual(connections,['ws://127.0.0.1:54321/bridge']);assert.equal(automatic.pending,false);
});
test('a timed-out successful late pairing cannot open a socket',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let resolve!:(r:Response)=>void,connections=0;const errors:string[]=[];
 const automatic=new AutomaticBridge({connect:()=>{connections++;},error:e=>errors.push(e)},async()=>new Promise(r=>{resolve=r;}));
 const work=automatic.connect();t.mock.timers.tick(10001);resolve(reply());await work;
 assert.equal(connections,0);assert.match(errors[0],/timed out/);assert.equal(automatic.pending,false);
});
test('connection/transport failure is visible and never silently falls back to a camera',async()=>{
 const errors:string[]=[];let connects=0;const automatic=new AutomaticBridge({connect:()=>{connects++;},error:e=>errors.push(e)},async()=>{throw new Error('SIMULATED offline');});
 await automatic.connect();assert.equal(connects,0);assert.match(errors[0],/offline/);assert.equal(automatic.pending,false);
});
