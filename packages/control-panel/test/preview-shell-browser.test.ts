import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import type { ChildProcess } from 'node:child_process';
import { createServer } from '../src/server.ts';
import { appLaunchUrl } from '../../sdk/src/launch-context.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('real browser Escape only returns; explicit close relay rejects foreign sources', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const root = path.resolve(import.meta.dirname, '../../..'), artifacts = path.join(root, '.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(artifacts, 'preview-shell-'));
  for (const id of ['launcher', 'child']) {
    const project = path.join(workspace, 'projects/Apps', id), dist = path.join(project, 'dist');
    await fs.mkdir(dist, { recursive: true });
    await fs.writeFile(path.join(project, 'xrb-project.json'), JSON.stringify({ name: id, kind: 'app', entry: 'dist', target: 'webxr' }));
    for (const module of ['app-shell', 'launch-context', 'return-overlay', 'cursor-style']) {
      const source = stripTypeScriptTypes(await fs.readFile(path.join(root, 'packages/sdk/src', `${module}.ts`), 'utf8')).replaceAll('.ts\'', '.js\'');
      await fs.writeFile(path.join(dist, `${module}.js`), source);
    }
    await fs.writeFile(path.join(dist, 'index.html'), `<script type="module">import {installAppShell} from './app-shell.js'; installAppShell({host:null,projection:()=> 'orthographic',returnToLauncher:()=>false});window.ready=true;</script>`);
  }
  const reserve = http.createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const panel = createServer({ repo: root, workspace, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  let child: any;
  panel.panel.launchBrowser = async () => { child = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null }); return child as ChildProcess; };
  (panel.panel.runner as any).kill = async () => { child.exitCode = 0; child.emit('close', 0); };
  const launch = async (fullscreen: boolean) => {
    const response = await fetch(`${panel.url}api/projects/launcher/preview`, { method: 'POST', headers: { origin: new URL(panel.url).origin, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'built', fullscreen, token: 'browser-shell-token-1234' }) });
    const data = await response.json() as { url: string };
    assert.equal(response.status, 200, JSON.stringify(data)); return data.url;
  };
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      const escape = async (repeat = false) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, autoRepeat: repeat }); await sleep(150); };
      for (const fullscreen of [false, true]) for (const returned of [false, true]) {
        const launcher = await launch(fullscreen);
        const url = returned ? appLaunchUrl(`${panel.url}preview/child/`, { returnUrl: launcher }) : launcher;
        await navigate(url, '!!window.ready');
        await escape();
        if (returned) {
          assert.equal(await evaluate('location.pathname'), '/preview/launcher/');
          assert.equal(panel.panel.runner.state().phase, 'running');
          await escape(true); assert.equal(panel.panel.runner.state().phase, 'running');
          await escape();
        }
        assert.equal(panel.panel.runner.state().phase, 'running', 'Escape leaves direct and returned-to sessions open');
        await panel.panel.runner.stop();
      }
      const launcher = new URL(await launch(true)), scope = {
        type: 'xrb-preview-close', route: launcher.searchParams.get('xrb-preview-route'), token: launcher.searchParams.get('xrb-preview-token'), session: launcher.searchParams.get('xrb-preview-session'),
      };
      const wrapper = new URL('fullscreen-preview.html', panel.url);
      for (const [key, value] of Object.entries({ target: launcher.href, route: scope.route, token: scope.token, session: scope.session })) wrapper.searchParams.set(key, value!);
      await navigate(wrapper.href, '!!document.querySelector("#preview")?.contentWindow?.ready');
      await evaluate(`window.scope=${JSON.stringify(scope)};dispatchEvent(new MessageEvent('message',{data:scope,source:window,origin:location.origin}))`);
      await sleep(100); assert.equal(panel.panel.runner.state().phase, 'running', 'foreign source is rejected');
      await evaluate(`dispatchEvent(new MessageEvent('message',{data:scope,source:document.querySelector('#preview').contentWindow,origin:'https://foreign.test'}))`);
      await sleep(100); assert.equal(panel.panel.runner.state().phase, 'running', 'foreign origin is rejected');
      await evaluate(`dispatchEvent(new MessageEvent('message',{data:{...scope,session:'old-session-123456'},source:document.querySelector('#preview').contentWindow,origin:location.origin}))`);
      await sleep(100); assert.equal(panel.panel.runner.state().phase, 'running', 'stale session is rejected');
      await evaluate(`document.querySelector('#preview').contentWindow.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}))`);
      await sleep(150);
      assert.equal(panel.panel.runner.state().phase, 'running', 'iframe Escape never closes a direct session');
      await evaluate(`dispatchEvent(new MessageEvent('message',{data:scope,source:document.querySelector('#preview').contentWindow,origin:location.origin}))`);
      for (let i = 0; i < 30 && panel.panel.runner.state().phase !== 'idle'; i++) await sleep(100);
      assert.equal(panel.panel.runner.state().phase, 'idle', 'an explicit validated close still targets only its owned runner');
    });
  } finally { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
