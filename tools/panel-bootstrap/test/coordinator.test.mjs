import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fixture,state,action,until} from './fixture.mjs';
import {requestOwner,main,waitForSetupPage} from '../bootstrap.mjs';

test('missing packages show a session before work; success verifies destination and replays without reinstall',async t=>{
  const f=fixture(t);let installs=0,starts=0,ready=false;
  const c=await f.coordinator({probe:async()=>ready?'matching':'free',install:async()=>{installs++;f.install();},start:()=>{starts++;ready=true;return {};}});
  const m=await c.register(f.target);assert.equal(m.kind,'setup');assert.equal(installs,0);assert.equal((await state(m)).state,'waiting');
  assert.equal((await action(m)).status,202);const done=await until(()=>state(m),s=>s.state==='ready');
  assert.equal(done.url,`http://127.0.0.1:${f.target.port}/`);assert.equal(installs,1);assert.equal(starts,1);
  assert.equal((await action(m)).status,200);assert.equal(installs,1);assert.equal((await c.register(f.target)).kind,'panel');
});
test('ready core and responsive exact panel skip installer and unnecessary setup window',async t=>{
  const f=fixture(t);f.install();let calls=0,ready=false;
  const c=await f.coordinator({probe:async()=>ready?'matching':'free',install:()=>{throw Error('unexpected install');},start:()=>{calls++;ready=true;return {};}});
  assert.equal((await c.register(f.target)).kind,'panel');assert.equal(calls,1);
  assert.equal((await c.register(f.target)).kind,'panel');assert.equal(calls,1);
});
test('matching existing panel can open without missing-dependency repair underneath it',async t=>{
  const f=fixture(t);const c=await f.coordinator({probe:async()=> 'matching',snapshot:()=>{throw Error('must not inspect/install in-use deps');}});
  assert.equal((await c.register(f.target)).kind,'panel');
});
test('duplicate clicks coalesce one install; distinct modes retain own destinations',async t=>{
  const f=fixture(t);let installs=0,release;const barrier=new Promise(r=>release=r),ready=new Set();
  const c=await f.coordinator({probe:async target=>ready.has(target.port)?'matching':'free',install:async()=>{installs++;f.install();await barrier;},start:(root,target)=>{ready.add(target.port);return {};}});
  const a=await c.register(f.target),a2=await c.register(f.target);assert.equal(a.url,a2.url);
  const b=await c.register({...f.target,mode:'user',explicit:false,workspace:path.join(f.root,'user'),projects:path.join(f.root,'user'),port:f.target.port+1});assert.notEqual(a.url,b.url);
  await Promise.all([action(a),action(a2),action(b)]);await until(async()=>installs,v=>v===1);
  const late=await c.register({...f.target,port:f.target.port+2});assert.equal(late.kind,'setup');assert.equal(ready.size,0);
  assert.equal((await state(a)).state,'installing');release();
  const [sa,sb]=await Promise.all([until(()=>state(a),s=>s.state==='ready'),until(()=>state(b),s=>s.state==='ready')]);
  assert.notEqual(sa.url,sb.url);assert.equal(installs,1);await until(async()=>ready.size,n=>n===3);
});
test('failure is persistent with explicit retry only; reconnect does not loop or cancel',async t=>{
  const f=fixture(t);let attempts=0,ready=false;
  const c=await f.coordinator({probe:async()=>ready?'matching':'free',install:async()=>{if(++attempts===1)throw Error('network offline');f.install();},start:()=>{ready=true;return {};}});
  const m=await c.register(f.target);await action(m);assert.match((await until(()=>state(m),s=>s.state==='failed')).message,/offline/);
  assert.equal((await c.register(f.target)).url,m.url);assert.equal(attempts,1);await action(m);assert.equal(attempts,1);
  assert.equal((await action(m,'/api/retry')).status,202);await until(()=>state(m),s=>s.state==='ready');assert.equal(attempts,2);
});
test('unknown listener, running core and unsupported runtime remain explicit safe failures',async t=>{
  const f=fixture(t);let installs=0;
  for(const overrides of [{probe:async()=> 'other'},{inUse:()=>true},{runtime:()=>{throw Error('unsupported Node');}}]){
    const c=await f.coordinator({probe:async()=> 'free',install:()=>installs++,...overrides});const m=await c.register(f.target);
    if((await state(m)).state==='waiting')await action(m);
    assert.equal((await until(()=>state(m),s=>s.state==='failed')).state,'failed');assert.equal(installs,0);await c.close();
  }
});
test('active close cannot orphan setup, and a failed-live server retry never duplicates it',async t=>{
  const f=fixture(t);f.install();let starts=0;const c=await f.coordinator({probe:async()=> 'free',start:()=>{starts++;return {};}});
  const m=await c.register(f.target);await until(()=>state(m),s=>s.state==='failed');assert.equal(starts,1);
  await action(m,'/api/retry');assert.equal((await action(m,'/api/close')).status,409);
  await until(()=>state(m),s=>s.state==='failed');assert.equal(starts,1);
});
test('early child exit cannot look successful merely because spawning succeeded',async t=>{
  const f=fixture(t);f.install();const c=await f.coordinator({probe:async()=> 'free',start:()=>({exitCode:1})});const m=await c.register(f.target);
  const s=await state(m);assert.equal(s.state,'failed');assert.match(s.message,/exited before/);assert.equal(s.url,null);
});
test('session HTTP requires exact Host/Origin/capability and allowlisted actions/assets',async t=>{
  const f=fixture(t);let calls=0;const c=await f.coordinator({probe:async()=> 'free',install:()=>calls++}),m=await c.register(f.target),url=new URL(m.url),auth={authorization:'Bearer '+url.hash.slice(1)};
  assert.equal((await fetch(url.origin+'/api/state')).status,403);
  const forgedHost=await new Promise((resolve,reject)=>{const request=http.get({host:'127.0.0.1',port:url.port,path:'/api/state',headers:{...auth,host:'foreign.invalid'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
  assert.equal(forgedHost,403);
  assert.equal((await fetch(url.origin+'/api/state',{headers:{...auth,origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await action(m,'/api/start',{headers:auth})).status,403);
  assert.equal((await action(m,'/api/start',{headers:{...auth,origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await action(m,'/api/start',{body:'arbitrary command'})).status,400);
  assert.equal((await fetch(url.origin+'/package.json',{headers:auth})).status,403);
  assert.equal((await fetch(url.origin+'/api/state?token=secret',{headers:auth})).status,400);
  assert.equal((await fetch(url.origin+'/startup.js')).status,200);assert.equal(calls,0);
  const response=await fetch(url.origin+'/');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('access-control-allow-origin'),null);
});
test('unknown/malformed IPC owners are not trusted and no lock/process cleanup happens',async t=>{
  const f=fixture(t),c=await f.coordinator({probe:async()=> 'free'});
  await assert.rejects(requestOwner(c.pipe,f.target,f.root,async()=>false),/Unverified/);
  await new Promise((resolve,reject)=>{const s=net.createConnection(c.pipe,()=>s.write('not json\n'));s.on('data',()=>s.end());s.on('end',resolve);s.on('error',reject);});
  assert.equal((await c.register(f.target)).kind,'setup');
});
test('browser acknowledgement is required; unavailable UI does not install invisibly',async t=>{
  const f=fixture(t);let calls=0;const c=await f.coordinator({probe:async()=> 'free',install:()=>calls++});const m=await c.register(f.target);
  await assert.rejects(waitForSetupPage(m.url,30),/setup page did not open/);assert.equal(calls,0);
  await state(m);await waitForSetupPage(m.url,100);assert.equal(calls,0);
});
test('browser launch failure does not start hidden dependency installation',async t=>{
  const f=fixture(t);let installs=0,fallback='',oldCode=process.exitCode;
  try{await main(['--shortcut-launch=user'],{root:f.root,directory:path.join(f.root,'main-runtime'),create:opts=>f.coordinator({probe:async()=> 'free',install:()=>installs++},{...opts,pipe:process.platform==='win32'?opts.pipe:'\0xr-main-'+path.basename(f.root)}),browser:async()=>{throw Error('no browser');},fallback:async text=>fallback=text});}
  finally{process.exitCode=oldCode;}
  assert.match(fallback,/no browser/);assert.equal(installs,0);
});
