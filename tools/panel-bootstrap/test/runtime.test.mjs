import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture,copyBootstrap,until} from './fixture.mjs';
import {coreSnapshot,dependencyProblems,versionMatches,installCore,installerEnvironment,redact,lineSink,createLog,selectedTarget,supportedRuntime,probePanel,coreInUse} from '../runtime.mjs';
import {startPanel} from '../bootstrap.mjs';

test('preflight resolves real packages in this core, not directory/stamp presence or ambient modules',t=>{
  const f=fixture(t); f.put('.setup-stamp','old success');
  assert.equal(dependencyProblems(coreSnapshot(f.root)).length,1);
  f.install('1.2.2'); assert.equal(dependencyProblems(coreSnapshot(f.root)).length,1);
  f.install(); assert.deepEqual(dependencyProblems(coreSnapshot(f.root)),[]);
  fs.unlinkSync(path.join(f.root,'packages/control-panel/node_modules/fixture-lib/index.js'));
  assert.equal(dependencyProblems(coreSnapshot(f.root)).length,1);
});
test('wrong, linked and escaped package graphs cannot select private/external installation',t=>{
  const f=fixture(t);
  f.put('pnpm-workspace.yaml','packages:\n - packages/*\n - tools/*\n - .xrbuild/plugins/*\n');
  assert.throws(()=>coreSnapshot(f.root),/only packages/);
  f.put('pnpm-workspace.yaml','packages:\n - packages/*\n - tools/*\n');
  f.put('packages/control-panel/package.json',JSON.stringify({name:'panel',dependencies:{outside:'file:../../../outside'}}));
  assert.throws(()=>coreSnapshot(f.root),/escapes/);
  f.put('packages/control-panel/package.json',JSON.stringify({name:'panel',dependencies:{outside:'workspace:*'}}));
  assert.throws(()=>coreSnapshot(f.root),/escapes/);
  f.put('packages/control-panel/package.json',JSON.stringify({name:'panel',optionalDependencies:{outside:'file:../../../outside'}}));assert.throws(()=>coreSnapshot(f.root),/escapes/);
  f.put('packages/control-panel/package.json',JSON.stringify({name:'panel',pnpm:{patchedDependencies:{outside:'../private.patch'}}}));assert.throws(()=>coreSnapshot(f.root),/overrides/);
  f.put('package.json',JSON.stringify({packageManager:'pnpm@latest'}));assert.throws(()=>coreSnapshot(f.root),/exact/);
});
test('dangling or externally linked modules cannot borrow an ambient installation',t=>{
  const f=fixture(t),outside=fixture(t);outside.install();
  const link=path.join(f.root,'packages/control-panel/node_modules/fixture-lib');fs.mkdirSync(path.dirname(link),{recursive:true});
  fs.symlinkSync(path.join(outside.root,'packages/control-panel/node_modules/fixture-lib'),link,process.platform==='win32'?'junction':'dir');
  assert.equal(dependencyProblems(coreSnapshot(f.root)).length,1);
  fs.rmSync(link,{recursive:true});fs.symlinkSync(path.join(f.root,'missing-module'),link,process.platform==='win32'?'junction':'dir');
  assert.equal(dependencyProblems(coreSnapshot(f.root)).length,1);
});
test('dependency compatibility is pinned or bounded, including caret zero ranges',()=>{
  for(const[v,s,yes]of[['1.2.3','1.2.3',true],['1.3.0','^1.2.3',true],['2.0.0','^1.2.3',false],['0.3.0','^0.2.1',false],['0.2.2','^0.2.1',true],['0.0.2','^0.0.1',false],['1.2.8','~1.2.3',true],['1.3.0','~1.2.3',false]])assert.equal(versionMatches(v,s),yes);
});
test('installation uses exact manager/frozen/no-scripts graph and verifies real results',async t=>{
  const f=fixture(t),before=coreSnapshot(f.root).fingerprint,calls=[];
  await installCore(f.root,{write(){}},async(root,args,log)=>{assert.equal(root,f.root);calls.push(args);if(args[0]==='--version')log.write('9.15.9');else f.install();});
  assert.equal(coreSnapshot(f.root).fingerprint,before);assert.equal(calls.length,2);
  for(const flag of ['--frozen-lockfile','--ignore-scripts','--ignore-pnpmfile'])assert.ok(calls[1].includes(flag));
  assert.ok(calls[1].some(v=>v.startsWith('--config.userconfig=')));
});
test('offline, wrong manager, changed inputs and missing post-install output never certify setup',async t=>{
  const f=fixture(t),log={write(){}};
  await assert.rejects(installCore(f.root,log,async()=>{throw Error('offline');}),/offline/);
  await assert.rejects(installCore(f.root,log,async(r,a,l)=>l.write('9.0.0')),/pinned version/);
  await assert.rejects(installCore(f.root,log,async(r,a,l)=>{if(a[0]==='--version')l.write('9.15.9');}),/still unavailable/);
  await assert.rejects(installCore(f.root,log,async(r,a,l)=>{l.write('9.15.9');f.put('pnpm-lock.yaml','changed');}),/changed/);
  f.put('.npmrc','workspace-dir=../another');await assert.rejects(installCore(f.root,log),/manual review/);
});
test('installer environment removes routing/hook overrides but never changes global tooling',()=>{
  const e=installerEnvironment({PATH:'safe',NODE_OPTIONS:'--import bad',NODE_PATH:'outside',npm_config_workspace_dir:'private',PNPM_HOME:'outside',GIT_DIR:'other',COREPACK_ENABLE_NETWORK:'0',SECRET_TOKEN:'fake-value'});
  assert.equal(e.PATH,'safe');assert.equal(e.NODE_OPTIONS,undefined);assert.equal(e.npm_config_workspace_dir,undefined);assert.equal(e.COREPACK_ENABLE_NETWORK,'0');assert.equal(e.COREPACK_ENABLE_DOWNLOAD_PROMPT,'0');
});
test('split stream output is decoded, bounded and redacted before logging/copying',t=>{
  const f=fixture(t),log=createLog(path.join(f.root,'runtime/setup.log'),{API_TOKEN:'synthetic-credential'}),sink=lineSink(log.write);
  sink.write('token=synthetic-');sink.write('credential\nhttps://user:pass@example.invalid Bearer hidden\n\x1b[31mred\x1b[0m\n');
  sink.write('x'.repeat(17000));sink.write('tail\n');sink.end();
  const text=log.tail();assert.doesNotMatch(text,/synthetic-credential|user:pass|Bearer hidden|\x1b/);assert.match(text,/redacted/);assert.match(text,/oversized/);
  for(let i=0;i<400;i++)log.write('x'.repeat(1000));assert.ok(fs.statSync(log.file).size<300000);assert.ok(log.tail().length<=32768);
  assert.equal(redact('ordinary output',{}),'ordinary output');
});
test('route selection preserves user/development/auto and explicit project/env precedence',()=>{
  const root=path.resolve('fixture-core'),env={USERPROFILE:path.resolve('home')};
  const user=selectedTarget(root,['--open','--shortcut-launch=user'],env);assert.equal(user.port,5180);assert.equal(user.explicit,false);
  const dev=selectedTarget(root,['--workspace=.xrbuild','--shortcut-launch=repository'],{...env,XRB_HOME:path.resolve('elsewhere')});assert.equal(dev.workspace,path.join(root,'.xrbuild'));assert.equal(dev.port,5181);assert.equal(dev.explicit,true);
  const auto=selectedTarget(root,['--auto-workspace','--shortcut-launch=auto'],env);assert.equal(auto.workspace,user.workspace);
  assert.equal(selectedTarget(root,[],{...env,XRB_PANEL_PORT:'6123'}).port,6123);
  for(const args of [['--workspace'],['--workspace='],['--anything'],['--workspace=x','--auto-workspace']])assert.throws(()=>selectedTarget(root,args,env));
  assert.throws(()=>supportedRuntime({}),/22.18/);
});
test('wrapper entries remain stable and enter dependency-free bootstrap before panel imports',()=>{
  const root=path.resolve(import.meta.dirname,'../../..');
  for(const name of ['start.vbs','start-repo.vbs','start-auto.vbs']){
    const text=fs.readFileSync(path.join(root,name),'utf8');assert.match(text,/tools\\panel-bootstrap\\bootstrap\.mjs/);assert.doesNotMatch(text,/src\\server\.ts/);assert.match(text,/, 0, False/);
  }
  for(const name of ['runtime.mjs','bootstrap.mjs','child.mjs'])for(const m of fs.readFileSync(path.join(root,'tools/panel-bootstrap',name),'utf8').matchAll(/from ['"]([^'"]+)['"]/g))assert.ok(m[1].startsWith('node:')||m[1].startsWith('./'));
});
test('detached panel imports/logs survive coordinator teardown without inherited stdout pipes',async t=>{
  const f=fixture(t);copyBootstrap(f);f.install();
  // Reserve a fresh port independently of any live panel.
  const net=await import('node:net');const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  f.target.port=port;
  f.put('packages/control-panel/src/server.ts',`import http from 'node:http';console.log('early server output');const server=http.createServer((q,s)=>s.end(JSON.stringify({app:'xrb-control-panel',repo:process.cwd(),workspace:process.env.XRB_HOME,projects:process.env.XRB_PROJECTS_HOME})));server.listen(Number(process.env.XRB_PANEL_PORT),'127.0.0.1');setTimeout(()=>console.log('late server output'),250);`);
  const c=await f.coordinator({}, {startTimeout:5000});const m=await c.register(f.target);
  await until(()=>probePanel(f.target,f.root),v=>v==='matching',5000);
  const child=[...c.sessions.values()][0].child;f.cleanup(()=>new Promise(resolve=>{if(!child||child.exitCode!=null)return resolve();child.once('exit',resolve);child.kill();}));await c.close();
  await new Promise(r=>setTimeout(r,400));assert.equal(await probePanel(f.target,f.root),'matching');assert.match(c.log.tail(),/late server output/);assert.equal(await coreInUse(f.root),true);
});
