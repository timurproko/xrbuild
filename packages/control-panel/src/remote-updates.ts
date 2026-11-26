// Advisory discovery only: never fetch, inspect dirty files, or change refs/index/worktrees.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export const REMOTE_UPDATE_INTERVAL_MS = 5 * 60_000;
export type RemoteGit = (args: string[], cwd: string, signal: AbortSignal) => Promise<{code:number;output:string}>;
export interface RemoteTip { available: boolean; branch: string; tip: string; checkedMs: number }
export interface RemoteUpdateStatus { available: boolean; core: RemoteTip | null; workspace: RemoteTip | null }

/** Abort/timeout resolves only after the child has exited, so job admission can drain it. */
export const remoteGit = (args:string[], cwd:string, signal:AbortSignal, timeoutMs=8000):Promise<{code:number;output:string}> => new Promise(resolve => {
  if (signal.aborted) { resolve({code:1,output:''});return; }
  const child = spawn('git', ['-c', 'credential.interactive=false', ...args], {
    cwd, windowsHide:true, detached:process.platform!=='win32', stdio:['ignore','pipe','pipe'],
    env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',
      GIT_SSH_COMMAND:process.env.GIT_SSH_COMMAND ?? 'ssh -oBatchMode=yes -oConnectTimeout=5'},
  });
  let output='', failed=false;
  let cleanup:Promise<void>=Promise.resolve();
  const abort = () => {
    if(failed)return;failed=true;
    // Git may own an SSH/HTTP helper: cancellation must stop that tree, not orphan a network request.
    if(process.platform==='win32'&&child.pid) {
      cleanup=new Promise<void>(done=>{
        const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>{child.kill();done();});killer.on('close',()=>done());
      });
    } else { try { process.kill(-child.pid!, 'SIGKILL'); } catch { child.kill(); } }
  };
  const timer=setTimeout(abort,timeoutMs);
  signal.addEventListener('abort',abort,{once:true});
  child.stdout.setEncoding('utf8').on('data',(chunk:string)=>{ if(output.length<65536)output+=chunk;else abort(); });
  child.stderr.resume();
  child.on('error',()=>{failed=true;});
  child.on('close',async code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);await cleanup;resolve({code:failed?1:code??1,output});});
});
const canonical = async (dir:string) => {
  const value=path.resolve(await fs.realpath(dir).catch(()=>dir));
  return process.platform==='win32'?value.toLowerCase():value;
};
export async function discoverRemoteTip(dir:string, signal:AbortSignal, git:RemoteGit=remoteGit):Promise<RemoteTip|null> {
  const read=async(args:string[])=>{if(signal.aborted)throw new Error('cancelled');const value=await git(args,dir,signal);if(signal.aborted)throw new Error('cancelled');return value;};
  const top=await read(['rev-parse','--show-toplevel']);
  if(top.code!==0||await canonical(top.output.trim())!==await canonical(dir))return null;
  const head=await read(['rev-parse','--verify','HEAD']);
  if(head.code!==0||! /^[0-9a-f]{40,64}$/.test(head.output.trim()))return null;
  const remote=await read(['ls-remote','--symref','origin','HEAD']);
  if(remote.code!==0)return null;
  const branches=[...remote.output.matchAll(/^ref: refs\/heads\/([^\s]+)\tHEAD\r?$/gm)];
  const tips=[...remote.output.matchAll(/^([0-9a-f]{40,64})\tHEAD\r?$/gm)];
  if(branches.length!==1||tips.length!==1)return null;
  const tip=tips[0]![1]!,branch=branches[0]![1]!;
  const ancestry=tip===head.output.trim()?{code:0}:await read(['merge-base','--is-ancestor',tip,head.output.trim()]);
  // An unfetched advertised object is normally unknown locally. Availability isn't Update eligibility.
  if(![0,1,128].includes(ancestry.code))return null;
  return {available:ancestry.code!==0,branch,tip,checkedMs:Date.now()};
}

export class RemoteUpdates {
  status:RemoteUpdateStatus={available:false,core:null,workspace:null};
  git:RemoteGit=remoteGit;
  private controller:AbortController|null=null;
  private work:Promise<void>|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private due=0;
  private closed=false;
  private core:string;
  private workspace:string;
  private busy:()=>boolean;
  private changed:(status:RemoteUpdateStatus)=>void;
  constructor(core:string,workspace:string,busy:()=>boolean,changed:(status:RemoteUpdateStatus)=>void) {
    this.core=core;this.workspace=workspace;this.busy=busy;this.changed=changed;
  }
  start():void {
    if(this.timer||this.closed)return;
    this.timer=setInterval(()=>void this.check(),REMOTE_UPDATE_INTERVAL_MS);this.timer.unref();
    void this.check();
  }
  check(force=false):Promise<void> {
    if(this.closed||this.busy())return Promise.resolve();
    if(this.work)return this.work;
    if(!force&&Date.now()<this.due)return Promise.resolve();
    this.due=Date.now()+REMOTE_UPDATE_INTERVAL_MS;
    const controller=new AbortController();this.controller=controller;
    this.work=(async()=>{
      try {
        const same=await canonical(this.core)===await canonical(this.workspace);
        const core=await discoverRemoteTip(this.core,controller.signal,this.git);
        const workspace=same?core:await discoverRemoteTip(this.workspace,controller.signal,this.git);
        if(controller.signal.aborted)return;
        // An offline failure retains only prior knowledge with its original check time.
        const next={core:core??this.status.core,workspace:workspace??this.status.workspace,available:false};
        next.available=!!(next.core?.available||next.workspace?.available);
        this.status=next;this.changed(next);
      } catch { /* Offline, authentication and cancellation are intentionally silent. */ }
      finally {this.controller=null;this.work=null;}
    })();
    return this.work;
  }
  /** Called synchronously when reserving a job. The queued job waits for the killed query to exit. */
  pause():Promise<void>|undefined {
    if(!this.work)return;
    this.due=0;this.controller?.abort();return this.work;
  }
  async close():Promise<void> {this.closed=true;if(this.timer)clearInterval(this.timer);await this.pause();}
}
