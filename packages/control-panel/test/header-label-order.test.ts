import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { MAINTENANCE_ACTIONS, navigationItems, orderMaintenanceLabels } from '../ui/navigation.js';

function headerFixture() {
  let comments = 0, focused = 0;
  const doc: any = { activeElement: null, createComment() { comments++;return { replaceWith(node: any) {
    const old = nodes.indexOf(node);if (old >= 0) nodes.splice(old, 1);
    nodes.splice(nodes.indexOf(this), 1, node);doc.activeElement = null;
  } }; } };
  const make = (id: string, maintenance?: string) => ({ id, dataset: maintenance ? { maintenance } : {}, hidden: id === 'rebuild', className: 'original', textContent: id,
    before(slot: any) { nodes.splice(nodes.indexOf(this), 0, slot); }, contains(node: any) { return node === this; }, focus() { focused++;doc.activeElement = this; } });
  const restart = make('restart', 'restart'), rebuild = make('rebuild', 'rebuild'), brand = make('brand'), stats = make('stats'), unknown = make('unknown', 'unregistered');
  const nodes: any[] = [brand, rebuild, stats, restart, unknown];
  const header = { ownerDocument: doc, get children() { return nodes.filter(node => 'dataset' in node); } } as unknown as HTMLElement;
  return { header, nodes, restart, rebuild, doc, counts: () => ({ comments, focused }) };
}

test('maintenance menu has one immutable order used for corresponding header labels', () => {
  const menu = navigationItems('http://localhost:5180', [{ id: 'tool', label: 'Tool', route: '/tool/' }]);
  assert.deepEqual(MAINTENANCE_ACTIONS.map(item => item.id), ['restart', 'rebuild']);
  assert.deepEqual(menu.slice(-2).map(item => item.id), MAINTENANCE_ACTIONS.map(item => item.id));
  assert.deepEqual(menu.map(item => item.label ?? 'separator'), ['Apps', 'Tool', 'Plugins', 'Settings', 'separator', 'Restart', 'Rebuild']);
  assert.ok(Object.isFrozen(MAINTENANCE_ACTIONS));assert.ok(MAINTENANCE_ACTIONS.every(Object.isFrozen));
});

test('ordering moves the same nodes into their existing slots, preserving unrelated content, states and focus', () => {
  const f = headerFixture();f.doc.activeElement = f.restart;
  orderMaintenanceLabels(f.header);
  assert.deepEqual(f.nodes.map(node => node.id), ['brand', 'restart', 'stats', 'rebuild', 'unknown']);
  assert.equal(f.nodes[1], f.restart);assert.equal(f.nodes[3], f.rebuild);
  assert.equal(f.restart.className, 'original');assert.equal(f.rebuild.hidden, true);assert.equal(f.restart.textContent, 'restart');
  assert.equal(f.doc.activeElement, f.restart);
  assert.deepEqual(f.counts(), { comments: 2, focused: 1 });
  orderMaintenanceLabels(f.header);
  assert.deepEqual(f.counts(), { comments: 2, focused: 1 }, 'already ordered labels are not remounted');
  orderMaintenanceLabels(f.header, []);
  assert.deepEqual(f.counts(), { comments: 2, focused: 1 }, 'headers without matching menu actions are unchanged');
});

test('panel and embedded hand default markup follow the same menu order before scripts initialize', async () => {
  for (const file of ['../ui/index.html', '../../../embedded/plugins/input-hands/samples/hand-tracking/index.html']) {
    const html = await fs.readFile(new URL(file, import.meta.url), 'utf8'), header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
    const ids = [...header.matchAll(/data-maintenance="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids, MAINTENANCE_ACTIONS.map(item => item.id), file);
    assert.ok(header.indexOf('id="panel-chip"') < header.indexOf('id="host-chip"'), file);
  }
});
