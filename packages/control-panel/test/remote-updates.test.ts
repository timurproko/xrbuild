import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { JobRunner } from '../src/jobs.ts';
import { Panel } from '../src/panel.ts';
import { discoverRemoteTip, remoteGit, RemoteUpdates, REMOTE_UPDATE_INTERVAL_MS, type RemoteGit } from '../src/remote-updates.ts';
import { fixture, git, snapshot } from './helpers/update-fixture.ts';

test('passive checks discover either current default tip without fetching or touching local changes/index', async t => {
  const f=await fixture(t), signal=new AbortController().signal;
  assert.equal((await discoverRemoteTip(f.core.checkout,signal))?.available,false);
  const before=await snapshot(f.core.checkout), refs=git(f.core.checkout,'show-ref');
  await f.core.publish();
  await fs.writeFile(`${f.core.checkout}/settings.json`,'personal');
  const dirty=await snapshot(f.core.checkout);
  const result=await discoverRemoteTip(f.core.checkout,signal);
  assert.equal(result?.available,true);assert.equal(result.branch,'main');
  assert.deepEqual(await snapshot(f.core.checkout),dirty);assert.equal(git(f.core.checkout,'show-ref'),refs);assert.equal(f.core.head(),before.head);
  const service=new RemoteUpdates(f.core.checkout,f.workspace.checkout,()=>false,()=>{});
  await service.check();assert.equal(service.status.available,true);assert.equal(service.status.workspace?.available,false);
  await f.workspace.publish();await service.check(true);assert.equal(service.status.workspace?.available,true);
  // The remote changes its default branch independently of stale upstream configuration.
  git(f.workspace.publisher,'checkout','-qb','next');await f.workspace.publish('other.txt','next\n');
  git(f.workspace.publisher,'push','-q','origin','HEAD:next');git(f.workspace.remote,'symbolic-ref','HEAD','refs/heads/next');
  assert.equal((await discoverRemoteTip(f.workspace.checkout,signal))?.branch,'next');
  await service.close();
});

test('local-ahead, dirty and nested non-repositories do not invent remote updates', async t => {
  const f=await fixture(t),signal=new AbortController().signal;
  await fs.writeFile(`${f.core.checkout}/shared.txt`,'local\n');git(f.core.checkout,'add','.');git(f.core.checkout,'commit','-qm','local');
  assert.equal((await discoverRemoteTip(f.core.checkout,signal))?.available,false);
  await fs.mkdir(`${f.core.checkout}/nested`);assert.equal(await discoverRemoteTip(`${f.core.checkout}/nested`,signal),null);
});

test('five-minute caching, identical-root deduplication and silent offline checks retain honest timestamps', async t => {
  const f=await fixture(t);assert.equal(REMOTE_UPDATE_INTERVAL_MS,300000);
  let calls=0,busy=true;
  const service=new RemoteUpdates(f.core.checkout,f.core.checkout,()=>busy,()=>{});
  service.git=async(...args)=>{calls++;return remoteGit(...args);};
  await service.check();assert.equal(calls,0);
  busy=false;await service.check();const count=calls;
  assert.equal(service.status.core,service.status.workspace);assert.equal(count,3);
  await service.check();assert.equal(calls,count);
  const checked=service.status.core?.checkedMs;
  service.git=async()=>({code:1,output:'offline'});await service.check(true);
  assert.equal(service.status.core?.checkedMs,checked);
  await service.close();
});

test('job and idle notifications cannot activate discovery before server startup or after shutdown', async t => {
  const f=await fixture(t);
  const panel=new Panel(f.core.checkout,f.workspace.checkout,{send(){}} as ConstructorParameters<typeof Panel>[2]);
  let calls=0;
  panel.remoteUpdates.git=async()=>{calls++;return {code:1,output:''};};
  try {
    for(const kind of ['web-build','update'] as const) {
      const job=panel.jobs.start(kind,null,'fixture work',async()=>{});
      assert.equal(job.state,'running');await panel.jobs.wait(job);
    }
    panel.runner.emit('state',{phase:'idle'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,0,'bare Panel use must not acquire a background Git process or admission barrier');
    panel.remoteUpdates.start();await panel.remoteUpdates.check();
    assert.ok(calls>0,'server startup still checks immediately');
    const initial=calls;
    const update=panel.jobs.start('update',null,'fixture update',async()=>{});
    await panel.jobs.wait(update);await panel.remoteUpdates.check();
    assert.ok(calls>initial,'an active server still rechecks after Update');
    await panel.remoteUpdates.close();const stopped=calls;
    const later=panel.jobs.start('update',null,'after shutdown',async()=>{});
    await panel.jobs.wait(later);panel.runner.emit('state',{phase:'idle'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,stopped,'shutdown cannot be undone by completion/idle notifications');
  } finally {await panel.dispose();}
});

test('job reservation cancels and drains a passive query before any queued job body starts', async () => {
  const jobs=new JobRunner();let started!:()=>void,release!:()=>void,aborted=false,ran=false;
  const entered=new Promise<void>(resolve=>started=resolve);
  const service=new RemoteUpdates('core','workspace',()=>jobs.active().length>0,()=>{});
  service.git=async(_args,_cwd,signal)=>{started();await new Promise<void>(resolve=>{release=resolve;signal.addEventListener('abort',()=>{aborted=true;},{once:true});});return {code:1,output:''};};
  jobs.beforeStart=()=>service.pause();
  const check=service.check();await entered;
  const job=jobs.start('web-build',null,'build',async()=>{ran=true;});
  assert.equal(aborted,true);assert.equal(job.state,'queued');assert.equal(ran,false);
  // Even a forced timer check does not start while a job is reserved.
  await service.check(true);assert.equal(ran,false);
  release();await check;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ran,true);assert.equal(job.state,'done');await service.close();
});

test('timeout and explicit cancellation stop the Git network-helper tree silently', async t => {
  const f=await fixture(t),server=http.createServer();
  server.on('request',()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  git(f.core.checkout,'remote','set-url','origin',`http://127.0.0.1:${port}/stall`);
  try {
    const result=await remoteGit(['ls-remote','origin','HEAD'],f.core.checkout,new AbortController().signal,150);
    assert.notEqual(result.code,0);
    const controller=new AbortController();
    const work=remoteGit(['ls-remote','origin','HEAD'],f.core.checkout,controller.signal);
    setTimeout(()=>controller.abort(),150);assert.notEqual((await work).code,0);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
