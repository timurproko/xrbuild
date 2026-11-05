import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultIco, defaultIcon, icoFromPngs, isIconColor, isIconShape } from '../src/icon.ts';

test('default icon: blue by default, another colour on request, same size and format', () => {
  const blue = defaultIcon(64), green = defaultIcon(64, 'green');
  assert.deepEqual(defaultIcon(64, 'blue'), blue);
  assert.notDeepEqual(green, blue);
  assert.equal(green.readUInt32BE(16), 64);  // IHDR width
  assert.ok(isIconColor('teal') && !isIconColor('pink') && !isIconColor('toString'));
});

test('default icon: selectable shapes', () => {
  const sphere = defaultIcon(64);
  for (const shape of ['cube', 'diamond', 'hexagon'] as const) assert.notDeepEqual(defaultIcon(64, 'blue', shape), sphere);
  assert.ok(isIconShape('diamond') && !isIconShape('triangle'));
});

test('.ico: one PNG image per size, 256 written as 0', () => {
  const ico = icoFromPngs([{ size: 16, png: Buffer.from('a') }, { size: 256, png: Buffer.from('bcd') }]);
  assert.equal(ico.readUInt16LE(2), 1, 'type icon');
  assert.equal(ico.readUInt16LE(4), 2, 'two images');
  assert.equal(ico[6], 16);
  assert.equal(ico[6 + 16], 0, '256 px');
  assert.equal(ico.readUInt32LE(6 + 16 + 8), 3, 'second image size');
  assert.equal(ico.subarray(ico.readUInt32LE(6 + 16 + 12)).toString(), 'bcd');
  assert.equal(defaultIco().readUInt16LE(4), 6, 'the host icon has six sizes');
});
