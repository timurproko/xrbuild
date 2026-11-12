import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { encodeSetCameras, encodeSetProjection, encodeSetView, HostRunner, parseHostLine } from '../src/host-runner.ts';

test('parses host stdout: channel, status, log', () => {
  assert.deepEqual(parseHostLine('@channel ws://127.0.0.1:5000/?token=ab'), { kind: 'channel', url: 'ws://127.0.0.1:5000/?token=ab' });
  const s = parseHostLine('@status {"uptimeS":3.2,"pageFps":60.0,"frameMs":16.6,"latencyMs":null,"eyeW":1920,"eyeH":1080,"pageAgeMs":120,"handsHz":55.4,"handState":"running","hands":2,"clients":1}');
  assert.equal(s.kind, 'status');
  assert.equal(s.kind === 'status' && s.status.pageFps, 60);
  assert.deepEqual(parseHostLine('@status {broken'), { kind: 'log', text: '@status {broken' });
  assert.deepEqual(parseHostLine('    1.000 [host] start'), { kind: 'log', text: '    1.000 [host] start' });
});

/** A fake host: a Node script that prints like xrb-host and exits on its own or when "closed". */
async function fakeHost(script: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-host-'));
  const file = path.join(dir, 'fake-host.mjs');
  await fs.writeFile(file, script);
  return file;
}

test('built mode: streams status and log, reports the exit', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-entry-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const host = await fakeHost(`
    console.log('@channel ws://127.0.0.1:1/?token=t');
    console.log('    0.1 [host] page ' + process.argv.find((a) => a.startsWith('--app-dir=')));
    console.log('@status ' + JSON.stringify({ uptimeS: 1, pageFps: 60, frameMs: 16.6, latencyMs: null, eyeW: 800, eyeH: 600, pageAgeMs: 10, handsHz: 0, handState: 'off', hands: 0, clients: 1 }));
    // a status line glued to a partial line of another writer (seen with a display runtime)
    console.log('[clien@status ' + JSON.stringify({ uptimeS: 2, pageFps: 59, frameMs: 16.9, latencyMs: null, eyeW: 800, eyeH: 600, pageAgeMs: 10, handsHz: 0, handState: 'off', hands: 0, clients: 1 }));
    setTimeout(() => process.exit(0), 200);
  `);
  const runner = new HostRunner(async () => [], async () => {});
  const statuses: unknown[] = [];
  runner.on('status', (s) => statuses.push(s));
  const exited = new Promise((r) => runner.once('exit', r));
  // The "host exe" is node running the fake script.
  await runner.start({ projectId: 'apps/a', mode: 'built', hostExe: process.execPath, projectDir: entry, entryDir: entry,
    builtUrl: 'https://app.local/index.html?xrb-panel=http%3A%2F%2F127.0.0.1%3A5191%2F', hostArgs: [host] });
  assert.equal(runner.projectId, 'apps/a');
  assert.equal(await exited, 0);
  const st = runner.state();
  assert.equal(st.phase, 'idle');
  assert.equal(st.last?.exitCode, 0);
  assert.equal(statuses.length, 2, 'the glued status line is parsed too');
  assert.ok(runner.logLines().includes('[clien'), 'and the partial line before it stays in the log');
  assert.ok(!runner.logLines().some((l) => l.includes('@status')));
  assert.ok(runner.logLines().some((l) => l.includes(`--app-dir=${entry}`)));
  assert.ok(runner.logLines().some((l) => l.includes('--url=https://app.local/index.html?xrb-panel=')),
    'the host can serve the local build while opening it with panel workspace context');
});

test('Desktop dev URL carries selected-panel and logical project context without publication identity', async () => {
  const host = await fakeHost(`console.log(process.argv.find(a => a.startsWith('--url=')));`);
  const runner = new HostRunner(async () => [], async () => {});
  (runner as any).startDev = async () => 'http://127.0.0.1:54321/?existing=1';
  const exited = new Promise(resolve => runner.once('exit', resolve));
  await runner.start({ projectId: 'bundled:launcher', mode: 'dev', hostExe: process.execPath, projectDir: '.', entryDir: '.',
    panelUrl: 'http://127.0.0.1:5191/', mouseEnabled: true, cursor: 'system', hostArgs: [host] });
  await exited;
  const output = runner.logLines().find(line => line.startsWith('--url='));
  assert.ok(output);
  const url = new URL(output.slice('--url='.length));
  assert.equal(url.origin, 'http://127.0.0.1:54321');
  assert.equal(url.searchParams.get('xrb-panel'), 'http://127.0.0.1:5191/');
  assert.equal(url.searchParams.get('xrb-project'), 'bundled:launcher');
  assert.equal(url.searchParams.get('existing'), '1');
  assert.equal(url.searchParams.get('xrb-mouse'), '1');
  assert.equal(url.searchParams.get('xrb-cursor'), 'system');
});

test('2D/3D: the view follows the host status, and a switch goes to the host channel', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-entry-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const status = (session: boolean, stereo: boolean) =>
    JSON.stringify({ uptimeS: 1, session, stereo, pageFps: 60, frameMs: 16.6, latencyMs: null, eyeW: 1920, eyeH: 1080, pageAgeMs: 10, handsHz: 0, handState: 'off', hands: 0, clients: 1 });
  const host = await fakeHost(`
    console.log('@channel ws://127.0.0.1:1/?token=t');
    console.log('@status ${status(true, true)}');
    setTimeout(() => console.log('@status ${status(true, false)}'), 150);
    setTimeout(() => process.exit(0), 400);
  `);
  const sent: Array<[string, boolean]> = [], projections: boolean[] = [];
  const runner = new HostRunner(async () => [], async () => {}, async (url, stereo) => { sent.push([url, stereo]); }, undefined,
    async (_url, orthographic) => { projections.push(orthographic); });
  const statuses: Array<{ stereo?: boolean }> = [];
  runner.on('status', (s) => statuses.push(s));
  const exited = new Promise((r) => runner.once('exit', r));
  await runner.start({ projectId: 'apps/a', mode: 'built', switchView: true, hostExe: process.execPath, projectDir: entry, entryDir: entry, hostArgs: [host] });
  while (statuses.length < 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(runner.state().switchable, true, 'a session: the view can be switched');
  assert.equal(runner.state().flat, false, '3D as reported');
  await runner.setView(true);
  assert.deepEqual(projections, [true], 'asks the managed camera for Orthographic');
  assert.deepEqual(sent, [['ws://127.0.0.1:1/?token=t', false]], 'asks the host for stereo off');
  assert.equal(runner.state().flat, true, 'shown at once');
  while (statuses.length < 2) await new Promise((r) => setTimeout(r, 10));
  assert.equal(runner.state().flat, true, 'the host confirmed 2D');
  await exited;
  await assert.rejects(runner.setView(false), /no app is running/);
});

test('a host without a session cannot switch', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-entry-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const host = await fakeHost(`
    console.log('@channel ws://127.0.0.1:1/?token=t');
    console.log('@status ' + JSON.stringify({ uptimeS: 1, session: false, stereo: false, pageFps: 60, frameMs: 16.6, latencyMs: null, eyeW: 800, eyeH: 600, pageAgeMs: 10, handsHz: 0, handState: 'off', hands: 0, clients: 1 }));
    setTimeout(() => process.exit(0), 300);
  `);
  const runner = new HostRunner(async () => [], async () => {}, async () => { throw new Error('must not be called'); }, undefined,
    async () => { throw new Error('must not be called'); });
  const got = new Promise((r) => runner.once('status', r));
  const exited = new Promise((r) => runner.once('exit', r));
  await runner.start({ projectId: 'apps/a', mode: 'built', flat: true, switchView: true, hostExe: process.execPath, projectDir: entry, entryDir: entry, hostArgs: [host] });
  await got;
  assert.equal(runner.state().switchable, false);
  assert.equal(runner.state().flat, true, 'keeps the mode it was started with');
  await assert.rejects(runner.setView(false), /no switchable session/);
  await exited;
});

test('desktop projection switches without a display session', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-entry-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const host = await fakeHost(`console.log('@channel ws://127.0.0.1:1/?token=t'); setTimeout(() => process.exit(0), 300);`);
  const projections: boolean[] = [];
  const runner = new HostRunner(async () => [], async () => {}, undefined, undefined, async (_url, orthographic) => { projections.push(orthographic); });
  const exited = new Promise((r) => runner.once('exit', r));
  await runner.start({ projectId: 'apps/a', mode: 'built', switchView: false, hostExe: process.execPath, projectDir: entry, entryDir: entry, hostArgs: [host] });
  while (!runner.state().channelUrl) await new Promise((r) => setTimeout(r, 10));
  await runner.setView(true);
  await runner.setView(false);
  assert.deepEqual(projections, [true, false]);
  assert.equal(runner.state().flat, false);
  await exited;
});

test('kSetView message: header, then one byte', () => {
  const on = encodeSetView(true), off = encodeSetView(false);
  assert.equal(on.length, 17);
  assert.deepEqual([on[0], on[1], on[16]], [101, 1, 1]);
  assert.equal(off[16], 0);
});

test('kSetProjection message: header, then one byte', () => {
  assert.deepEqual([encodeSetProjection(true)[0], encodeSetProjection(true)[16], encodeSetProjection(false)[16]], [103, 1, 0]);
});

test('camera view switches without restarting the host', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-cameras-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const host = await fakeHost(`console.log('@channel ws://127.0.0.1:1/?token=t'); setTimeout(() => process.exit(0), 450);`);
  const sent: boolean[] = [];
  const runner = new HostRunner(async () => [], async () => {}, undefined, async (_url, enabled) => { sent.push(enabled); });
  const exited = new Promise((r) => runner.once('exit', r));
  await runner.start({ projectId: 'apps/a', mode: 'built', hostExe: process.execPath, projectDir: entry, entryDir: entry,
    hostArgs: [host], cameraAvailable: true, cameraView: false });
  while (!runner.state().channelUrl) await new Promise((r) => setTimeout(r, 10));
  assert.match(runner.logLines()[0], /--camera-view=on --camera-stream=off/);
  await runner.setCameras(true);
  assert.equal(runner.state().cameraView, true);
  await runner.setCameras(false);
  assert.deepEqual(sent, [true, false]);
  assert.equal(runner.state().cameraView, false);
  await exited;
  await assert.rejects(runner.setCameras(true), /no app is running/);
});

test('kSetCameras message: header, then one byte', () => {
  assert.deepEqual([encodeSetCameras(true)[0], encodeSetCameras(true)[16], encodeSetCameras(false)[16]], [102, 1, 0]);
});

test('built mode refuses an entry without index.html', async () => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-empty-'));
  const runner = new HostRunner(async () => [], async () => {});
  await assert.rejects(runner.start({ projectId: 'apps/a', mode: 'built', hostExe: process.execPath, projectDir: empty, entryDir: empty, hostArgs: [] }), /run Build first/);
  assert.equal(runner.state().phase, 'idle');
});

test('stop: gentle first, forced after the grace period, with a warning', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-entry-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const host = await fakeHost(`setInterval(() => {}, 1000);`);  // ignores close requests
  const kills: Array<{ pid: number; force: boolean }> = [];
  const runner = new HostRunner(async () => [], async (pid, force) => {
    kills.push({ pid, force });
    if (force) process.kill(pid);
  });
  await runner.start({ projectId: 'apps/a', mode: 'built', hostExe: process.execPath, projectDir: entry, entryDir: entry, hostArgs: [host] });
  await runner.stop(300);
  assert.deepEqual(kills.map((k) => k.force), [false, true]);
  assert.equal(runner.state().phase, 'idle');
  assert.equal(runner.state().last?.forced, true);
  assert.match(runner.state().warning!, /replug/);
});

test('exit code 3 right after start: another host is running', async () => {
  const entry = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-entry-'));
  await fs.writeFile(path.join(entry, 'index.html'), 'x');
  const host = await fakeHost(`process.exit(3);`);
  const runner = new HostRunner(async () => [{ pid: 4242, exe: 'C:\\Station\\Apps\\Demo App\\0.1.1\\Demo App.exe' }], async () => {});
  const exited = new Promise((r) => runner.once('exit', r));
  await runner.start({ projectId: 'apps/a', mode: 'built', hostExe: process.execPath, projectDir: entry, entryDir: entry, hostArgs: [host] });
  await exited;
  const st = runner.state();
  assert.match(st.warning!, /another host is already running: Demo App\.exe \(pid 4242\)/);
  assert.equal(st.foreign.length, 1);
});
