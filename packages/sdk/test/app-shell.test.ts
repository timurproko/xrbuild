import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeAction, installAppShell, previewCloseContext } from '../src/app-shell.ts';
import { appLaunchUrl, appResumeUrl } from '../src/launch-context.ts';
import type { HostInfo } from '../src/host.ts';

const base = 'http://127.0.0.1:5181/preview/launcher/';
const preview = `${base}?xrb-preview-panel=http://127.0.0.1:5181&xrb-preview-route=/preview/launcher/&xrb-preview-token=preview-token-1234&xrb-preview-session=session-token-1234&xrb-preview-fullscreen=1&xrb-cursor=ring`;

test('Escape policy returns launcher children and never closes direct apps', () => {
  for (const fullscreen of [false, true]) assert.equal(escapeAction(base, fullscreen), 'return');
  assert.equal(escapeAction(null, false), 'none');
  assert.equal(escapeAction(null, true), 'none');
  assert.equal(previewCloseContext(preview)?.session, 'session-token-1234');
  for (const href of [base, preview.replace('fullscreen=1', 'fullscreen=0'), preview.replace('session-token-1234', 'bad'), preview.replace('http://127.0.0.1:5181&', 'https://outside.test&')])
    assert.equal(previewCloseContext(href), null);
});

test('cursor and owned-session scope survive launch and return without leaking to foreign pages', () => {
  const child = appLaunchUrl('http://localhost:5173/', { returnUrl: preview, projection: 'orthographic' });
  assert.equal(new URL(child).searchParams.get('xrb-cursor'), 'ring');
  assert.deepEqual(previewCloseContext(child), previewCloseContext(preview));
  assert.deepEqual(previewCloseContext(appResumeUrl(preview, 'perspective')), previewCloseContext(preview));
  const foreign = appLaunchUrl('https://outside.test/', { returnUrl: preview });
  assert.equal(previewCloseContext(foreign), null);
});

for (const native of [false, true]) for (const fullscreen of [false, true]) for (const child of [false, true]) {
  test(`Escape runtime native=${native} fullscreen=${fullscreen} child=${child}`, async () => {
    const g = globalThis as typeof globalThis & Record<string, any>;
    const saved = new Map(['location', 'addEventListener', 'removeEventListener', 'fetch', 'parent'].map(key => [key, Object.getOwnPropertyDescriptor(g, key)]));
    const events = new EventTarget();
    let returns = 0, closes = 0;
    const direct = fullscreen ? preview : base;
    const href = child ? appLaunchUrl('http://127.0.0.1:5181/preview/test/', { returnUrl: direct }) : direct;
    Object.assign(g, { location: { href, assign() { returns++; } }, parent: g,
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
      fetch: async () => { closes++; return new Response('{}'); },
    });
    const dispose = installAppShell({
      host: native ? { fullscreen, requestClose() { closes++; } } as HostInfo : null,
      projection: () => 'orthographic', returnToLauncher: () => { returns++; return true; },
    });
    const escape = (repeat = false) => {
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, { key: 'Escape', repeat });
      events.dispatchEvent(event);
      return event;
    };
    try {
      const event = escape();
      escape(true);
      assert.equal(returns, child ? 1 : 0);
      assert.equal(closes, 0, 'Escape never requests session closure');
      assert.equal(event.defaultPrevented, child);
      dispose();
      escape();
      assert.equal(returns + closes, child ? 1 : 0, 'disposal removes the shell handler');
      await Promise.resolve();
    } finally {
      dispose();
      for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(g, key, descriptor); else delete g[key]; }
    }
  });
}
