import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('launcher entry stays text-free while its canvas loads or resumes', async () => {
  for (const file of ['../index.html', '../dist/index.html']) {
    const html = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /Opening XR library|id=["']loading["']/);
    assert.match(html, /<script[^>]*type="module"/);
  }
});
