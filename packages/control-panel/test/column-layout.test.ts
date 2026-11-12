import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { iconSvg } from '../ui/design-system.js';

const read = (name: string) => readFileSync(new URL(`../ui/${name}`, import.meta.url), 'utf8');
const app = read('app.js');
const css = read('style.css');
const shared = read('design-system.css');

test('activity labels and ordering match the visible actions', () => {
  const html = read('index.html');
  assert.match(html, /<h2>Analytics<\/h2>/);
  assert.doesNotMatch(html, /<h2>Running<\/h2>/);
  assert.ok(html.indexOf('id="activity-jobs-tab"') < html.indexOf('id="activity-log-tab"'));
  assert.match(app, /e\.key === 'Home' \? 'jobs' : e\.key === 'End' \? 'log'/);
  const browserButton = app.slice(app.indexOf('function headsetButtons')).match(/const button = ([\s\S]*?);\r?\n  const dev/)?.[1];
  assert.ok(browserButton);
  assert.doesNotMatch(browserButton, /title=|data-tooltip=/, 'Browser Run has no tooltip, even when disabled');
});

test('folder glyph is optically raised without moving its SVG container', () => {
  const folder = iconSvg('folder');
  assert.match(folder, /^<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">/);
  assert.match(folder, /<path transform="translate\(0 -1\)"/);
  assert.doesNotMatch(iconSvg('code'), /transform=/);
});

test('column headings share responsive sticky offsets and section-label alignment', () => {
  assert.match(shared, /--xrb-workspace-sticky-top: calc\(var\(--xrb-app-bar-height, var\(--top-h\)\) \+ var\(--xrb-workspace-block-start\)\)/);
  for (const [selector, source] of [['.settings-module-heading, .settings-owner-heading', css], ['.col-label', css], ['.xrb-workspace-sidebar', shared]]) {
    const rule = source.slice(source.indexOf(`${selector} {`)).split('}')[0];
    assert.match(rule, /top: var\(--xrb-workspace-sticky-top\)/);
    assert.doesNotMatch(rule, /(?:top: calc\(var\(--top-h\) \+ 20px\)|0 -20px)/);
  }
  assert.match(app, /class="nav-tabs xrb-section-label"><span>Plugins<\/span>/);
  assert.match(app, /class="nav-tabs xrb-section-label settings-module-heading"><span>Module<\/span>/);
  assert.match(app, /class="settings-owner-heading xrb-section-label"/);
  assert.doesNotMatch(css, /\.settings-owner-heading \{[^}]*align-items: center/);
  assert.match(css, /\.nav-tabs\.xrb-section-label \{ flex: none; \}/);
});

test('Publish has JSON only, while Develop and Build retain their appropriate folders', () => {
  const expression = app.match(/const projectActions = ([\s\S]*?);\r?\n  if \(m\)/)?.[1];
  assert.ok(expression);
  // The live-app link is rendered separately (liveButton); this test covers the folder and JSON actions only.
  const actions = new Function('surface', 'publishSurface', 'p', 'manifestButton', 'iconSvg', `const liveButton = ''; return ${expression};`);
  for (const available of [false, true]) {
    const project = { packaging: { available } };
    const publish = actions('publish', true, project, '<a id="open-manifest">JSON</a>', () => 'icon');
    assert.match(publish, /open-manifest/);
    assert.doesNotMatch(publish, /open-dir|out-path|folder/);
    assert.match(actions('display', false, project, '', () => 'icon'), /id="open-dir"/);
    assert.match(actions('build', false, project, '', () => 'icon'), available ? /id="out-path"/ : /id="open-dir"/);
    for (const surface of ['display', 'build']) {
      const markup = actions(surface, false, project, '<a id="open-manifest">JSON</a>', () => 'icon');
      assert.ok(markup.indexOf('folder') < markup.indexOf('open-manifest'), 'Folder precedes JSON in visual and keyboard order');
    }
  }
});
