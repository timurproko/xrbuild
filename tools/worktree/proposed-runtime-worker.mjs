// Isolated current-proposal integration. Never imports installed A1 or uses this session's data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPinnedRuntime, sourceRoot } from './proposed-a1-fixture.mjs';
import { executeGit } from './portable-context.mjs';
import { executeScopedNonForceRemoval } from './published-removal.mjs';
import { assertOwnershipExclusion } from './ownership-exclusion.mjs';
import { offlineExactRemovalDeclaration, invokeOfflineRepositoryAdapter, inspectRuntimeLocalRemoval } from './runtime-removal-adapter.mjs';
const git = (cwd, ...args) => executeGit(cwd, ['-c', 'commit.gpgsign=false', ...args]);
async function liveChild(cwd) {
  const child = spawn(process.execPath, ['-e', "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));console.log('ready');"], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
  return { child, async stop() { if (child.exitCode === null) child.stdin.end(); return await closed; } };
}
async function liveOwner(cwd, runtime) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./proposed-owner-process.mjs', import.meta.url)), runtime.contextModuleUrl, runtime.livenessModuleUrl], {cwd, stdio:['pipe','pipe','pipe','ipc']});
  const closed = new Promise((resolve,reject) => {child.once('error',reject);child.once('close',resolve);});
  let sequence = 0; const pending = new Map();
  child.on('message', message => {if(message.ready)return;const slot=pending.get(message.id);if(!slot)return;pending.delete(message.id);if(message.error)slot.reject(Object.assign(Error(message.error.message),{code:message.error.code}));else slot.resolve(message.result);});
  await new Promise((resolve,reject) => {child.once('error',reject);child.once('message',message => message.ready?resolve():reject(Error('Owner startup failed')));});
  return {child,call(operation,args){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.send({id,operation,...args});});},async stop(){if(child.exitCode===null)child.stdin.end();return await closed;}};
}
function repository(box, complete) {
  const root = path.join(box, 'primary'), remote = path.join(box, 'remote.git'); fs.mkdirSync(root);
  git(root, 'init', '--quiet', '-b', 'main'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(root, '.gitignore'), '.worktrees/\n.artifacts/\n.xrbuild/\n*.local\n'); fs.writeFileSync(path.join(root, 'source.txt'), 'published fixture source\n');
  fs.mkdirSync(path.join(root, '.a1')); fs.writeFileSync(path.join(root, '.a1/worktree.json'), JSON.stringify(offlineExactRemovalDeclaration()) + '\n');
  git(root, 'add', '.'); git(root, 'commit', '--quiet', '-m', 'offline adapter fixture');
  git(root, 'init', '--quiet', '--bare', remote); git(root, 'remote', 'add', 'origin', remote); git(root, 'push', '--quiet', 'origin', 'main');
  const target = path.join(root, '.worktrees/task'), unrelated = path.join(root, '.worktrees/unrelated');
  git(root, 'worktree', 'add', '--quiet', '-b', 'chore/task', target); git(root, 'worktree', 'add', '--quiet', '-b', 'chore/unrelated', unrelated);
  if (complete) { fs.writeFileSync(path.join(target, 'task.txt'), 'reviewed task\n'); git(target, 'add', '.'); git(target, 'commit', '--quiet', '-m', 'reviewed task'); }
  const head = git(target, 'rev-parse', 'HEAD'); git(root, 'push', '--quiet', 'origin', 'chore/task');
  let mergeHead = null;
  if (complete) {
    mergeHead = git(root, 'commit-tree', `${head}^{tree}`, '-p', git(root, 'rev-parse', 'main'), '-m', 'squashed task fixture');
    git(root, 'push', '--quiet', 'origin', `${mergeHead}:refs/heads/main`);
    git(root, 'push', '--quiet', 'origin', ':refs/heads/chore/task'); // Fixture setup models normal delete-on-merge; adapter never deletes refs.
  }
  const remoteRefs = git(remote, 'show-ref'), localRefs = git(root, 'show-ref', '--heads'), calls = [];
  const execute = (cwd, args, options) => { calls.push({ cwd, args: [...args] }); return executeGit(cwd, args, options); };
  const identify = cwd => git(cwd, 'remote', 'get-url', 'origin') === remote ? 'timurproko/xrbuild' : 'foreign/repository';
  return { root, target, unrelated, remote, head, mergeHead, remoteRefs, localRefs, calls, execute, identify };
}
export async function runProposedRuntimeScenario(scenario = 'new-owner', cacheRoot = sourceRoot) {
  if (!['new-owner','success','merged-success','unmerged-complete','new-owner-before-execute','scope-contender','scope-replaced','dirty-preflight','changed-declaration','late-content','reowned-head-change','recreated-target','lease-loss','missing-facility'].includes(scenario)) throw Error('Unknown offline scenario');
  const runtime = await loadPinnedRuntime(cacheRoot), box = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'xr-runtime-sequence-'))), children = [];
  try {
    const complete = ['merged-success','unmerged-complete'].includes(scenario), f = repository(box, complete), context = runtime.context, completion = runtime.completion;
    const shell = await liveChild(f.target), otherProcess = await liveOwner(f.root, runtime); children.push(shell, otherProcess);
    const session = name => { const identity = { sessionId: name, sessionFile: path.join(box, `${name}.jsonl`) }; fs.writeFileSync(identity.sessionFile, JSON.stringify({ type:'session',version:3,id:name,cwd:f.root })+'\n'); return identity; };
    const first = session('first-session'), other = session('other-session'), dataDir = path.join(box, 'isolated-data');
    const options = { dataDir, runtimeId:'first-runtime' }, otherOptions = { dataDir, runtimeId:'other-runtime' };
    await context.registerSessionRepositoryRuntime(first, options.runtimeId, {pid:process.pid,startIdentity:runtime.liveness.PID_LIVENESS_IDENTITY}, options);
    await otherProcess.call('register',{identity:other,options:otherOptions});
    await context.setSessionRepositoryContext(first, f.target, options);
    const acquireOther = options => otherProcess.call('attach',{identity:other,options,target:f.target});
    const events = []; let retainedScope, retainedSnapshot, contenderCode = null, lateAcquired = false, leaseLossObserved = false, misboundScopeRejected = false;
    const dependencies = { execute:f.execute, identify:f.identify, runtime, runtimeOptions:options,
      readPull: number => ({number,state:'closed',merged:scenario !== 'unmerged-complete',merged_at:'2026-11-14T00:00:00Z',merge_commit_sha:f.mergeHead,
        head:{sha:f.head,ref:'chore/task',repo:{full_name:'timurproko/xrbuild'}},base:{ref:'main',repo:{full_name:'timurproko/xrbuild'}},
        body:'```openspec-implementation\n{"version":1,"change":"fixture"}\n```'}),
      remove: async (root,target,signal) => { f.calls.push({cwd:root,args:['worktree','remove','--',target]}); await executeScopedNonForceRemoval(root,target,signal); },
      onScopeHeld: async (scope, snapshot) => {
        retainedScope = scope; retainedSnapshot = snapshot;
        try { assertOwnershipExclusion(scope,{...snapshot,target:f.unrelated}); } catch { misboundScopeRejected = true; }
        if (scenario === 'lease-loss') {
          const acquisition = otherProcess.call('attach-after-delay',{identity:other,options:otherOptions,target:f.target,delayMs:11_500});
          // Actual event-loop suspension in this isolated owner; another OS process can run and reclaim the stale lease.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,14_000);
          await acquisition;
          leaseLossObserved = (await context.readActiveSessionRepositoryContext(other,otherOptions))?.cwd === f.target;
        }
        if (scenario === 'scope-contender') {
          try { await acquireOther({...otherOptions,lockTimeoutMs:50}); }
          catch(error) { contenderCode = error.code; }
        }
        if (scenario === 'scope-replaced') {
          const gate = path.join(dataDir,runtime.identity.state.sessionWorktreeClaimDirectory,'mutation.authority.gate');
          fs.renameSync(gate,`${gate}.test-retained`); fs.mkdirSync(gate); // External lock-loss fault, not fabricated ownership information.
        }
      } };
    const run = async (command,args,cwd) => {
      const attached = await context.readActiveSessionRepositoryContext(first,options);
      const event = {phase:args[1],command,args,cwd,attached:attached?.cwd??null,shellAlive:shell.child.exitCode===null}; events.push(event);
      if (scenario === 'new-owner-before-execute' && args[1] === 'execute') { await acquireOther(otherOptions); lateAcquired = true; }
      try { const stdout=await invokeOfflineRepositoryAdapter(command,args,cwd,dependencies);event.report=JSON.parse(stdout);return stdout; }
      catch(error) { if(error.stdout)event.report=JSON.parse(error.stdout);throw error; }
    };
    if(scenario==='missing-facility')dependencies.runtime = null;
    if(scenario==='dirty-preflight')fs.writeFileSync(path.join(f.target,'notes.local'),'synthetic ignored content');
    let request, requestError;
    try { request = complete ? await completion.requestSessionWorktreeCompletion(first,{change:'fixture',pr:19},{...options,run}) : await completion.requestSessionWorktreeLocalRemoval(first,{...options,run}); }
    catch(error) { requestError={code:error.code,message:error.message}; }
    if(requestError)return {revision:runtime.revision,scenario,requestError,events,stillAttached:(await context.readActiveSessionRepositoryContext(first,options))?.cwd===f.target,targetPreserved:fs.existsSync(f.target),deletionCalls:0};
    const detached=await context.readActiveSessionRepositoryContext(first,options)===null;
    const common=path.join(f.root,'.git'), admin=git(f.target,'rev-parse','--absolute-git-dir');
    const afterDetachState=await context.sessionWorktreeClaimState(common,admin,options);
    if(['new-owner','reowned-head-change'].includes(scenario))await acquireOther(otherOptions);
    if(scenario==='reowned-head-change') {
      fs.writeFileSync(path.join(f.target,'source.txt'),'new owner published new work\n');git(f.target,'add','.');git(f.target,'commit','--quiet','-m','new owner work');git(f.target,'push','--quiet','origin','chore/task');
      await otherProcess.call('detach',{identity:other,options:otherOptions});
    }
    if(scenario==='changed-declaration'){const d=offlineExactRemovalDeclaration();d.localRemoval.execute.push('--changed');fs.writeFileSync(path.join(f.root,'.a1/worktree.json'),JSON.stringify(d)+'\n');}
    if(scenario==='late-content')fs.writeFileSync(path.join(f.target,'notes.local'),'synthetic content after detach');
    if(scenario==='recreated-target'){await shell.stop();git(f.root,'worktree','remove','--',f.target);git(f.root,'worktree','add','--quiet',f.target,'chore/task');}
    const beforeExecutionLocalRefs=git(f.root,'show-ref','--heads'),beforeExecutionRemoteRefs=git(f.remote,'show-ref');
    const secondOwner=await context.readActiveSessionRepositoryContext(other,otherOptions), ownerState=await context.sessionWorktreeClaimState(common,admin,options);
    const shellExit=await shell.stop(), shellExitedBeforeSettlement=shell.child.exitCode!==null;
    const settled=await completion.settleSessionWorktreeCompletion(first,{...options,run});
    const replay=await completion.settleSessionWorktreeCompletion(first,{...options,run});
    const observed=await context.withSessionRepositoryObservation(first,value=>({...value,source:fs.readFileSync(path.join(value.cwd,'source.txt'),'utf8')}),options);
    const directExecution=scenario==='new-owner'?await inspectRuntimeLocalRemoval({phase:'execute',root:f.root,target:f.target,...dependencies}):null;
    let expiredScopeRejected = null;
    if(retainedScope){try{assertOwnershipExclusion(retainedScope,retainedSnapshot);expiredScopeRejected=false;}catch{expiredScopeRejected=true;}}
    return {revision:runtime.revision,scenario,mockedDependencies:runtime.mockedDependencies,request,events,
      preflightPassed:events[0]?.report?.results[0]?.disposition==='eligible',preflightWhileOwned:events[0]?.attached===f.target&&events[0]?.shellAlive===true,
      detached,afterDetachState,secondOwnerAcquired:secondOwner?.cwd===f.target,ownerState,shellExit,shellExitedBeforeSettlement,settled,replay,directExecution,
      targetPreserved:fs.existsSync(f.target),targetRemoved:!fs.existsSync(f.target),unrelatedCheckoutPreserved:fs.existsSync(f.unrelated)&&git(f.unrelated,'rev-parse','HEAD')===git(f.root,'rev-parse','HEAD'),
      localHead:f.head,mergeHead:f.mergeHead,retainedHead:git(f.root,'rev-parse','chore/task'),
      localRefsPreserved:git(f.root,'show-ref','--heads')===beforeExecutionLocalRefs,remoteRefsPreserved:git(f.remote,'show-ref')===beforeExecutionRemoteRefs,
      bulkSweepCalls:events.filter(event=>event.args.includes('sweep')).length,deletionCalls:f.calls.filter(call=>call.args[0]==='worktree'&&call.args[1]==='remove').length,
      sessionUsableOutsideTarget:observed.cwd===f.root&&observed.revision==='unlinked'&&observed.source==='published fixture source\n',
      contenderCode,lateAcquired,leaseLossObserved,misboundScopeRejected,expiredScopeRejected,liveAdoption:'disabled',releasedCompatibility:'unverified'};
  } finally {for(const child of children)await child.stop();runtime.dispose();fs.rmSync(box,{recursive:true,force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{console.log(JSON.stringify(await runProposedRuntimeScenario(process.argv[2],process.argv[3])));}catch(error){console.error(JSON.stringify({error:error.message,code:error.code}));process.exitCode=1;}
}
