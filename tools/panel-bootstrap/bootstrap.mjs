#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn, execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  canonical, checkoutKey, runtimeDirectory, selectedTarget, validateTarget, targetKey, supportedRuntime,
  coreSnapshot, dependencyProblems, installCore, createLog, probePanel, coreInUse, openBrowser, nativeError, redact, sleep,
} from './runtime.mjs';

const entry = fileURLToPath(import.meta.url);
const productRoot = path.resolve(path.dirname(entry), '../..');
export function rendezvous(root, directory) {
  return process.platform === 'win32' ? `\\\\.\\pipe\\xrbuild-startup-${checkoutKey(root)}-${checkoutKey(directory)}` : path.join(directory, `owner-${checkoutKey(root)}.sock`);
}
export function startPanel(root, target, log, env = process.env) {
  const server = path.join(root, 'packages/control-panel/src/server.ts');
  const args = [path.join(root, 'tools/panel-bootstrap/child.mjs'), server, `--shortcut-launch=${target.mode}`];
  if (target.explicit) args.push(`--workspace=${target.workspace}`, `--projects=${target.projects}`);
  if (target.mode === 'auto') args.push('--auto-workspace');
  const child = spawn(process.execPath, args, {cwd:root, detached:true, windowsHide:true, stdio:'ignore', env:{...env,
    XRB_HOME:target.workspace, XRB_PROJECTS_HOME:target.projects, XRB_PANEL_PORT:String(target.port), XRB_CORE:root, XRB_STARTUP_LOG:log.file}});
  child.on('error', error => log.write(`Panel process could not start: ${error.message}`));
  child.unref(); return child;
}
export async function verifiedPeer(pid, root) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  if (process.platform !== 'win32') {
    try { const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); return argv.some(a => canonical(a) === canonical(path.join(root, 'tools/panel-bootstrap/bootstrap.mjs'))); } catch { return false; }
  }
  const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { $p | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress }`;
  return new Promise(resolve => execFile('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {windowsHide:true, timeout:5000}, (error, stdout) => {
    try {
      const p=JSON.parse(stdout), argv=[...(p.CommandLine || '').matchAll(/"([^"]*)"|(\S+)/g)].map(m=>m[1]??m[2]);
      resolve(!error && canonical(p.ExecutablePath)===canonical(process.execPath) && !!argv[1] && canonical(argv[1])===canonical(path.join(root,'tools/panel-bootstrap/bootstrap.mjs')));
    } catch { resolve(false); }
  }));
}
export function requestOwner(pipe, target, root, verify = verifiedPeer) {
  return new Promise((resolve,reject) => {
    const socket = net.createConnection(pipe); let input = '', handled = false;
    socket.setTimeout(8000, () => socket.destroy(Error('Startup coordinator did not answer. No lock or process was removed.')));
    socket.on('connect', () => socket.write(JSON.stringify(target) + '\n'));
    socket.on('error', reject);
    socket.on('data', chunk => {
      input += chunk; if (input.length > 16384) { socket.destroy(Error('Invalid startup coordinator')); return; }
      if (handled || !input.includes('\n')) return;
      handled = true; socket.end();
      void (async () => {
        try {
          const message = JSON.parse(input.split('\n')[0]);
          if (message.app !== 'xrb-startup' || canonical(message.core) !== canonical(root) || !await verify(message.pid, root)) throw Error('Unverified startup owner; no process was stopped.');
          const url = new URL(message.url);
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search) throw Error('Invalid local startup destination');
          if (message.kind === 'panel') {
            if (url.port !== String(target.port) || url.hash || await probePanel(target, root) !== 'matching') throw Error('Panel identity changed before opening');
          } else if (message.kind !== 'setup' || !/^#[a-f0-9]{64}$/.test(url.hash)) throw Error('Invalid startup session');
          resolve(message);
        } catch (error) { reject(error); }
      })();
    });
  });
}
export async function createCoordinator(options = {}) {
  const root = fs.realpathSync.native(options.root || productRoot), directory = options.directory || runtimeDirectory();
  fs.mkdirSync(directory, {recursive:true, mode:0o700});
  const pipe = options.pipe || rendezvous(root, directory), log = options.log || createLog(path.join(directory, `startup-${checkoutKey(root)}.log`));
  const deps = {snapshot:coreSnapshot, problems:dependencyProblems, install:installCore, probe:probePanel,
    start:startPanel, runtime:supportedRuntime, inUse:coreInUse, ...options.deps};
  const assets = options.assetRoot || path.join(productRoot, 'tools/panel-bootstrap/ui');
  const system = path.join(productRoot, 'packages/control-panel/ui');
  const sessions = new Map(), tokens = new Map(); let installation = null, closeTimer, closing = false;
  const timeout = options.startTimeout ?? 120000;
  const envelope = value => ({app:'xrb-startup',core:root,pid:process.pid,...value});
  const panelUrl = s => `http://127.0.0.1:${s.target.port}/`;
  const active = s => ['checking','installing','starting'].includes(s.state);
  const update = (s, state, message) => { s.state = state; s.message = redact(message); log.write(message); };
  const pendingChildren = () => [...sessions.values()].some(s => s.child && s.state !== 'ready' && s.child.exitCode == null && s.child.signalCode == null);
  const releaseIfDone = () => {
    if (closing) return;
    if (installation || pendingChildren() || [...sessions.values()].some(s => active(s) || s.state === 'waiting' || s.state === 'failed' && !s.closed)) return;
    clearTimeout(closeTimer); closeTimer = setTimeout(() => { void close(); }, options.releaseDelay ?? 30000);
  };
  async function launch(s) {
    update(s, 'starting', 'Starting XR Build…');
    if (!s.child || s.child.exitCode != null || s.child.signalCode != null) {
      s.child = await deps.start(root, s.target, log); s.child?.once?.('exit', releaseIfDone);
    }
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await deps.probe(s.target, root) === 'matching') { s.url = panelUrl(s); update(s, 'ready', 'Opening XR Build…'); releaseIfDone(); return; }
      if (s.child?.exitCode != null || s.child?.signalCode != null) throw Error(`XR Build exited before it was ready (code ${s.child.exitCode ?? s.child.signalCode}). See startup output below.`);
      await sleep(options.pollInterval ?? 200);
    }
    throw Error('XR Build is taking longer than expected. Retry checks the existing process; it does not start a duplicate or stop it.');
  }
  async function start(s, allowInstall) {
    if (s.promise) return s.promise;
    s.promise = (async () => {
      try {
        update(s, 'checking', 'Checking XR Build…');
        deps.runtime();
        const found = await deps.probe(s.target, root);
        if (found === 'matching') { s.url = panelUrl(s); update(s, 'ready', 'Opening XR Build…'); releaseIfDone(); return; }
        if (installation) { update(s, 'installing', 'Waiting for this checkout’s app dependency setup…'); await installation; }
        const snapshot = deps.snapshot(root), problems = deps.problems(snapshot);
        if (problems.length) {
          if (!allowInstall) { update(s, 'waiting', 'App dependencies need setup. Packages may be downloaded; project and native tools are not installed.'); return; }
          if (found !== 'free' || await deps.inUse(root)) throw Error('This core is in use. Close its existing panel before repairing app dependencies; no process was stopped.');
          update(s, 'installing', 'Installing app dependencies…');
          if (!installation) installation = Promise.resolve().then(() => deps.install(root, log)).finally(() => { installation = null; });
          await installation;
        }
        if (deps.problems(deps.snapshot(root)).length) throw Error('Core dependencies are not ready. Retry setup after fixing the reported problem.');
        await launch(s);
      } catch (error) { update(s, 'failed', error.message || String(error)); }
      finally { s.promise = null; releaseIfDone(); }
    })();
    return s.promise;
  }
  function session(target) {
    target = validateTarget(target); const key = targetKey(target); clearTimeout(closeTimer);
    let s = sessions.get(key);
    if (!s) {
      if (sessions.size >= 16) throw Error('Too many startup destinations; close the other setup windows first.');
      s = {target, token:randomBytes(32).toString('hex'), state:'waiting', message:'Checking XR Build…', closed:false}; sessions.set(key, s); tokens.set(s.token, s);
    }
    s.closed = false; return s;
  }
  let origin;
  const routes = new Map([
    ['/', [path.join(assets,'index.html'),'text/html; charset=utf-8']],
    ['/startup.js', [path.join(assets,'startup.js'),'text/javascript; charset=utf-8']],
    ['/startup.css', [path.join(assets,'startup.css'),'text/css; charset=utf-8']],
    ['/design-system.css', [path.join(system,'design-system.css'),'text/css; charset=utf-8']],
    ['/design-system.js', [path.join(system,'design-system.js'),'text/javascript; charset=utf-8']],
    ['/scrollbars.js', [path.join(system,'scrollbars.js'),'text/javascript; charset=utf-8']],
  ]);
  const server = http.createServer(async (req,res) => {
    const reply = (status, body, type = 'application/json') => { res.writeHead(status, {'content-type':type}); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    res.setHeader('cache-control','no-store'); res.setHeader('x-content-type-options','nosniff'); res.setHeader('referrer-policy','no-referrer');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      if (req.headers.host !== new URL(origin).host || req.headers.origin && req.headers.origin !== origin) return reply(403,{error:'Foreign startup request'});
      const url = new URL(req.url, origin); if (url.search) return reply(400,{error:'Query parameters are not accepted'});
      const asset = routes.get(url.pathname);
      if (req.method === 'GET' && asset) return reply(200, fs.readFileSync(asset[0]), asset[1]);
      const s = tokens.get((req.headers.authorization || '').replace(/^Bearer /,''));
      if (!s) return reply(403,{error:'Invalid startup session'});
      if (req.method === 'GET' && url.pathname === '/api/seen') return reply(200,{seen:!!s.seen});
      if (req.method === 'GET' && url.pathname === '/api/state') { s.seen=true; return reply(200, {state:s.state,message:s.message,output:log.tail(),logFile:log.file,core:root,url:s.state === 'ready' ? s.url : null}); }
      if (req.method !== 'POST' || req.headers.origin !== origin || !['/api/start','/api/retry','/api/close'].includes(url.pathname)) return reply(403,{error:'Invalid startup action'});
      if (Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding']) return reply(400,{error:'Startup actions take no input'});
      if (url.pathname === '/api/close') {
        if (active(s)) return reply(409,{error:'Setup is still running. Closing this tab does not cancel it; reopen the shortcut to see progress.'});
        s.closed = true; releaseIfDone(); return reply(200,{closed:true});
      }
      if (url.pathname === '/api/start' && s.state !== 'waiting') return reply(200,{state:s.state});
      if (url.pathname === '/api/retry' && s.state !== 'failed') return reply(409,{error:'Only a failed attempt can be retried'});
      void start(s, true); return reply(202,{state:s.state});
    } catch (error) { reply(500,{error:redact(error.message)}); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  async function register(target) {
    const s = session(target);
    if (s.state === 'waiting' && !s.promise) await Promise.race([start(s, false), sleep(options.fastPathDelay ?? 500)]);
    return envelope(s.state === 'ready' ? {kind:'panel',url:panelUrl(s)} : {kind:'setup',url:`${origin}/#${s.token}`});
  }
  const ipc = net.createServer(socket => {
    let data = '', handled = false; socket.setTimeout(8000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', chunk => {
      data += chunk; if (data.length > 8192) { socket.destroy(); return; }
      if (handled || !data.includes('\n')) return; handled = true;
      try { void register(JSON.parse(data.split('\n')[0])).then(message => socket.end(JSON.stringify(message)+'\n'), () => socket.end('{}\n')); }
      catch { socket.end('{}\n'); }
    });
  });
  try { await new Promise((resolve,reject) => { ipc.once('error', reject); ipc.listen(pipe, resolve); }); }
  catch (error) { await new Promise(resolve => server.close(resolve)); throw error; }
  const sockets = new Set(); server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  async function close() {
    if (closing) return; closing = true; clearTimeout(closeTimer);
    for (const socket of sockets) socket.destroy();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => ipc.close(resolve))]);
  }
  return {root,origin,pipe,log,register,close,sessions,busy:()=>!!installation || pendingChildren() || [...sessions.values()].some(active)};
}
export async function waitForSetupPage(url, timeout=12000) {
  const page=new URL(url), until=Date.now()+timeout;
  while(Date.now()<until) {
    try { const r=await fetch(page.origin+'/api/seen',{headers:{authorization:'Bearer '+page.hash.slice(1)},signal:AbortSignal.timeout(1000)});if(r.ok&&(await r.json()).seen)return; } catch { /* Browser may still be opening. */ }
    await sleep(200);
  }
  throw Error('The setup page did not open. Allow the local page in your browser and reopen the shortcut. No invisible dependency installation was started.');
}
export async function main(args = process.argv.slice(2), options = {}) {
  const root = options.root || productRoot, directory = options.directory || runtimeDirectory(), pipe = rendezvous(root, directory);
  const browser = options.browser || openBrowser, fallback = options.fallback || nativeError;
  let owner;
  try {
    const target = selectedTarget(root,args); let message;
    try { message = await requestOwner(pipe, target, root); }
    catch (error) {
      if (!['ENOENT','ECONNREFUSED'].includes(error.code)) throw error;
      try { owner = await (options.create || createCoordinator)({root,directory,pipe}); }
      catch (bindError) { if (bindError.code !== 'EADDRINUSE') throw bindError; }
      message = owner ? await owner.register(target) : await requestOwner(pipe,target,root);
    }
    await browser(message.url);
    if (message.kind === 'setup') await (options.waitForPage || waitForSetupPage)(message.url);
    if (!owner) return;
  } catch (error) {
    owner?.log.write(error.message);
    if (owner && !owner.busy()) await owner.close();
    await fallback(`XR Build could not start.\n\n${error.message}\n\nStartup logs: ${directory}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void main();
