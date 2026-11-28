import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentSettingsEndpoint, connectComponentSettings } from '../src/component-settings-client.ts';
import type { ComponentMetadata } from '../src/component-settings.ts';
const metadata: ComponentMetadata = { componentLibraries: { 'bundled:ui-kit': { props: { theme: 'theme' }, defaults: { theme: 'default' } } } };
const href = 'https://app.local/index.html?xrb-panel=http://127.0.0.1:5486/&xrb-project=launcher&xrb-hand-profile-run=run-1';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('only existing bounded managed launch identities produce a settings endpoint', () => {
  assert.equal(componentSettingsEndpoint('http://localhost:5173/'), null);
  assert.equal(componentSettingsEndpoint(href.replace('http://127.0.0.1:5486/', 'https://outside.test/')), null);
  assert.equal(componentSettingsEndpoint(href.replace('https://app.local', 'https://outside.test')), null);
  assert.equal(componentSettingsEndpoint(href.replace('&xrb-hand-profile-run=run-1', '')), null);
  assert.equal(componentSettingsEndpoint(href)?.searchParams.get('run'), 'run-1');
  const preview = componentSettingsEndpoint('http://127.0.0.1:5173/?xrb-panel=http://127.0.0.1:5486/&xrb-project=launcher&xrb-preview-token=token&xrb-preview-session=session&xrb-preview-route=/preview/launcher/');
  assert.equal(preview?.searchParams.get('session'), 'session');
  assert.equal(preview?.searchParams.get('route'), '/preview/launcher/');
});

test('saved standalone startup uses compiled project settings and never starts polling', async () => {
  let requests = 0;
  const connection = await connectComponentSettings({ ...metadata, componentSettings: { 'bundled:ui-kit': { theme: 'accent' } } }, { href: 'https://example.test/apps/launcher/', fetch: async () => { requests++; throw new Error(); } });
  assert.deepEqual(connection.props, { theme: 'accent' });
  connection.subscribe(() => assert.fail('standalone subscription'));
  connection.dispose(); assert.equal(requests, 0);
});

test('initial snapshot and live values retain last good props through disconnect and stop on retirement', async t => {
  let value: unknown = { 'bundled:ui-kit': { theme: 'accent' } }, status = 200, requests = 0;
  const connection = await connectComponentSettings(metadata, { href, intervalMs: 5, fetch: async () => { requests++; return Response.json(value, { status }); } });
  t.after(() => connection.dispose());
  assert.deepEqual(connection.props, { theme: 'accent' });
  const events: Record<string, string>[] = [];
  connection.subscribe(props => events.push(props));
  value = { 'bundled:ui-kit': { theme: 'default' } };
  for (let i = 0; i < 50 && !events.length; i++) await sleep(5);
  assert.deepEqual(events, [{ theme: 'default' }]);
  status = 503; value = {};
  await sleep(20); assert.deepEqual(connection.props, { theme: 'default' });
  status = 200; value = { 'bundled:ui-kit': { theme: 42 } };
  await sleep(20); assert.equal(events.length, 1);
  status = 404;
  await sleep(20); const retiredRequests = requests;
  value = { 'bundled:ui-kit': { theme: 'accent' } }; status = 200;
  await sleep(20); assert.equal(requests, retiredRequests); assert.equal(events.length, 1);
});

test('a page lifetime can retire pending initial settings before any mount or subscription', async () => {
  const lifetime = new AbortController(); let signal: AbortSignal | undefined;
  const pending = connectComponentSettings(metadata, { href, signal: lifetime.signal, fetch: async (_url, options) => {
    signal = options?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('retired')), { once: true }));
  } });
  lifetime.abort(); const connection = await pending;
  assert.equal(signal?.aborted, true);
  connection.subscribe(() => assert.fail('retired initial settings')); connection.dispose();
  assert.deepEqual(connection.props, { theme: 'default' });
});

test('disposal aborts pending reads and forbids callbacks from the retired connection', async () => {
  let respond: ((response: Response) => void) | undefined, signal: AbortSignal | undefined, calls = 0;
  const connection = await connectComponentSettings(metadata, { href, intervalMs: 5, fetch: async (_url, options) => {
    if (!calls++) return Response.json({});
    signal = options?.signal as AbortSignal;
    return new Promise<Response>(resolve => { respond = resolve; });
  } });
  connection.subscribe(() => assert.fail('retired callback'));
  for (let i = 0; i < 50 && !respond; i++) await sleep(5);
  assert.ok(respond);
  connection.dispose(); assert.equal(signal?.aborted, true);
  respond!(Response.json({ 'bundled:ui-kit': { theme: 'accent' } }));
  await sleep(20); assert.deepEqual(connection.props, { theme: 'default' });
});
