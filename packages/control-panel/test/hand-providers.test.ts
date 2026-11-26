import assert from 'node:assert/strict';
import test from 'node:test';
import { handProviderDeclarations } from '../src/hand-provider-contract.ts';
import { handRegistry } from '../src/hand-providers.ts';
import type { PluginCatalog, ResolvedPlugin } from '../src/extension-catalog.ts';
import type { ProviderList } from '../src/host-build.ts';

const declaration = { version: 1, id: 'skeleton', transport: 'native', runtimeName: 'tracker', purpose: 'tracked' };
const plugin = { key: 'workspace:example', id: 'example', sourceRoot: 'C:/fixtures/source', binaryRoot: 'C:/fixtures/bin', meta: { title: 'Example', handProviders: handProviderDeclarations([declaration]) } } as ResolvedPlugin;
const catalog = (): PluginCatalog => ({ plugins: [plugin], selected: [plugin], problems: [], prefs: { disabled: [], settings: {}, panelSettings: {} } });
const native = (): ProviderList => ({ providers: [{ role: 'input', name: 'tracker', path: 'C:/fixtures/bin/tracker.dll', builtin: false, version: '1', description: '' }], rejected: [], error: null });

test('hand declarations are bounded metadata with no executable or layout extension', () => {
  assert.equal(handProviderDeclarations([declaration])?.[0].id, 'skeleton');
  for (const bad of [[declaration, declaration], [{ ...declaration, version: 2 }], [{ ...declaration, runtimeName: 'simulated' }], [{ ...declaration, transport: 'script' }], [{ ...declaration, module: 'run.js' }], [{ ...declaration, id: '../escape' }]])
    assert.throws(() => handProviderDeclarations(bad), /handProviders/);
});

test('registry validates native role and ownership, keeps unavailable declarations and core sources', () => {
  const good = handRegistry(catalog(), native());
  assert.equal(good.providers.find(p => p.owner === plugin.key)?.available, true);
  assert.equal(good.providers.find(p => p.id === 'webxr')?.transport, 'webxr');
  for (const bad of [{ ...native(), unsafe: true }, { ...native(), providers: [{ ...native().providers[0], role: 'display' as const }] }, { ...native(), providers: [{ ...native().providers[0], path: 'C:/foreign/tracker.dll' }] }])
    assert.equal(handRegistry(catalog(), bad).providers.find(p => p.owner === plugin.key)?.available, false);
  const disabled = catalog(); disabled.prefs.disabled = ['example'];
  assert.match(handRegistry(disabled, native()).providers.find(p => p.owner === plugin.key)!.reason, /disabled/);
  const ambiguous = catalog(); ambiguous.selected = [];
  assert.equal(handRegistry(ambiguous, native()).providers.find(p => p.owner === plugin.key)?.available, false);
});

test('undeclared native inputs adapt to the hand contract without private names or capture', () => {
  const legacy = catalog(); legacy.plugins = [{ ...plugin, meta: { title: 'Old provider', panelProviderNames: { tracker: 'exposed' } } }]; legacy.selected = legacy.plugins;
  const result = handRegistry(legacy, native());
  assert.deepEqual(result.providers.find(p => p.owner === plugin.key)?.aliases, ['tracker', 'exposed']);
  assert.equal(result.providers.find(p => p.owner === plugin.key)?.id, 'tracker');
});
