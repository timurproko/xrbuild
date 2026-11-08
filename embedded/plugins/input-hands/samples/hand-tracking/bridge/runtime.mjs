// Optional bridge outputs are user-owned, source-bound and verified before any device command.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {userPath,plainPath,dependencyPath} from '../state-paths.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const sourceInputs=['CMakeLists.txt','build.mjs','capture.cpp','marker-assets.json','markers.hpp','prepare-markers.mjs','sensor-dependency.mjs','runtime.mjs','../state-paths.mjs'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalizedText=value=>Buffer.from(value).toString('utf8').replace(/\r\n/g,'\n');
export const runtimeValueSha256=(name,value)=>digest(/\.(md|txt)$/.test(name)?normalizedText(value):value);
function sourceDigest(){return digest(sourceInputs.map(name=>`${name}\0${digest(normalizedText(fs.readFileSync(plainPath(path.join(root,name)))))}`).join('\n'));}
export async function sourceSha256(){return sourceDigest();}
export function runtimePaths(options={}){const key=sourceDigest().slice(0,16),runtimeRoot=userPath(options,'cacheRoot',`bridge/r-${key}`);return{runtimeRoot,executable:path.join(runtimeRoot,'hand-tracking-rgbd.exe')};}
export async function stageRuntime(buildRoot,options={},dependency){
  const {runtimeRoot}=runtimePaths(options);plainPath(buildRoot);if(!dependency||!Array.isArray(dependency.notices))throw new Error('Reviewed sensor dependency descriptor required');
  const marker=dependencyPath(options,'markers/apriltag-3.4.5/LICENSE.md'),inputs=[{from:path.join(buildRoot,'hand-tracking-rgbd.exe'),name:'hand-tracking-rgbd.exe'},{from:dependency.runtime,name:path.basename(dependency.runtime)},{from:marker,name:'apriltag-LICENSE.md'},...dependency.notices.map((from,i)=>({from,name:`sensor-NOTICE-${i}.txt`}))];
  if(new Set(inputs.map(x=>x.name)).size!==inputs.length)throw new Error('Ambiguous bridge runtime inventory');
  try{await fsp.lstat(runtimeRoot);throw new Error('Bridge runtime already exists; never replace an immutable generation');}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=userPath(options,'cacheRoot',`bridge/r-${sourceDigest().slice(0,16)}-${crypto.randomUUID()}.preparing`,true);await fsp.mkdir(temporary);
  const files={};for(const input of inputs){plainPath(input.from);const bytes=await fsp.readFile(input.from);files[input.name]=runtimeValueSha256(input.name,bytes);await fsp.writeFile(path.join(temporary,input.name),bytes,{flag:'wx'});}
  const manifest={version:1,platform:'win32-x64',sourceSha256:sourceDigest(),dependencySha256:dependency.sha256,files};await fsp.writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});plainPath(runtimeRoot);await fsp.rename(temporary,runtimeRoot);return assertRuntimeSync(options);
}
export function assertRuntimeSync(options={}){
  const {runtimeRoot}=runtimePaths(options);let manifest;try{manifest=JSON.parse(fs.readFileSync(plainPath(path.join(runtimeRoot,'manifest.json')),'utf8'));}catch{throw new Error('Optional hand bridge is not built in this user workspace. Configure its reviewed dependency and run bridge:build / bridge:stage explicitly. Synthetic/browser use needs no bridge.');}
  if(manifest?.version!==1||manifest.platform!=='win32-x64'||manifest.sourceSha256!==sourceDigest()||!manifest.files||!manifest.files['hand-tracking-rgbd.exe']||!manifest.files['apriltag-LICENSE.md']||!/^[a-f0-9]{64}$/.test(manifest.dependencySha256))throw new Error('Hand bridge runtime provenance is invalid/stale');
  for(const [name,hash]of Object.entries(manifest.files)){if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.(?:exe|dll|md|txt)$/.test(name)||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Unsafe hand bridge runtime inventory');const file=plainPath(path.join(runtimeRoot,name));if(runtimeValueSha256(name,fs.readFileSync(file))!==hash)throw new Error('Hand bridge runtime hash mismatch');}
  return manifest;
}
export async function verifyRuntime(options={}){return assertRuntimeSync(options);}
