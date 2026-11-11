import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { BUILD_TOOLS_INSTALLER, MAX_INSTALLER_BYTES, DIRECT_INSTALLER_SCRIPT, directInstallerArgs, installBuildToolsDirect, systemPowerShell } from '../src/desktop-installer.ts';
import { runProcess, type JobContext } from '../src/jobs.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), {recursive:true});
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/direct-installer-')), core = path.join(root,'core'), storage = path.join(root,'setup');
  await fs.mkdir(core);
  t.after(() => fs.rm(root, {recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const lines: string[] = [], ctx: JobContext = {line:text=>lines.push(text),async run(){assert.fail('No real installer may run');}};
  return {root,core,storage,lines,ctx};
}
const payload = 'synthetic installer bytes';
const fakeFetch: typeof fetch = async (url, options) => {
  assert.equal(String(url), BUILD_TOOLS_INSTALLER); assert.equal(options?.redirect,'manual');
  return new Response(payload);
};

test('direct setup downloads into exclusive storage and uses fixed signature/elevation arguments', async t => {
  const f = await fixture(t); let runs = 0;
  const code = await installBuildToolsDirect(f.core,f.storage,f.ctx,{fetch:fakeFetch,run:async(command,args,line,options)=>{
    runs++; assert.equal(command,systemPowerShell()); assert.deepEqual(args.slice(0,3),['-NoProfile','-NonInteractive','-EncodedCommand']);
    assert.equal(Buffer.from(args[3],'base64').toString('utf16le'),DIRECT_INSTALLER_SCRIPT);
    const file = String(options?.env?.XRB_SETUP_FILE);
    assert.ok(file.startsWith(f.storage+path.sep)); assert.equal(await fs.readFile(file,'utf8'),payload);
    assert.equal(options?.env?.XRB_SETUP_SHA256,createHash('sha256').update(payload).digest('hex'));
    assert.match(DIRECT_INSTALLER_SCRIPT,/FileShare\]::Read/); assert.match(DIRECT_INSTALLER_SCRIPT,/Get-AuthenticodeSignature/);
    assert.match(DIRECT_INSTALLER_SCRIPT,/-Verb RunAs -Wait -PassThru/);
    assert.match(DIRECT_INSTALLER_SCRIPT,/\$env:PSModulePath = \$moduleRoot/);
    for (const name of ['Microsoft.PowerShell.Utility','Microsoft.PowerShell.Security','Microsoft.PowerShell.Management']) assert.ok(DIRECT_INSTALLER_SCRIPT.includes(name));
    assert.match(DIRECT_INSTALLER_SCRIPT,/Import-Module -Name \(\[System.IO.Path\]::Combine\(\$moduleRoot/);
    assert.ok(directInstallerArgs().includes('--norestart')); assert.doesNotMatch(DIRECT_INSTALLER_SCRIPT,/ExecutionPolicy|allow-reboot|ignore-hash/);
    line('synthetic verified installer'); return 3010;
  }});
  assert.equal(code,3010); assert.equal(runs,1); assert.ok(f.lines.includes('synthetic verified installer'));
  assert.equal((await fs.readdir(f.storage)).length,1);
});

for (const target of ['http://download.microsoft.com/tool.exe','https://example.invalid/tool.exe','https://user:secret@download.microsoft.com/tool.exe','https://download.microsoft.com:8443/tool.exe']) {
  test(`direct setup refuses an unapproved redirect (${new URL(target).hostname}) without execution`, async t => {
    const f = await fixture(t); let runs = 0;
    await assert.rejects(installBuildToolsDirect(f.core,f.storage,f.ctx,{fetch:async()=>new Response(null,{status:302,headers:{location:target}}),run:async()=>{runs++;return 0;}}),/approved HTTPS/);
    assert.equal(runs,0); assert.equal((await fs.readdir(f.storage)).length,1,'failed generation is preserved');
  });
}

test('direct setup bounds redirect chains, declared sizes and streamed download sizes', async t => {
  const f = await fixture(t); let runs = 0;
  const run = async()=>{runs++;return 0;};
  await assert.rejects(installBuildToolsDirect(f.core,f.storage,f.ctx,{run,fetch:async()=>new Response(null,{status:302,headers:{location:BUILD_TOOLS_INSTALLER}})}),/redirect limit/);
  await assert.rejects(installBuildToolsDirect(f.core,f.storage,f.ctx,{run,fetch:async()=>new Response('small',{headers:{'content-length':String(MAX_INSTALLER_BYTES+1)}})}),/size limit/);
  await assert.rejects(installBuildToolsDirect(f.core,f.storage,f.ctx,{run,fetch:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_INSTALLER_BYTES+1));controller.close();}}))}),/size limit/);
  await assert.rejects(installBuildToolsDirect(f.core,f.storage,f.ctx,{run,fetch:async()=>new Response('')}),/empty/);
  assert.equal(runs,0); assert.equal((await fs.readdir(f.storage)).length,4);
});

test('direct setup refuses linked storage and preserves foreign installer generations', async t => {
  const f = await fixture(t), outside = path.join(f.root,'outside'); await fs.mkdir(outside);
  await fs.symlink(outside,f.storage,process.platform==='win32'?'junction':'dir');
  await assert.rejects(installBuildToolsDirect(f.core,f.storage,f.ctx,{fetch:fakeFetch,run:async()=>assert.fail('must not execute')}));
  assert.deepEqual(await fs.readdir(outside),[]);
  await fs.unlink(f.storage); await fs.mkdir(f.storage);
  await fs.mkdir(path.join(f.storage,'installer-existing')); await fs.writeFile(path.join(f.storage,'installer-existing/KEEP'),'preserve');
  await installBuildToolsDirect(f.core,f.storage,f.ctx,{fetch:fakeFetch,run:async()=>0});
  assert.equal(await fs.readFile(path.join(f.storage,'installer-existing/KEEP'),'utf8'),'preserve');
});

const canVerify = process.platform==='win32' && existsSync(systemPowerShell());
for (const isolatedModules of [false,true]) for (const scenario of ['unsigned','changed','wrong-publisher','verified'] as const) test(`system verification ${scenario}${isolatedModules?' with isolated module path':''}: only the verified case reaches synthetic elevation`, {skip:!canVerify}, async t => {
  const f = await fixture(t), file = path.join(f.root,'synthetic.exe'); await fs.writeFile(file,payload);
  const hash = createHash('sha256').update(payload).digest('hex');
  const signature = scenario==='unsigned' ? '' : `function Get-AuthenticodeSignature { [pscustomobject]@{Status='Valid';SignerCertificate=[pscustomobject]@{Subject='CN=${scenario==='wrong-publisher'?'Other Provider':'Microsoft Corporation'}, O=Microsoft Corporation, C=US'}} }`;
  const elevation = `function Start-Process { param($FilePath,$ArgumentList,$Verb,[switch]$Wait,[switch]$PassThru)
    if ($env:PSModulePath -ne [System.IO.Path]::Combine($PSHOME, 'Modules')) { throw 'Verification must use this engine module root' }
    if ($Verb -ne 'RunAs' -or !$Wait -or !$PassThru -or $ArgumentList -ne '${directInstallerArgs().join(' ')}') { throw 'Unexpected elevation arguments' }
    [Console]::WriteLine('SYNTHETIC_ELEVATION_ONLY'); [pscustomobject]@{ExitCode=3010}
  }`;
  const moduleFixture = isolatedModules ? `$env:PSModulePath = '${path.join(f.root,'isolated-modules').replaceAll("'", "''")}'
    $PSModuleAutoloadingPreference = 'None'
    Get-Module Microsoft.PowerShell.Utility,Microsoft.PowerShell.Security,Microsoft.PowerShell.Management | Remove-Module
    function Write-Output { param($InputObject) [Console]::WriteLine([string]$InputObject) }
    if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) { throw 'Fixture did not isolate module discovery' }
    [Console]::WriteLine('ISOLATED_MODULE_DISCOVERY')
  ` : '';
  const script = moduleFixture+signature+'\n'+elevation+'\n'+DIRECT_INSTALLER_SCRIPT;
  const code = await runProcess(systemPowerShell(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],line=>f.lines.push(line),{env:{...process.env,XRB_SETUP_FILE:file,XRB_SETUP_SHA256:scenario==='changed'?'a'.repeat(64):hash}});
  if(isolatedModules)assert.match(f.lines.join('\n'),/ISOLATED_MODULE_DISCOVERY/,'the regression starts without the verification cmdlet');
  if(scenario==='verified'){assert.equal(code,3010,f.lines.join('\n')); assert.match(f.lines.join('\n'),/SYNTHETIC_ELEVATION_ONLY/);}
  else {assert.equal(code,1,f.lines.join('\n'));assert.doesNotMatch(f.lines.join('\n'),/SYNTHETIC_ELEVATION_ONLY/);assert.match(f.lines.join('\n'),scenario==='changed'?/changed after download/:/signature is not valid/);}
  assert.equal(await fs.readFile(file,'utf8'),payload);
});
