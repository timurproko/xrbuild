import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import asset from './marker-assets.json' with {type:'json'};
import {dependencyPath,plainPath} from '../state-paths.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inventory(root){const files={};async function visit(relative=''){for(const item of(await fs.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(!relative&&item.name==='.verified-source.json')continue;const name=relative?relative+'/'+item.name:item.name,file=plainPath(path.join(root,name));if(item.isDirectory())await visit(name);else if(item.isFile())files[name]=digest(await fs.readFile(file));else throw new Error('Unsupported marker source entry');}}await visit();return files;}
/** Explicit build-time only. Source and cache remain outside product files; no automatic upgrade/reset. */
export async function prepareMarkers(cmake,options={}){
  const source=dependencyPath(options,`markers/apriltag-${asset.version}`),receipt=path.join(source,'.verified-source.json');
  try{const prior=JSON.parse(await fs.readFile(plainPath(receipt),'utf8'));if(prior.archive!==asset.sha256||JSON.stringify(prior.files)!==JSON.stringify(await inventory(source)))throw new Error('Marker source differs from its verified generation; preserve/review it before setup');return source;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await fs.lstat(source);throw new Error('Incomplete marker source exists; no automatic replacement');}catch(error){if(error.code!=='ENOENT')throw error;}
  const archive=dependencyPath(options,`markers/${asset.sha256}.tar.gz`,true);let bytes;try{bytes=await fs.readFile(archive);}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch(asset.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Public marker source download failed');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>10*1024*1024)throw new Error('Marker archive exceeds 10 MiB');chunks.push(chunk);}bytes=Buffer.concat(chunks,size);}
  if(digest(bytes)!==asset.sha256)throw new Error('Marker source archive SHA-256 mismatch');try{await fs.writeFile(archive,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(digest(await fs.readFile(archive))!==asset.sha256)throw new Error('Existing marker archive is invalid');}
  const temporary=dependencyPath(options,`markers/preparing-${randomUUID()}`,true);await fs.mkdir(temporary);execFileSync(cmake,['-E','tar','xzf',archive],{cwd:temporary,stdio:'inherit',windowsHide:true,timeout:30000});
  const extracted=path.join(temporary,`apriltag-${asset.version}`),files=await inventory(extracted);if(!files['LICENSE.md']||!files['apriltag.h'])throw new Error('Marker source/license incomplete');await fs.writeFile(path.join(extracted,'.verified-source.json'),JSON.stringify({version:1,archive:asset.sha256,files}),{flag:'wx'});plainPath(source);await fs.rename(extracted,source);return source;
}
