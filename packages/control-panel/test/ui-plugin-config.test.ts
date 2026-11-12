import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const source = (await fs.readFile(path.resolve(import.meta.dirname, '..', 'ui', 'app.js'), 'utf8')).replace(/\r\n/g, '\n');
const fn = (name: string) => { const start = source.indexOf(`${name}(`); assert.ok(start >= 0, name); return source.slice(start, source.indexOf('\n}\n', start) + 2); };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const renderField = (label: string, control: string) => `<label>${label}${control}</label>`;
const field = () => '<select></select>';
const render = new Function('esc', 'renderField', 'field', `${fn('function pluginSettingControl')}\n${fn('function pluginConfigForm')}\nreturn pluginConfigForm;`)(esc, renderField, field) as (plugin: unknown, divided?: boolean) => string;

const config = [
  { key: 'productionConfigured', label: 'Production configured explicitly', type: 'boolean', default: false },
  { key: 'productionOrigin', label: 'Production HTTPS origin', type: 'text', default: '' },
];

test('declared configuration renders as its own section with an explicit Save', () => {
  const html = render({ id: 'bundled:publisher', enabled: true, config, configValues: { productionConfigured: true, productionOrigin: 'https://site.example' } }, true);
  assert.match(html, /data-plugin-config="bundled:publisher"/);
  assert.match(html, /<h2 class="settings-section">Configuration<\/h2>/);
  assert.match(html, /xrb-section-divider/);
  assert.match(html, /name="productionConfigured" checked/);
  assert.match(html, /value="https:\/\/site\.example"/);
  assert.match(html, /<button type="submit"[^>]*>Save configuration<\/button>/);
  assert.doesNotMatch(html, /disabled/);
});

test('disabled plugins and unreadable files keep configuration read-only and say why', () => {
  assert.equal(render({ id: 'p', enabled: true, config: [] }), '', 'no section without declared fields');
  const disabled = render({ id: 'p', enabled: false, config, configValues: {} });
  assert.match(disabled, /name="productionOrigin" value=""\s+disabled/);
  assert.match(disabled, /Save configuration/); assert.match(disabled, /<button type="submit" class="action-button" disabled>/);
  const broken = render({ id: 'p', enabled: true, config, configProblem: 'Invalid JSON in plugin config: <file>' });
  assert.match(broken, /<p class="errors" role="alert">Invalid JSON in plugin config: &lt;file&gt;<\/p>/);
  assert.match(broken, /<button type="submit" class="action-button" disabled>/);
});

class ApiError extends Error {
  status: number; data: any;
  constructor(status: number, data: any) { super(data?.error); this.status = status; this.data = data; }
}

function control(name: string, value: string | boolean) {
  return typeof value === 'boolean' ? { name, checked: value, disabled: false } : { name, value, disabled: false };
}
function form(values: Record<string, string | boolean>) {
  const controls = Object.entries(values).map(([name, value]) => control(name, value));
  const error = { textContent: '', hidden: true };
  return {
    dataset: { pluginConfig: 'p' }, isConnected: true, error, controls,
    elements: { namedItem: (name: string) => controls.find(item => item.name === name) },
    querySelector: (selector: string) => selector === '[data-config-error]' ? error : null,
    querySelectorAll: () => controls,
  };
}
function harness(api: (method: string, url: string, body?: any) => Promise<any>, rendered: ReturnType<typeof form>) {
  const plugin: any = { id: 'p', enabled: true, config, configValues: {}, configRevision: 'absent' };
  const state = { managedPlugins: [plugin] }, calls = { render: 0, projects: 0 };
  const document = { getElementById: () => ({ hidden: true, className: '', textContent: '' }), querySelector: () => rendered };
  const save = new Function('state', 'api', 'ApiError', 'document', 'CSS', 'renderGlobalSettings', 'loadProjects', `${fn('async function savePluginConfig')}\nreturn savePluginConfig;`)(
    state, api, ApiError, document, { escape: (value: string) => value }, () => { calls.render++; }, async () => { calls.projects++; }) as (form: unknown) => Promise<void>;
  return { plugin, calls, save };
}

test('Save sends trimmed values with the loaded revision and keeps the new revision', async () => {
  const sent: any[] = [], f = form({ productionConfigured: true, productionOrigin: ' https://site.example ' });
  const h = harness(async (method, url, body) => { sent.push({ method, url, body }); return { revision: 'b'.repeat(64), values: body.values }; }, f);
  await h.save(f);
  assert.deepEqual(sent, [{ method: 'PUT', url: '/api/plugins/manage/p/config', body: { values: { productionConfigured: true, productionOrigin: 'https://site.example' }, revision: 'absent' } }]);
  assert.equal(h.plugin.configRevision, 'b'.repeat(64));
  assert.equal(h.calls.projects, 1, 'publisher choices refresh');
  assert.ok(f.controls.every(item => !item.disabled));
});

test('invalid values show inline and stale saves reload what is on disk', async () => {
  const f = form({ productionConfigured: false, productionOrigin: 'x' });
  const invalid = harness(async () => { throw new ApiError(400, { error: 'Invalid value for Production HTTPS origin', details: { fields: [{ field: 'productionOrigin' }] } }); }, f);
  await invalid.save(f);
  assert.equal(f.error.hidden, false); assert.match(f.error.textContent, /Invalid value/);
  assert.equal(invalid.calls.render, 0, 'typed values are kept');

  const fresh = form({});
  const stale = harness(async (method) => {
    if (method === 'GET') return { revision: 'c'.repeat(64), values: { productionConfigured: false, productionOrigin: 'https://other.example' } };
    throw new ApiError(409, { error: 'The configuration changed on disk; reload it before saving', details: { stale: 'config' } });
  }, fresh);
  await stale.save(form({ productionConfigured: true, productionOrigin: 'https://mine.example' }));
  assert.equal(stale.plugin.configRevision, 'c'.repeat(64));
  assert.equal(stale.plugin.configValues.productionOrigin, 'https://other.example');
  assert.equal(stale.calls.render, 1);
  assert.match(fresh.error.textContent, /changed on disk/);
});

test('unconfigured publishers are named "(not configured)" instead of their placeholder host', () => {
  const name = new Function(`${fn('function publisherDisplayName')}\nreturn publisherDisplayName;`)() as (item: unknown) => string;
  assert.equal(name({ name: 'production-web', label: 'Production', origin: '', configured: false }), 'Production (not configured)');
  assert.equal(name({ name: 'production-web', origin: '', configured: false }), 'production-web (not configured)');
  assert.equal(name({ name: 'local-test', label: 'Localhost', origin: 'https://127.0.0.1:8443', configured: true }), '127.0.0.1');
});

test('the Publish card explains a missing configuration and links to that plugin in Settings', () => {
  const fields = fn('function publicationFields');
  assert.match(fields, /selectedItem\?\.configured === false/);
  assert.match(fields, /Publisher not configured/);
  assert.match(fields, /href="\/settings\/\?module=\$\{encodeURIComponent\(selectedItem\.settingsModule\)\}">Configure…<\/a>/);
  assert.match(fields, /const result = configure \|\| failure;/);
  assert.match(fields, /const canPublish = !!selectedPublisher && info\.available/, 'the server marks an unconfigured selection unavailable, which disables Publish');
  assert.match(fn('function renderGlobalSettings'), /plugins\.find\(\(plugin\) => plugin\.key === requestedModule\)\?\.id/, 'Settings accepts the linked plugin key');
});
