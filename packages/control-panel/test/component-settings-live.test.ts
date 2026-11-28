import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentSettingsFixture } from './component-settings.fixture.ts';
import { connectComponentSettings } from '../../sdk/src/component-settings-client.ts';

test('managed built/dev preview and native scopes expose only the active project and current committed values', async t => {
  const f = await componentSettingsFixture(t), panel = f.server.panel as any;
  let active = true;
  t.mock.getter(panel.runner, 'busy', () => active);
  t.mock.getter(panel.runner, 'projectId', () => 'launcher');
  const route = '/preview/launcher/';
  panel.previewProjection = { route, token: 'token', session: 'session', projectId: 'launcher' };
  const endpoint = '/api/component-settings?project=launcher&route=/preview/launcher/&token=token&session=session';
  assert.equal((await f.request('GET', '/api/component-settings?project=launcher')).status, 404);
  assert.equal((await f.request('GET', endpoint.replace('session=session', 'session=old'))).status, 404);
  assert.equal((await f.request('GET', endpoint.replace('project=launcher', 'project=plain'))).status, 404);
  assert.equal((await f.request('GET', endpoint)).json['bundled:ui-kit'].theme, 'default');
  const saved = await f.save(await f.get(), 'accent'); assert.equal(saved.status, 200);
  assert.equal((await f.request('GET', endpoint)).json['bundled:ui-kit'].theme, 'accent');
  // Built and cross-port dev previews share this exact token/session/route authority.
  for (const origin of [f.server.url, 'http://127.0.0.1:5173/']) {
    const href = new URL(origin); href.searchParams.set('xrb-panel', f.server.url); href.searchParams.set('xrb-project', 'launcher');
    href.searchParams.set('xrb-preview-route', route); href.searchParams.set('xrb-preview-token', 'token'); href.searchParams.set('xrb-preview-session', 'session');
    const connection = await connectComponentSettings(saved.json.manifest, { href: href.href });
    assert.deepEqual(connection.props, { theme: 'accent' }); connection.dispose();
    const crossOrigin = await fetch(new URL(endpoint, f.server.url), { headers: { origin: new URL(origin).origin } });
    assert.equal(crossOrigin.status, 200);
    if (new URL(origin).origin !== new URL(f.server.url).origin) assert.equal(crossOrigin.headers.get('access-control-allow-origin'), new URL(origin).origin);
  }
  active = false; assert.equal((await f.request('GET', endpoint)).status, 404);
  active = true; panel.previewProjection = null; panel.nativeHandPolicy = 'off'; panel.liveHands = { envelope: { runId: 'native-run' }, close() {} };
  try {
    const native = '/api/component-settings?project=launcher&run=native-run';
    assert.equal((await f.request('GET', native)).status, 200);
    assert.equal((await f.request('GET', native.replace('native-run', 'retired'))).status, 404);
    assert.equal((await f.request('GET', endpoint)).status, 404);
    for (const origin of ['https://app.local/index.html', 'http://127.0.0.1:5173/']) {
      const href = new URL(origin); href.searchParams.set('xrb-panel', f.server.url); href.searchParams.set('xrb-project', 'launcher'); href.searchParams.set('xrb-hand-profile-run', 'native-run');
      const connection = await connectComponentSettings(saved.json.manifest, { href: href.href });
      assert.deepEqual(connection.props, { theme: 'accent' }); connection.dispose();
    }
    const cors = await fetch(new URL(native, f.server.url), { headers: { origin: 'https://app.local' } });
    assert.equal(cors.headers.get('access-control-allow-origin'), 'https://app.local');
  } finally { panel.liveHands = null; panel.nativeHandPolicy = null; }
});
