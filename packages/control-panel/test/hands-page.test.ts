import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { validateToolLinks } from '../src/navigation.ts';
import { navigationItems } from '../ui/navigation.js';

const ui = path.resolve(import.meta.dirname, '../ui');
test('Hands has persistent tab panels, stable component mounts and scene-only controls', async () => {
  const html = await fs.readFile(path.join(ui, 'hands.html'), 'utf8');
  for (const id of ['hands-postprocessing-root', 'hands-session-status', 'hands-session-actions', 'hands-adjustments-root', 'hands-recordings-root', 'hands-canvas', 'hands-view-reset', 'hands-fullscreen']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /id="hands-recordings-tab"[^>]*aria-selected="true"/);
  assert.doesNotMatch(html, /hands-diagnostics|Acquisition diagnostics|Local fixture|Motion \+ pinch|Pause|Restart|Capture|Calibration/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 1);
  const shell = await fs.readFile(path.join(ui, 'hands-shell.js'), 'utf8');
  assert.match(shell, /resetView\(\)/); assert.match(shell, /requestFullscreen\(\)/); assert.match(shell, /ArrowLeft/);
  assert.doesNotMatch(shell, /fetch\(|innerHTML\s*=.*tabpanel|replaceChildren/);
  const page = await fs.readFile(path.join(ui, 'hands.js'), 'utf8');
  assert.match(page, /import \{ mountHandsPostprocessing \} from '\.\/hands-postprocessing\.js'/);
  assert.equal((page.match(/mountHandsPostprocessing\(\$\('hands-postprocessing-root'\)\)/g) ?? []).length, 1);
  assert.match(page, /postprocessing\.dispose\(\)/);
});

test('stale diagnostic tool declarations cannot register or return to navigation', () => {
  for (const route of ['/hands-diagnostics/', '/hand-tracking/', '/hands-diagnostics/nested/']) {
    const tool = { id: 'old-tool', label: 'Retired', route, module: 'old.mjs' };
    assert.deepEqual(validateToolLinks({ tools: [tool] }), []);
    assert.equal(navigationItems('http://127.0.0.1:5180', [tool]).some(item => item.id === 'old-tool'), false);
    assert.deepEqual(validateToolLinks({ tools: [{ id: 'old-tool', label: 'Retired', url: `http://127.0.0.1:5220${route}` }] }), []);
  }
});
