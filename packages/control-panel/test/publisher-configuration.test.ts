import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { REPO } from '../src/env.ts';
import { EventHub } from '../src/http.ts';
import { Panel } from '../src/panel.ts';
import { discoverPublishers, publisherUnconfigured, type Publisher } from '../src/publishers.ts';

async function workspace(t: TestContext) {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/publisher-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'projects'), { recursive: true });
  return root;
}
const publisher = (name: string, extra: Partial<Publisher> = {}): Publisher => ({
  name, label: name === 'live' ? 'Live' : 'Production', origin: name === 'live' ? 'https://live.example' : 'https://unconfigured.invalid', routePrefix: 'apps',
  validate: () => [], status: async () => ({ state: 'unpublished', selectedUrl: '' }) as never, publish: async () => ({}) as never, unpublish: async () => ({}) as never, ...extra,
});
const manifest = (name: string) => ({ name: 'App', kind: 'app', target: 'webxr', publication: { enabled: true, publisher: name, id: '00000000-0000-4000-8000-000000000000', slug: 'app' } }) as never;

test('configured state defaults to configured and carries a bounded reason', () => {
  assert.equal(publisherUnconfigured(publisher('live')), null);
  assert.equal(publisherUnconfigured(publisher('prod', { configured: true })), null);
  assert.equal(publisherUnconfigured(publisher('prod', { configured: false, configurationProblem: 'Configure production in Settings' })), 'Configure production in Settings');
  assert.equal(publisherUnconfigured(publisher('prod', { configured: false })), 'This publisher is not configured');
});

test('discovery accepts the configured state and rejects malformed values', async t => {
  const w = await workspace(t);
  for (const [name, extra] of [['ok', `configured:false,configurationProblem:'Configure it'`], ['badflag', `configured:'no'`], ['badtext', `configured:false,configurationProblem:'a\nb'`]] as const) {
    const dir = path.join(w, 'plugins', name); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'xrb-plugin.json'), JSON.stringify({ title: name, type: 'publisher', version: '0.1.0' }));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, xrBuild: { publisher: './p.mjs' } }));
    await fs.writeFile(path.join(dir, 'p.mjs'), `export const publisher={name:'${name}',origin:'https://unconfigured.invalid',${extra},validate(){return []},async status(){return {state:'unavailable'}},async publish(){return {}},async unpublish(){return {}}}`);
  }
  const found = await discoverPublishers(w);
  assert.deepEqual(found.found.map(item => item.publisher.name), ['ok']);
  assert.equal(found.problems.length, 2);
});

test('an unconfigured publisher is listed without its placeholder origin and is never offered for publication', async t => {
  const panel = new Panel(REPO, await workspace(t), new EventHub());
  let statusCalls = 0;
  const prod = publisher('prod', { configured: false, configurationProblem: 'Configure production in Settings', status: async () => { statusCalls++; return { state: 'unavailable' } as never; } });
  panel.publishers = { found: [{ publisher: publisher('live'), dir: '' }, { publisher: prod, dir: '', plugin: { key: 'bundled:webxr' } as never }], problems: [] };
  const info = await panel.publicationOf(manifest('prod'));
  assert.equal(info.available, false);
  assert.equal(info.reason, 'Configure production in Settings');
  assert.equal(info.status, null);
  const listed = info.publishers.find(item => item.name === 'prod')!;
  assert.deepEqual({ origin: listed.origin, configured: listed.configured, problem: listed.configurationProblem, module: listed.settingsModule, releases: listed.releases },
    { origin: '', configured: false, problem: 'Configure production in Settings', module: 'bundled:webxr', releases: false });
  assert.equal(info.publishers.find(item => item.name === 'live')!.configured, true);
  assert.deepEqual(Object.keys(await panel.publicationDestinationsOf(manifest('prod'))), ['live']);
  assert.equal(statusCalls, 0, 'a placeholder destination is never asked for status');
  (panel as unknown as { editableManifest(): unknown }).editableManifest = () => manifest('prod');
  await assert.rejects((panel as unknown as { preparePublish(p: unknown, body: unknown): Promise<unknown> }).preparePublish({ id: 'app', manifest: manifest('prod'), dir: REPO }, {}), /Configure production in Settings/);
});
