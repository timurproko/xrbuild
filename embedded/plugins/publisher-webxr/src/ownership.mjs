import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const within=(root,file)=>{const relative=path.relative(root,file);return !relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
export async function plain(file){
  const parent=path.dirname(file);if(parent!==file)await plain(parent);
  const stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(stat&&(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile()||stat.isFile()&&stat.nlink!==1))throw Error('Publisher path must be plain and unlinked');
  return stat;
}
export async function directory(file){await plain(file);await fs.mkdir(file,{recursive:true,mode:0o700});const stat=await plain(file);if(!stat?.isDirectory())throw Error('Publisher directory is invalid');}
export async function readJson(file,missing){
  const stat=await plain(file);if(!stat)return missing;
  if(!stat.isFile()||stat.size>1024*1024)throw Error('Publisher JSON is invalid or oversized; preserve and review it');
  const handle=await fs.open(file,'r');try{
    const opened=await handle.stat();if(opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('Publisher JSON changed while opening');
    const buffer=Buffer.alloc(1024*1024+1);let length=0;
    while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,null);if(!result.bytesRead)break;length+=result.bytesRead;}
    if(length>1024*1024)throw Error('Publisher JSON is oversized');
    try{return JSON.parse(buffer.subarray(0,length).toString('utf8'));}catch{throw Error('Publisher JSON is corrupt; preserve and review it');}
  }finally{await handle.close();}
}
export async function writeJson(file,value){
  await directory(path.dirname(file));await plain(file);
  const temp=path.join(path.dirname(file),'.write-'+randomUUID());
  const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  await plain(file);await fs.rename(temp,file);
}
export async function contextPaths(context){
  if(!context?.plugin||!context.config||!path.isAbsolute(context.workspace??'')||!path.isAbsolute(context.plugin.sourceRoot??''))throw Error('Publisher requires an explicit owner, user workspace and config');
  const id=context.plugin.id;if(!/^[a-z0-9][a-z0-9._-]*$/.test(id))throw Error('Publisher owner ID is invalid');
  await plain(context.workspace);await plain(context.plugin.sourceRoot);
  const workspace=await fs.realpath(context.workspace),source=await fs.realpath(context.plugin.sourceRoot);
  if(within(source,workspace))throw Error('Publisher workspace must be outside product source');
  const configRoot=path.join(workspace,'config','plugins',id),stateRoot=path.join(workspace,'.xrb','publication',id),workRoot=path.join(workspace,'build','publication',id);
  if(path.resolve(context.config.file)!==path.join(configRoot,'config.json'))throw Error('Publisher config belongs to another workspace');
  for(const file of [configRoot,stateRoot,workRoot]){if(within(source,file))throw Error('Publisher state cannot be product source');await plain(file);}
  return{workspace,source,configRoot,stateRoot,workRoot,values:context.config.values};
}
export async function exclusive(root,work){
  await directory(root);const file=path.join(root,'operation.lock');let lock;
  try{lock=await fs.open(file,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('Publisher operation lock exists; verify the writer stopped before recovery');throw error;}
  try{return await work();}finally{const owned=await lock.stat();await lock.close();const current=await plain(file);if(!current||current.dev!==owned.dev||current.ino!==owned.ino)throw Error('Publisher lock ownership changed; preserve it for recovery');await fs.unlink(file);}
}
