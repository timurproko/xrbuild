import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { updateRestartChip } from '../ui/design-system.js';
const ui = path.resolve(import.meta.dirname, '..', 'ui');

test('panel freshness shows the restart chip and the Restart dot only while outdated', async () => {
  const app = await fs.readFile(path.join(ui, 'app.js'), 'utf8');
  const index = await fs.readFile(path.join(ui, 'index.html'), 'utf8');
  const navigation = await fs.readFile(path.join(ui, 'navigation.js'), 'utf8');
  assert.match(index, /<span id="panel-chip" class="chip warn" data-maintenance="restart" hidden>restart available<\/span>/);
  assert.match(navigation, /\{id:'restart',label:'Restart'/);
  assert.match(navigation, /\{id:'rebuild',label:'Rebuild'/);
  assert.match(navigation, /dot\.id=item\.id==='rebuild'\?'host-rebuild-dot':'panel-restart-dot'/, 'both menu items share one dot style');
  assert.match(app, /setInterval\([^\n]*loadPanelFreshness\(\)[^\n]*, 30000\)/, 'refreshed with the host timer');
  assert.match(app, /addEventListener\('focus', \(\) => loadPanelFreshness\(\)/, 'refreshed when the page regains focus');

  // Run the real render function against stand-in elements.
  const start = app.indexOf('function renderPanelFreshness()');
  const source = app.slice(start, app.indexOf('\nfunction tile(', start));
  const elements: Record<string, { hidden: boolean; title: string; className?: string; textContent?: string }> = { '#panel-chip': { hidden: true, title: '' }, '#panel-restart-dot': { hidden: true, title: '' } };
  const state: { panel: unknown } = { panel: null };
  const render = new Function('state', '$', 'updateRestartChip', `${source}; return renderPanelFreshness;`)(state, (s: string) => elements[s], updateRestartChip) as () => void;

  render();
  assert.equal(elements['#panel-chip'].hidden, true, 'nothing before the first answer');
  state.panel = { outdated: true, newestSource: 'packages/control-panel/src/http.ts' };
  render();
  assert.equal(elements['#panel-chip'].hidden, false);
  assert.equal(elements['#panel-restart-dot'].hidden, false);
  assert.match(elements['#panel-chip'].title, /^packages\/control-panel\/src\/http\.ts changed after the control panel started/);
  state.panel = { outdated: false, newestSource: null };
  render();
  assert.equal(elements['#panel-chip'].hidden, true);
  assert.equal(elements['#panel-restart-dot'].hidden, true);
});
