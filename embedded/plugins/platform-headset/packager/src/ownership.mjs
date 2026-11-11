import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const inside=(root,file)=>{const r=path.relative(root,file);return !r||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export async function plain(file,missing=false){
 const absolute=path.resolve(file),base=path.parse(absolute).root;let current=base;
 for(const part of absolute.slice(base.length).split(path.sep).filter(Boolean)){current=path.join(current,part);let stat;try{stat=await fs.lstat(current);}catch(e){if(missing&&e.code==='ENOENT')continue;throw e;}
  if(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile()||stat.isFile()&&stat.nlink!==1)throw Error('Headset paths must be plain and unlinked');}
 return absolute;
}
export function relative(value){if(typeof value!=='string'||!value||value.length>500||value.includes('\\')||value.includes(':')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)))throw Error('Invalid headset relative path');return value;}
export async function read(file,limit=65536){await plain(file);const h=await fs.open(file,'r');try{const before=await fs.lstat(file),opened=await h.stat();if(before.ino!==opened.ino||before.dev!==opened.dev||!opened.isFile()||opened.nlink!==1||opened.size>limit)throw Error('Invalid headset file ownership or size');const buffer=Buffer.alloc(opened.size+1),{bytesRead}=await h.read(buffer,0,buffer.length,0);if(bytesRead!==opened.size)throw Error('Headset file changed during read');const bytes=buffer.subarray(0,bytesRead),after=await fs.lstat(file);if(after.ino!==opened.ino||after.dev!==opened.dev||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs)throw Error('Headset file changed during read');return bytes;}finally{await h.close();}}
export async function contextPaths(context){
 if(!context?.workspace||!context.core||!context.plugin?.sourceRoot||!context.config?.file)throw Error('Headset requires an explicit plugin service context');
 const workspace=await plain(context.workspace,true),core=await plain(context.core),source=await plain(context.plugin.sourceRoot),config=path.join(workspace,'config','plugins',context.plugin.id);
 if(context.plugin.id!=='platform-headset'||path.resolve(context.config.file)!==path.join(config,'config.json')||inside(core,workspace)&&!inside(path.join(core,'.xrbuild'),workspace)&&!inside(path.join(core,'.artifacts'),workspace)||inside(source,workspace))throw Error('Headset context is outside its writable user owner');
 await plain(config,true);return{workspace,core,source,config,work:path.join(workspace,'build','headset')};
}
export async function writable(paths,file){const absolute=await plain(file,true);if(inside(paths.core,absolute)&&!inside(paths.workspace,absolute)||inside(paths.source,absolute))throw Error('Headset output cannot modify product source');return absolute;}
export async function locked(file,fn){await plain(file,true);await fs.mkdir(path.dirname(file),{recursive:true});const h=await fs.open(file,'wx');const stat=await h.stat();try{await h.writeFile(randomUUID());return await fn();}finally{await h.close();const current=await fs.lstat(file).catch(()=>null);if(current?.ino===stat.ino&&current.dev===stat.dev)await fs.unlink(file);}}
