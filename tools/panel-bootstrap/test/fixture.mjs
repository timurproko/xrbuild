import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createCoordinator} from '../bootstrap.mjs';
export const task = path.resolve(import.meta.dirname, '../../..');
export function fixture(t) {
  const parent = path.join(task,'.artifacts'); fs.mkdirSync(parent,{recursive:true});
  const root = fs.mkdtempSync(path.join(parent,'startup-'));
  const put = (file, value) => { fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true}); fs.writeFileSync(path.join(root,file),value); };
  put('package.json',JSON.stringify({name:'fixture-core',private:true,packageManager:'pnpm@9.15.9'}));
  put('pnpm-workspace.yaml','packages:\n  - packages/*\n  - tools/*\n'); put('pnpm-lock.yaml',"lockfileVersion: '9.0'\n");
  put('packages/control-panel/package.json',JSON.stringify({name:'fixture-panel',dependencies:{'fixture-lib':'1.2.3'}}));
  fs.mkdirSync(path.join(root,'tools'),{recursive:true});
  const install = (version = '1.2.3') => { put('packages/control-panel/node_modules/fixture-lib/package.json',JSON.stringify({name:'fixture-lib',version,main:'index.js'})); put('packages/control-panel/node_modules/fixture-lib/index.js','module.exports = true;\n'); };
  const cleanups=[];
  t.after(async()=>{for(const cleanup of cleanups.reverse())await cleanup();fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100});});
  const coordinator = async (deps = {}, extra = {}) => {
    const c = await createCoordinator({root,directory:path.join(root,'runtime'),pipe:process.platform === 'win32' ? undefined : '\0xr-test-' + randomBytes(12).toString('hex'),pollInterval:5,startTimeout:200,releaseDelay:60000,...extra,deps:{inUse:()=>false,...deps}});
    cleanups.push(()=>c.close()); return c;
  };
  return {root,put,install,coordinator,cleanup:fn=>cleanups.push(fn),target:{mode:'repository',workspace:path.join(root,'workspace'),projects:path.join(root,'workspace'),port:45678,explicit:true}};
}
export async function state(message) {
  const u = new URL(message.url); return (await fetch(u.origin + '/api/state',{headers:{authorization:'Bearer '+u.hash.slice(1)}})).json();
}
export function action(message, route = '/api/start', overrides = {}) {
  const u = new URL(message.url); return fetch(u.origin+route,{method:'POST',headers:{origin:u.origin,authorization:'Bearer '+u.hash.slice(1)},...overrides});
}
export async function until(read, predicate, timeout = 3000) {
  const deadline = Date.now()+timeout;
  while(Date.now()<deadline) { const value = await read(); if(predicate(value)) return value; await new Promise(r=>setTimeout(r,10)); }
  throw Error('Fixture state did not settle');
}
export function copyBootstrap(f) {
  for(const file of ['runtime.mjs','bootstrap.mjs','child.mjs','package.json']) f.put('tools/panel-bootstrap/'+file,fs.readFileSync(path.join(task,'tools/panel-bootstrap',file)));
  fs.cpSync(path.join(task,'tools/panel-bootstrap/ui'),path.join(f.root,'tools/panel-bootstrap/ui'),{recursive:true});
  for(const file of ['design-system.css','design-system.js','scrollbars.js']) f.put('packages/control-panel/ui/'+file,fs.readFileSync(path.join(task,'packages/control-panel/ui',file)));
}
