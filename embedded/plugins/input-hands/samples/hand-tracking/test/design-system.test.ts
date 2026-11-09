// Private diagnostic contracts for shared core UI components; no runtime/device startup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), 'utf8');
const html = read('index.html');
const style = read('src/style.css');
const main = read('src/main.ts');
const workspace = read('src/ui/workspace.ts');
const status = read('src/ui/panel-status.ts');
const csv = read('src/live/recording/csv-panel.ts');

test('diagnostic workspace uses shared layout rhythm without redefining spacing', () => {
  assert.match(html, /id="workspace" class="xrb-workspace-layout"/);
  assert.doesNotMatch(style, /main#workspace \{[^}]*padding:|main#workspace \{[^}]*gap:/);
});

test('diagnostic maintenance actions consume the shared status helpers', () => {
  assert.match(status, /updateRebuildChip\(host,status\.host\)/);
  assert.match(status, /updateRestartChip\(panel,status\.panel\.outdated\)/);
  assert.doesNotMatch(status, /chip \$\{!status\.host\.exists\?'bad':'warn'\}/);
});

test('diagnostic uses shared visual components and behaviors', () => {
  assert.doesNotMatch(style, /^\.(?:control-group|button-row|toggle-grid|readout|output-media-tabs button|marker-dialog-header|marker-dialog-close|marker-dialog-status|camera-context-menu|icon-button)\b/m);
  for (const component of ['xrb-control-group', 'xrb-button-row', 'xrb-field-grid', 'xrb-supporting-text', 'xrb-code-block', 'xrb-segmented', 'xrb-dialog', 'xrb-dialog-header', 'xrb-dialog-actions', 'xrb-disclosure', 'xrb-range']) assert.ok(html.includes(component), component);
  assert.doesNotMatch(`${html}\n${main}`, /<svg\b|style="/);
  assert.match(workspace, /import\('@xr-build\/design-system'\)/);
  assert.match(csv, /openFloating\(menu,\{x,y\}\)/);
  assert.match(main, /iconSvg\('fullscreen'\)/);
});
