import assert from 'node:assert/strict';
import test from 'node:test';
import { notifyPanel, setPanelNotifier, type PanelToast } from '../src/plugin-service.ts';

test('core and plugins raise toasts through one validated path', () => {
  const sent: PanelToast[] = [];
  setPanelNotifier(toast => sent.push(toast));
  try {
    notifyPanel({ title: 'SOMA hand mesh', message: 'GPU runtime installed', tone: 'ok', id: 'soma', actions: [{ label: 'Open Hands', href: '/hands/' }, { label: 'Elsewhere', href: 'https://example.invalid' }] });
    notifyPanel({ title: '' });
    notifyPanel({ title: 'x'.repeat(500), tone: 'loud' as never });
    assert.deepEqual(sent[0], { title: 'SOMA hand mesh', message: 'GPU runtime installed', tone: 'ok', id: 'soma', actions: [{ label: 'Open Hands', href: '/hands/' }] }, 'only panel links are allowed as actions');
    assert.equal(sent.length, 2, 'a toast without a title is dropped');
    assert.equal(sent[1].title.length, 120); assert.equal(sent[1].tone, 'info', 'unknown tones fall back to info');
  } finally { setPanelNotifier(null); }
});
