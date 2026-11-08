import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {createProductionPublisher} from '../src/production.mjs';
import {config,fixture,git,id,log} from './fixture.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function parentRepository(f){
  const parent=path.join(f.root,'parent');await fs.mkdir(parent);git(parent,'init','-b','keep');git(parent,'config','user.name','Parent Fixture');git(parent,'config','user.email','parent@example.invalid');await fs.writeFile(path.join(parent,'keep.txt'),'preserve parent');git(parent,'add','keep.txt');git(parent,'commit','-m','parent baseline');
  const fingerprint=async()=>JSON.stringify({head:git(parent,'symbolic-ref','HEAD'),commit:git(parent,'rev-parse','HEAD'),index:sha(await fs.readFile(path.join(parent,'.git/index'))),config:sha(await fs.readFile(path.join(parent,'.git/config'))),content:await fs.readFile(path.join(parent,'keep.txt'),'utf8')});
  return{parent,fingerprint};
}
function publisher(f,storageRoot){return createProductionPublisher(config,{storageRoot,remoteUrl:f.remote,associationsFile:f.associationsFile,fetch:f.fetch,sleep:async()=>{},hostingReady:async()=>{},deployment:{deploy:async()=>({link:'https://example.test/build'})}});}

test('nested publishing binds explicit Git metadata and never changes enclosing repository HEAD/index/config',async t=>{
  const f=await fixture(t),outer=await parentRepository(f),before=await outer.fingerprint();let storageRoot=outer.parent;while(storageRoot.length<165)storageRoot=path.join(storageRoot,'deep-cache-layer');
  const p=publisher(f,storageRoot),publication={id:id('1'),slug:'deep-app'};const initial=await p.status(publication);assert.equal(initial.state,'unpublished',initial.error);await p.publish({app:f.app,publication,log});assert.equal((await p.status(publication)).state,'published');assert.equal(await outer.fingerprint(),before);
  const clones=await fs.readdir(storageRoot);assert.equal(clones.length,1);const clone=path.join(storageRoot,clones[0]);assert.ok((await fs.stat(path.join(clone,'.git'))).isDirectory());assert.equal((await fs.readdir(path.join(clone,'.git'))).includes('commondir'),false);
});

test('unsupported extreme Windows paths fail closed before parent Git discovery',async t=>{
  const f=await fixture(t),outer=await parentRepository(f),before=await outer.fingerprint();let storageRoot=outer.parent;while(storageRoot.length<310)storageRoot=path.join(storageRoot,'deep-cache-layer');const p=publisher(f,storageRoot),publication={id:id('1'),slug:'too-deep'};
  if(process.platform==='win32'){const status=await p.status(publication);assert.equal(status.state,'unavailable');assert.match(status.error,/too long/);await assert.rejects(p.publish({app:f.app,publication,log}),/too long/);}else{await p.publish({app:f.app,publication,log});assert.equal((await p.status(publication)).state,'published');}assert.equal(await outer.fingerprint(),before);
});

test('shared or missing clone metadata fails closed instead of discovering the enclosing repository',async t=>{
  const f=await fixture(t),outer=await parentRepository(f),before=await outer.fingerprint(),storageRoot=path.join(outer.parent,'cache'),p=publisher(f,storageRoot),publication={id:id('1'),slug:'owned-app'};
  assert.equal((await p.status(publication)).state,'unpublished');const clone=path.join(storageRoot,(await fs.readdir(storageRoot))[0]);await fs.writeFile(path.join(clone,'.git/commondir'),path.join(outer.parent,'.git'));
  assert.equal((await p.status(publication)).state,'unavailable');await assert.rejects(p.publish({app:f.app,publication,log}),/cannot share/);assert.equal(await outer.fingerprint(),before);
  await fs.unlink(path.join(clone,'.git/commondir'));await fs.rename(path.join(clone,'.git'),path.join(clone,'.git-preserved'));
  assert.equal((await p.status(publication)).state,'unavailable');await assert.rejects(p.publish({app:f.app,publication,log}),/already exists|not an empty/);assert.equal(await outer.fingerprint(),before);
});
