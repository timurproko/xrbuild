import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { componentMetadataErrors, resolveComponentGroups, componentSceneProps, type ComponentMetadata, type ComponentLibrary } from '../../sdk/src/component-settings.ts';
import { uiKitThemeChoices } from '../../ui-kit/src/theme-choices.ts';
import { uiKitTheme as kitTheme } from '../../../embedded/projects/core/ui-kit/src/theme.ts';
import { uiKitTheme as launcherTheme } from '../../../embedded/projects/core/launcher/src/theme.ts';
import { validateManifest } from '../src/projects.ts';
const root = path.resolve(import.meta.dirname, '../../..');
const library: ComponentLibrary = { parameters: { theme: { type: 'choice', label: 'Theme', options: uiKitThemeChoices, default: 'default' } } };
const consumer: ComponentMetadata = { componentLibraries: { 'bundled:ui-kit': { props: { theme: 'theme' }, defaults: { theme: 'default' } } } };
const libraries = new Map([['bundled:ui-kit', { name: 'UI Kit', componentLibrary: library }]]);

test('typed declarations match UI Kit registration and consumer defaults without loading app code', async () => {
  const kit = JSON.parse(await fs.readFile(path.join(root, 'embedded/projects/core/ui-kit/xrb-project.json'), 'utf8'));
  const launcher = JSON.parse(await fs.readFile(path.join(root, 'embedded/projects/core/launcher/xrb-project.json'), 'utf8'));
  assert.deepEqual(kit.componentLibrary, library);
  assert.equal(kit.componentLibrary.parameters.theme.default, kitTheme.defaultTheme);
  assert.equal(launcher.componentLibraries['bundled:ui-kit'].defaults.theme, launcherTheme.defaultTheme);
  // UI Kit consumes its own library, so its Settings tab chooses the theme it shows when run.
  assert.deepEqual(kit.componentLibraries, { 'bundled:ui-kit': { props: { theme: 'theme' }, defaults: { theme: kitTheme.defaultTheme } } });
  assert.deepEqual(launcher.componentLibraries, consumer.componentLibraries);
  assert.deepEqual(validateManifest(kit, root), []);
  assert.deepEqual(validateManifest(launcher, root), []);
  const registry = await fs.readFile(path.join(root, 'packages/ui-kit/src/visual-theme.ts'), 'utf8');
  assert.match(registry, /Record<UiKitThemeId, UiKitTheme>/);
});

test('explicit references resolve defaults, saved values and scene props independently', () => {
  assert.equal(resolveComponentGroups(consumer, libraries)[0].values.theme, 'default');
  assert.equal(resolveComponentGroups({ componentLibraries: { 'bundled:ui-kit': { props: { theme: 'theme' }, defaults: { theme: 'chamfer' } } } }, libraries)[0].values.theme, 'chamfer');
  assert.deepEqual(resolveComponentGroups(consumer, new Map([['bundled:ui-kit', { name: 'Empty', componentLibrary: { parameters: {} } }]])), []);
  const selected = { ...consumer, componentSettings: { 'bundled:ui-kit': { theme: 'chamfer' } } };
  const groups = resolveComponentGroups(selected, libraries);
  assert.equal(groups[0].values.theme, 'chamfer');
  assert.deepEqual(componentSceneProps(consumer, Object.fromEntries(groups.map(g => [g.id, g.values]))), { theme: 'chamfer' });
  assert.equal(resolveComponentGroups(consumer, libraries)[0].values.theme, 'default');
  assert.deepEqual(resolveComponentGroups({}, libraries), []);
  assert.deepEqual(resolveComponentGroups(consumer, new Map([['workspace:ui-kit', libraries.get('bundled:ui-kit')!]])), []);
  assert.deepEqual(resolveComponentGroups(consumer, new Map()), []);
});

test('a second library and parameter require only declarations', () => {
  const declarations = new Map(libraries);
  declarations.set('workspace:shapes', { name: 'Shapes', componentLibrary: { parameters: { style: { type: 'choice', label: 'Style', default: 'plain', options: [{ value: 'plain', label: 'Plain' }] } } } });
  const both = { ...consumer, componentLibraries: { ...consumer.componentLibraries, 'workspace:shapes': { props: { style: 'shapeStyle' } } } };
  const groups = resolveComponentGroups(both, declarations);
  assert.deepEqual(groups.map(g => g.id), ['bundled:ui-kit', 'workspace:shapes']);
  assert.deepEqual(componentSceneProps(both, Object.fromEntries(groups.map(g => [g.id, g.values]))), { theme: 'default', shapeStyle: 'plain' });
});

test('malformed declarations and unsafe keys never become parameters', () => {
  for (const componentLibrary of [null, [], { parameters: null }, { parameters: { theme: { ...library.parameters.theme, default: 'missing' } } }, { parameters: { theme: { ...library.parameters.theme, options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A' }] } } }]) {
    assert.ok(componentMetadataErrors({ componentLibrary } as any).length);
  }
  assert.ok(componentMetadataErrors({ componentLibraries: { 'bundled:ui-kit': { props: { theme: 'constructor' } } } }).length);
  assert.ok(componentMetadataErrors({ componentSettings: { 'ui-kit': { theme: 'default' } } }).length);
});
