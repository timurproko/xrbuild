import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { validateToolLinks } from '../src/navigation.ts';
import { navigationItems } from '../ui/navigation.js';

const ui = path.resolve(import.meta.dirname, '../ui');
test('Hands has minimal persistent panels, stable live mounts and scene-only controls', async () => {
  const html = await fs.readFile(path.join(ui, 'hands.html'), 'utf8');
  for (const id of ['hands-provider', 'hands-form', 'hands-postprocessing-root', 'hands-session-actions', 'hands-adjustments-root', 'hands-canvas', 'hands-view-reset', 'hands-fullscreen']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.indexOf('id="hands-session-actions"') < html.indexOf('id="hands-provider"'));
  assert.doesNotMatch(html, /hands-save|hands-reload|hands-availability|hands-session-status|hands-previous-session|hands-record/);
  assert.match(html, /id="hands-postprocessing-root" hidden/);
  assert.doesNotMatch(html, /hands-diagnostics|Acquisition diagnostics|Local fixture|Motion \+ pinch|Pause|Restart|Capture|Calibration/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 0);
  const live = await fs.readFile(path.join(ui, 'hands-live-controls.js'), 'utf8');
  assert.match(live, /next Start or app launch/);
  assert.match(live, /active session is not switched/);
  assert.match(live, /Opening this page starts no capture/);
  const shell = await fs.readFile(path.join(ui, 'hands-shell.js'), 'utf8');
  assert.match(shell, /resetView\(\)/); assert.match(shell, /requestFullscreen\(\)/); assert.match(shell, /ArrowLeft/);
  assert.doesNotMatch(shell, /fetch\(|innerHTML\s*=.*tabpanel|replaceChildren/);
  const page = await fs.readFile(path.join(ui, 'hands.js'), 'utf8');
  assert.match(page, /import \{ mountHandsPostprocessing \} from '\.\/hands-postprocessing\.js'/);
  assert.equal((page.match(/mountHandsPostprocessing\(\$\('hands-postprocessing-root'\)\)/g) ?? []).length, 1);
  assert.match(page, /postprocessing\.dispose\(\)/);
  assert.doesNotMatch(page, /mountRecordingTools|mountHandsTools|import\(status\.module\)/);
  assert.match(page, /export const handsPage = \{ get view\(\)/);
  assert.match(page, /view\.active \|\| view\.replaying/);
});

test('adjustment groups are direct standard sections, retain controls and only the size hint', async () => {
  const component = await fs.readFile(path.join(ui, 'hands-adjustments.js'), 'utf8');
  assert.equal((component.match(/<section class="xrb-sidebar-section"/g) ?? []).length, 2);
  assert.doesNotMatch(component, /class="card|Drawing only|X right/);
  assert.match(component, /Changes where the hand touches/);
  assert.match(component, /role="menuitem" data-reset="\$\{section\}">Reset to defaults/);
  assert.match(component, /tab\('geometry', 'Position', true\)\}\$\{tab\('appearance', 'Visual', false\)\}/);
  assert.match(component, /tabs\.className = 'xrb-tabs hands-adjustment-tabs'; tabs\.setAttribute\('role', 'tablist'\)/);
  assert.match(component, /tabAction\('geometry', 'Position', true\)\}\$\{tabAction\('appearance', 'Visual', false\)\}/);
  assert.match(component, /role="tabpanel" id="\$\{prefix\}-panel-appearance" aria-labelledby="\$\{prefix\}-tab-appearance" hidden/);
  assert.match(component, /tabs\.remove\(\)/);
  assert.match(component, /class="xrb-icon-button"[^>]+aria-haspopup="menu"/);
  assert.doesNotMatch(component, /class="small" data-reset=/);
});

test('stale diagnostic tool declarations cannot register or return to navigation', () => {
  for (const route of ['/hands-diagnostics/', '/hand-tracking/', '/hands-diagnostics/nested/']) {
    const tool = { id: 'old-tool', label: 'Retired', route, module: 'old.mjs' };
    assert.deepEqual(validateToolLinks({ tools: [tool] }), []);
    assert.equal(navigationItems('http://127.0.0.1:5180', [tool]).some(item => item.id === 'old-tool'), false);
    assert.deepEqual(validateToolLinks({ tools: [{ id: 'old-tool', label: 'Retired', url: `http://127.0.0.1:5220${route}` }] }), []);
  }
});
