import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { DesktopSetup, desktopInstallerArgs, desktopInstallerNeedsRestart, type DesktopTools } from '../src/desktop-setup.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { findCmake } from '../src/host-build.ts';
import { JobRunner, type JobContext } from '../src/jobs.ts';
import { desktopChecklistHtml } from '../ui/desktop-setup.js';
import { rebuildPresentation } from '../ui/rebuild-dialog.js';
import { withBrowser, sleep } from './browser-fixture.ts';

async function fixture(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/desktop-setup-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user'), storage = path.join(root, 'setup');
  await fs.mkdir(core);
  const cleanup = { stop: async () => {} };
  t.after(async () => { await cleanup.stop(); await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  let tools: DesktopTools = { cmake: null, compiler: null, sdk: null, manager: path.join(root, 'synthetic-manager.exe') };
  const state = { libraries: false, runtime: false, code: 0, calls: 0, downloads: 0, boot: Date.now() - 100000, gate: null as Promise<void> | null, verified: true };
  const lines: string[] = [];
  const ctx: JobContext = { line: text => lines.push(text), async run() { assert.fail('No real process may run in setup tests'); } };
  const setup = new DesktopSetup(core, workspace, { storage, platform: 'win32', tools: async () => tools,
    libraries: async () => ({ ready: state.libraries, root: path.join(root, 'synthetic-deps'), revision: 'pinned', problem: state.libraries ? null : 'Missing pinned libraries', blocked: false }),
    runtime: async () => ({ exists: state.runtime, outdated: !state.runtime }),
    installLibraries: async context => { state.downloads++; context.line('synthetic pinned download'); state.libraries = true; },
    run: async (command, args, line) => {
      assert.equal(command, tools.manager); assert.deepEqual(args, desktopInstallerArgs());
      state.calls++; line('synthetic installer progress'); await state.gate;
      if (state.verified && [0, 3010].includes(state.code)) tools = { ...tools, cmake: 'checked-cmake', compiler: 'checked-compiler', sdk: 'checked-sdk' };
      return state.code;
    }, bootTime: () => state.boot });
  return { root, core, workspace, storage, setup, state, ctx, lines, cleanup, setTools: (next: DesktopTools) => { tools = next; } };
}
const install = async (f: Awaited<ReturnType<typeof fixture>>, action = 'toolchain') => f.setup.install(action, (await f.setup.check()).revision, true, f.ctx);

test('desktop checks are read-only and distinguish installable tools, unavailable setup and unsupported systems', async t => {
  const f = await fixture(t), status = await f.setup.check();
  assert.equal(status.canBuild, false); assert.equal(status.steps.length, 5);
  assert.ok(status.steps.every(step => step.state === 'missing'));
  assert.equal(f.state.calls, 0); assert.equal(f.state.downloads, 0);
  await assert.rejects(fs.access(f.workspace)); await assert.rejects(fs.access(f.storage));
  f.setTools({ cmake: null, compiler: null, sdk: null, manager: null });
  const unavailable = (await f.setup.check()).steps[0];
  assert.equal(unavailable.action, null);
  assert.equal(unavailable.state, 'blocked');
  assert.equal(unavailable.detail, 'Automatic setup is unavailable on this PC.');
  const other = new DesktopSetup(f.core, f.workspace, { ...f.setup.deps, platform: 'other' });
  const unsupported = await other.check(); assert.equal(unsupported.supported, false); assert.equal(unsupported.steps[0].state, 'blocked');
  const denied = new DesktopSetup(f.core, f.workspace, { ...f.setup.deps, tools: async () => { throw new Error('tool lookup denied'); } });
  const blocked = await denied.check(); assert.equal(blocked.steps[0].state, 'blocked'); assert.equal(blocked.steps[0].action, null);
  assert.match(blocked.steps[0].detail, /Cannot inspect desktop tools/);
});

test('without a package manager, an available signed direct installer runs only after explicit consent', async t => {
  const f = await fixture(t);
  f.setTools({cmake:null,compiler:null,sdk:null,manager:null,directInstaller:true});
  let calls = 0;
  f.setup.deps.installToolchain = async ctx => { calls++; ctx.line('synthetic signed bootstrapper'); f.setTools({cmake:'checked',compiler:'checked',sdk:'checked',manager:null,directInstaller:true}); return 0; };
  const status = await f.setup.check();
  assert.equal(status.steps[0].action, 'toolchain'); assert.equal(calls, 0);
  await assert.rejects(f.setup.install('toolchain', status.revision, false, f.ctx), /Confirm/);
  assert.equal(calls, 0);
  const result = await install(f);
  assert.equal(calls, 1); assert.equal(f.state.calls, 0);
  assert.ok(result.status.steps.slice(0, 3).every(step => step.state === 'ready'));
});

test('CMake discovery can skip an unusable PATH candidate and reuse another installed candidate', async t => {
  const f = await fixture(t), old = process.env.PATH;
  const first = path.join(f.root, 'old'), second = path.join(f.root, 'current');
  await fs.mkdir(first); await fs.mkdir(second);
  await fs.writeFile(path.join(first, 'cmake.exe'), 'synthetic old tool'); await fs.writeFile(path.join(second, 'cmake.exe'), 'synthetic current tool');
  const seen: string[] = [];
  try {
    process.env.PATH = [first, second].join(path.delimiter);
    const chosen = findCmake(file => { seen.push(file); return file === path.join(second, 'cmake.exe'); });
    assert.equal(chosen, path.join(second, 'cmake.exe'));
    assert.deepEqual(seen, [path.join(first, 'cmake.exe'), path.join(second, 'cmake.exe')]);
  } finally { if (old === undefined) delete process.env.PATH; else process.env.PATH = old; }
});

test('unconfirmed, unknown and stale requests cannot start installers or create storage', async t => {
  const f = await fixture(t), status = await f.setup.check();
  await assert.rejects(f.setup.install('toolchain', status.revision, false, f.ctx), /Confirm/);
  await assert.rejects(f.setup.install('arbitrary-command', status.revision, true, f.ctx), /Unknown/);
  await assert.rejects(f.setup.install('toolchain', 'stale', true, f.ctx), /changed/);
  assert.equal(f.state.calls, 0); await assert.rejects(fs.access(f.storage));
  const args = desktopInstallerArgs();
  assert.ok(args.includes('--source') && args.includes('winget') && args.includes('--exact'));
  assert.match(args.at(-1)!, /--norestart/); assert.doesNotMatch(args.join(' '), /--allow-reboot|ignore-security|ignore-hash/);
});

test('explicit setup streams output and verifies tools/dependencies before enabling rebuild', async t => {
  const f = await fixture(t);
  const first = await install(f); assert.equal(first.status.canBuild, false); assert.equal(f.state.calls, 1);
  assert.ok(first.status.steps.slice(0, 3).every(step => step.state === 'ready'));
  assert.ok(f.lines.includes('synthetic installer progress'));
  const second = await install(f, 'native-deps'); assert.equal(second.status.canBuild, true); assert.equal(f.state.downloads, 1);
  await assert.rejects(fs.access(path.join(f.storage, 'setup.lock')));
  await assert.rejects(fs.access(f.workspace));
});

test('installer failure and success without verified readiness never produce false-ready status', async t => {
  const f = await fixture(t); f.state.code = 7;
  await assert.rejects(install(f), /code 7/); assert.equal((await f.setup.check()).canBuild, false);
  await assert.rejects(fs.access(path.join(f.storage, 'setup.lock')));
  f.state.code = 0; f.state.verified = false;
  await assert.rejects(install(f), /readiness checks still fail/);
  assert.equal(f.state.calls, 2); await assert.rejects(fs.access(path.join(f.storage, 'restart.json')));
});

test('native and signed/unsigned package-manager restart codes are recognized without treating failures as ready', () => {
  for (const code of [3010,1641,0x8A150109,0x8A15010A,0x8A15010B]) {
    assert.equal(desktopInstallerNeedsRestart(code), true);
    assert.equal(desktopInstallerNeedsRestart(code | 0), true);
  }
  for (const code of [0,5,0x8A150102,0x8A15010D]) assert.equal(desktopInstallerNeedsRestart(code), false);
});

test('restart-required setup remains explicit until a later boot and never invokes reboot', async t => {
  const f = await fixture(t); f.state.code = 3010; f.state.libraries = true;
  const result = await install(f);
  assert.equal(result.restartRequired, true); assert.equal(result.status.canBuild, false);
  assert.equal(result.status.steps[0].state, 'restart-required'); assert.equal(f.state.calls, 1);
  const marker = await fs.readFile(path.join(f.storage, 'restart.json'));
  assert.equal((await f.setup.check()).steps[0].state, 'restart-required');
  f.state.boot = Date.now() + 1000;
  assert.equal((await f.setup.check()).canBuild, true);
  assert.deepEqual(await fs.readFile(path.join(f.storage, 'restart.json')), marker);
});

test('independent panels respect a foreign/active setup lock without removing it', async t => {
  const f = await fixture(t); let release!: () => void;
  f.state.gate = new Promise<void>(resolve => { release = resolve; });
  const pending = install(f);
  for (let i = 0; i < 100 && !f.state.calls; i++) await sleep(10);
  assert.equal(f.state.calls, 1);
  const other = new DesktopSetup(f.core, f.workspace, f.setup.deps);
  const busy = await other.check(); assert.equal(busy.busy, true);
  const lock = await fs.readFile(path.join(f.storage, 'setup.lock'));
  await assert.rejects(other.install('toolchain', busy.revision, true, f.ctx), /lock exists/);
  assert.deepEqual(await fs.readFile(path.join(f.storage, 'setup.lock')), lock);
  release(); await pending;
  await fs.writeFile(path.join(f.storage, 'setup.lock'), 'foreign installer');
  assert.equal((await other.check()).busy, true);
  assert.equal(await fs.readFile(path.join(f.storage, 'setup.lock'), 'utf8'), 'foreign installer');
});

test('linked and malformed setup state is preserved instead of repaired blindly', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, f.storage, process.platform === 'win32' ? 'junction' : 'dir');
  const blocked = await f.setup.check(); assert.equal(blocked.steps[0].state, 'blocked');
  await assert.rejects(f.setup.install('toolchain', blocked.revision, true, f.ctx)); assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(f.storage); await fs.mkdir(f.storage); await fs.writeFile(path.join(f.storage, 'restart.json'), '{preserve');
  assert.equal((await f.setup.check()).steps[0].state, 'blocked');
  assert.equal(await fs.readFile(path.join(f.storage, 'restart.json'), 'utf8'), '{preserve');
});

test('desktop setup jobs exclude all other jobs in both directions', async () => {
  for (const kind of ['web-build', 'package', 'host-rebuild', 'icon-render', 'desktop-setup'] as const) for (const reverse of [false, true]) {
    const jobs = new JobRunner(); let release!: () => void;
    const job = jobs.start(reverse ? kind : 'desktop-setup', null, 'active', () => new Promise<void>(resolve => { release = resolve; }));
    assert.throws(() => jobs.start(reverse ? 'desktop-setup' : kind, null, 'conflict', async () => {}), /desktop setup/);
    release(); await jobs.wait(job);
  }
});

async function serverFixture(t: TestContext) {
  const f = await fixture(t), server = createServer({ repo: f.core, workspace: f.workspace, workspaceKind: 'user', port: await freePort() });
  server.panel.desktopSetup = f.setup;
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  f.cleanup.stop = () => server.close();
  const request = async (method: string, route: string, body?: object) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  };
  return { ...f, server, request };
}

test('setup API enforces consent/revision and prevents forced quit/restart during installation', async t => {
  const f = await serverFixture(t), status = (await f.request('GET', '/api/host/setup')).data;
  assert.equal((await f.request('POST', '/api/host/setup', { action: 'toolchain', revision: status.revision })).status, 400);
  assert.equal((await f.request('POST', '/api/host/setup', { action: 'shell', revision: status.revision, confirm: true })).status, 400);
  assert.equal((await f.request('POST', '/api/host/setup', { action: 'toolchain', revision: 'stale', confirm: true })).status, 409);
  assert.equal((await f.request('POST', '/api/host/setup', { action: 'toolchain', revision: status.revision, confirm: true, command: 'not-allowed' })).status, 400);
  assert.equal(f.server.panel.jobs.list().length, 0);
  let release!: () => void; f.state.gate = new Promise<void>(resolve => { release = resolve; });
  const started = await f.request('POST', '/api/host/setup', { action: 'toolchain', revision: status.revision, confirm: true });
  assert.equal(started.status, 202); assert.equal(started.data.kind, 'desktop-setup');
  assert.equal(started.data.setupAction, 'toolchain');
  assert.equal((await f.request('POST', '/api/quit', { confirm: true })).status, 409);
  assert.equal((await f.request('POST', '/api/restart', { confirm: true })).status, 409);
  assert.equal((await f.request('POST', '/api/host/rebuild')).status, 409);
  release(); const job = await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.data.id)!); assert.equal(job.state, 'done', job.error ?? '');
});

test('checklist escapes diagnostics and setup progress preserves restart/failure semantics', async t => {
  const f = await fixture(t), status = await f.setup.check(); status.steps[0].detail = '<unsafe>'; status.steps[0].state = 'blocked';
  for (const step of status.steps.slice(0, 3)) { step.state = 'blocked'; step.detail = '<unsafe>'; }
  const html = desktopChecklistHtml(status);
  assert.match(html, /&lt;unsafe&gt;/); assert.doesNotMatch(html, /<unsafe>/);
  assert.equal((html.match(/&lt;unsafe&gt;/g) ?? []).length, 1, 'shared toolchain diagnostics are shown once');
  const restart = rebuildPresentation({kind:'desktop-setup',state:'done',id:1,result:{restartRequired:true},lines:['restart']});
  assert.equal(restart.message, 'Restart Windows when convenient, then refresh Desktop setup.');
  assert.equal(restart.title, 'Restart required'); assert.equal(restart.succeeded, false);
  assert.equal(rebuildPresentation({kind:'desktop-setup',state:'failed',error:'failed',id:1}).title, 'Setup failed');
});

test('checklist keeps fixed workflow positions regardless of readiness without mutating status', async t => {
  const f = await fixture(t), status = await f.setup.check();
  const rowLabels = () => [...desktopChecklistHtml(status).matchAll(/<(?:strong|span) class="xrb-setup-label">(.*?)<\/(?:strong|span)>/g)].map(match => match[1]);
  const order = ['Core native libraries', 'CMake 3.21+', 'C++ build tools', 'Desktop SDK'];
  assert.doesNotMatch(desktopChecklistHtml(status), /Host runtime|data-desktop-step="runtime"/);
  assert.deepEqual(rowLabels(), order);
  status.steps[0].state = 'ready';
  status.steps[1].state = 'blocked';
  status.steps[2].state = 'restart-required';
  for (const step of status.steps.slice(0, 3)) step.action = null;
  const before = structuredClone(status);
  assert.deepEqual(rowLabels(), order);
  assert.deepEqual(status, before, 'presentation sorting never changes API prerequisite order/state');
  status.steps[3].state = 'ready';
  assert.deepEqual(rowLabels(), order, 'completing the top installation does not move it');
});

test('checklist uses one Install/Repair flow without library descriptions, output links or manual setup', async t => {
  const f = await fixture(t), status = await f.setup.check();
  const html = desktopChecklistHtml(status);
  assert.doesNotMatch(html, /View setup output|data-desktop-output|Required to compile|Pinned native libraries/);
  assert.doesNotMatch(html, /CEF browser runtime|nlohmann\/json|xrb-setup-includes|data-desktop-manual|visualstudio\.microsoft\.com/);
  assert.match(html, /data-desktop-group="toolchain"/);
  assert.equal((html.match(/data-desktop-install="toolchain"/g) ?? []).length, 1);
  status.steps[0].state='ready';
  assert.match(desktopChecklistHtml(status), /data-desktop-install="toolchain"[^>]*><span>Repair<\/span><\/button>/);
  assert.doesNotMatch(desktopChecklistHtml(status), /Install \/ repair/);
});

const until = async (evaluate: (expression: string) => Promise<any>, expression: string) => {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); } assert.fail(expression);
};
const injectSetupNetworkFaults = async (evaluate: (expression: string) => Promise<any>) => evaluate(`
  window.__setupNetwork = {dropJobs:0,drops:0,posts:0,losePostResponse:false};
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const route = new URL(input, location.href).pathname, state = window.__setupNetwork;
    if (route === '/api/jobs' && state.dropJobs > 0) { state.dropJobs--; state.drops++; throw new TypeError('Failed to fetch'); }
    if (route === '/api/host/setup' && options?.method === 'POST') {
      state.posts++;
      const response = await originalFetch(input, options);
      if (state.losePostResponse) { await response.arrayBuffer(); throw new TypeError('Failed to fetch'); }
      return response;
    }
    return originalFetch(input, options);
  };
`);

for (const droppedReads of [2, 3]) test(`browser recovers ${droppedReads} interrupted job reads without repeating installation or retaining a false failure`, { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t);
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await injectSetupNetworkFaults(evaluate);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`window.__setupNetwork.dropJobs=${droppedReads};document.querySelector('[data-desktop-install="native-deps"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && !!document.querySelector('[data-desktop-step="native-deps"] .state.ok') && document.querySelector('[data-desktop-error]').hidden`);
    assert.equal(await evaluate(`window.__setupNetwork.drops`), droppedReads);
    assert.equal(await evaluate(`window.__setupNetwork.posts`), 1);
    assert.equal(f.state.downloads, 1);
    assert.equal(f.server.panel.jobs.list()[0].state, 'done');
    assert.equal(await evaluate(`document.querySelector('.xrb-setup-step strong').textContent`), 'Core native libraries');
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-output]')`), false);
    assert.match(f.server.panel.jobs.list()[0].lines.join('\n'), /synthetic pinned download/);
    assert.equal(rebuildPresentation(f.server.panel.jobs.list()[0]).title, 'Setup complete');
  });
});

test('browser bounds persistent read retries and explains unknown status without claiming installation failed', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t);
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await injectSetupNetworkFaults(evaluate);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`window.__setupNetwork.dropJobs=Infinity;document.querySelector('[data-desktop-install="native-deps"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && document.querySelector('[data-desktop-error]').textContent.includes('Connection lost.')`);
    assert.equal(await evaluate(`window.__setupNetwork.drops`), 6, 'three attempts per read, including the one explicit recovery read');
    assert.equal(await evaluate(`window.__setupNetwork.posts`), 1);
    assert.equal(f.server.panel.jobs.list()[0].state, 'done');
    assert.equal(f.server.panel.jobs.list()[0].error, null);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-error]').textContent`), 'Connection lost. Refresh to reconnect.');
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-busy]')`), false);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-build]').disabled`), true);
    await evaluate(`window.__setupNetwork.dropJobs=0;document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled && document.querySelector('[data-desktop-error]').hidden`);
    assert.equal(await evaluate(`window.__setupNetwork.posts`), 1);
    assert.equal(f.state.downloads, 1);
  });
});

test('browser never repeats an installation POST after its accepted response is lost', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t);
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await injectSetupNetworkFaults(evaluate);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`window.__setupNetwork.losePostResponse=true;document.querySelector('[data-desktop-install="native-deps"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && document.querySelector('[data-desktop-error]').textContent.includes('Setup may have started')`);
    assert.equal(await evaluate(`window.__setupNetwork.posts`), 1);
    assert.equal(f.state.downloads, 1);
    await f.server.panel.jobs.wait(f.server.panel.jobs.list()[0]);
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled && document.querySelector('[data-desktop-error]').hidden`);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-output]')`), false);
    assert.equal(rebuildPresentation(f.server.panel.jobs.list()[0]).title, 'Setup complete');
    await evaluate(`document.querySelector('[data-desktop-setup]').dispatchEvent(new Event('close'))`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-setup]')?.open`), true, 'a delayed close event must not dismiss the reopened checklist');
    assert.equal(await evaluate(`window.__setupNetwork.posts`), 1);
  });
});

test('browser checklist uses install-click consent without a checkbox, shows progress and rebuilds explicitly', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t); let release!: () => void;
  f.state.gate = new Promise<void>(resolve => { release = resolve; });
  const start = f.server.panel.jobs.start.bind(f.server.panel.jobs);
  (f.server.panel.jobs as any).start = (kind: any, id: any, title: any, work: any, ...rest: any[]) => start(kind, id, title, kind === 'host-rebuild' ? async ctx => { ctx.line('synthetic host build'); f.state.runtime = true; } : work, ...rest);
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    assert.equal(f.state.calls, 0); await assert.rejects(fs.access(f.storage));
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    assert.equal(f.server.panel.jobs.list().length, 0);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-consent]')`), false);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-install="toolchain"]').disabled`), false);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-disclosure]')`), false);
    assert.doesNotMatch(await evaluate(`document.querySelector('[data-desktop-setup]').textContent`), /By clicking Install/);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-manual]')`), false, 'setup has no alternate manual flow');
    assert.equal(f.state.calls, 0, 'opening the checklist does not consent or install');
    await evaluate(`document.querySelector('[data-desktop-install="toolchain"]').click()`);
    await until(evaluate, `document.querySelector('[data-xrb-rebuild-title]')?.textContent === 'Installing desktop prerequisites'`);
    assert.equal(f.state.calls, 1); release();
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-build]').disabled`), true);
    await evaluate(`document.querySelector('[data-desktop-install="native-deps"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && !document.querySelector('[data-desktop-build]').disabled`);
    assert.equal(f.state.downloads, 1);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-output]')`), false);
    const recorded = (await f.request('GET','/api/jobs')).data.jobs;
    assert.match(recorded.find((job:any)=>job.setupAction==='toolchain').lines.join('\n'), /synthetic installer progress/);
    assert.match(recorded.find((job:any)=>job.setupAction==='native-deps').lines.join('\n'), /synthetic pinned download/);
    assert.equal(f.server.panel.jobs.list().filter(job => job.kind === 'host-rebuild').length, 0);
    await evaluate(`document.querySelector('[data-desktop-build]').click()`);
    await until(evaluate, `document.querySelector('[data-xrb-rebuild-title]').textContent === 'Rebuilt'`);
    assert.equal(f.state.runtime, true); assert.equal(f.state.calls, 1);
  });
});

test('browser grouped build tools provide one direct-install button without a package manager', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t); f.state.libraries = true;
  f.setTools({cmake:null,compiler:null,sdk:null,manager:null,directInstaller:true});
  let calls = 0;
  f.setup.deps.installToolchain = async ctx => { calls++; ctx.line('synthetic signed bootstrapper'); f.setTools({cmake:'checked',compiler:'checked',sdk:'checked',manager:null,directInstaller:true}); return 0; };
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-desktop-group="toolchain"] [data-desktop-install]').length`), 1);
    assert.equal(await evaluate(`document.querySelectorAll('.xrb-setup-checks [data-desktop-install]').length`), 0);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-manual]')`), false);
    assert.equal(calls, 0);
    await evaluate(`document.querySelector('[data-desktop-install="toolchain"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && !document.querySelector('[data-desktop-build]').disabled`);
    assert.equal(calls, 1); assert.equal(f.state.calls, 0);
    assert.equal(await evaluate(`document.querySelectorAll('[data-desktop-output]').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('.xrb-setup-checks .state.ok').length`), 3);
  });
});

test('browser compact cards align titles and Install actions without output links/descriptions in narrow/wide light/dark views', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000}, async t => {
  const f = await serverFixture(t);
  f.setTools({cmake:'checked',compiler:'checked',sdk:'checked',manager:null});
  const prior=f.server.panel.jobs.start('desktop-setup',null,'install core native libraries',async ctx=>ctx.line('synthetic prior library setup'));
  await f.server.panel.jobs.wait(prior);
  const job=f.server.panel.jobs.start('desktop-setup',null,'install desktop build tools',async ctx=>ctx.line('synthetic installed toolchain'));
  await f.server.panel.jobs.wait(job);
  await withBrowser(async ({navigate,evaluate,send})=>{
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    for(const ready of [false,'partial',true]){
      f.state.libraries=ready===true;
      f.setTools({cmake:ready?'checked':null,compiler:ready===true?'checked':null,sdk:ready===true?'checked':null,manager:'synthetic-manager.exe'});
      await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
      await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
      for(const width of [1280,390])for(const theme of ['light','dark']){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      const layout=await evaluate(`(()=>{
        const group=document.querySelector('[data-desktop-group="toolchain"]'),title=group.querySelector('h4'),label=group.querySelector('.xrb-setup-label'),dialog=document.querySelector('[data-desktop-setup]');
        const a=title.getBoundingClientRect(),card=dialog.querySelector('[data-desktop-step="native-deps"]'),cardTitle=card.querySelector('.xrb-setup-label'),coreButton=card.querySelector('[data-desktop-install]'),toolsButton=group.querySelector('[data-desktop-install]');
        return {noOutput:!dialog.querySelector('[data-desktop-output]'),
          matchingCards:parseFloat(getComputedStyle(card).borderTopWidth)>0&&getComputedStyle(card).borderTopWidth===getComputedStyle(group).borderTopWidth&&getComputedStyle(card).paddingLeft===getComputedStyle(group).paddingLeft,
          headingsAligned:Math.abs(cardTitle.getBoundingClientRect().left-a.left)<1,
          actionsAligned:!toolsButton||Math.abs(coreButton.getBoundingClientRect().right-toolsButton.getBoundingClientRect().right)<1,
          centered:[...dialog.querySelectorAll('.xrb-setup-heading')].every(heading=>{const label=heading.querySelector('h4,.xrb-setup-label'),control=heading.querySelector('button,.state');if(!control)return true;const a=label.getBoundingClientRect(),b=control.getBoundingClientRect();return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<0.1;}),
          noDescriptions:!card.querySelector('.xrb-help')&&!group.querySelector('.xrb-setup-group-header > .xrb-help'),
          summaryOnly:card.querySelectorAll('.xrb-setup-label').length===1&&!card.querySelector('ul'),
          compactButtons:[...dialog.querySelectorAll('[data-desktop-install]')].every(button=>{const badge=group.querySelector('.state.neutral')??group.querySelector('.state'),a=getComputedStyle(button),b=getComputedStyle(badge);return Math.abs(button.getBoundingClientRect().height-badge.getBoundingClientRect().height)<0.1&&Math.abs(button.getBoundingClientRect().width-badge.getBoundingClientRect().width)<0.1&&a.fontFamily===b.fontFamily&&a.fontSize===b.fontSize&&a.fontWeight===b.fontWeight&&a.lineHeight===b.lineHeight&&parseFloat(a.paddingLeft)+parseFloat(a.borderLeftWidth)===parseFloat(b.paddingLeft)&&parseFloat(a.paddingTop)+parseFloat(a.borderTopWidth)===parseFloat(b.paddingTop);}),
          lighter:Number(getComputedStyle(label).fontWeight)<Number(getComputedStyle(title).fontWeight),smaller:parseFloat(getComputedStyle(label).fontSize)<parseFloat(getComputedStyle(title).fontSize),
          aligned:[...dialog.querySelectorAll('.xrb-setup-step')].every(row=>{const badge=row.querySelector('.state');return !badge||Math.abs(row.getBoundingClientRect().right-parseFloat(getComputedStyle(row).paddingRight)-parseFloat(getComputedStyle(row).borderRightWidth)-badge.getBoundingClientRect().right)<1;}),
          compactBottom:parseFloat(getComputedStyle(group.querySelector('.xrb-setup-checks > :last-child')).paddingBottom)===0&&dialog.querySelector('.xrb-dialog-actions').getBoundingClientRect().top-group.getBoundingClientRect().bottom>=18&&dialog.querySelector('.xrb-dialog-actions').getBoundingClientRect().top-group.getBoundingClientRect().bottom<=24,
          noRuntime:!dialog.querySelector('[data-desktop-step="runtime"]'),noOverflow:dialog.scrollWidth<=dialog.clientWidth+1};
      })()`);
      assert.deepEqual(layout,{noOutput:true,matchingCards:true,headingsAligned:true,actionsAligned:true,centered:true,noDescriptions:true,summaryOnly:true,compactButtons:true,lighter:true,smaller:true,aligned:true,compactBottom:true,noRuntime:true,noOverflow:true},`${ready}/${width}/${theme}`);
      }
    }
    assert.equal(f.state.calls,0);assert.equal(f.state.downloads,0);
  });
});

test('browser restart keeps required badges without a redundant red restart notice', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000}, async t=>{
  const f=await serverFixture(t);f.state.libraries=true;f.state.code=3010;
  const status=(await f.request('GET','/api/host/setup')).data;
  const started=await f.request('POST','/api/host/setup',{action:'toolchain',revision:status.revision,confirm:true});
  await f.server.panel.jobs.wait(f.server.panel.jobs.get(started.data.id)!);
  await withBrowser(async({navigate,evaluate})=>{
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-error]').hidden`),true);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-error]').textContent`),'');
    assert.equal(await evaluate(`[...document.querySelectorAll('.xrb-setup-checks .state')].every(badge=>badge.textContent==='Restart required')`),true);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-build]').disabled`),true);
    assert.equal(f.server.panel.jobs.list()[0].result.restartRequired,true);
  });
});

test('browser Refresh stays disabled as Checking... through competing renders and restores after success or failure', {skip:!process.env.XRB_TEST_BROWSER,timeout:60000}, async t=>{
  const f=await serverFixture(t);
  await withBrowser(async({navigate,evaluate})=>{
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`window.__refresh={armed:false,count:0,fail:false};const originalRefreshFetch=window.fetch.bind(window);let initialJobs=true;
      window.fetch=async(input,options)=>{
        const route=new URL(input,location.href).pathname;
        if(route==='/api/jobs'&&initialJobs){initialJobs=false;await new Promise(resolve=>window.__refresh.releaseJobs=resolve);}
        if(route==='/api/host/setup'&&(!options?.method||options.method==='GET')&&window.__refresh.armed){
          window.__refresh.count++;await new Promise(resolve=>window.__refresh.releaseStatus=resolve);
          if(window.__refresh.fail)return new Response(JSON.stringify({error:'Synthetic check failed'}),{status:500,headers:{'content-type':'application/json'}});
        }
        return originalRefreshFetch(input,options);
      }`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!window.__refresh.releaseJobs&&!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`window.__refresh.armed=true;document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `window.__refresh.count===1`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').textContent`),'Checking...');
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').disabled`),true);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-desktop-install]')].every(button=>button.disabled)`),true);
    await evaluate(`document.querySelector('[data-desktop-refresh]').dispatchEvent(new Event('click'));window.__refresh.releaseJobs()`);
    await sleep(100);
    assert.equal(await evaluate(`window.__refresh.count`),1,'duplicate refresh is refused');
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').disabled`),true,'startup job render must not re-enable refresh');
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').textContent`),'Checking...');
    await evaluate(`window.__refresh.releaseStatus()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').textContent`),'Refresh');
    await evaluate(`window.__refresh.fail=true;document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `window.__refresh.count===2`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').textContent`),'Checking...');
    await evaluate(`window.__refresh.releaseStatus()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-refresh]').textContent`),'Refresh');
    assert.match(await evaluate(`document.querySelector('[data-desktop-error]').textContent`),/Synthetic check failed/);
    assert.equal(f.state.calls,0);assert.equal(f.state.downloads,0);
  });
});

test('browser unavailable setup explains blocked reasons, consistent spacing and recovery without a manual route', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t);
  f.setTools({ cmake: null, compiler: null, sdk: null, manager: null });
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    assert.equal(await evaluate(`document.querySelector('.xrb-setup-step strong').textContent`), 'Core native libraries');
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-step="runtime"]')`), false);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-manual]')`), false);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-error]').textContent`), 'Automatic setup is unavailable on this PC.');
    assert.equal(await evaluate(`document.querySelectorAll('.xrb-setup-checks .state.err').length`), 3);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-group="toolchain"] h4').textContent`), 'Build tools');
    assert.equal(await evaluate(`document.querySelectorAll('.xrb-setup-checks .xrb-help').length`), 0, 'included checks have no repeated installation instructions');
    assert.doesNotMatch(await evaluate(`document.querySelector('[data-desktop-setup]').textContent`), /Automatic build-tools installation is unavailable|not an extra dependency|Install the desktop C\+\+ workload/);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-setup] a')`), false);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-consent]')`), false);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-install="native-deps"]').disabled`), false);
    assert.equal(f.state.downloads, 0);
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
    assert.equal(f.state.downloads, 0, 'refresh never consents or installs');
    await evaluate(`document.querySelector('[data-desktop-install="native-deps"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && !document.querySelector('[data-desktop-install="native-deps"]')`);
    assert.equal(f.state.downloads, 1); assert.equal(f.state.calls, 0);
    assert.equal(await evaluate(`document.querySelector('.xrb-setup-step strong').textContent`), 'Core native libraries', 'completed installation remains at the top');
    const order = await evaluate(`[...document.querySelectorAll('.xrb-setup-label')].map(row => row.textContent)`);
    await evaluate(`document.querySelector('[data-desktop-close]').click();document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.xrb-setup-label')].map(row => row.textContent)`), order);
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.xrb-setup-label')].map(row => row.textContent)`), order);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-output]')`), false);
    assert.match((await f.request('GET','/api/jobs')).data.jobs[0].lines.join('\n'), /synthetic pinned download/);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-build]').disabled`), true, 'unavailable toolchain setup cannot be bypassed');
    const libraries = f.setup.deps.libraries;
    f.setup.deps.libraries = async () => ({ready:false,blocked:true,revision:'unsafe',problem:'Native dependency receipt needs review.'});
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
    assert.equal(await evaluate(`(()=>{
      const dialog=document.querySelector('[data-desktop-setup]'),header=dialog.querySelector('.xrb-setup-dialog-header');
      const titleGap=header.querySelector('p').getBoundingClientRect().top-header.querySelector('h3').getBoundingClientRect().bottom;
      return Math.abs(titleGap-4)<0.1&&[...dialog.querySelectorAll('.xrb-setup-group-header')].every(section=>Math.abs(section.querySelector('.xrb-help').getBoundingClientRect().top-section.querySelector('.xrb-setup-heading').getBoundingClientRect().bottom-8)<0.1)&&parseFloat(getComputedStyle(dialog.querySelector('.xrb-setup-checks > :first-child')).paddingTop)===0;
    })()`), true, 'headings, helper text and first checks share one spacing rhythm');
    f.setTools({ cmake: 'checked-cmake', compiler: 'checked-compiler', sdk: 'checked-sdk', manager: null });
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-refresh]').disabled`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-error]').textContent`), 'Native dependency receipt needs review.');
    f.setup.deps.libraries = libraries;
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await until(evaluate, `!document.querySelector('[data-desktop-build]').disabled`);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-error]').hidden`), true, 'resolving refresh clears the blocked reason');
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-manual]')`), false);
    assert.equal(f.state.downloads, 1); assert.equal(f.state.calls, 0);
    assert.equal(f.server.panel.jobs.list().filter(job => job.kind === 'host-rebuild').length, 0);
  });
});

test('browser setup failure retains output and retry guidance without automatic retries', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t); f.state.code = 5;
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`document.querySelector('[data-desktop-install="toolchain"]').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && document.querySelector('[data-desktop-error]').textContent.includes('code 5')`);
    assert.equal(f.state.calls, 1); assert.equal(f.server.panel.jobs.list().length, 1);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-manual]')`), false, 'failure preserves the same command-backed retry route');
    assert.equal(await evaluate(`document.querySelector('[data-desktop-install="toolchain"]').disabled`), false);
    assert.equal(await evaluate(`!!document.querySelector('[data-desktop-output]')`), false);
    assert.equal(rebuildPresentation(f.server.panel.jobs.list()[0]).title, 'Setup failed');
    assert.match((await f.request('GET','/api/jobs')).data.jobs[0].lines.join('\n'), /synthetic installer progress/);
    await evaluate(`document.querySelector('[data-desktop-refresh]').click()`);
    await sleep(100); assert.equal(f.state.calls, 1);
    assert.equal(await evaluate(`document.querySelector('[data-desktop-build]').disabled`), true);
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    await evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await until(evaluate, `document.querySelector('[data-desktop-setup]')?.open && document.querySelector('[data-desktop-error]').textContent.includes('code 5')`);
    assert.equal(f.state.calls, 1);
  });
});

test('reload leaves installation running and explicit Rebuild resumes its existing progress', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await serverFixture(t); f.state.libraries = true;
  let release!: () => void; f.state.gate = new Promise<void>(resolve => { release = resolve; });
  await withBrowser(async ({navigate,evaluate}) => {
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    const open = () => evaluate(`document.querySelector('#panel-menu-button').click();document.querySelector('#host-rebuild').click()`);
    await open(); await until(evaluate, `!!document.querySelector('[data-desktop-setup]')?.open`);
    await evaluate(`document.querySelector('[data-desktop-install="toolchain"]').click()`);
    await until(evaluate, `document.querySelector('[data-xrb-rebuild-title]')?.textContent === 'Installing desktop prerequisites'`);
    assert.equal(f.state.calls, 1);
    await navigate(f.server.url, `!!document.querySelector('#panel-menu-button')`);
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`), false);
    await open(); await until(evaluate, `document.querySelector('[data-xrb-rebuild-title]')?.textContent === 'Installing desktop prerequisites'`);
    assert.equal(f.state.calls, 1); release();
    await until(evaluate, `document.querySelector('[data-desktop-setup]').open && !document.querySelector('[data-desktop-build]').disabled`);
    assert.equal(f.state.calls, 1);
    assert.equal(f.server.panel.jobs.list().filter(job => job.kind === 'host-rebuild').length, 0);
  });
});
