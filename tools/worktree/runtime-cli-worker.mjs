// Deployed declaration -> actual packaged A1 request/settlement -> real XR CLI children. Only GitHub transport is replaced.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { fixtureDirectory, loadPinnedRuntime, sourceRoot } from './proposed-a1-fixture.mjs';
import { repository, liveOwner } from './proposed-runtime-worker.mjs';
import { executeGit } from './portable-context.mjs';
import { disposeFixture } from './fixture-disposal.mjs';
import { APPROVED_HASHES, findPlanningSnapshot } from './delivery-contract.mjs';
const git = (root, ...args) => executeGit(root, ['-c', 'commit.gpgsign=false', ...args]);
export async function runCliScenario(scenario, cacheRoot = sourceRoot) {
  if (!['cli-success','cli-local','cli-ambiguous','cli-unmerged','cli-private','cli-dirty','cli-unpublished','cli-missing-package','cli-legacy','cli-owner','cli-head-change','cli-recreated','cli-journal','cli-changed-declaration','cli-intent-change'].includes(scenario)) throw Error('Unknown CLI scenario');
  const runtime = await loadPinnedRuntime(cacheRoot), box = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'xr-cli-completion-')));
  let shell, peer, finished = false;
  try {
    const complete = scenario !== 'cli-local';
    const f = repository(box, complete, root => {
      for (const file of ['runtime-removal-adapter.mjs','a1-cleanup-runtime.mjs','ownership-exclusion.mjs','published-removal.mjs','portable-context.mjs','git-environment.mjs','delivery-contract.mjs']) {
        const target = path.join(root,'tools/worktree',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(sourceRoot,'tools/worktree',file),target);
      }
      fs.mkdirSync(path.join(root,'tools/pr-automation'),{recursive:true});fs.copyFileSync(path.join(sourceRoot,'tools/pr-automation/pr-body.mjs'),path.join(root,'tools/pr-automation/pr-body.mjs'));
      for (const dir of ['docs',findPlanningSnapshot(sourceRoot)]) for (const name of Object.keys(APPROVED_HASHES)) {
        const target=path.join(root,dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(sourceRoot,dir,name),target);
      }
      fs.copyFileSync(path.join(sourceRoot,'AGENTS.md'),path.join(root,'AGENTS.md'));
      fs.copyFileSync(path.join(sourceRoot,'.a1/worktree.json'),path.join(root,'.a1/worktree.json'));
      fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}\n');
      fs.appendFileSync(path.join(root,'.gitignore'),'node_modules/\n');
      fs.writeFileSync(path.join(root,'repo'),"console.log('timurproko/xrbuild');\n");
      fs.writeFileSync(path.join(root,'api'),`import fs from'node:fs';const data=JSON.parse(fs.readFileSync('.artifacts/github.json','utf8'));const route=process.argv.at(-1);if(route.includes('/commits/'))console.log(JSON.stringify(data.candidates));else if(/\\/pulls\\/19$/.test(route))console.log(JSON.stringify(data.pull));else process.exit(61);\n`);
    });
    fs.mkdirSync(path.join(f.root,'.artifacts'),{recursive:true});
    const pull={number:19,state:'closed',merged:scenario!=='cli-unmerged',merged_at:'2026-11-18T00:00:00Z',merge_commit_sha:f.mergeHead,
      head:{sha:f.head,ref:'chore/task',repo:{full_name:'timurproko/xrbuild'}},base:{ref:'main',repo:{full_name:'timurproko/xrbuild'}},
      body:'```openspec-implementation\n{"version":1,"change":"fixture"}\n```'};
    fs.writeFileSync(path.join(f.root,'.artifacts/github.json'),JSON.stringify({pull,candidates:scenario==='cli-ambiguous'?[pull,{...pull,number:20}]:[pull]}));
    const bin=path.join(box,'bin');fs.mkdirSync(bin);fs.copyFileSync(process.execPath,path.join(bin,process.platform==='win32'?'gh.exe':'gh'));if(process.platform!=='win32')fs.chmodSync(path.join(bin,'gh'),0o755);
    process.env.PATH=bin+path.delimiter+process.env.PATH;
    if(scenario!=='cli-missing-package') {fs.mkdirSync(path.join(f.root,'node_modules/@timurproko'),{recursive:true});fs.symlinkSync(fixtureDirectory(cacheRoot),path.join(f.root,'node_modules/@timurproko/a1'),'junction');}
    const dataDir=path.join(box,'isolated-data');process.env[runtime.identity.environment.dataDir]=dataDir;
    const identity={sessionId:'cli-completion',sessionFile:path.join(box,'session.jsonl')},options={dataDir,runtimeId:'cli-completion-runtime'};
    fs.writeFileSync(identity.sessionFile,JSON.stringify({type:'session',version:3,id:identity.sessionId,cwd:f.root})+'\n');
    await runtime.context.registerSessionRepositoryRuntime(identity,options.runtimeId,{pid:process.pid,startIdentity:runtime.liveness.PID_LIVENESS_IDENTITY},options);
    await runtime.context.setSessionRepositoryContext(identity,f.target,options);
    shell=spawn(process.execPath,['-e',"process.stdin.resume();process.stdin.on('end',()=>process.exit(0));console.log('ready');"],{cwd:f.target,stdio:['pipe','pipe','pipe']});const shellClosed=once(shell,'close');await once(shell.stdout,'data');
    if(scenario==='cli-private')fs.mkdirSync(path.join(f.target,'.xrbuild'));
    if(scenario==='cli-dirty')fs.appendFileSync(path.join(f.target,'source.txt'),'unpublished edit\n');
    if(scenario==='cli-unpublished'){fs.appendFileSync(path.join(f.target,'source.txt'),'local commit\n');git(f.target,'add','.');git(f.target,'commit','--quiet','-m','unpublished');}
    if(scenario==='cli-legacy')fs.writeFileSync(path.join(f.root,'.a1/worktree.json'),JSON.stringify({cleanup:['node','tools/worktree/worktree.mjs','sweep','--apply']}));
    const localRefs=git(f.root,'show-ref','--heads'),remoteRefs=git(f.remote,'show-ref');
    let requestError;
    try { if(complete)await runtime.completion.requestSessionWorktreeCompletion(identity,{},options);else await runtime.completion.requestSessionWorktreeLocalRemoval(identity,options); }
    catch(error){requestError={code:error.code,message:error.message};}
    const attached=await runtime.context.readActiveSessionRepositoryContext(identity,options);
    if(requestError){shell.stdin.end();await shellClosed;finished=true;return{revision:runtime.revision,packageSha256:runtime.packageSha256,scenario,requestError,stillAttached:attached?.cwd===f.target,targetPreserved:fs.existsSync(f.target),localRefsPreserved:git(f.root,'show-ref','--heads')===localRefs,remoteRefsPreserved:git(f.remote,'show-ref')===remoteRefs,unrelatedPreserved:fs.existsSync(f.unrelated)};}
    const directory=path.join(f.root,'.git','xrb-removal'),journal=()=>JSON.parse(fs.readFileSync(path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith('.json'))),'utf8'));
    const preflightOwned=journal().phase==='prepared'&&shell.exitCode===null&&fs.existsSync(f.target);
    if(scenario==='cli-owner'){peer=await liveOwner(f.root,runtime);const other={sessionId:'cli-other',sessionFile:path.join(box,'other.jsonl')};fs.writeFileSync(other.sessionFile,JSON.stringify({type:'session',version:3,id:other.sessionId,cwd:f.root})+'\n');const otherOptions={dataDir,runtimeId:'cli-other-runtime'};await peer.call('register',{identity:other,options:otherOptions});await peer.call('attach',{identity:other,options:otherOptions,target:f.target});}
    const notRemovedBeforeIssuingExit=fs.existsSync(f.target)&&journal().phase==='prepared'&&shell.exitCode===null;
    shell.stdin.end();await shellClosed;
    if(scenario==='cli-intent-change'){const changed={...pull,body:'```openspec-implementation\n{"version":1,"change":"replacement"}\n```'};fs.writeFileSync(path.join(f.root,'.artifacts/github.json'),JSON.stringify({pull:changed,candidates:[changed]}));}
    if(scenario==='cli-head-change'){fs.appendFileSync(path.join(f.target,'task.txt'),'changed head\n');git(f.target,'add','.');git(f.target,'commit','--quiet','-m','changed head');}
    if(scenario==='cli-recreated'){git(f.root,'worktree','remove','--',f.target);git(f.root,'worktree','add','--quiet',f.target,'chore/task');}
    if(scenario==='cli-journal'){const record=journal();record.phase='removing';fs.writeFileSync(path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith('.json'))),JSON.stringify(record));}
    if(scenario==='cli-changed-declaration'){const file=path.join(f.root,'.a1/worktree.json'),declaration=JSON.parse(fs.readFileSync(file));declaration.cleanup.push('--changed');fs.writeFileSync(file,JSON.stringify(declaration));}
    const executionLocalRefs=git(f.root,'show-ref','--heads');
    const settled=await runtime.completion.settleSessionWorktreeCompletion(identity,options),replay=await runtime.completion.settleSessionWorktreeCompletion(identity,options);
    const observation=await runtime.context.withSessionRepositoryObservation(identity,value=>value.cwd,options);
    finished=true;
    return{revision:runtime.revision,packageSha256:runtime.packageSha256,scenario,preflightOwned,notRemovedBeforeIssuingExit,detached:attached===null,shellExited:shell.exitCode!==null,settled,replay,primaryUsable:observation===f.root,
      targetRemoved:!fs.existsSync(f.target),targetPreserved:fs.existsSync(f.target),journalPhase:journal().phase,
      localRefsPreserved:git(f.root,'show-ref','--heads')===executionLocalRefs,remoteRefsPreserved:git(f.remote,'show-ref')===remoteRefs,unrelatedPreserved:fs.existsSync(f.unrelated)};
  } finally {if(peer)await peer.stop();if(shell?.exitCode===null)shell.stdin.end();runtime.dispose();if(finished)disposeFixture(box);}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){try{console.log(JSON.stringify(await runCliScenario(process.argv[2],process.argv[3])));}catch(error){console.error(JSON.stringify({error:error.message,code:error.code}));process.exitCode=1;}}
