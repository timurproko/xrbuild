// Fixed official bootstrapper fallback. Called only inside an explicitly confirmed, locked setup job.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertWritablePath } from './project-access.ts';
import { runProcess, type JobContext } from './jobs.ts';

export const BUILD_TOOLS_INSTALLER = 'https://aka.ms/vs/17/release/vs_BuildTools.exe';
export const MAX_INSTALLER_BYTES = 64 * 1024 * 1024;
export function systemPowerShell(): string {
  return path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
}
export function directInstallerArgs(): string[] {
  return ['--wait', '--quiet', '--norestart', '--add', 'Microsoft.VisualStudio.Workload.VCTools', '--add', 'Microsoft.VisualStudio.Component.VC.CMake.Project', '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.26100', '--includeRecommended'];
}
/** The read-only file lease prevents replacement/modification between verification and elevated execution. */
export const DIRECT_INSTALLER_SCRIPT = `$ErrorActionPreference = 'Stop'
$lease = $null
try {
  # The launcher may inherit a newer shell's module paths. Use this engine's trusted built-ins only.
  $moduleRoot = [System.IO.Path]::Combine($PSHOME, 'Modules')
  $env:PSModulePath = $moduleRoot
  foreach ($name in @('Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Security', 'Microsoft.PowerShell.Management')) {
    Import-Module -Name ([System.IO.Path]::Combine($moduleRoot, $name, ($name + '.psd1'))) -ErrorAction Stop
  }
  $file = $env:XRB_SETUP_FILE
  $lease = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
  if ($hash -ne $env:XRB_SETUP_SHA256) { throw 'Installer changed after download; nothing was executed.' }
  $signature = Get-AuthenticodeSignature -FilePath ([System.Management.Automation.WildcardPattern]::Escape($file))
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\\s*)O=Microsoft Corporation(,|$)' -or $signature.SignerCertificate.Subject -notmatch '(^|,\\s*)CN=Microsoft Corporation(,|$)') { throw 'Installer provider signature is not valid; nothing was executed.' }
  Write-Output 'Official installer signature and download hash verified.'
  Write-Output 'Installing C++ build tools, CMake and SDK; approve the Windows administrator prompt if requested.'
  $process = Start-Process -FilePath $file -ArgumentList '${directInstallerArgs().join(' ')}' -Verb RunAs -Wait -PassThru
  exit $process.ExitCode
} catch {
  Write-Output ('Build-tools setup stopped: ' + $_.Exception.Message)
  exit 1
} finally {
  if ($null -ne $lease) { $lease.Dispose() }
}`;

function checkedDownloadUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
    || !['aka.ms', 'download.visualstudio.microsoft.com', 'download.microsoft.com'].includes(url.hostname))
    throw new Error('Official installer redirected outside approved HTTPS hosts; nothing was executed');
  return url;
}
export async function installBuildToolsDirect(core: string, storage: string, ctx: JobContext,
  dependencies: { fetch?: typeof globalThis.fetch; run?: typeof runProcess } = {}): Promise<number> {
  const fetcher = dependencies.fetch ?? globalThis.fetch, run = dependencies.run ?? runProcess;
  assertWritablePath(core, storage);
  await fs.mkdir(storage, { recursive: true });
  const generation = await fs.mkdtemp(path.join(storage, 'installer-'));
  const file = path.join(generation, 'vs_BuildTools.exe');
  assertWritablePath(core, storage, file);
  const handle = await fs.open(file, 'wx', 0o600), hash = createHash('sha256');
  ctx.line('Downloading the official build-tools installer. Failed installer generations are preserved for review.');
  try {
    let url = checkedDownloadUrl(BUILD_TOOLS_INSTALLER), response: Response | undefined;
    const signal = AbortSignal.timeout(120000);
    for (let redirects = 0; redirects <= 5; redirects++) {
      response = await fetcher(url, { redirect: 'manual', signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === 5) throw new Error('Official installer redirect limit exceeded; nothing was executed');
      url = checkedDownloadUrl(new URL(location, url).href);
    }
    if (!response?.ok || !response.body) throw new Error(`Official installer download failed (${response?.status ?? 'no response'})`);
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_INSTALLER_BYTES) { await response.body.cancel(); throw new Error('Official installer exceeds the download size limit'); }
    const reader = response.body.getReader();
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_INSTALLER_BYTES) throw new Error('Official installer exceeds the download size limit');
        hash.update(value); await handle.writeFile(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    if (!size) throw new Error('Official installer download is empty');
    await handle.sync();
  } finally { await handle.close(); }
  assertWritablePath(core, storage, file);
  ctx.line('Verifying the installer provider signature before requesting elevation.');
  return run(systemPowerShell(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(DIRECT_INSTALLER_SCRIPT, 'utf16le').toString('base64')],
    line => ctx.line(line.slice(0, 16384)), { cwd: generation, windowsHide: true,
      env: { ...process.env, XRB_SETUP_FILE: file, XRB_SETUP_SHA256: hash.digest('hex') } });
}
