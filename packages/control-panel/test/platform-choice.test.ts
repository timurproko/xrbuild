import assert from 'node:assert/strict';
import test from 'node:test';
import { platformChoiceOf, platformChoices, refreshedDesktopDisplay, selectPlatform, switchRunSettings } from '../ui/platform-choice.js';

const plugins = {
  providers: [{ role: 'platform', name: 'station' }, { role: 'display', name: 'stereo-panel' }],
  packagers: ['station', 'native-package'],
  headsetPlatforms: ['headset-package'],
  standaloneTargets: ['webxr'],
  disabled: [],
};

test('display refresh replaces only a disconnected desktop monitor with the primary or first available monitor', () => {
  const monitors = [{ index: 3, name: 'Secondary', primary: false }, { index: 0, name: 'Primary', primary: true }];
  assert.equal(refreshedDesktopDisplay({ display: 'desktop', plugins: { desktop: { monitor: 7 } } }, monitors), 'desktop:0');
  assert.equal(refreshedDesktopDisplay({ display: 'desktop', plugins: { desktop: { monitor: 3 } } }, monitors), null);
  assert.equal(refreshedDesktopDisplay({ display: 'stereo-panel', plugins: { desktop: { monitor: 7 } } }, monitors), null);
  assert.equal(refreshedDesktopDisplay({ display: 'desktop', plugins: { desktop: { monitor: 7 } } }, []), null);
  assert.equal(refreshedDesktopDisplay({ display: 'desktop', plugins: { desktop: { monitor: 7 } } }, [{ index: 5, primary: false }]), 'desktop:5');
});

test('Platform offers standalone browser and desktop plus target-aware providers and packagers', () => {
  const choices = platformChoices({ kind: 'app' }, plugins);
  assert.deepEqual(choices.options, ['host:', 'webxr:', 'host:native-package', 'host:station', 'webxr:headset-package']);
  assert.equal(choices.selected, 'host:');
  assert.equal(choices.labels['host:'], 'Desktop');
  assert.equal(choices.labels['webxr:'], 'Browser');
  assert.equal(platformChoices({ target: 'webxr' }, plugins).selected, 'webxr:');
  assert.equal(platformChoices({ target: 'webxr', platform: 'headset-package' }, plugins).selected, 'webxr:headset-package');
});

test('Display and Build expose preview and distribution choices separately', () => {
  const display = platformChoices({ kind: 'app' }, plugins, 'display');
  assert.deepEqual(display.options, ['host:', 'webxr:']);
  const build = platformChoices({ target: 'webxr' }, plugins, 'build');
  assert.deepEqual(build.options, ['host:', 'host:native-package', 'host:station', 'webxr:headset-package']);
  assert.equal(platformChoices({ target: 'webxr', platform: 'headset-package' }, plugins, 'display').options.includes('webxr:headset-package'), false);
  assert.equal(platformChoices({ platform: 'station' }, plugins, 'display').options.includes('host:station'), false);
  assert.equal(platformChoices({ platform: 'station' }, plugins, 'build').options.includes('host:station'), true);
});

test('a plugin label changes only UI text, not the persisted platform identity', () => {
  const manifest = { target: 'webxr', platform: 'headset-package' };
  const named = { ...plugins, packagerLabels: { 'headset-package': 'Device Model' } };
  const choice = platformChoices(manifest, named);
  assert.equal(choice.labels['webxr:headset-package'], 'Device Model');
  assert.equal(choice.selected, 'webxr:headset-package');
  assert.deepEqual(selectPlatform(manifest, choice.selected), manifest);
  assert.match(platformChoices({ platform: 'headset-package' }, named).warning, /Device Model requires WebXR/);
});

test('changing Platform updates target and platform together, preserving unrelated fields and legacy host default', () => {
  const original = { kind: 'app', display: 'stereo-panel', plugins: { desktop: { monitor: 2 } }, platform: 'station' };
  const webxr = selectPlatform(original, 'webxr:headset-package');
  assert.equal(original.target, undefined);
  assert.equal(original.platform, 'station');
  assert.deepEqual(webxr, { ...original, target: 'webxr', platform: 'headset-package' });
  assert.deepEqual(selectPlatform(webxr, 'webxr:'), { kind: 'app', display: 'stereo-panel', plugins: original.plugins, target: 'webxr' });
  assert.deepEqual(selectPlatform(webxr, 'host:'), { kind: 'app', display: 'stereo-panel', plugins: original.plugins });
  assert.throws(() => selectPlatform(original, 'host:station;bad'), /Invalid platform choice/);
});

test('disabled platform falls back without rewriting manifest; unavailable and mismatched choices stay readable', () => {
  const noStandalone = { ...plugins, standaloneTargets: [] };
  assert.ok(!platformChoices({ kind: 'app' }, noStandalone).options.includes('webxr:'));
  const savedStandalone = platformChoices({ target: 'webxr' }, noStandalone);
  assert.equal(savedStandalone.selected, 'webxr:');
  assert.equal(savedStandalone.labels['webxr:'], 'Browser (unavailable)');
  assert.match(savedStandalone.warning, /Browser unavailable/);

  const manifest = { target: 'webxr', platform: 'headset-package' };
  const disabled = platformChoices(manifest, { ...plugins, disabled: [{ name: 'headset-package', role: 'platform' }] });
  assert.equal(disabled.selected, 'webxr:');
  assert.ok(!disabled.options.includes('webxr:headset-package'));
  assert.deepEqual(manifest, { target: 'webxr', platform: 'headset-package' });
  assert.equal(platformChoices(manifest, plugins).selected, 'webxr:headset-package');
  const missing = platformChoices({ platform: 'unbuilt' }, plugins);
  assert.ok(missing.options.includes('host:unbuilt'));
  assert.match(missing.warning, /unavailable/);
  const mismatch = platformChoices({ platform: 'headset-package' }, plugins);
  assert.match(mismatch.warning, /requires WebXR/);
  assert.ok(mismatch.options.includes('host:headset-package'));
});

test('each platform tab keeps its own Display and Input', () => {
  const desktop = { name: 'App', kind: 'app', display: 'desktop', inputs: ['mouse', 'keyboard'], plugins: { desktop: { monitor: 1 } } };
  // First visit to Station: it starts from the current settings, then gets its own.
  let station = switchRunSettings(desktop, selectPlatform(structuredClone(desktop), 'host:station'), 'host:station');
  assert.equal(platformChoiceOf(station), 'host:station');
  assert.deepEqual(station.inputs, ['mouse', 'keyboard']);
  station = { ...station, display: 'stereo-panel', inputs: ['tracker'] };
  // Back to Desktop: its own settings return; Station's are kept for next time.
  const back = switchRunSettings(station, selectPlatform(structuredClone(station), 'host:'), 'host:');
  assert.equal(back.display, 'desktop');
  assert.deepEqual(back.inputs, ['mouse', 'keyboard']);
  assert.equal(back.plugins.desktop.monitor, 1);
  assert.deepEqual(back.platformSettings['host:station'], { display: 'stereo-panel', inputs: ['tracker'], monitor: 1 });
  const again = switchRunSettings(back, selectPlatform(structuredClone(back), 'host:station'), 'host:station');
  assert.equal(again.display, 'stereo-panel');
  assert.deepEqual(again.inputs, ['tracker']);
});
