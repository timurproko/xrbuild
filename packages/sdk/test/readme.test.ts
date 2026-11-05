// The README's examples use only what the SDK exports: imported names and xrb.<member> calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as sdk from '../src/index.ts';

// A Windows checkout may have CRLF line ends.
const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = [...README.matchAll(/```(?:ts|js)\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');

test('README imports from the SDK exist', () => {
  const names = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@xr-build\/sdk'/g)]
    .flatMap((m) => m[1].split(','))
    .map((n) => n.trim().replace(/^type\s+/, ''))
    .filter((n) => n && !/^[A-Z]\w*(Options|Info|Message|Style|Event)$/.test(n));  // type-only names vanish at run time
  assert.ok(names.length > 0, 'the README imports from @xr-build/sdk');
  for (const n of names) assert.ok(n in sdk, `README imports ${n}, which the SDK does not export`);
});

test('README xrb.<member> uses exist on Xrb', () => {
  const members = new Set([...code.matchAll(/\bxrb\.(\w+)/g)].map((m) => m[1]));
  const own = ['currentHands', 'sceneHands', 'currentEyes', 'fps', 'renderMs', 'handsObject', 'cursorObject', 'hands', 'view', 'pointer',
    'interaction', 'channel', 'host', 'display', 'icon'];  // instance fields, not on the prototype
  for (const m of members) assert.ok(m in sdk.Xrb.prototype || own.includes(m), `README uses xrb.${m}`);
  for (const m of ['platform', 'onPlatform', 'handCapabilities', 'handStatus']) assert.ok(members.has(m) || README.includes(`xrb.${m}`), `README documents xrb.${m}`);
});
