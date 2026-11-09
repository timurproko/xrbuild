import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const inside=(root,file)=>{const rel=path.relative(root,file);return !rel||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
export function plainPath(file){
  const absolute=path.resolve(file),parent=path.dirname(absolute);if(parent!==absolute)plainPath(parent);
  const stat=fs.lstatSync(absolute,{throwIfNoEntry:false});
  if(stat?.isSymbolicLink()||stat?.isFile()&&stat.nlink!==1)throw new Error('Hand diagnostic path uses a link/shared file');
  if(stat&&!stat.isDirectory()&&!stat.isFile())throw new Error('Unsupported hand diagnostic path');return absolute;
}
export function statePaths({core=process.env.XRB_CORE,workspace=process.env.XRB_HOME||path.join(process.env.USERPROFILE||os.homedir(),'.xrbuild')}={}){
  if(!core||!path.isAbsolute(core)||!workspace||!path.isAbsolute(workspace))throw new Error('Explicit absolute core/user workspace paths required');
  core=plainPath(core);workspace=plainPath(workspace);
  if(core===workspace||['embedded','native','packages','tools','templates','third_party'].some(name=>inside(path.join(core,name),workspace)))throw new Error('Hand diagnostic user state must be outside product sources/dependencies');
  return{core,workspace,configRoot:plainPath(path.join(workspace,'config/plugins/input-hands')),stateRoot:plainPath(path.join(workspace,'.xrb/hand-tracking')),cacheRoot:plainPath(path.join(workspace,'build/hand-tracking',createHash('sha256').update(process.platform==='win32'?core.toLowerCase():core).digest('hex').slice(0,12))),dependencies:plainPath(path.join(core,'third_party/hand-tracking'))};
}
export function userPath(options,kind,relative='',create=false){
  const roots=statePaths(options),root=roots[kind];if(!root||!['configRoot','stateRoot','cacheRoot'].includes(kind)||path.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>x==='..'||x==='.'||x.includes(':')))throw new Error('Invalid hand diagnostic state path');
  const target=plainPath(path.join(root,relative));if(!inside(root,target))throw new Error('Hand diagnostic state escapes its owner');
  if(create){fs.mkdirSync(path.dirname(target),{recursive:true});plainPath(target);}return target;
}
export function dependencyPath(options,relative='',create=false){const root=statePaths(options).dependencies;if(path.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>x==='..'||x==='.'||x.includes(':')))throw new Error('Invalid hand dependency path');const target=plainPath(path.join(root,relative));if(!inside(root,target))throw new Error('Hand dependency escapes its owner');if(create){fs.mkdirSync(path.dirname(target),{recursive:true});plainPath(target);}return target;}
export function sameOrigin(req){const host=req.headers.host,address=req.socket.localAddress,remote=req.socket.remoteAddress;if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)||![`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`].includes(host))return false;return (!req.headers.origin||req.headers.origin===`http://${host}`)&&(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin');}
