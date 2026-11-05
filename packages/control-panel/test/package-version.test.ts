import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bumpPackageVersion } from '../ui/package-version.js';

const ui = new URL('../ui/', import.meta.url);

test('package version actions increment only valid three-part versions', () => {
  assert.equal(bumpPackageVersion('2.4.7', 'patch'), '2.4.8');
  assert.equal(bumpPackageVersion('2.4.7', 'minor'), '2.5.0');
  assert.equal(bumpPackageVersion('2.4.7', 'major'), '3.0.0');
  assert.equal(bumpPackageVersion('0.0.9', 'minor'), '0.1.0');
  assert.equal(bumpPackageVersion('0.0.9', 'major'), '1.0.0');
  assert.equal(bumpPackageVersion('2.4', 'patch'), null);
  assert.equal(bumpPackageVersion('2.4.7-beta', 'patch'), null);
  assert.equal(bumpPackageVersion('2.4.7', 'other'), null);
});

test('the pending package version field opens the shared increment menu without saving', () => {
  const html = readFileSync(new URL('index.html', ui), 'utf8');
  const app = readFileSync(new URL('app.js', ui), 'utf8');
  assert.match(html, /id="version-menu" class="menu xrb-menu"[\s\S]*data-version-bump="patch"[\s\S]*data-version-bump="minor"[\s\S]*data-version-bump="major"/);
  assert.match(app, /wireVersionMenu\(\$\('#act-version'\), 'input'\)/, 'the package version opens the shared menu from its context menu');
  assert.match(app, /function wireVersionMenu\(input, commit\)[\s\S]*if \(event\.button === 2\) event\.preventDefault\(\);[\s\S]*addEventListener\('contextmenu'[\s\S]*openVersionMenu\(input, commit/, 'a right-click opens the menu without focusing the field first');
  assert.match(app, /function openVersionMenu\(input, commit, at\)[\s\S]*bumpPackageVersion\(input\.value, 'patch'\)[\s\S]*versionMenuTarget = \{ input, commit \}/, 'one shared menu serves every version input');
  assert.match(app, /input\.value = version;\s*input\.dispatchEvent\(new Event\('input'/);
  assert.doesNotMatch(app, /act-version[\s\S]{0,250}saveSettings/);
});
