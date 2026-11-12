import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const source = (await fs.readFile(path.resolve(import.meta.dirname, '..', 'ui', 'app.js'), 'utf8')).replace(/\r\n/g, '\n');
const fn = (name: string) => { const start = source.indexOf(`${name}(`); assert.ok(start >= 0, name); return source.slice(start, source.indexOf('\n}\n', start) + 2); };
const constant = (name: string) => { const start = source.indexOf(`const ${name} =`); assert.ok(start >= 0, name); return source.slice(start, source.indexOf(';\n', start) + 2); };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const renderField = (label: string, control: string) => `<label>${label}${control}</label>`;
const field = () => '<select></select>';
const drafts = new Map<string, Record<string, unknown>>();
const configSource = [fn('function shownConfigFields'), fn('function configGroupFields'), constant('configFormId'), constant('configDisabled'),
  fn('function configControlValue'), fn('function pluginSettingControl'), fn('function configControl'), fn('function configBody'),
  fn('function destinationRow'), fn('function generalConfigBlock'), fn('function configForms'), fn('function pluginSettingsForm')].join('\n');
const ui = new Function('esc', 'renderField', 'field', 'pluginConfigDrafts', `${configSource}\nreturn { pluginSettingsForm, generalConfigBlock, configForms };`)(esc, renderField, field, drafts) as {
  pluginSettingsForm(plugin: unknown, scope: string, fields: unknown[], values: Record<string, unknown>): string;
  generalConfigBlock(plugin: unknown): string;
  configForms(plugin: unknown): string;
};

const settings = [
  { key: 'localhost', label: 'Localhost', type: 'boolean', default: true, hint: 'Test on this computer.' },
  { key: 'production', label: 'Production', type: 'boolean', default: false, hint: 'Publish to your website.' },
];
const config = [
  { key: 'localPort', label: 'Port', type: 'number', default: 8443, shownWhen: 'localhost' },
  { key: 'productionOrigin', label: 'Origin', type: 'text', default: '', shownWhen: 'production' },
  { key: 'productionBranch', label: 'Branch', type: 'text', default: '', shownWhen: 'production' },
  { key: 'productionTimeoutMs', label: 'Timeout', type: 'number', default: 10, shownWhen: 'production', advanced: true },
];
const plugin = (extra: Record<string, unknown> = {}) => ({ id: 'w', enabled: true, settings, config, values: { localhost: true, production: true }, configValues: {}, ...extra });
const card = (p: any) => ui.pluginSettingsForm(p, 'settings', p.settings, p.values) + ui.generalConfigBlock(p) + ui.configForms(p);

test('each destination is one row with its name, description, status and switch', () => {
  const html = card(plugin({ destinationStatus: { localhost: { configured: true }, production: { configured: false, problem: 'Configure production in Settings' } } }));
  assert.deepEqual([...html.matchAll(/data-destination="([^"]+)"/g)].map(m => m[1]), ['localhost', 'production']);
  assert.match(html, /<h2 class="settings-section">Localhost<\/h2><span class="xrb-help">Test on this computer\.<\/span>/);
  assert.match(html, /<span class="state ok">ready<\/span>/);
  assert.match(html, /<span class="state busy" title="Configure production in Settings">not configured<\/span>/);
  assert.match(html, /<label class="xrb-switch"><input type="checkbox" role="switch" name="production" aria-label="Production" checked/);
  assert.match(html, /<p class="xrb-help settings-destination-problem">Configure production in Settings<\/p>/);
  assert.doesNotMatch(html, /xrb-tabs|<label class="toggle"><input type="checkbox" name="production"/, 'no tabs and no duplicate checkbox');
  assert.match(html, /<section class="settings-destination " data-destination="localhost">/, 'the first section has no divider');
  assert.match(html, /<section class="settings-destination xrb-section-divider" data-destination="production">/, 'later sections use the shared divider, not a border');
});

test('a destination that is off shows only its row; its fields and form are not rendered', () => {
  const html = card(plugin({ values: { localhost: true, production: false } }));
  assert.match(html, /<section class="settings-destination xrb-section-divider" data-destination="production">/);
  assert.doesNotMatch(html, /productionOrigin|plugin-config-w-production/);
  assert.match(html, /id="plugin-config-w-localhost" data-plugin-config="w" data-config-group="localhost" hidden/);
});

test('configuration fields belong to their destination form, with Advanced folded and a Save per row', () => {
  const html = card(plugin({ configValues: { productionOrigin: 'https://site.example' } }));
  assert.match(html, /form="plugin-config-w-production" name="productionOrigin" value="https:\/\/site\.example"/);
  assert.match(html, /<details class="xrb-disclosure settings-config-advanced"><summary>Advanced<\/summary><div class="settings-card-fields">[^]*name="productionTimeoutMs"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('<details')), /name="productionTimeoutMs"/, 'advanced fields stay folded');
  assert.equal([...html.matchAll(/<button type="submit" form="plugin-config-w-(localhost|production)" class="action-button" >Save<\/button>/g)].length, 2);
  assert.match(html, /id="plugin-config-w-production-error" data-config-error/);
});

test('typed drafts survive a redraw', () => {
  drafts.set('w', { productionBranch: 'pages' });
  assert.match(card(plugin({ configValues: { productionBranch: 'main' } })), /name="productionBranch" value="pages"/);
  drafts.clear();
});

test('configuration not tied to a setting renders as its own block', () => {
  const p = plugin({ settings: [], values: {}, config: [{ key: 'region', label: 'Region', type: 'text', default: '' }] });
  const html = card(p);
  assert.match(html, /<div class="settings-config">[^]*form="plugin-config-w-general" name="region"/);
  assert.match(html, /id="plugin-config-w-general" data-plugin-config="w" data-config-group=""/);
});

test('disabled plugins and unreadable files keep configuration read-only and say why', () => {
  const disabled = card(plugin({ enabled: false }));
  assert.match(disabled, /name="productionOrigin" value=""\s+disabled/);
  assert.match(disabled, /<button type="submit" form="plugin-config-w-production" class="action-button" disabled>Save<\/button>/);
  const broken = card(plugin({ configProblem: 'Invalid JSON in plugin config: <file>' }));
  assert.match(broken, /<p class="errors" role="alert">Invalid JSON in plugin config: &lt;file&gt;<\/p>/);
  assert.match(broken, /class="action-button" disabled>Save/);
});

class ApiError extends Error {
  status: number; data: any;
  constructor(status: number, data: any) { super(data?.error); this.status = status; this.data = data; }
}

function form(values: Record<string, string | boolean>, group = 'production') {
  const controls = Object.entries(values).map(([name, value]) => typeof value === 'boolean' ? { name, checked: value, disabled: false } : { name, value, disabled: false });
  const named: any = (name: string) => controls.find(item => item.name === name);
  const elements = Object.assign([...controls], { namedItem: named });
  return { id: `plugin-config-p-${group}`, dataset: { pluginConfig: 'p', configGroup: group }, isConnected: true, controls, elements };
}
function harness(api: (method: string, url: string, body?: any) => Promise<any>, extra: Record<string, unknown> = {}) {
  const p: any = { id: 'p', enabled: true, config, values: { localhost: true, production: true }, configValues: {}, configRevision: 'absent', ...extra };
  const calls = { render: 0, projects: 0, plugins: 0 }, errors = new Map<string, { textContent: string; hidden: boolean }>();
  const document = { getElementById: (id: string) => { if (!errors.has(id)) errors.set(id, { textContent: '', hidden: true }); return errors.get(id); } };
  const local = new Map<string, unknown>([['p', { productionOrigin: 'typed' }]]);
  const save = new Function('state', 'api', 'ApiError', 'document', 'renderGlobalSettings', 'loadProjects', 'loadManagedPlugins', 'pluginConfigDrafts',
    `${[fn('function shownConfigFields'), constant('configDisabled'), fn('function configControlValue'), fn('async function savePluginConfig')].join('\n')}\nreturn savePluginConfig;`)(
    { managedPlugins: [p] }, api, ApiError, document, () => { calls.render++; }, async () => { calls.projects++; }, async () => { calls.plugins++; }, local) as (form: unknown) => Promise<void>;
  return { plugin: p, calls, save, drafts: local, error: (id: string) => errors.get(`${id}-error`) };
}

test('Save sends only that destination\'s fields, trimmed, with the loaded revision', async () => {
  const sent: any[] = [], f = form({ productionOrigin: ' https://site.example ', productionBranch: 'main', productionTimeoutMs: '20' });
  const h = harness(async (method, url, body) => { sent.push({ method, url, body }); return { revision: 'b'.repeat(64), values: body.values }; });
  await h.save(f);
  assert.deepEqual(sent, [{ method: 'PUT', url: '/api/plugins/manage/p/config', body: { values: { productionOrigin: 'https://site.example', productionBranch: 'main', productionTimeoutMs: 20 }, revision: 'absent' } }]);
  assert.equal(h.plugin.configRevision, 'b'.repeat(64));
  assert.deepEqual(h.calls, { render: 1, projects: 1, plugins: 1 }, 'the ready/not configured chip and publisher choices refresh');
  assert.equal(h.drafts.has('p'), false, 'a saved draft is cleared');
  assert.ok(f.controls.every(item => !item.disabled));
});

test('the Localhost row saves only Localhost, so other destinations keep their stored values', async () => {
  const sent: any[] = [];
  const h = harness(async (_m, _u, body) => { sent.push(body); return { revision: 'r'.repeat(64), values: body.values }; });
  await h.save(form({ localPort: '9443' }, 'localhost'));
  assert.deepEqual(sent[0].values, { localPort: 9443 });
});

test('invalid values show inline and stale saves reload what is on disk', async () => {
  const f = form({ productionOrigin: 'x', productionBranch: '', productionTimeoutMs: '10' });
  const invalid = harness(async () => { throw new ApiError(400, { error: 'Invalid value for Origin', details: { fields: [{ field: 'productionOrigin' }] } }); });
  await invalid.save(f);
  assert.equal(invalid.error(f.id)!.hidden, false); assert.match(invalid.error(f.id)!.textContent, /Invalid value/);
  assert.equal(invalid.calls.render, 0, 'typed values are kept');

  const stale = harness(async (method) => {
    if (method === 'GET') return { revision: 'c'.repeat(64), values: { productionOrigin: 'https://other.example' } };
    throw new ApiError(409, { error: 'The configuration changed on disk; reload it before saving', details: { stale: 'config' } });
  });
  const g = form({ productionOrigin: 'https://mine.example', productionBranch: '', productionTimeoutMs: '10' });
  await stale.save(g);
  assert.equal(stale.plugin.configRevision, 'c'.repeat(64));
  assert.equal(stale.plugin.configValues.productionOrigin, 'https://other.example');
  assert.equal(stale.calls.render, 1);
  assert.match(stale.error(g.id)!.textContent, /changed on disk/);
});

test('switches save instantly, configuration fields only remember drafts, and a destination switch redraws', () => {
  const render = fn('function renderGlobalSettings');
  assert.match(render, /if \(event\.target\.form !== form\) return; \/\/ a configuration field inside a destination row/);
  assert.match(render, /addEventListener\('input', rememberConfigDraft\)/);
  const save = fn('async function savePluginSettings');
  assert.match(save, /if \(plugin\.config\?\.some\(\(setting\) => setting\.shownWhen\)\) \{\n\s+\/\/[^\n]*\n\s+await loadManagedPlugins\(\)\.catch\(\(\) => \{\}\);\n\s+renderGlobalSettings\(\);/);
  assert.match(save, /if \(!control\.form \|\| control\.form === form\) control\.disabled = true/, 'configuration controls are left alone');
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
