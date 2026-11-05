import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');

test('native and browser windowed previews share the constrained 1520 by 856 target', () => {
  const args = readFileSync(path.join(root, 'native/host/src/args.h'), 'utf8');
  const presenter = readFileSync(path.join(root, 'native/host/src/presenter.cpp'), 'utf8');
  const panel = readFileSync(path.join(root, 'packages/control-panel/src/panel.ts'), 'utf8');
  assert.match(args, /int windowW = 1520, windowH = 856/);
  assert.match(presenter, /windowedRectOn\(const RECT& monitor, int desiredW = 1520, int desiredH = 856\)[\s\S]*monitor\.right - monitor\.left\) - 80[\s\S]*return \{x, y, x \+ w, y \+ h\};/, 'native uses the same decorated outer rectangle passed to the browser');
  assert.match(panel, /Math\.min\(1520, screenWidth - 80\)[\s\S]*Math\.min\(856, screenHeight - 80\)/);
  assert.match(panel, /fullscreen \? screenLeft[\s\S]*fullscreen \? screenTop/);
});
