import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Opt-in real-browser checks use isolated profiles and only worktree-local scratch. */
export async function withBrowser(run: (browser: { send(method: string, params?: object): Promise<any>; evaluate(expression: string): Promise<any>; navigate(url: string, ready: string): Promise<void> }) => Promise<void>) {
  const artifacts = path.resolve(import.meta.dirname, '../../../.artifacts');
  await mkdir(artifacts, { recursive: true });
  const profile = await mkdtemp(path.join(artifacts, 'shell-browser-'));
  const processHandle = spawn(process.env.XRB_TEST_BROWSER!, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let socket: WebSocket | undefined, launchError: Error | undefined;
  processHandle.on('error', error => launchError = error);
  try {
    let port = '';
    for (let i = 0; i < 100; i++) {
      if (launchError) throw launchError;
      try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
    }
    assert.ok(port, 'browser starts');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json() as { webSocketDebuggerUrl: string };
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => socket!.addEventListener('open', resolve, { once: true }));
    let id = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: unknown) => void }>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)), entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(message.error); else entry.resolve(message.result);
    });
    const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(new Error(`Timed out: ${method}`)); }, 10000);
      pending.set(key, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      socket!.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const navigate = async (url: string, ready: string) => {
      await evaluate('window.__fixturePreviousDocument = true');
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) { if (await evaluate(`!window.__fixturePreviousDocument && !document.body?.classList.contains('workspace-pending') && (${ready})`)) return; await sleep(100); }
      assert.fail(`Page not ready: ${url}`);
    };
    await send('Page.enable');
    await run({ send, evaluate, navigate });
    await send('Browser.close');
  } finally {
    socket?.close(); processHandle.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}
