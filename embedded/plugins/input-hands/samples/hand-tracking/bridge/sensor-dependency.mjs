// Device SDK payloads are optional, externally reviewed inputs, never copied from a private workspace.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dependencyPath,plainPath} from '../state-paths.mjs';
export async function sensorDependency(options={}){
  const root=dependencyPath(options,'sensor'),file=plainPath(path.join(root,'dependency.json'));let bytes;
  try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')throw new Error('Optional device SDK is unconfigured. Supply a separately reviewed public dependency.json and verified files under core third_party/hand-tracking/sensor; no private SDK fallback is permitted.');throw error;}
  if(bytes.length>65536)throw new Error('Oversized sensor dependency descriptor');const descriptor=JSON.parse(bytes),digest=createHash('sha256').update(bytes);
  if(descriptor?.version!==1||typeof descriptor.upstreamVersion!=='string'||!descriptor.source||!/^https:\/\//.test(descriptor.source.url)||!/^[a-f0-9]{64}$/.test(descriptor.source.sha256)||!['Apache-2.0','MIT','BSD-2-Clause','BSD-3-Clause'].includes(descriptor.license)||!descriptor.files||!Array.isArray(descriptor.notices)||!descriptor.notices.length)throw new Error('Sensor dependency requires pinned public source/version/hash/license/notices');
  const owned=relative=>{if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>!x||x==='..'||x==='.'||x.includes(':')))throw new Error('Unsafe sensor dependency path');return plainPath(path.join(root,relative));};
  const entries=Object.entries(descriptor.files);if(entries.length<4||entries.length>4096)throw new Error('Invalid sensor dependency file inventory');
  for(const [name,hash]of entries.sort()){if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('Unpinned sensor dependency file');const value=await fs.readFile(owned(name));if(createHash('sha256').update(value).digest('hex')!==hash)throw new Error('Sensor dependency SHA-256 mismatch');digest.update(name).update(hash);}
  for(const name of [descriptor.cppHeader,descriptor.geometryHeader,descriptor.library,descriptor.runtime,...descriptor.notices])if(!Object.hasOwn(descriptor.files,name))throw new Error('Sensor dependency input is absent from the verified inventory');
  return{...descriptor,sha256:digest.digest('hex'),root,cppHeader:owned(descriptor.cppHeader),geometryHeader:owned(descriptor.geometryHeader),include:owned(descriptor.include),library:owned(descriptor.library),runtime:owned(descriptor.runtime),notices:descriptor.notices.map(owned)};
}
