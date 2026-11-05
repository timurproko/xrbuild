import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventHub } from '../src/http.ts';
import { Panel } from '../src/panel.ts';
import type { Manifest } from '../src/projects.ts';
import type { PublicationIdentity, Publisher } from '../src/publishers.ts';

class RecordingHub extends EventHub {
  readonly sent: Array<{ type: string; data: unknown }> = [];
  override send(type: string, data: unknown): void {
    this.sent.push({ type, data });
  }
}

const manifest = { name: 'Published', kind: 'app', target: 'webxr', publication: { enabled: true, publisher: 'slow', id: '11111111-1111-4111-8111-111111111111', slug: 'demo' } } as Manifest;

function slowPublisher() {
  const calls: PublicationIdentity[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const publisher: Publisher = {
    name: 'slow', origin: 'https://example.test', routePrefix: 'apps',
    validate: () => [],
    async status(p) { calls.push(p); await gate; return { state: 'published', selectedUrl: '', deployedUrl: `https://example.test/apps/${p.slug}/` }; },
    publish: async () => ({}),
    unpublish: async () => ({}),
  };
  return { publisher, calls, release };
}

test('the project list never waits for a publisher: checking first, then the cached status and an event', async () => {
  const hub = new RecordingHub();
  const panel = new Panel('core', 'workspace', hub);
  const slow = slowPublisher();
  panel.publishers = { found: [{ publisher: slow.publisher, dir: 'plugins/slow' }], problems: [] };

  const first = await panel.publicationOf(manifest);
  assert.equal(first.status?.state, 'checking', 'answered before the publisher');
  assert.equal(first.status?.selectedUrl, 'https://example.test/apps/demo/');
  assert.equal((await panel.publicationDestinationsOf(manifest)).slow.status.state, 'checking');
  assert.equal(slow.calls.length, 1, 'one refresh in flight at a time');

  slow.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(hub.sent.map((e) => e.type), ['publication-status']);
  const second = await panel.publicationOf(manifest);
  assert.equal(second.status?.state, 'published');
  assert.equal(second.status?.deployedUrl, 'https://example.test/apps/demo/');
  assert.equal(slow.calls.length, 1, 'a fresh status is served from the cache');
});

test('a stale status is answered from the cache and refreshed in the background', async () => {
  const hub = new RecordingHub();
  const panel = new Panel('core', 'workspace', hub);
  const slow = slowPublisher();
  slow.release();
  panel.publishers = { found: [{ publisher: slow.publisher, dir: 'plugins/slow' }], problems: [] };
  panel.publicationStatusMaxAgeMs = 0;
  await panel.publicationOf(manifest);
  await new Promise((resolve) => setImmediate(resolve));
  const again = await panel.publicationOf(manifest);
  assert.equal(again.status?.state, 'published', 'the last status while a refresh runs');
  assert.equal(slow.calls.length, 2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(hub.sent.length, 1, 'an unchanged status sends no event');
});
