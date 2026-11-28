import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentSettingsFixture } from './component-settings.fixture.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Components uses normal dropdowns, follows Develop, autosaves and never changes platform settings', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const f = await componentSettingsFixture(t);
  await withBrowser(async ({ evaluate, navigate }) => {
    const until = async (expr: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expr)) return; await sleep(50); } assert.fail(expr); };
    await navigate(`${f.server.url}?project=launcher`, `!!document.querySelector('[data-surface="components"]')`);
    await evaluate(`document.querySelector('[data-id="launcher"]')?.click()`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-surface]')).map(x=>x.textContent.trim())`), ['Develop', 'Components', 'Build']);
    const develop = await evaluate(`document.querySelector('#settings').innerHTML`);
    await evaluate(`document.querySelector('[data-surface="components"]').click()`);
    await until(`!!document.querySelector('[name="componentSettings.bundled:ui-kit.theme"]')`);
    assert.equal(await evaluate(`document.querySelector('#settings h2').textContent`), 'UI Kit');
    assert.equal(await evaluate(`document.querySelectorAll('#settings .dropdown').length`), 1);
    assert.equal(await evaluate(`!!document.querySelector('#act-run,#act-package,#act-publish,#settings .xrb-help')`), false);
    await evaluate(`document.querySelector('#settings .dropdown-btn').click()`);
    await until(`!!document.querySelector('[role="option"]')`);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(x=>x.textContent.trim()==='Chamfer').click()`);
    await until(`document.querySelector('#settings input')?.value==='chamfer'`);
    for (let i = 0; i < 100 && (await f.get()).manifest.componentSettings?.['bundled:ui-kit']?.theme !== 'chamfer'; i++) await sleep(50);
    assert.equal((await f.get()).manifest.componentSettings['bundled:ui-kit'].theme, 'chamfer');
    // A second quick edit uses the existing serialized settings writer.
    await evaluate(`document.querySelector('#settings .dropdown-btn').click()`);
    await until(`!!document.querySelector('[role="option"]')`);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(x=>x.textContent.trim()==='Default').click()`);
    for (let i = 0; i < 100 && (await f.get()).manifest.componentSettings?.['bundled:ui-kit']?.theme !== 'default'; i++) await sleep(50);
    assert.equal((await f.get()).manifest.componentSettings['bundled:ui-kit'].theme, 'default');
    await navigate(f.server.url, `!!document.querySelector('[name="componentSettings.bundled:ui-kit.theme"]')`);
    assert.equal(await evaluate(`document.querySelector('#settings input').value`), 'default');
    await evaluate(`document.querySelector('[data-surface="display"]').click()`);
    await until(`!!document.querySelector('[data-surface="display"][aria-selected="true"]')`);
    assert.equal(await evaluate(`document.querySelector('#settings').innerHTML`), develop);
    const saved = (await f.get()).manifest;
    assert.equal(saved.description, 'Keep me');
    assert.equal(saved.platformSettings, undefined);
    assert.equal(saved.target, undefined);
    assert.equal(saved.platform, undefined);
    await evaluate(`document.querySelector('[data-surface="components"]').click(); localStorage.setItem('panel.selected','plain')`);
    await navigate(`${f.server.url}?project=plain`, `!!document.querySelector('[data-surface="display"]')`);
    // Select by rendered name rather than relying on persisted preference keys.
    await evaluate(`Array.from(document.querySelectorAll('#projects .proj')).find(x=>x.textContent.trim()==='plain')?.click()`);
    await until(`document.querySelector('.project-title-row h3')?.textContent==='plain'`);
    assert.equal(await evaluate(`!!document.querySelector('[data-surface="components"]')`), false);
  });
});
