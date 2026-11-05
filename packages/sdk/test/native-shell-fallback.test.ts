import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('native Escape has no injected fallback or pre-browser quit path', async () => {
  const source = await fs.readFile(new URL('../../../native/host/src/host_info.cpp', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /addEventListener\('keydown'/);
  const main = await fs.readFile(new URL('../../../native/host/src/main.cpp', import.meta.url), 'utf8');
  const keys = main.slice(main.indexOf('presenter.onKey = [&]'), main.indexOf('CefWindowInfo wi;'));
  assert.match(keys, /sel.keyboard \|\| w == VK_ESCAPE/);
  assert.doesNotMatch(keys, /quit\s*=|onQuit|requestClose/);
  const presenter = await fs.readFile(new URL('../../../native/host/src/presenter.cpp', import.meta.url), 'utf8');
  assert.doesNotMatch(presenter, /VK_ESCAPE/);
  assert.match(presenter, /case WM_CLOSE:[\s\S]*onQuit/);
});
