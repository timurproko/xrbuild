import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const position = (name) => {
  const match = source.match(new RegExp(`${name}\\.position\\.set\\(([^)]+)\\)`));
  assert.ok(match, name);
  return match[1].split(',').map(Number);
};

test('sliders sit below the aligned round button, robot and dial', () => {
  const stepped = position('stepped'), slider = position('slider');
  assert.equal(stepped[0], -slider[0]);
  assert.equal(stepped[1], slider[1]);
  assert.ok(stepped[0] < 0 && slider[0] > 0);
  const round = position('round'), dial = position('dial');
  assert.equal(round[0], -dial[0]);
  assert.equal(round[1], dial[1]);
  assert.equal(round[1], position('trackball')[1]);
  assert.ok(round[1] > slider[1] + 0.08, 'control labels have room above the lower sliders');
  assert.match(source, /latchSelected: false/);
  assert.doesNotMatch(source, /reselectIndex/);
  assert.match(source, /const row1 = \[pill, dialogButton, toggle, interactable\]/);
});

test('showcase removes checklist, footer and shortcuts but keeps the real controls', async () => {
  assert.doesNotMatch(source, /import.*Checklist|new Checklist|checklist\.|new Label|addEventListener\('keydown'|setInterval|seen\./);
  await assert.rejects(access(new URL('../src/kit/checklist.ts', import.meta.url)), { code: 'ENOENT' });
  assert.match(source, /dialogButton\.on\('click',.*dialog\.open/);
  assert.match(source, /trackball\.axis = AXES/);
  assert.match(source, /control\.setEnabled\(event\.on/);
  assert.match(source, /control\.attach\(xrb\.interaction\)/);
  assert.doesNotMatch(source, /xrb\.bindMouse|scene\.add\(xrb\.cursorObject/);
});
