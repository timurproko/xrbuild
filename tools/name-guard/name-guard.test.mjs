import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkRepo, checksContents, findNames, hashOf, hookDecision, nameKeys, words } from './name-guard.mjs';

// Made-up names: the guard's own tests name nothing real.
const banned = new Set([...nameKeys('acmecorp'), ...nameKeys('Widget Pro'), ...nameKeys('ZX', true)].map(hashOf));

test('words split on separators and camel case, keeping the whole run', () => {
  assert.deepEqual(words('AcmeCorp-widget_pro2').map((w) => w.word), ['AcmeCorp', 'Acme', 'Corp', 'widget', 'pro2', 'pro', '2']);
});

test('a name is found in text, in any case and spelling of its words', () => {
  const text = 'line one\nuses the ACMECORP sdk\nAcmeCorp again\nWidgetPro and widget-pro and Widget Pro\n';
  assert.deepEqual(findNames(text, banned).map((h) => `${h.line}:${h.word}`), ['2:ACMECORP', '3:AcmeCorp', '4:WidgetPro', '4:widget-pro', '4:Widget Pro']);
});

test('a name inside a longer word is not a match', () => {
  assert.deepEqual(findNames('superacmecorpx and widgetprofile and zx81', banned), []);
});

test('an exact-case name matches only that spelling', () => {
  assert.deepEqual(findNames('<circle cx="1" zx="2"/> the ZX runtime', banned).map((h) => h.word), ['ZX']);
});

test('the repo check reports contents with line numbers, file names and package names', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'name-guard-'));
  const w = (rel, t) => fs.mkdir(path.dirname(path.join(repo, rel)), { recursive: true }).then(() => fs.writeFile(path.join(repo, rel), t));
  await w('README.md', '# Tool\n\nWorks with the acmecorp board.\n');
  await w('src/acmecorp_bridge.ts', 'export {};\n');
  await w('packages/x/package.json', JSON.stringify({ name: '@widget-pro/x' }));
  await w('src/clean.ts', 'export const ok = 1;\n');
  await w('assets/blob.bin', Buffer.from([0, 1, 2, 0x61, 0x63, 0x6d, 0x65]));
  await w('.xrbuild/plugins/acmecorp/xrb-plugin.json', '{"name":"Acmecorp"}');
  await w('.xrbuild/projects/Apps/demo/index.html', 'Acmecorp');
  await w('.xrbuild/third_party/acmecorp/file.dll', Buffer.from([0, 1, 2]));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  const hits = await checkRepo(repo, banned);
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}:${h.word}`).sort(), [
    'README.md:3:acmecorp',
    'packages/x/package.json:1:widget-pro',
    'src/acmecorp_bridge.ts:0:acmecorp',
  ]);
  const staged = await checkRepo(repo, banned, { staged: true });
  assert.equal(staged.length, 3, 'the staged files are checked from the index');
});

test('the whole private workspace is excluded while core files remain checked', () => {
  for (const rel of ['.xrbuild/plugins/acmecorp/README.md', '.xrbuild/plugins/input-tracker/xrb-plugin.json',
    '.xrbuild/third_party/acmecorp/file.dll', '.xrbuild/projects/Apps/demo/index.html']) {
    assert.equal(checksContents(rel), false, rel);
  }
  assert.equal(checksContents('packages/sdk/src/main.ts'), true);
});

test('the agent hook enforces neutral core boundaries and permits the private workspace', () => {
  const repo = path.resolve('/core');
  const deny = hookDecision({ tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'README.md'), old_string: 'x', new_string: 'now with Acmecorp' } }, repo, banned);
  assert.match(deny, /banned name .*Acmecorp in README\.md/);
  assert.match(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'widget-pro.ts'), content: 'clean' } }, repo, banned), /widget-pro/);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, '.xrbuild', 'plugins', 'acmecorp', 'src', 'adapter.cpp'), content: 'clean' } }, repo, banned), null);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, '.xrbuild', 'plugins', 'input-tracker', 'README.md'), content: 'Acmecorp setup' } }, repo, banned), null);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, '.xrbuild', 'projects', 'Apps', 'demo', 'index.html'), content: 'Acmecorp' } }, repo, banned), null);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, '.xrbuild', 'third_party', 'acmecorp', 'file.dll'), content: 'Acmecorp' } }, repo, banned), null);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, '.xrbuild', 'plugins', 'input-tracker', 'src', 'adapter.cpp'), content: 'AcmecorpApiStart();' } }, repo, banned), null);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'a.ts'), content: 'clean' } }, repo, banned), null);
  assert.equal(hookDecision({ tool_name: 'Write', tool_input: { file_path: path.resolve('/workspace/plugins/acmecorp/a.cpp'), content: 'acmecorp' } }, repo, banned), null, 'files outside the repository are out of scope');
});
