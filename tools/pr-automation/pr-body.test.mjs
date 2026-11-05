import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseLink, writeLink } from './pr-body.mjs';

const body = (json, fence = '```') => `## Proposal\n\nText.\n\n## Automation\n\n<details>\n<summary>Used by CI</summary>\n\n${fence}openspec-implementation\n${json}\n${fence}\n\n</details>\n`;

test('a valid block links the change', () => {
  assert.deepEqual(parseLink(body('{"version":1,"change":"pr-delivery-automation"}')), { linked: true, link: { version: 1, change: 'pr-delivery-automation' } });
  const finalized = parseLink(body('{"version":1,"change":"x","archive":"openspec/changes/archive/2026-10-11-x","finalizedHead":"abc"}'));
  assert.equal(finalized.link.finalizedHead, 'abc');
  assert.ok(parseLink(body('{"version":1,"change":"x"}', '~~~')).linked, 'a tilde fence works too');
});

test('no block, or an empty one, is not linked and not an error', () => {
  assert.deepEqual(parseLink('## Proposal\n\nNo automation here.'), { linked: false });
  assert.deepEqual(parseLink(body('')), { linked: false });
  assert.deepEqual(parseLink(null), { linked: false });
});

test('a malformed block is an error naming the problem', () => {
  assert.match(parseLink(body('{"version":1,')).error, /not valid JSON/);
  assert.match(parseLink(body('[1]')).error, /JSON object/);
  assert.match(parseLink(body('{"version":2,"change":"x"}')).error, /version 2/);
  assert.match(parseLink(body('{"version":1,"change":"Bad Name"}')).error, /not a change folder name/);
  assert.match(parseLink(body('{"version":1,"change":"../x"}')).error, /not a change folder name/);
  assert.match(parseLink(body('{"version":1,"change":"x","archive":3}')).error, /"archive" must be a string/);
});

test('rewriting the block leaves the rest of the body byte-identical', () => {
  const before = body('{"version":1,"change":"x"}');
  const after = writeLink(before, { version: 1, change: 'x', archive: 'openspec/changes/archive/2026-10-11-x', finalizedHead: 'f00' });
  const [head, tail] = before.split('{"version":1,"change":"x"}');
  assert.ok(after.startsWith(head) && after.endsWith(tail));
  assert.equal(parseLink(after).link.finalizedHead, 'f00');
  const crlf = before.replace(/\n/g, '\r\n');
  assert.equal(writeLink(crlf, { version: 1, change: 'y' }), crlf.replace('"change":"x"', '"change":"y"'), 'CRLF bodies keep CRLF');
  assert.throws(() => writeLink('no block', { version: 1, change: 'x' }), /no openspec-implementation block/);
});

test('the PR template\'s empty block reads as not linked', () => {
  const template = readFileSync(new URL('../../.github/pull_request_template.md', import.meta.url), 'utf8');
  assert.match(template, /```openspec-implementation/);
  assert.deepEqual(parseLink(template), { linked: false });
  const filled = template.replace(/(```openspec-implementation\r?\n)/, '$1{"version":1,"change":"x"}\n');
  assert.deepEqual(parseLink(filled), { linked: true, link: { version: 1, change: 'x' } });
  assert.equal(parseLink(writeLink(template, { version: 1, change: 'y' })).link.change, 'y', 'the empty block can be filled');
});
