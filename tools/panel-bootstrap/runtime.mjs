// This module must remain usable with no installed packages and before TypeScript imports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn, execFile} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function canonical(value) {
  let result; try { result = fs.realpathSync.native(value); } catch { result = path.resolve(value); }
  return process.platform === 'win32' ? result.toLowerCase() : result;
}
export function inside(root, value) { const rel = path.relative(root, value); return !rel.startsWith('..') && !path.isAbsolute(rel); }
export function checkoutKey(root) { return createHash('sha256').update(canonical(root)).digest('hex').slice(0, 24); }
export function runtimeDirectory(env = process.env) { return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'XRBuild', 'startup'); }
export function selectedTarget(root, args = [], env = process.env) {
  const value = name => {
    if (args.includes(name)) throw Error(`${name} requires ${name}=<value>`);
    const found = args.filter(a => a.startsWith(name + '='));
    if (found.length > 1 || found[0] === name + '=') throw Error(`Invalid ${name}`);
    return found[0]?.slice(name.length + 1);
  };
  const explicit = value('--workspace'), projects = value('--projects');
  const mode = value('--shortcut-launch') || (explicit ? 'repository' : 'user');
  if (!['user', 'repository', 'auto'].includes(mode)) throw Error('Invalid shortcut mode');
  if (args.some(a => a !== '--open' && a !== '--auto-workspace' && !['--workspace=', '--projects=', '--shortcut-launch='].some(p => a.startsWith(p)))) throw Error('Unsupported shortcut argument');
  if (args.includes('--auto-workspace') && explicit) throw Error('Auto mode cannot select an explicit workspace');
  const workspace = path.resolve(root, explicit || env.XRB_HOME || path.join(env.USERPROFILE || os.homedir(), '.xrbuild'));
  const projectRoot = path.resolve(root, projects || env.XRB_PROJECTS_HOME || workspace);
  const port = Number(env.XRB_PANEL_PORT) || (explicit || projects || env.XRB_PROJECTS_HOME ? 5181 : 5180);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid panel port');
  return {mode, workspace, projects: projectRoot, port, explicit: !!explicit};
}
export function validateTarget(t) {
  if (!t || !['user', 'repository', 'auto'].includes(t.mode) || typeof t.explicit !== 'boolean'
      || !Number.isInteger(t.port) || t.port < 1 || t.port > 65535
      || ![t.workspace, t.projects].every(v => typeof v === 'string' && v.length < 4096 && !/[\0\r\n]/.test(v) && path.isAbsolute(v))) throw Error('Invalid launch selection');
  return {mode:t.mode, workspace:t.workspace, projects:t.projects, port:t.port, explicit:t.explicit};
}
export function targetKey(t) { return JSON.stringify([canonical(t.workspace), canonical(t.projects), t.port, t.mode, t.explicit]); }
export function supportedRuntime(features = process.features) {
  if (!features.typescript) throw Error('XR Build needs Node.js with built-in TypeScript support (22.18+ or current LTS). Install a supported Node.js, then retry.');
}
function regular(root, file) {
  const absolute = path.join(root, file), stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || !inside(canonical(root), canonical(absolute))) throw Error(`Unsafe core input: ${file}`);
  if (stat.size > 2 * 1024 * 1024) throw Error(`Oversized core input: ${file}`);
  return fs.readFileSync(absolute);
}
export function coreSnapshot(root) {
  root = fs.realpathSync.native(root);
  const workspace = regular(root, 'pnpm-workspace.yaml').toString('utf8').split(/\r?\n/).map(l => l.split('#')[0].trim()).filter(Boolean);
  if (workspace.join('\n') !== 'packages:\n- packages/*\n- tools/*') throw Error('Core workspace must contain only packages/* and tools/*; automatic setup refuses another package graph.');
  const files = new Map(), packages = [];
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) files.set(file, regular(root, file));
  for (const dir of ['packages', 'tools']) {
    if (!inside(root, fs.realpathSync.native(path.join(root, dir)))) throw Error('Linked public package directory escapes core');
    for (const item of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
      if (!item.isDirectory() && !item.isSymbolicLink()) continue;
      const file = `${dir}/${item.name}/package.json`;
      if (!fs.existsSync(path.join(root, file))) continue;
      const bytes = regular(root, file); files.set(file, bytes); packages.push({dir:path.dirname(file), manifest:JSON.parse(bytes)});
    }
  }
  const manifest = JSON.parse(files.get('package.json'));
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(manifest.packageManager || '')) throw Error('Core must pin an exact pnpm package manager version.');
  packages.unshift({dir:'.', manifest});
  for (const p of packages) if (p.manifest.pnpm && Object.keys(p.manifest.pnpm).length) throw Error('Automatic setup requires review of custom package-manager overrides.');
  const names = new Map(packages.filter(p => p.manifest.name).map(p => [p.manifest.name, canonical(path.resolve(root, p.dir))]));
  for (const p of packages) for (const [name, spec] of Object.entries({...p.manifest.dependencies, ...p.manifest.devDependencies, ...p.manifest.optionalDependencies, ...p.manifest.peerDependencies})) {
    if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || typeof spec !== 'string') throw Error('Unsafe public dependency declaration');
    if (spec.startsWith('workspace:') && !names.has(name)) throw Error('Workspace dependency escapes the public graph');
    if (/^(file|link):/.test(spec) && ![...names.values()].includes(canonical(path.resolve(root, p.dir, spec.slice(spec.indexOf(':') + 1))))) throw Error('Local dependency escapes the public graph');
  }
  const hash = createHash('sha256'); for (const [file, bytes] of [...files].sort(([a],[b]) => a.localeCompare(b))) hash.update(file).update('\0').update(bytes);
  return {root, packages, files, manager:manifest.packageManager.slice(5), fingerprint:hash.digest('hex')};
}
export function versionMatches(version, spec) {
  if (spec.startsWith('workspace:') || /^(file|link):/.test(spec)) return true;
  const match = /^(\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(spec), actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || !actual) return false;
  const [major,minor,patch] = actual.slice(1).map(Number), [a,b,c] = match.slice(2).map(Number);
  if (!match[1]) return major === a && minor === b && patch === c;
  const minimum = major > a || major === a && (minor > b || minor === b && patch >= c);
  return minimum && (match[1] === '~' ? major === a && minor === b : a ? major === a : b ? major === 0 && minor === b : major === 0 && minor === 0 && patch === c);
}
export function dependencyProblems(snapshot) {
  const problems = [];
  for (const p of snapshot.packages) for (const [name, spec] of Object.entries({...p.manifest.devDependencies, ...p.manifest.dependencies})) {
    try {
      const consumer = path.join(snapshot.root, p.dir), location = path.join(consumer, 'node_modules', name);
      const installed = JSON.parse(fs.readFileSync(path.join(location, 'package.json'), 'utf8'));
      if (!inside(canonical(snapshot.root), canonical(location))) throw Error('outside this core');
      if (installed.name !== name || !versionMatches(installed.version, spec)) throw Error('wrong version');
      if (p.manifest.dependencies?.[name]) {
        const resolved = createRequire(path.join(consumer, 'package.json')).resolve(name);
        if (!fs.statSync(resolved).isFile() || !inside(canonical(snapshot.root), canonical(resolved))) throw Error('missing or ambient module');
      }
    } catch { problems.push(`${name} (${p.dir}) is missing or incompatible`); }
  }
  return problems;
}
export function redact(value, env = process.env) {
  let text = String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
  for (const [key, secret] of Object.entries(env).sort((a,b) => (b[1]?.length || 0) - (a[1]?.length || 0))) {
    if (/(token|secret|password|credential|private.?key|auth)/i.test(key) && secret && secret.length >= 4) text = text.split(secret).join('[redacted]');
  }
  return text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\b(Bearer|Basic)\s+[^\s]+/gi, '$1 [redacted]')
    .replace(/((?:token|password|secret|_authToken|_auth)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
export function lineSink(write) {
  const decoder = new StringDecoder('utf8'); let pending = '', dropped = false;
  const push = text => {
    pending += text;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index); pending = pending.slice(index + 1);
      if (!dropped) write(line.length > 16384 ? '[oversized output line omitted]' : line.replace(/\r/g, ''));
      dropped = false;
    }
    if (pending.length > 16384) { if (!dropped) write('[oversized output line omitted]'); pending = ''; dropped = true; }
  };
  return {write:chunk => push(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))), end:() => { push(decoder.end()); if (pending && !dropped) write(pending); pending = ''; }};
}
export function createLog(file, env = process.env) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) throw Error('Unsafe startup log destination');
  return {file, write(value) {
    const line = redact(value, env).slice(0, 16384) + '\n';
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024) {
        const bytes = fs.readFileSync(file); fs.writeFileSync(file, bytes.subarray(bytes.lastIndexOf(10, bytes.length - 128 * 1024) + 1), {mode:0o600});
      }
      fs.appendFileSync(file, line, {mode:0o600});
    } catch { /* UI retains its own error; diagnostics must not crash the panel. */ }
  }, tail() { try { return fs.readFileSync(file, 'utf8').split('\n').slice(-120).join('\n').slice(-32768); } catch { return ''; } }};
}
export async function probePanel(target, root, timeout = 1500) {
  return new Promise(resolve => {
    const req = http.get({host:'127.0.0.1', port:target.port, path:'/api/ping', timeout}, res => {
      let bytes = '';
      res.on('data', c => { bytes += c; if (bytes.length > 16384) req.destroy(Error('Oversized panel identity')); });
      res.on('end', () => {
        try {
          const p = JSON.parse(bytes);
          const match = res.statusCode === 200 && p.app === 'xrb-control-panel' && typeof p.repo === 'string' && canonical(p.repo) === canonical(root)
            && typeof p.workspace === 'string' && canonical(p.workspace) === canonical(target.workspace)
            && typeof p.projects === 'string' && canonical(p.projects) === canonical(target.projects);
          resolve(match ? 'matching' : 'other');
        } catch { resolve('other'); }
      });
    });
    req.on('timeout', () => req.destroy(Error('Panel did not answer')));
    req.on('error', e => resolve(e.code === 'ECONNREFUSED' ? 'free' : 'other'));
  });
}
export async function coreInUse(root) {
  const server = path.join(root, 'packages/control-panel/src/server.ts'), child = path.join(root, 'tools/panel-bootstrap/child.mjs');
  if (process.platform === 'win32') {
    const quote = v => `'${v.replace(/'/g,"''")}'`;
    const script = `$ErrorActionPreference='Stop'; $found=Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains(${quote(server)}) -or $_.CommandLine.Contains(${quote(child)})) }; if ($found) { 'busy' } else { 'free' }`;
    return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000},(error,stdout)=>error?reject(Error('Cannot verify whether this core is in use; automatic repair is blocked.')):resolve(stdout.trim() === 'busy')));
  }
  try {
    for (const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))) {
      let argv; try { argv=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0'); } catch { continue; }
      if(argv.includes(server)||argv.includes(child)) return true;
    }
    return false;
  } catch { throw Error('Cannot verify whether this core is in use; automatic repair is blocked.'); }
}
export function installerEnvironment(env = process.env) {
  const result = {...env};
  for (const key of Object.keys(result)) if (/^(npm_config_|pnpm_|corepack_|node_options$|node_path$|git_)/i.test(key)) delete result[key];
  return {...result, CI:'true', COREPACK_ENABLE_DOWNLOAD_PROMPT:'0', COREPACK_ENABLE_PROJECT_SPEC:'1', COREPACK_ENABLE_AUTO_PIN:'0',
    ...(env.COREPACK_ENABLE_NETWORK === '0' ? {COREPACK_ENABLE_NETWORK:'0'} : {})};
}
export function runManager(root, args, log, env = process.env) {
  // The shim resides with the running Node, never in the selected workspace/current directory.
  const manager = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'corepack.cmd' : 'corepack');
  if (!fs.existsSync(manager)) return Promise.reject(Error('Corepack is unavailable beside Node.js. Provision Corepack for this Node installation, then Retry; XR Build will not install global tools.'));
  return new Promise((resolve,reject) => {
    let child;
    if (process.platform === 'win32') {
      // All arguments here are fixed installer flags; root is cwd, not interpolated shell data.
      child = spawn(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c', `""${manager}" pnpm ${args.join(' ')}"`], {cwd:root, env:installerEnvironment(env), windowsHide:true, windowsVerbatimArguments:true, stdio:['ignore','pipe','pipe']});
    } else child = spawn(manager, ['pnpm', ...args], {cwd:root, env:installerEnvironment(env), stdio:['ignore','pipe','pipe']});
    const out = lineSink(v => log.write(v)), err = lineSink(v => log.write(v)); child.stdout.on('data', out.write); child.stderr.on('data', err.write);
    child.once('error', reject); child.once('close', code => { out.end(); err.end(); code === 0 ? resolve() : reject(Error(`Dependency setup exited with code ${code}. Check the output, fix network/permissions/lock inputs, then Retry.`)); });
  });
}
export async function installCore(root, log, manager = runManager) {
  const before = coreSnapshot(root);
  if (before.packages.some(p=>fs.existsSync(path.join(root,p.dir,'.npmrc')))) throw Error('Checkout-local .npmrc requires manual review; automatic setup will not inherit another install scope.');
  log.write(`Preparing pinned pnpm ${before.manager}; packages may be downloaded.`);
  // Corepack honors the exact packageManager pin; verify it before any install.
  let version = '';
  const versionLog = {write(line) { version += line + '\n'; log.write(line); }};
  await manager(root, ['--version'], versionLog);
  if (!version.split(/\r?\n/).some(line => line.trim() === before.manager)) throw Error('Package manager did not report the repository-pinned version.');
  if (coreSnapshot(root).fingerprint !== before.fingerprint) throw Error('Core inputs changed during setup. Retry after the checkout is stable.');
  await manager(root, ['install','--frozen-lockfile','--ignore-scripts','--ignore-pnpmfile','--reporter=append-only',
    '--config.userconfig=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'), '--config.globalconfig=' + (process.platform === 'win32' ? 'NUL' : '/dev/null')], log);
  if (coreSnapshot(root).fingerprint !== before.fingerprint) throw Error('Core dependency inputs changed; setup is not accepted. Retry after the checkout is stable.');
  const problems = dependencyProblems(coreSnapshot(root)); if (problems.length) throw Error('Dependencies are still unavailable after setup: ' + problems.join('; '));
}
export function openBrowser(url) {
  return new Promise((resolve,reject) => {
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const child = spawn(command, args, {detached:true, stdio:'ignore', windowsHide:true});
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
export function nativeError(message) {
  if (process.platform !== 'win32') { console.error(redact(message)); return Promise.resolve(); }
  return new Promise(resolve => {
    const text = Buffer.from(redact(message), 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile','-NonInteractive','-Command', `$s=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${text}')); (New-Object -ComObject WScript.Shell).Popup($s,0,'XR Build startup',16) | Out-Null`], {windowsHide:true}, () => resolve());
  });
}
